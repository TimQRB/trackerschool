"""Simple in-process pub/sub for WebSocket broadcasting.

Backed by an asyncio.Queue per subscriber. The HTTP ingest endpoint posts events
via `publish_threadsafe` (called from sync code) and WebSocket consumers pull
from their queues.
"""
import asyncio
import json
from typing import Any


_subscribers: set[asyncio.Queue] = set()
_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


async def _broadcast(message: dict[str, Any]) -> None:
    data = json.dumps(message, default=str)
    for q in list(_subscribers):
        try:
            q.put_nowait(data)
        except asyncio.QueueFull:
            pass


def publish(message: dict[str, Any]) -> None:
    """Thread-safe publish callable from sync request handlers."""
    if _loop is None:
        return
    asyncio.run_coroutine_threadsafe(_broadcast(message), _loop)
