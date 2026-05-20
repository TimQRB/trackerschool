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


# ---------- serial port session manager ----------
class SerialSession:
    def __init__(self):
        self.ser: serial.Serial | None = None
        self.reader_task: asyncio.Task | None = None
        self._cancel_event = asyncio.Event()

    def is_open(self) -> bool:
        return self.ser is not None and self.ser.is_open

    def list_ports(self) -> list[dict]:
        ports = []
        for p in serial.tools.list_ports.comports():
            ports.append({
                "port": p.device,
                "description": p.description,
                "hwid": p.hwid,
            })
        return ports

    async def open(self, port: str, baud: int = 115200) -> str:
        if self.is_open():
            raise RuntimeError(f"Already connected to {self.ser.port}")
        try:
            self.ser = await asyncio.to_thread(
                serial.Serial, port, baud, timeout=1, write_timeout=1,
            )
            logger.info("serial: opened %s @ %d", port, baud)
            return f"Connected to {port} @ {baud}"
        except serial.SerialException as e:
            self.ser = None
            raise RuntimeError(str(e))

    async def send(self, data: str) -> None:
        if not self.is_open():
            raise RuntimeError("Serial port not open")
        encoded = data.encode("utf-8")
        await asyncio.to_thread(self.ser.write, encoded)

    async def read_all(self) -> str:
        if not self.is_open():
            return ""
        data = await asyncio.to_thread(self.ser.read_all)
        return data.decode("utf-8", errors="replace") if data else ""

    async def read_until_timeout(self) -> str:
        if not self.is_open():
            return ""
        data = await asyncio.to_thread(self.ser.read_until)
        return data.decode("utf-8", errors="replace") if data else ""

    def close(self) -> None:
        self._cancel_event.set()
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
        self._cancel_event.clear()


_session = SerialSession()


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
        while True:
            try:
                data = await _session.read_until_timeout()
                if data:
                    await send({"type": "data", "data": data})
            except Exception as e:
                await send({"type": "error", "message": str(e)})
                break

    serial_reader_task: asyncio.Task | None = None

    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type", "")

            if msg_type == "ports":
                ports = _session.list_ports()
                await send({"type": "ports", "ports": ports})

            elif msg_type == "open":
                try:
                    _session.close()
                    port = msg.get("port", "")
                    baud = int(msg.get("baud", 115200))
                    result = await _session.open(port, baud)
                    await send({"type": "opened", "message": result, "port": port, "baud": baud})
                    serial_reader_task = asyncio.create_task(reader_loop())
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
                if serial_reader_task:
                    serial_reader_task.cancel()
                    serial_reader_task = None
                await send({"type": "closed"})

            elif msg_type == "flush":
                data = await _session.read_all()
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
        if serial_reader_task:
            serial_reader_task.cancel()
