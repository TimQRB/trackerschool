"""Firebase Cloud Messaging push notification sender.

Usage:
    from .notify import send_push

    send_push(user_id=2, title="SOS!", body="...", data={...})

Initialise with FIREBASE_CREDENTIALS env var (path to service account JSON)
or place the file at /app/firebase-credentials.json in the container.
"""
import os
from typing import Any

from .database import SessionLocal
from .models import Student, User

_fcm_app = None


def _get_fcm_app():
    global _fcm_app
    if _fcm_app is not None:
        return _fcm_app

    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError:
        return None

    if firebase_admin._apps:
        _fcm_app = firebase_admin.get_app()
        return _fcm_app

    cred_path = os.getenv("FIREBASE_CREDENTIALS", "/app/firebase-credentials.json")
    if not os.path.isfile(cred_path):
        return None

    cred = credentials.Certificate(cred_path)
    _fcm_app = firebase_admin.initialize_app(cred)
    return _fcm_app


def send_push(
    user_id: int,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> bool:
    """Send a push notification to a user by their user_id.

    Returns True if sent, False if the user has no FCM token or FCM unavailable.
    """
    app = _get_fcm_app()
    if app is None:
        return False

    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user or not user.fcm_token:
            return False

        from firebase_admin import messaging

        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            token=user.fcm_token,
        )
        messaging.send(message, app=app)
        return True
    except Exception:
        return False
    finally:
        db.close()


def send_push_to_parents(
    student_id: int,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> int:
    """Send push to all parents of a given student. Returns count sent."""
    db = SessionLocal()
    try:
        student = db.get(Student, student_id)
        if not student or not student.parent_id:
            return 0
        sent = send_push(student.parent_id, title, body, data)
        return 1 if sent else 0
    finally:
        db.close()
