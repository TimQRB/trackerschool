from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator


# --- Auth ---

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    full_name: str
    user_id: int
    school_id: int | None = None

# --- Schools ---

class SchoolCreate(BaseModel):
    name: str
    address: str | None = None


class SchoolOut(BaseModel):
    id: int
    name: str
    address: str | None
    created_at: datetime

    class Config:
        from_attributes = True

# --- Users ---

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str  # parent | school | admin
    school_id: int | None = None


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    school_id: int | None = None

    class Config:
        from_attributes = True


# --- Students ---

class StudentCreate(BaseModel):
    full_name: str
    class_name: str
    parent_id: int | None = None
    school_id: int | None = None

    @field_validator('parent_id', 'school_id', mode='before')
    @classmethod
    def transform_ids(cls, v):
        # Если фронтенд прислал пустую строку "" или строку "null", превращаем в None
        if v == "" or v == "null" or v is None:
            return None
        # Если пришла строка, состоящая из цифр (например "12"), конвертируем в int
        if isinstance(v, str):
            v = v.strip()
            if v.isdigit():
                return int(v)
            elif v == "":
                return None
        return v


class StudentOut(BaseModel):
    id: int
    full_name: str
    class_name: str
    parent_id: int | None
    school_id: int | None = None
    parent_email: str | None = None
    device: "DeviceOut | None" = None

    class Config:
        from_attributes = True


# --- Devices ---

class DeviceCreate(BaseModel):
    identifier: str
    student_id: int | None = None


class DeviceOut(BaseModel):
    id: int
    identifier: str
    imei: str | None = None
    dev_type: str | None = None
    model_name: str | None = None
    student_id: int | None
    api_key: str
    last_seen_at: datetime | None
    last_battery: int | None
    is_active: bool

    class Config:
        from_attributes = True


# --- Geofences ---

class GeofenceCreate(BaseModel):
    name: str
    zone_type: str  # school | home | route
    # GeoJSON-like polygon coords: [[lon, lat], ...] — first and last must match
    coordinates: list[list[float]] = Field(..., min_length=4)
    student_id: int | None = None
    school_id: int | None = None


class GeofenceOut(BaseModel):
    id: int
    name: str
    zone_type: str
    student_id: int | None
    school_id: int | None
    coordinates: list[list[float]]


# --- Locations ---

class ContactCreate(BaseModel):
    device_id: int
    contact_type: str  # family | sos | whitelist
    number: str
    display_name: str
    serial_no: int = 0


class ContactOut(BaseModel):
    id: int
    device_id: int
    contact_type: str
    number: str
    display_name: str
    serial_no: int

    class Config:
        from_attributes = True


class LocationIngest(BaseModel):
    lat: float
    lon: float
    accuracy: float | None = None
    speed: float | None = None
    battery: int | None = None
    sos: bool = False


class LocationOut(BaseModel):
    id: int
    device_id: int
    lat: float
    lon: float
    battery: int | None
    speed: float | None
    recorded_at: datetime

    class Config:
        from_attributes = True


# --- Events ---

class EventOut(BaseModel):
    id: int
    student_id: int
    event_type: str
    severity: str
    geofence_id: int | None
    message: str
    lat: float | None
    lon: float | None
    acknowledged: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- WebSocket payloads ---

class WSMessage(BaseModel):
    type: str  # "location" | "event"
    payload: dict[str, Any]


StudentOut.model_rebuild()
