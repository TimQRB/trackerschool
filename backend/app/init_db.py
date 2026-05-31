"""Bootstrap: create extension, create tables, seed admin + demo data."""
import secrets

from shapely import wkt
from shapely.geometry import Polygon
from sqlalchemy import select, text

from .database import Base, SessionLocal, engine
from .models import Device, Geofence, Role, Student, User, ZoneType, School
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
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token VARCHAR(512)"))
        conn.commit()

    db = SessionLocal()
    try:
        # 1. Сначала подкидываем новые колонки
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id)"))
            conn.execute(text("ALTER TABLE students ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id)"))
            conn.execute(text("ALTER TABLE geofences ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id)"))
            conn.commit()

        # 2. Создаем тестовую Школу (новая сущность)
        demo_school = db.execute(select(School).where(School.name == "Школа №42")).scalar_one_or_none()
        if not demo_school:
            demo_school = School(
                name="Школа №42",
                address="г. Алматы, ул. Абая, 10"
            )
            db.add(demo_school)
            db.commit()
            db.refresh(demo_school)

        # 3. Админ
        admin = db.execute(select(User).where(User.email == settings.admin_email)).scalar_one_or_none()
        if not admin:
            admin = User(
                email=settings.admin_email,
                password_hash=hash_password(settings.admin_password),
                full_name="Администратор",
                role=Role.ADMIN.value,
            )
            db.add(admin)

        # 4. Родитель
        parent = db.execute(select(User).where(User.email == "parent@safemektep.kz")).scalar_one_or_none()
        if not parent:
            parent = User(
                email="parent@safemektep.kz",
                password_hash=hash_password("parent123"),
                full_name="Айгуль Касымова",
                role=Role.PARENT.value,
            )
            db.add(parent)
            db.commit()
            db.refresh(parent)

        # 5. Пользователь-Школа (Привязываем к демо-школе)
        school_user = db.execute(select(User).where(User.email == "school@safemektep.kz")).scalar_one_or_none()
        if not school_user:
            school_user = User(
                email="school@safemektep.kz",
                password_hash=hash_password("school123"),
                full_name="Координатор Школы №42",
                role=Role.SCHOOL.value,
                school_id=demo_school.id
            )
            db.add(school_user)
        else:
            if school_user.school_id is None:
                school_user.school_id = demo_school.id

        db.commit()

        # 6. Студент (Привязываем к демо-школе)
        student = db.execute(select(Student).where(Student.full_name == "Ержан Касымов")).scalar_one_or_none()
        if not student:
            student = Student(
                full_name="Ержан Касымов",
                class_name="5А",
                parent_id=parent.id,
                school_id=demo_school.id
            )
            db.add(student)
            db.commit()
            db.refresh(student)
        else:
            if student.school_id is None:
                student.school_id = demo_school.id
                db.commit()

        # 7. Устройство
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

        # 8. Геозоны (Школа №42)
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
                school_id=demo_school.id
            ))
        else:
            if existing_school_zone.school_id is None:
                existing_school_zone.school_id = demo_school.id

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
        print("SafeMektep initialized with Multi-School support")
        print(f"Админ:    {settings.admin_email} / {settings.admin_password}")
        print("Школа:    school@safemektep.kz / school123")
        print("Родитель: parent@safemektep.kz / parent123")
        print(f"Устройство DEMO-001 IMEI: {device.imei}")
        print(f"Устройство DEMO-001 API key: {device.api_key}")
        print("=" * 60)
    finally:
        db.close()