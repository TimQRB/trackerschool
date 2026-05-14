"""HC02 TCP gateway.

Two TCP listeners:
  - Registration center (port 13000): replies once with the Service Node address.
  - Service node (port 13001): long-lived connection per device. Handles Link,
    Heartbeat, Periodic positioning, Alarms. Translates to our internal data model.

Devices are looked up by IMEI in the same database backend uses. New IMEI on
first Link is auto-created as an unbound device (no student) so the operator
can attach it from admin UI later.
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy import select

from app.bus import publish, set_loop
from app.config import settings
from app.database import SessionLocal
from app.geofence_service import check_transitions
from app.notify import send_push_to_parents
from app.models import (
    AttendanceLog,
    CallLog,
    Device,
    Event,
    EventType,
    HealthRecord,
    LocationPoint,
    Severity,
    Student,
)

from .protocol import (
    Frame,
    P_ALARM,
    P_BLOOD_OXYGEN,
    P_CALL_LOG,
    P_HEARTBEAT,
    P_HEART_RATE,
    P_IMMEDIATE_LOC,
    P_LINK,
    P_POSITION,
    read_frame,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("hc02-gw")


REG_PORT = int(os.getenv("REG_PORT", "13000"))
SVC_PORT = int(os.getenv("SVC_PORT", "13001"))
PUBLIC_HOST = os.getenv("PUBLIC_HOST", "gateway")
PUBLIC_SVC_PORT = int(os.getenv("PUBLIC_SVC_PORT", str(SVC_PORT)))

# IMEI -> active connection writer (for platform→device commands)
ACTIVE: dict[str, asyncio.StreamWriter] = {}


async def _command_subscriber(imei: str, writer: asyncio.StreamWriter) -> None:
    """Subscribe to dev_cmd:<imei> Redis channel and forward commands to the TCP socket."""
    client = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = client.pubsub()
    await pubsub.subscribe(f"dev_cmd:{imei}")
    log.info("svc: imei=%s subscribed to command channel", imei)
    try:
        async for msg in pubsub.listen():
            if msg.get("type") != "message":
                continue
            try:
                data = json.loads(msg["data"])
                proto_type = int(data["proto_type"])
                payload = data.get("payload") or {}
                frame = Frame(proto_type, payload)
                writer.write(frame.encode())
                await writer.drain()
                log.info("svc: imei=%s -> command 0x%04x sent", imei, proto_type)
            except Exception:
                log.exception("svc: imei=%s failed to forward command", imei)
    except asyncio.CancelledError:
        pass
    finally:
        try:
            await pubsub.unsubscribe(f"dev_cmd:{imei}")
            await pubsub.aclose()
            await client.aclose()
        except Exception:
            pass


# ----------------------- registration center -----------------------

async def reg_handler(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    peer = writer.get_extra_info("peername")
    try:
        frame = await read_frame(reader)
        if not frame or frame.proto_type != P_LINK:
            log.warning("reg: unexpected frame from %s: %s", peer, frame)
            return
        req = frame.payload.get("req", {})
        imei = req.get("identity") or req.get("imei") or "?"
        log.info("reg: %s identity=%s devType=%s model=%s",
                 peer, imei, req.get("devType"), req.get("modelName"))

        reply = Frame(P_LINK, {
            "res": {
                "result": 1,
                "proaddr": f"{PUBLIC_HOST}:{PUBLIC_SVC_PORT}",
            }
        })
        writer.write(reply.encode())
        await writer.drain()
    except asyncio.IncompleteReadError:
        pass
    except Exception:
        log.exception("reg: error from %s", peer)
    finally:
        writer.close()


# ----------------------- service node -----------------------

def _get_or_create_device(db, imei: str, dev_type: str | None, model_name: str | None) -> Device:
    device = db.execute(select(Device).where(Device.imei == imei)).scalar_one_or_none()
    if device is None:
        # Auto-provision: operator binds to a student later via admin UI.
        identifier = f"HC02-{imei[-6:]}"
        import secrets
        device = Device(
            identifier=identifier,
            imei=imei,
            dev_type=dev_type,
            model_name=model_name,
            api_key="hc02-" + secrets.token_urlsafe(16),
        )
        db.add(device)
        db.commit()
        db.refresh(device)
        log.info("auto-provisioned device id=%s imei=%s identifier=%s", device.id, imei, identifier)
    else:
        changed = False
        if dev_type and device.dev_type != dev_type:
            device.dev_type = dev_type; changed = True
        if model_name and device.model_name != model_name:
            device.model_name = model_name; changed = True
        if changed:
            db.commit()
    return device


def _handle_position(db, device: Device, body: dict) -> None:
    """0x03E1 — periodic positioning. Mode 4 = raw GPS (lat/lon present)."""
    if not device.student_id:
        log.info("position from imei=%s: device not bound to student, skipping", device.imei)
        return
    lat = body.get("lat")
    lon = body.get("lon")
    if lat is None or lon is None:
        # Mode 2 (base station) / 3 (wifi) — we don't resolve those server-side in MVP
        log.info("position imei=%s mode=%s lat/lon empty (base/wifi locate not supported yet)",
                 device.imei, body.get("mode"))
        return
    try:
        lat = float(lat); lon = float(lon)
    except (TypeError, ValueError):
        log.warning("position imei=%s: bad lat/lon %r %r", device.imei, lat, lon)
        return

    battery = body.get("battery")
    if isinstance(battery, str):
        try: battery = int(battery)
        except ValueError: battery = None

    student = db.get(Student, device.student_id)
    point = LocationPoint(
        device_id=device.id,
        lat=lat,
        lon=lon,
        battery=battery if isinstance(battery, int) else None,
    )
    db.add(point)

    device.last_seen_at = datetime.now(timezone.utc)
    if isinstance(battery, int):
        device.last_battery = battery

    new_events = check_transitions(db, device, student, lat, lon)
    db.commit()
    db.refresh(point)

    publish({
        "type": "location",
        "payload": {
            "student_id": student.id,
            "student_name": student.full_name,
            "device_id": device.id,
            "lat": lat,
            "lon": lon,
            "battery": point.battery,
            "speed": None,
            "recorded_at": point.recorded_at.isoformat(),
        },
    })
    for evt in new_events:
        publish({
            "type": "event",
            "payload": {
                "id": evt.id,
                "student_id": evt.student_id,
                "student_name": student.full_name,
                "event_type": evt.event_type,
                "severity": evt.severity,
                "message": evt.message,
                "lat": evt.lat,
                "lon": evt.lon,
                "created_at": evt.created_at.isoformat(),
            },
        })

        if evt.event_type == EventType.SOS.value:
            send_push_to_parents(
                student_id=student.id,
                title="SOS! Тревога",
                body=evt.message,
                data={"type": "sos", "student_id": str(student.id), "lat": str(evt.lat), "lon": str(evt.lon)},
            )
        elif evt.event_type in (EventType.ENTER_ZONE.value, EventType.EXIT_ZONE.value):
            send_push_to_parents(
                student_id=student.id,
                title="Уведомление о геозоне",
                body=evt.message,
                data={"type": "geofence", "student_id": str(student.id)},
            )
        elif evt.event_type == EventType.LOW_BATTERY.value:
            send_push_to_parents(
                student_id=student.id,
                title="Низкий заряд батареи",
                body=evt.message,
                data={"type": "low_battery", "student_id": str(student.id), "battery": str(battery)},
            )


def _handle_alarm(db, device: Device, body: dict) -> None:
    """0x03DB — alarms (1=power on, 2=power off, 3=SOS)."""
    if not device.student_id:
        return
    alarm_type = body.get("type")
    student = db.get(Student, device.student_id)

    lat = body.get("lat")
    lon = body.get("lon")
    try:
        lat = float(lat) if lat is not None else None
        lon = float(lon) if lon is not None else None
    except (TypeError, ValueError):
        lat = lon = None

    if alarm_type == 3:
        evt_type = EventType.SOS.value
        severity = Severity.CRITICAL.value
        msg = f"SOS! Ученик {student.full_name} нажал тревожную кнопку"
    elif alarm_type == 1:
        evt_type = "power_on"
        severity = Severity.INFO.value
        msg = f"Устройство ученика {student.full_name} включено"
    elif alarm_type == 2:
        evt_type = "power_off"
        severity = Severity.WARNING.value
        msg = f"Устройство ученика {student.full_name} выключено"
    else:
        log.info("alarm imei=%s unknown type=%s", device.imei, alarm_type)
        return

    evt = Event(
        student_id=student.id,
        event_type=evt_type,
        severity=severity,
        message=msg,
        lat=lat,
        lon=lon,
    )
    db.add(evt)
    db.commit()
    db.refresh(evt)

    publish({
        "type": "event",
        "payload": {
            "id": evt.id,
            "student_id": evt.student_id,
            "student_name": student.full_name,
            "event_type": evt.event_type,
            "severity": evt.severity,
            "message": evt.message,
            "lat": evt.lat,
            "lon": evt.lon,
            "created_at": evt.created_at.isoformat(),
        },
    })

    if alarm_type == 3:
        send_push_to_parents(
            student_id=student.id,
            title="SOS! Тревога",
            body=msg,
            data={"type": "sos", "student_id": str(student.id), "lat": str(lat), "lon": str(lon)},
        )


def _handle_heartbeat(db, device: Device, body: dict) -> None:
    """0x03DC — heartbeat with battery."""
    device.last_seen_at = datetime.now(timezone.utc)
    battery = body.get("battery")
    if isinstance(battery, str):
        try: battery = int(battery)
        except ValueError: battery = None
    if isinstance(battery, int):
        device.last_battery = battery
    db.commit()


def _handle_heart_rate(db, device: Device, body: dict) -> None:
    """0x105E — heart rate + step data upload."""
    heart_rate = body.get("heartRate")
    steps = body.get("step")
    if heart_rate is None and steps is None:
        return
    try:
        heart_rate = int(heart_rate) if heart_rate is not None else None
        steps = int(steps) if steps is not None else None
    except (TypeError, ValueError):
        return

    rec = HealthRecord(
        device_id=device.id,
        heart_rate=heart_rate,
        steps=steps,
    )
    db.add(rec)
    db.commit()
    log.info("heart-rate imei=%s heart_rate=%s steps=%s", device.imei, heart_rate, steps)


def _handle_blood_oxygen(db, device: Device, body: dict) -> None:
    """0x1063 — blood oxygen (SpO2) data upload."""
    value = body.get("value")
    if value is None:
        return
    try:
        spo2 = float(value)
    except (TypeError, ValueError):
        return

    rec = HealthRecord(
        device_id=device.id,
        spo2=spo2,
    )
    db.add(rec)
    db.commit()
    log.info("blood-oxygen imei=%s spo2=%s", device.imei, spo2)


def _handle_call_log(db, device: Device, body: dict) -> None:
    """0x0312 — call record report from device."""
    number = body.get("number", "")
    direction_raw = body.get("direction", "1")
    duration = body.get("duration", 0)
    time_str = body.get("time", "")

    direction = "outgoing" if direction_raw == "1" else "incoming"
    try:
        duration = int(duration)
    except (TypeError, ValueError):
        duration = 0

    called_at = datetime.now(timezone.utc)
    if time_str:
        try:
            called_at = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            try:
                called_at = datetime.strptime(time_str, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
            except ValueError:
                pass

    log_entry = CallLog(
        device_id=device.id,
        number=number,
        direction=direction,
        duration=duration,
        called_at=called_at,
    )
    db.add(log_entry)
    db.commit()
    log.info("call-log imei=%s number=%s dir=%s dur=%s", device.imei, number, direction, duration)


async def svc_handler(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    peer = writer.get_extra_info("peername")
    log.info("svc: connection from %s", peer)
    imei: str | None = None
    cmd_task: asyncio.Task | None = None
    try:
        while True:
            try:
                frame = await asyncio.wait_for(read_frame(reader), timeout=600)
            except asyncio.TimeoutError:
                log.info("svc: %s idle timeout, closing", peer)
                break
            if frame is None:
                break

            req = frame.payload.get("req", {})

            if frame.proto_type == P_LINK:
                imei = req.get("identity") or req.get("imei")
                if not imei:
                    log.warning("svc: %s link without identity", peer)
                    writer.write(Frame(P_LINK, {"res": {"result": 0, "errText": "no identity"}}).encode())
                    await writer.drain()
                    break

                with SessionLocal() as db:
                    _get_or_create_device(db, imei, req.get("devType"), req.get("modelName"))
                ACTIVE[imei] = writer
                writer.write(Frame(P_LINK, {
                    "res": {
                        "result": 1,
                        "Time": datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"),
                    }
                }).encode())
                await writer.drain()
                log.info("svc: linked imei=%s from %s", imei, peer)
                cmd_task = asyncio.create_task(_command_subscriber(imei, writer))

            elif frame.proto_type == P_HEARTBEAT:
                if imei:
                    with SessionLocal() as db:
                        device = db.execute(select(Device).where(Device.imei == imei)).scalar_one()
                        _handle_heartbeat(db, device, req)
                writer.write(Frame(P_HEARTBEAT, {"res": {"result": 1}}).encode())
                await writer.drain()

            elif frame.proto_type == P_POSITION:
                if imei:
                    with SessionLocal() as db:
                        device = db.execute(select(Device).where(Device.imei == imei)).scalar_one()
                        _handle_position(db, device, req)
                writer.write(Frame(P_POSITION, {"res": {"result": 1}}).encode())
                await writer.drain()

            elif frame.proto_type == P_ALARM:
                if imei:
                    with SessionLocal() as db:
                        device = db.execute(select(Device).where(Device.imei == imei)).scalar_one()
                        _handle_alarm(db, device, req)
                writer.write(Frame(P_ALARM, {"res": {"result": 1}}).encode())
                await writer.drain()

            elif frame.proto_type == P_IMMEDIATE_LOC:
                # Device's reply to our 0x03DD command — payload sits under "res"
                res = frame.payload.get("res", {})
                if imei and res:
                    with SessionLocal() as db:
                        device = db.execute(select(Device).where(Device.imei == imei)).scalar_one()
                        _handle_position(db, device, res)
                log.info("svc: imei=%s immediate-location reply", imei)

            elif frame.proto_type == P_HEART_RATE:
                if imei:
                    with SessionLocal() as db:
                        device = db.execute(select(Device).where(Device.imei == imei)).scalar_one()
                        _handle_heart_rate(db, device, req)
                writer.write(Frame(P_HEART_RATE, {"res": {"result": 1}}).encode())
                await writer.drain()
                log.info("svc: imei=%s heart-rate upload", imei)

            elif frame.proto_type == P_BLOOD_OXYGEN:
                if imei:
                    with SessionLocal() as db:
                        device = db.execute(select(Device).where(Device.imei == imei)).scalar_one()
                        _handle_blood_oxygen(db, device, req)
                writer.write(Frame(P_BLOOD_OXYGEN, {"res": {"result": 1}}).encode())
                await writer.drain()
                log.info("svc: imei=%s blood-oxygen upload", imei)

            elif frame.proto_type == P_CALL_LOG:
                if imei:
                    with SessionLocal() as db:
                        device = db.execute(select(Device).where(Device.imei == imei)).scalar_one()
                        _handle_call_log(db, device, req)
                writer.write(Frame(P_CALL_LOG, {"res": {"result": 1}}).encode())
                await writer.drain()
                log.info("svc: imei=%s call-log upload", imei)

            else:
                log.info("svc: imei=%s unhandled proto 0x%04x payload=%s",
                         imei, frame.proto_type, frame.payload)
                # acknowledge anyway so device doesn't retransmit
                writer.write(Frame(frame.proto_type, {"res": {"result": 1}}).encode())
                await writer.drain()
    except asyncio.IncompleteReadError:
        log.info("svc: imei=%s peer %s closed", imei, peer)
    except Exception:
        log.exception("svc: error in handler imei=%s", imei)
    finally:
        if cmd_task is not None:
            cmd_task.cancel()
        if imei and ACTIVE.get(imei) is writer:
            ACTIVE.pop(imei, None)
        writer.close()


async def main():
    set_loop(asyncio.get_running_loop())
    log.info("admin: %s / %s", settings.admin_email, settings.admin_password)

    reg = await asyncio.start_server(reg_handler, host="0.0.0.0", port=REG_PORT)
    svc = await asyncio.start_server(svc_handler, host="0.0.0.0", port=SVC_PORT)
    log.info("HC02 registration center on :%d, service node on :%d", REG_PORT, SVC_PORT)
    log.info("registration replies with proaddr=%s:%d", PUBLIC_HOST, PUBLIC_SVC_PORT)

    async with reg, svc:
        await asyncio.gather(reg.serve_forever(), svc.serve_forever())


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
