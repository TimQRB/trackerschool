from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from shapely.geometry import Polygon
from shapely import wkt
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Geofence, Role, Student, User, ZoneType
from ..schemas import GeofenceCreate, GeofenceOut
from ..security import get_current_user, require_roles


router = APIRouter(prefix="/api/geofences", tags=["geofences"])


def _to_out(g: Geofence) -> GeofenceOut:
    shape = to_shape(g.polygon)
    coords = [[x, y] for x, y in shape.exterior.coords]
    return GeofenceOut(
        id=g.id,
        name=g.name,
        zone_type=g.zone_type,
        student_id=g.student_id,
        school_id=g.school_id,
        coordinates=coords,
    )


@router.get("", response_model=list[GeofenceOut])
def list_geofences(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    q = select(Geofence)
    
    if user.role == Role.ADMIN.value:
        pass # Админ видит всё
        
    elif user.role == Role.SCHOOL.value:
        # Школа видит только свои геозоны
        q = q.where(Geofence.school_id == user.school_id)
        
    elif user.role == Role.PARENT.value:
        # Родитель видит:
        # 1. Зоны, привязанные к его детям (Дом)
        # 2. Общие зоны школы, в которой учатся его дети
        student_ids = [s.id for s in user.students]
        school_ids = list(set([s.school_id for s in user.students if s.school_id]))
        
        q = q.where(
            (Geofence.student_id.in_(student_ids)) | 
            ((Geofence.student_id.is_(None)) & (Geofence.school_id.in_(school_ids)))
        )
        
    fences = db.execute(q).scalars().all()
    return [_to_out(f) for f in fences]

@router.post("", response_model=GeofenceOut, status_code=201)
def create_geofence(
    payload: GeofenceCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    if payload.zone_type not in {z.value for z in ZoneType}:
        raise HTTPException(status_code=400, detail="Недопустимый тип зоны")
    if payload.student_id is not None:
        if not db.get(Student, payload.student_id):
            raise HTTPException(status_code=400, detail="Ученик не найден")

    coords = [(c[0], c[1]) for c in payload.coordinates]
    if coords[0] != coords[-1]:
        coords.append(coords[0])
    polygon = Polygon(coords)
    if not polygon.is_valid:
        raise HTTPException(status_code=400, detail="Полигон некорректен")

    fence = Geofence(
        name=payload.name,
        zone_type=payload.zone_type,
        polygon=f"SRID=4326;{wkt.dumps(polygon)}",
        student_id=payload.student_id,
        school_id=user.school_id if user.role == Role.SCHOOL.value else payload.school_id,
    )
    db.add(fence)
    db.commit()
    db.refresh(fence)
    return _to_out(fence)


@router.delete("/{fence_id}", status_code=204)
def delete_geofence(
    fence_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    fence = db.get(Geofence, fence_id)
    if not fence:
        raise HTTPException(status_code=404, detail="Не найдено")
    db.delete(fence)
    db.commit()
