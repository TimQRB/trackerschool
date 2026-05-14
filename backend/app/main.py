import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import bus
from .init_db import init
from .routers import auth, contacts, devices, events, geofences, locations, students, users, ws
from .routers import attendance, commands, device_config, health, notifications


@asynccontextmanager
async def lifespan(app: FastAPI):
    bus.set_loop(asyncio.get_running_loop())
    init()
    yield


app = FastAPI(title="SafeMektep API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(students.router)
app.include_router(devices.router)
app.include_router(geofences.router)
app.include_router(locations.router)
app.include_router(events.router)
app.include_router(contacts.router)
app.include_router(device_config.router)
app.include_router(ws.router)
app.include_router(notifications.router)
app.include_router(attendance.router)
app.include_router(commands.router)
app.include_router(health.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
