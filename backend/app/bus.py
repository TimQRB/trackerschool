"""Cross-process Redis Pub/Sub bus for WebSocket broadcasting.

The backend process runs a single background listener that reads from the
"safemektep:events" Redis channel and fans messages out to all local
WebSocket subscribers (asyncio.Queue each).

`publish()` is synchronous and safe to call from any process / thread —
both the backend HTTP handlers and the gateway TCP handlers use it. This
replaces the previous in-process-only bus, which was silently broken
between gateway and backend because Python module globals are per-process.
"""
import asyncio
import json
import logging
from typing import Any

import redis
import redis.asyncio as aioredis

from .config import settings


log = logging.getLogger(__name__)

CHANNEL = "safemektep:events"

_subscribers: set[asyncio.Queue] = set()
_sync_redis: redis.Redis | None = None
_listener_task: asyncio.Task | None = None


def _client() -> redis.Redis:
    global _sync_redis
    if _sync_redis is None:
        _sync_redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _sync_redis


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


def publish(message: dict[str, Any]) -> None:
    """Synchronous publish — safe from any process or thread."""
    try:
        _client().publish(CHANNEL, json.dumps(message, default=str))
    except Exception:
        log.exception("bus publish failed")


async def _listen_forever() -> None:
    """Background task: read from Redis, fan out to local asyncio queues."""
    while True:
        try:
            client = aioredis.from_url(settings.redis_url, decode_responses=True)
            pubsub = client.pubsub()
            await pubsub.subscribe(CHANNEL)
            log.info("bus: subscribed to %s", CHANNEL)
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                data = msg["data"]
                for q in list(_subscribers):
                    try:
                        q.put_nowait(data)
                    except asyncio.QueueFull:
                        pass
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("bus listener error, reconnecting in 2s")
            await asyncio.sleep(2)


async def start_listener() -> None:
    global _listener_task
    if _listener_task is None or _listener_task.done():
        _listener_task = asyncio.create_task(_listen_forever())


async def stop_listener() -> None:
    global _listener_task
    if _listener_task is not None:
        _listener_task.cancel()
        try:
            await _listener_task
        except BaseException:
            pass
        _listener_task = None


# --- backwards compat shim ---
# Old code called bus.set_loop(loop) at startup; the new Redis-backed bus
# doesn't need the loop. Keep the function as a no-op so existing call sites
# don't break.
def set_loop(_loop: asyncio.AbstractEventLoop) -> None:  # pragma: no cover
    pass
