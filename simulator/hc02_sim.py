"""HC02 device simulator over the real TCP protocol.

Flow:
  1. Connect to Registration Center -> get Service Node address (or skip with --direct).
  2. Disconnect from registration.
  3. Connect to Service Node.
  4. Send Link (0x0000).
  5. Loop: send periodic position (0x03E1) and heartbeat (0x03DC).
     - Type 's' + Enter to fire SOS alarm (0x03DB).
     - Type 'q' + Enter to quit.

Usage:
    python hc02_sim.py --reg-host localhost --reg-port 13000 --imei 865687062604820
"""
import argparse
import asyncio
import json
import math
import struct
import sys
import time

SYNC = b"\x40\x50"
P_LINK = 0x0000
P_HEARTBEAT = 0x03DC
P_POSITION = 0x03E1
P_ALARM = 0x03DB
P_IMMEDIATE_LOC = 0x03DD

HOME = (43.2310, 76.9190)
SCHOOL = (43.2390, 76.9290)

CURRENT_POS = {"lat": HOME[0], "lon": HOME[1], "battery": 95}


def encode(proto_type: int, payload: dict) -> bytes:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return SYNC + struct.pack(">HH", proto_type, len(body)) + body


async def read_frame(reader: asyncio.StreamReader):
    header = await reader.readexactly(6)
    if header[:2] != SYNC:
        raise ValueError(f"bad sync: {header[:2].hex()}")
    proto_type, length = struct.unpack(">HH", header[2:6])
    body = await reader.readexactly(length) if length > 0 else b""
    return proto_type, (json.loads(body.decode("utf-8")) if body else {})


def interpolate(a, b, steps):
    for i in range(steps):
        t = i / max(steps - 1, 1)
        yield (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def stationary(point, count):
    for _ in range(count):
        yield (point[0] + math.sin(time.time()) * 5e-5,
               point[1] + math.cos(time.time()) * 5e-5)


def build_route():
    yield from stationary(HOME, 5)
    yield from interpolate(HOME, SCHOOL, 30)
    yield from stationary(SCHOOL, 30)
    yield from interpolate(SCHOOL, HOME, 30)
    yield from stationary(HOME, 5)


def stdin_has_data() -> bool:
    if sys.platform == "win32":
        import msvcrt
        return msvcrt.kbhit()
    import select
    return bool(select.select([sys.stdin], [], [], 0)[0])


def read_command():
    if not stdin_has_data():
        return None
    return sys.stdin.readline().strip().lower() or None


async def request_service_node(reg_host: str, reg_port: int, imei: str, model: str, dev_type: str):
    print(f"[sim] connecting to registration center {reg_host}:{reg_port}")
    reader, writer = await asyncio.open_connection(reg_host, reg_port)
    writer.write(encode(P_LINK, {"req": {
        "devType": dev_type,
        "modelName": model,
        "identity": imei,
        "keepAlive": 1,
    }}))
    await writer.drain()
    proto, payload = await read_frame(reader)
    writer.close()
    await writer.wait_closed()
    res = payload.get("res", {})
    if res.get("result") != 1:
        raise RuntimeError(f"registration failed: {payload}")
    proaddr = res.get("proaddr", "")
    host, port = proaddr.rsplit(":", 1)
    print(f"[sim] registration ok, service node = {host}:{port}")
    return host, int(port)


async def run(args):
    imei = args.imei
    model = args.model
    dev_type = args.dev_type

    if args.direct:
        svc_host, svc_port = args.svc_host, args.svc_port
    else:
        svc_host, svc_port = await request_service_node(
            args.reg_host, args.reg_port, imei, model, dev_type
        )

    # On host machine, gateway advertises itself as "gateway:13001" (docker hostname).
    # Override if simulator runs on the host directly.
    if args.override_svc_host:
        svc_host = args.override_svc_host

    print(f"[sim] connecting to service node {svc_host}:{svc_port}")
    reader, writer = await asyncio.open_connection(svc_host, svc_port)

    writer.write(encode(P_LINK, {"req": {
        "devType": dev_type,
        "modelName": model,
        "identity": imei,
    }}))
    await writer.drain()
    proto, payload = await read_frame(reader)
    if payload.get("res", {}).get("result") != 1:
        print(f"[sim] link failed: {payload}")
        return
    print(f"[sim] linked, server time = {payload['res'].get('Time')}")
    print("[sim] sending positions. Commands: 's'=SOS, 'b'=low battery, 'q'=quit")

    battery = 95
    last_heartbeat = time.time()

    async def reader_task():
        try:
            while True:
                proto, payload = await read_frame(reader)
                print(f"[sim] <- 0x{proto:04x}: {payload}")
                if proto == P_IMMEDIATE_LOC:
                    # Platform asks for our current location → reply with same proto
                    print("[sim] *** immediate-location requested, replying ***")
                    writer.write(encode(P_IMMEDIATE_LOC, {"res": {
                        "Result": "1",
                        "mode": "4",
                        "lat": str(CURRENT_POS["lat"]),
                        "lon": str(CURRENT_POS["lon"]),
                        "battery": CURRENT_POS["battery"],
                        "bts": "460,00,25505,96266004,-65",
                    }}))
                    await writer.drain()
        except (asyncio.IncompleteReadError, ConnectionResetError):
            print("[sim] server closed connection")

    rt = asyncio.create_task(reader_task())

    try:
        while True:
            for lat, lon in build_route():
                cmd = read_command()
                if cmd == "q":
                    print("[sim] quit")
                    return
                if cmd == "s":
                    print("[sim] *** SOS ***")
                    writer.write(encode(P_ALARM, {"req": {
                        "type": 3,
                        "time": time.strftime("%Y%m%d%H%M%S"),
                        "lat": lat,
                        "lon": lon,
                        "mode": "4",
                        "bts": "460,00,25505,96266004,-65",
                    }}))
                    await writer.drain()
                if cmd == "b":
                    print("[sim] battery -> 10%")
                    battery = 10

                CURRENT_POS["lat"] = lat
                CURRENT_POS["lon"] = lon
                CURRENT_POS["battery"] = battery
                writer.write(encode(P_POSITION, {"req": {
                    "imei": imei,
                    "mode": "4",
                    "lat": str(lat),
                    "lon": str(lon),
                    "battery": battery,
                    "bts": "460,00,25505,96266004,-65",
                    "step": 0,
                }}))
                await writer.drain()
                print(f"[sim] -> pos ({lat:.5f}, {lon:.5f}) battery={battery}%")

                if time.time() - last_heartbeat > 60:
                    writer.write(encode(P_HEARTBEAT, {"req": {"battery": battery, "status": 3}}))
                    await writer.drain()
                    last_heartbeat = time.time()
                    print("[sim] -> heartbeat")

                if battery > 1 and int(time.time()) % 30 == 0:
                    battery = max(1, battery - 1)

                await asyncio.sleep(args.interval)
    finally:
        rt.cancel()
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--reg-host", default="localhost")
    p.add_argument("--reg-port", type=int, default=13000)
    p.add_argument("--svc-host", default="localhost")
    p.add_argument("--svc-port", type=int, default=13001)
    p.add_argument("--override-svc-host", default="localhost",
                   help="Override service node host returned by registry (registry returns docker hostname)")
    p.add_argument("--direct", action="store_true",
                   help="Skip registration center, connect directly to service node")
    p.add_argument("--imei", default="865687062604820")
    p.add_argument("--model", default="HC02")
    p.add_argument("--dev-type", default="1032")
    p.add_argument("--interval", type=float, default=2.0)
    return p.parse_args()


if __name__ == "__main__":
    try:
        asyncio.run(run(parse_args()))
    except KeyboardInterrupt:
        print("\n[sim] stopped")
