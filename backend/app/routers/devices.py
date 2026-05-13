import secrets
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..device_commands import send_command
from ..models import Device, Role, Student, User
from ..schemas import DeviceCreate, DeviceOut
from ..security import get_current_user, require_roles


router = APIRouter(prefix="/api/devices", tags=["devices"])


@router.get("", response_model=list[DeviceOut])
def list_devices(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    return db.execute(select(Device)).scalars().all()


@router.post("", response_model=DeviceOut, status_code=201)
def create_device(
    payload: DeviceCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    if db.execute(select(Device).where(Device.identifier == payload.identifier)).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Устройство с таким идентификатором уже есть")
    if payload.student_id is not None:
        student = db.get(Student, payload.student_id)
        if not student:
            raise HTTPException(status_code=400, detail="Ученик не найден")
        if student.device:
            raise HTTPException(status_code=409, detail="У ученика уже есть устройство")
    device = Device(
        identifier=payload.identifier,
        student_id=payload.student_id,
        api_key=secrets.token_urlsafe(24),
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.post("/{device_id}/locate-now")
def locate_now(
    device_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    """Push 0x03DD Immediate Location command to the device through the gateway."""
    device = db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Устройство не найдено")
    if user.role == Role.PARENT.value:
        student = db.get(Student, device.student_id) if device.student_id else None
        if not student or student.parent_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
    if not device.imei:
        raise HTTPException(status_code=400, detail="У устройства не задан IMEI")

    task_id = f"loc-{int(time.time() * 1000)}"
    subscribers = send_command(device.imei, 0x03DD, {"req": {"taskId": task_id}})
    if subscribers == 0:
        return {"ok": False, "reason": "Устройство сейчас не на связи", "task_id": task_id}
    return {"ok": True, "task_id": task_id}


@router.post("/{device_id}/assign/{student_id}", response_model=DeviceOut)
def assign_device(
    device_id: int,
    student_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    device = db.get(Device, device_id)
    student = db.get(Student, student_id)
    if not device or not student:
        raise HTTPException(status_code=404, detail="Не найдено")
    if student.device and student.device.id != device.id:
        raise HTTPException(status_code=409, detail="У ученика уже есть устройство")
    device.student_id = student_id
    db.commit()
    db.refresh(device)
    return device
