import asyncio

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from ..bus import subscribe, unsubscribe
from ..config import settings


router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, token: str = Query(...)):
    try:
        jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    q = subscribe()
    try:
        while True:
            try:
                data = await asyncio.wait_for(q.get(), timeout=30)
                await websocket.send_text(data)
            except asyncio.TimeoutError:
                await websocket.send_text('{"type":"ping"}')
    except WebSocketDisconnect:
        pass
    finally:
        unsubscribe(q)
