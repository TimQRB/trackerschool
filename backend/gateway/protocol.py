"""HC02 wire protocol codec.

Frame: [0x40 0x50] [proto_type:2B big-endian] [data_len:2B big-endian] [json bytes]
"""
import asyncio
import json
import struct
from dataclasses import dataclass

SYNC = b"\x40\x50"
HEADER_LEN = 6  # sync(2) + type(2) + len(2)


@dataclass
class Frame:
    proto_type: int
    payload: dict

    def encode(self) -> bytes:
        body = json.dumps(self.payload, ensure_ascii=False).encode("utf-8")
        return SYNC + struct.pack(">HH", self.proto_type, len(body)) + body


async def read_frame(reader: asyncio.StreamReader) -> Frame | None:
    """Read one frame from the stream. Returns None on EOF."""
    header = await reader.readexactly(HEADER_LEN)
    if header[:2] != SYNC:
        raise ValueError(f"bad sync bytes: {header[:2].hex()}")
    proto_type, length = struct.unpack(">HH", header[2:6])
    body = await reader.readexactly(length) if length > 0 else b""
    try:
        payload = json.loads(body.decode("utf-8")) if body else {}
    except json.JSONDecodeError as e:
        raise ValueError(f"invalid JSON: {e}; raw={body!r}")
    return Frame(proto_type=proto_type, payload=payload)


# Protocol type constants (from HC02 docs)
P_LINK = 0x0000
P_HEARTBEAT = 0x03DC
P_POSITION = 0x03E1
P_IMMEDIATE_LOC = 0x03DD
P_ALARM = 0x03DB
P_SET_CONTACTS = 0x03D0
P_SET_CLASSROOM = 0x03D7
P_CALL_LOG = 0x0312
P_HEART_RATE = 0x105E
P_BLOOD_OXYGEN = 0x1063
P_SET_POS_PERIOD = 0x03D1
