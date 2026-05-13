"""Publish commands from backend (REST) to gateway (TCP gateway subscribers).

Channel format: dev_cmd:<imei>
Payload: JSON {"proto_type": int, "payload": dict}
"""
import json

import redis

from .config import settings


_redis: redis.Redis | None = None


def _client() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def channel(imei: str) -> str:
    return f"dev_cmd:{imei}"


def send_command(imei: str, proto_type: int, payload: dict) -> int:
    """Publish a command to the device's gateway connection.

    Returns the number of subscribers that received the message (0 if device is offline).
    """
    msg = json.dumps({"proto_type": proto_type, "payload": payload})
    return _client().publish(channel(imei), msg)
