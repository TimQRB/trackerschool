"""Bootstrap: create extension, create tables, seed admin + demo data."""
import secrets

from shapely import wkt
from shapely.geometry import Polygon
from sqlalchemy import select, text

from .database import Base, SessionLocal, engine
from .models import Device, Geofence, Role, Student, User, ZoneType
from .security import hash_password
from .config import settings


def init() -> None:
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        conn.commit()

    Base.metadata.create_all(engine)

    # idempotent column additions (no Alembic in MVP)
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS imei VARCHAR(32) UNIQUE"))
        conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS dev_type VARCHAR(16)"))
        conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS model_name VARCHAR(32)"))
        conn.commit()

    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == settings.admin_email)).scalar_one_or_none()
        if not admin:
            admin = User(
                email=settings.admin_email,
                password_hash=hash_password(settings.admin_password),
                full_name="Администратор",
                role=Role.ADMIN.value,
            )
            db.add(admin)

        parent = db.execute(select(User).where(User.email == "parent@safemektep.kz")).scalar_one_or_none()
        if not parent:
            parent = User(
                email="parent@safemektep.kz",
                password_hash=hash_password("parent123"),
                full_name="Айгуль Касымова",
                role=Role.PARENT.value,
            )
            db.add(parent)

        school = db.execute(select(User).where(User.email == "school@safemektep.kz")).scalar_one_or_none()
        if not school:
            school = User(
                email="school@safemektep.kz",
                password_hash=hash_password("school123"),
                full_name="Школа №42",
                role=Role.SCHOOL.value,
            )
            db.add(school)
        db.commit()
        db.refresh(parent)

        student = db.execute(select(Student).where(Student.full_name == "Ержан Касымов")).scalar_one_or_none()
        if not student:
            student = Student(
                full_name="Ержан Касымов",
                class_name="5А",
                parent_id=parent.id,
            )
            db.add(student)
            db.commit()
            db.refresh(student)

        device = db.execute(select(Device).where(Device.identifier == "DEMO-001")).scalar_one_or_none()
        if not device:
            device = Device(
                identifier="DEMO-001",
                imei="865687062604820",
                dev_type="1032",
                model_name="HC02",
                student_id=student.id,
                api_key="demo-key-please-change-" + secrets.token_urlsafe(8),
            )
            db.add(device)
            db.commit()
            db.refresh(device)
        elif not device.imei:
            device.imei = "865687062604820"
            device.dev_type = "1032"
            device.model_name = "HC02"
            db.commit()
            db.refresh(device)

        # School zone in Almaty (around Abai Square area)
        existing_school_zone = db.execute(
            select(Geofence).where(Geofence.name == "Школа №42")
        ).scalar_one_or_none()
        if not existing_school_zone:
            school_poly = Polygon([
                (76.9280, 43.2380),
                (76.9300, 43.2380),
                (76.9300, 43.2400),
                (76.9280, 43.2400),
                (76.9280, 43.2380),
            ])
            db.add(Geofence(
                name="Школа №42",
                zone_type=ZoneType.SCHOOL.value,
                polygon=f"SRID=4326;{wkt.dumps(school_poly)}",
                student_id=None,
            ))

        existing_home_zone = db.execute(
            select(Geofence).where(Geofence.name == "Дом Ержана")
        ).scalar_one_or_none()
        if not existing_home_zone:
            home_poly = Polygon([
                (76.9180, 43.2300),
                (76.9200, 43.2300),
                (76.9200, 43.2320),
                (76.9180, 43.2320),
                (76.9180, 43.2300),
            ])
            db.add(Geofence(
                name="Дом Ержана",
                zone_type=ZoneType.HOME.value,
                polygon=f"SRID=4326;{wkt.dumps(home_poly)}",
                student_id=student.id,
            ))

        db.commit()

        print("=" * 60)
        print("SafeMektep инициализирован")
        print(f"Админ:    {settings.admin_email} / {settings.admin_password}")
        print("Школа:    school@safemektep.kz / school123")
        print("Родитель: parent@safemektep.kz / parent123")
        print(f"Устройство DEMO-001 IMEI: {device.imei}")
        print(f"Устройство DEMO-001 API key: {device.api_key}")
        print("=" * 60)
    finally:
        db.close()
