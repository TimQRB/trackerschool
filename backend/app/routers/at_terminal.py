"""AT command terminal.

- WebSocket: local serial port terminal (replaces sscom)
- REST:      list ports, command templates, historical log
- REST:      remote AT command via TCP to online devices
"""
import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Annotated

import serial
import serial.tools.list_ports
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..device_commands import send_command
from ..models import AtCommandLog, Device, Role, User
from ..security import get_current_user, require_roles

logger = logging.getLogger("at-terminal")

router = APIRouter(prefix="/api/at", tags=["at-terminal"])

# ---------- templates ----------
AT_TEMPLATES: list[dict] = [
    {"command": "AT", "label": "Проверка связи", "description": "Базовый тест — должен ответить OK"},
    {"command": "AT+CGMI", "label": "Производитель модуля", "description": "Название чипа/модема"},
    {"command": "AT+CGMM", "label": "Модель модуля", "description": "Модель модема"},
    {"command": "AT+CGSN", "label": "IMEI устройства", "description": "Серийный номер модема"},
    {"command": "AT+CPIN?", "label": "Статус SIM-карты", "description": "READY = SIM OK, ERROR = нет SIM"},
    {"command": "AT+CSQ", "label": "Уровень сигнала", "description": "0-31 (чем больше, тем лучше)"},
    {"command": "AT+CREG?", "label": "Регистрация в сети", "description": "0,1 = дома, 0,5 = роуминг"},
    {"command": "AT+CGATT?", "label": "GPRS-статус", "description": "1 = GPRS подключён"},
    {"command": "AT+CGDCONT?", "label": "APN-настройки", "description": "Текущая конфигурация APN"},
    {"command": "AT+CGDCONT=1,\"IP\",\"internet\"", "label": "Установить APN (internet)", "description": "Стандартный APN Казахстан"},
    {"command": "AT+CGDCONT=1,\"IP\",\"internet.beeline.kz\"", "label": "Установить APN (Beeline)", "description": "APN для Beeline KZ"},
    {"command": "AT+CGDCONT=1,\"IP\",\"internet.tele2.kz\"", "label": "Установить APN (Tele2)", "description": "APN для Tele2 KZ"},
    {"command": "AT+CGDCONT=1,\"IP\",\"internet.activ.kz\"", "label": "Установить APN (Activ)", "description": "APN для Activ KZ"},
    {"command": "AT+CGPADDR=1", "label": "IP-адрес (PDP)", "description": "Полученный IP после подключения GPRS"},
    {"command": "AT+COPS?", "label": "Текущий оператор", "description": "Название оператора связи"},
    {"command": "AT+CIMI", "label": "IMSI SIM-карты", "description": "Уникальный номер SIM"},
    {"command": "AT+CCID", "label": "CCID SIM-карты", "description": "Серийный номер SIM"},
    {"command": "AT+QGPS?", "label": "Статус GPS (Qualcomm)", "description": "1 = GPS включён, 0 = выключен"},
    {"command": "AT+QGPS=1", "label": "Включить GPS (Qualcomm)", "description": "Включить GNSS"},
    {"command": "AT+QGPS=0", "label": "Выключить GPS (Qualcomm)", "description": "Выключить GNSS"},
    {"command": "AT+QGMR", "label": "Версия прошивки", "description": "Текущая версия firmware"},
    {"command": "AT+QHTTPCFG=\"contextid\",1", "label": "HTTP: контекст 1", "description": "Настройка HTTP через контекст PDP"},
    {"command": "AT+QHTTPURL?", "label": "HTTP: статус URL", "description": "Статус HTTP-соединения"},
    {"command": "AT+VERSION", "label": "Версия HC02 (ASR)", "description": "Версия встроенного ПО трекера"},
    {"command": "AT+HEART", "label": "Интервал heartbeat", "description": "Текущий интервал отчётов"},
    {"command": "AT+HEART=300", "label": "Установить heartbeat 300с", "description": "Интервал 5 минут"},
    {"command": "AT+SLEEP=0", "label": "Отключить спящий режим", "description": "Устройство не уходит в сон"},
    {"command": "AT+RESET", "label": "Перезагрузить устройство", "description": "Soft reset трекера"},
]


# ---------- session managers (serial + TCP) ----------
class SerialSession:
    def __init__(self):
        self.ser: serial.Serial | None = None
        self.reader_task: asyncio.Task | None = None

    @property
    def label(self) -> str:
        return f"serial:{self.ser.port}" if self.ser else ""

    def is_open(self) -> bool:
        return self.ser is not None and self.ser.is_open

    def list_ports(self) -> list[dict]:
        return [
            {"port": p.device, "description": p.description, "hwid": p.hwid}
            for p in serial.tools.list_ports.comports()
        ]

    async def open(self, port: str, baud: int = 115200) -> str:
        if self.is_open():
            raise RuntimeError(f"Already connected to {self.ser.port}")
        try:
            self.ser = await asyncio.to_thread(serial.Serial, port, baud, timeout=1, write_timeout=1)
            logger.info("serial: opened %s @ %d", port, baud)
            return f"Connected to {port} @ {baud}"
        except serial.SerialException as e:
            self.ser = None
            raise RuntimeError(str(e))

    async def send(self, data: str) -> None:
        encoded = data.encode("utf-8")
        await asyncio.to_thread(self.ser.write, encoded)

    async def read_some(self) -> str:
        data = await asyncio.to_thread(self.ser.read_all)
        if data:
            return data.decode("utf-8", errors="replace")
        return ""

    def close(self) -> None:
        if self.reader_task:
            self.reader_task.cancel()
            self.reader_task = None
        if self.ser:
            try:
                self.ser.close()
                logger.info("serial: closed %s", self.ser.port)
            except Exception:
                pass
            self.ser = None


class TcpSession:
    def __init__(self):
        self.reader: asyncio.StreamReader | None = None
        self.writer: asyncio.StreamWriter | None = None
        self.reader_task: asyncio.Task | None = None
        self._host = ""
        self._port = 0

    @property
    def label(self) -> str:
        return f"tcp:{self._host}:{self._port}" if self._host else ""

    def is_open(self) -> bool:
        return self.writer is not None

    async def open(self, host: str, port: int) -> str:
        if self.is_open():
            raise RuntimeError(f"Already connected to {self._host}:{self._port}")
        try:
            self.reader, self.writer = await asyncio.open_connection(host, port)
            self._host = host
            self._port = port
            logger.info("tcp: connected to %s:%d", host, port)
            return f"Connected to {host}:{port}"
        except (OSError, ConnectionError) as e:
            self.writer = None
            raise RuntimeError(str(e))

    async def send(self, data: str) -> None:
        self.writer.write(data.encode("utf-8"))
        await self.writer.drain()

    async def read_some(self) -> str:
        try:
            data = await asyncio.wait_for(self.reader.read(4096), timeout=0.1)
            return data.decode("utf-8", errors="replace") if data else ""
        except asyncio.TimeoutError:
            return ""
        except Exception:
            raise

    def close(self) -> None:
        if self.reader_task:
            self.reader_task.cancel()
            self.reader_task = None
        if self.writer:
            try:
                self.writer.close()
                logger.info("tcp: closed %s:%d", self._host, self._port)
            except Exception:
                pass
            self.writer = None
            self.reader = None
        self._host = ""
        self._port = 0


class SessionManager:
    def __init__(self):
        self.serial = SerialSession()
        self.tcp = TcpSession()
        self._active: SerialSession | TcpSession | None = None

    @property
    def active(self) -> SerialSession | TcpSession | None:
        return self._active

    def is_open(self) -> bool:
        return self._active is not None and self._active.is_open()

    async def connect_serial(self, port: str, baud: int) -> str:
        self.close()
        result = await self.serial.open(port, baud)
        self._active = self.serial
        return result

    async def connect_tcp(self, host: str, port: int) -> str:
        self.close()
        result = await self.tcp.open(host, port)
        self._active = self.tcp
        return result

    async def send(self, data: str) -> None:
        if not self._active or not self._active.is_open():
            raise RuntimeError("Not connected")
        await self._active.send(data)

    async def read_some(self) -> str:
        if not self._active or not self._active.is_open():
            return ""
        return await self._active.read_some()

    @property
    def label(self) -> str:
        return self._active.label if self._active else ""

    def close(self) -> None:
        self.serial.close()
        self.tcp.close()
        self._active = None


_session = SessionManager()


# ---------- REST endpoints ----------
@router.get("/ports")
def list_ports(
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    return _session.list_ports()


@router.get("/templates")
def list_templates(
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    return AT_TEMPLATES


class AtHistoryQuery(BaseModel):
    device_id: int | None = None
    limit: int = 50
    offset: int = 0


@router.get("/history")
def get_history(
    device_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Annotated[Session, Depends(get_db)] = None,
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))] = None,
):
    q = select(AtCommandLog).order_by(AtCommandLog.created_at.desc())
    if device_id:
        q = q.where(AtCommandLog.device_id == device_id)
    q = q.offset(offset).limit(limit)
    return db.execute(q).scalars().all()


class AtHistorySave(BaseModel):
    device_id: int | None = None
    command: str
    response: str | None = None
    source: str = "serial"  # serial | remote
    success: bool = False


@router.post("/history", status_code=201)
def save_history(
    payload: AtHistorySave,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    log = AtCommandLog(
        device_id=payload.device_id,
        command=payload.command,
        response=payload.response,
        source=payload.source,
        success=payload.success,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


class RemoteAtCommand(BaseModel):
    imei: str
    command: str
    timeout: int = 30


@router.post("/remote")
def remote_at_command(
    payload: RemoteAtCommand,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    """Send AT command to an online device via TCP tunnel (proto 0x10FF).

    Note: requires firmware with 0x10FF handler on the tracker side.
    """
    device = db.execute(select(Device).where(Device.imei == payload.imei)).scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    subscribers = send_command(device.imei, 0x10FF, {"req": {"cmd": payload.command, "timeout": payload.timeout}})

    AtCommandLog(
        device_id=device.id,
        command=payload.command,
        source="remote",
    )
    db.commit()

    if subscribers == 0:
        return {"ok": False, "reason": "Device offline", "imei": payload.imei}

    return {"ok": True, "imei": payload.imei, "command": payload.command}


# ---------- WebSocket serial terminal ----------
@router.websocket("/ws")
async def at_websocket(websocket: WebSocket, token: str | None = Query(None)):
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        role = payload.get("role", "")
        if role not in ("admin", "school"):
            await websocket.close(code=4003, reason="Forbidden")
            return
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return
    await websocket.accept()

    async def send(msg: dict):
        try:
            await websocket.send_json(msg)
        except Exception:
            pass

    async def reader_loop():
        try:
            while True:
                try:
                    data = await _session.read_some()
                    if data:
                        await send({"type": "data", "data": data})
                    await asyncio.sleep(0.05)
                except Exception as e:
                    await send({"type": "error", "message": str(e)})
                    break
        except asyncio.CancelledError:
            pass

    reader_task: asyncio.Task | None = None

    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type", "")

            if msg_type == "ports":
                ports = _session.serial.list_ports()
                await send({"type": "ports", "ports": ports})

            elif msg_type == "open":
                try:
                    port = msg.get("port", "")
                    baud = int(msg.get("baud", 115200))
                    result = await _session.connect_serial(port, baud)
                    await send({"type": "opened", "message": result, "port": port, "baud": baud, "mode": "serial"})
                    reader_task = asyncio.create_task(reader_loop())
                except RuntimeError as e:
                    await send({"type": "error", "message": str(e)})

            elif msg_type == "connect_tcp":
                try:
                    host = msg.get("host", "127.0.0.1")
                    port = int(msg.get("port", 9999))
                    result = await _session.connect_tcp(host, port)
                    await send({"type": "opened", "message": result, "host": host, "tcpPort": port, "mode": "tcp"})
                    reader_task = asyncio.create_task(reader_loop())
                except RuntimeError as e:
                    await send({"type": "error", "message": str(e)})

            elif msg_type == "send":
                try:
                    cmd = msg.get("data", "")
                    await _session.send(cmd)
                    await send({"type": "sent", "data": cmd})
                except RuntimeError as e:
                    await send({"type": "error", "message": str(e)})

            elif msg_type == "close":
                _session.close()
                if reader_task:
                    reader_task.cancel()
                    reader_task = None
                await send({"type": "closed"})

            elif msg_type == "flush":
                data = await _session.read_some()
                if data:
                    await send({"type": "data", "data": data})

            else:
                await send({"type": "error", "message": f"Unknown type: {msg_type}"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("ws error")
        try:
            await send({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        _session.close()
        if reader_task:
            reader_task.cancel()
