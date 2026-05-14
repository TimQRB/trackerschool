"""Push notification FCM token registration."""
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..security import get_current_user


router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class FCMTokenRequest(BaseModel):
    fcm_token: str
    platform: str = "android"  # "android" | "ios"


@router.post("/register-fcm")
def register_fcm(
    payload: FCMTokenRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    user.fcm_token = payload.fcm_token
    db.commit()
    return {"ok": True}


@router.delete("/unregister-fcm")
def unregister_fcm(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    user.fcm_token = None
    db.commit()
    return {"ok": True}
