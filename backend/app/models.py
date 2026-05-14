from datetime import date, datetime, timezone
from enum import Enum

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, Enum):
    PARENT = "parent"
    SCHOOL = "school"
    ADMIN = "admin"


class ZoneType(str, Enum):
    SCHOOL = "school"
    HOME = "home"
    ROUTE = "route"


class ContactType(str, Enum):
    FAMILY = "family"  # vendor type 1
    SOS = "sos"        # vendor type 2
    WHITELIST = "whitelist"  # vendor type 3


CONTACT_TYPE_TO_VENDOR = {
    ContactType.FAMILY.value: 1,
    ContactType.SOS.value: 2,
    ContactType.WHITELIST.value: 3,
}


class EventType(str, Enum):
    ENTER_ZONE = "enter_zone"
    EXIT_ZONE = "exit_zone"
    SOS = "sos"
    LOW_BATTERY = "low_battery"
    LOST_SIGNAL = "lost_signal"


class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32))
    fcm_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    students: Mapped[list["Student"]] = relationship(back_populates="parent")


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255))
    class_name: Mapped[str] = mapped_column(String(64))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    parent: Mapped["User | None"] = relationship(back_populates="students")
    device: Mapped["Device | None"] = relationship(back_populates="student", uselist=False)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    identifier: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    imei: Mapped[str | None] = mapped_column(String(32), unique=True, index=True, nullable=True)
    dev_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(32), nullable=True)
    student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id"), nullable=True)
    api_key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_battery: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    student: Mapped["Student | None"] = relationship(back_populates="device")


class Geofence(Base):
    __tablename__ = "geofences"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    zone_type: Mapped[str] = mapped_column(String(32))
    polygon = mapped_column(Geometry("POLYGON", srid=4326))
    student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LocationPoint(Base):
    __tablename__ = "location_points"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    battery: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(32))
    severity: Mapped[str] = mapped_column(String(16))
    geofence_id: Mapped[int | None] = mapped_column(ForeignKey("geofences.id"), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Contact(Base):
    """Phone contact configured on a device: family / SOS / whitelist."""
    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    contact_type: Mapped[str] = mapped_column(String(16))  # family | sos | whitelist
    number: Mapped[str] = mapped_column(String(32))
    display_name: Mapped[str] = mapped_column(String(64))
    serial_no: Mapped[int] = mapped_column(Integer, default=0)  # order within type (1..3 for family/sos)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DeviceZoneState(Base):
    """Tracks whether a device is currently inside a given geofence (to detect transitions)."""
    __tablename__ = "device_zone_states"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    geofence_id: Mapped[int] = mapped_column(ForeignKey("geofences.id"), index=True)
    is_inside: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class HealthRecord(Base):
    """Heart rate, SpO2, steps reported by device."""
    __tablename__ = "health_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    heart_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    spo2: Mapped[float | None] = mapped_column(Float, nullable=True)
    steps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class AttendanceLog(Base):
    """School attendance: enter/exit times for each student per day."""
    __tablename__ = "attendance_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    enter_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    exit_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="present")


class CallLog(Base):
    """Call history reported by device (protocol 0x0312)."""
    __tablename__ = "call_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    number: Mapped[str] = mapped_column(String(32))
    direction: Mapped[str] = mapped_column(String(16))  # incoming | outgoing
    duration: Mapped[int] = mapped_column(Integer, default=0)
    called_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
