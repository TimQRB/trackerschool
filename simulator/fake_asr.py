"""Fake ASR Modem over TCP — for testing AT Web Terminal without physical hardware.

No serial port drivers needed (no com0com / socat).
Connect from the web terminal's TCP mode.

Usage:
    python simulator/fake_asr.py              # listen on 0.0.0.0:9999
    python simulator/fake_asr.py --port 8888  # custom port
    python simulator/fake_asr.py --host 127.0.0.1  # local only
"""

import argparse
import asyncio

RESPONSES: dict[str, str] = {
    "AT": "\r\nOK\r\n",
    "AT\r": "\r\nOK\r\n",
    "AT+CGMI": "\r\nASR\r\n\r\nOK\r\n",
    "AT+CGMM": "\r\nASR3603S\r\n\r\nOK\r\n",
    "AT+CGSN": "\r\n865687062604820\r\n\r\nOK\r\n",
    "AT+CPIN?": "\r\n+CPIN: READY\r\n\r\nOK\r\n",
    "AT+CSQ": "\r\n+CSQ: 18,0\r\n\r\nOK\r\n",
    "AT+CREG?": "\r\n+CREG: 0,1\r\n\r\nOK\r\n",
    "AT+CGATT?": "\r\n+CGATT: 1\r\n\r\nOK\r\n",
    "AT+CGDCONT?": '\r\n+CGDCONT: 1,"IP","internet","10.10.10.10",0\r\n\r\nOK\r\n',
    "AT+CGPADDR=1": '\r\n+CGPADDR: 1,10.10.10.10\r\n\r\nOK\r\n',
    "AT+COPS?": '\r\n+COPS: 0,0,"Kcell",7\r\n\r\nOK\r\n',
    "AT+CIMI": "\r\n274010123456789\r\n\r\nOK\r\n",
    "AT+CCID": "\r\n89827401012345678901\r\n\r\nOK\r\n",
    "AT+QGPS?": "\r\n+QGPS: 1\r\n\r\nOK\r\n",
    "AT+QGPS=1": "\r\nOK\r\n",
    "AT+QGPS=0": "\r\nOK\r\n",
    "AT+QGMR": "\r\nASR3603S_HC02_V1.2.3\r\n\r\nOK\r\n",
    "AT+VERSION": "\r\nHC02_V2.1.0\r\n\r\nOK\r\n",
    "AT+HEART": "\r\n+HEART: 300\r\n\r\nOK\r\n",
    "AT+HEART=300": "\r\nOK\r\n",
    "AT+SLEEP=0": "\r\nOK\r\n",
    "AT+CGATT=1": "\r\nOK\r\n",
    'AT+CGDCONT=1,"IP","internet"': "\r\nOK\r\n",
    'AT+CGDCONT=1,"IP","internet.beeline.kz"': "\r\nOK\r\n",
    'AT+CGDCONT=1,"IP","internet.tele2.kz"': "\r\nOK\r\n",
    'AT+CGDCONT=1,"IP","internet.activ.kz"': "\r\nOK\r\n",
    'AT+QHTTPCFG="contextid",1': "\r\nOK\r\n",
    "AT+QHTTPURL?": "\r\n+QHTTPURL: 0,0\r\n\r\nOK\r\n",
}

RESET_SEQUENCE = "\r\n\r\nOK\r\n\r\nASR Modem Ready\r\n"


def _normalise(cmd: str) -> str:
    return cmd.strip().rstrip("\r\n")


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    peer = writer.get_extra_info("peername")
    print(f"[fake-asr] connected from {peer}")
    buf = ""
    try:
        while True:
            data = await reader.read(1024)
            if not data:
                break
            text = data.decode("utf-8", errors="replace")
            buf += text
            while "\n" in buf:
                line, buf = buf.split("\n", 1)
                line = _normalise(line)
                if not line:
                    continue
                print(f"[fake-asr] < {line}")
                if line == "AT+RESET":
                    writer.write(RESET_SEQUENCE.encode())
                    await writer.drain()
                    print(f"[fake-asr] > (reset sequence)")
                    continue
                reply = RESPONSES.get(line, "\r\nOK\r\n")
                writer.write(reply.encode())
                await writer.drain()
                print(f"[fake-asr] > {reply.strip()}")
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"[fake-asr] error: {e}")
    finally:
        print(f"[fake-asr] disconnected from {peer}")
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


async def main():
    p = argparse.ArgumentParser(description="Fake ASR modem over TCP")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=9999)
    args = p.parse_args()

    server = await asyncio.start_server(handle_client, args.host, args.port)
    addr = server.sockets[0].getsockname()
    print(f"[fake-asr] listening on TCP {addr[0]}:{addr[1]}")
    print(f"[fake-asr] connect from web terminal → TCP mode → {addr[0] if addr[0] != '0.0.0.0' else '127.0.0.1'}:{addr[1]}")

    async with server:
        try:
            await server.serve_forever()
        except KeyboardInterrupt:
            print("\n[fake-asr] stopped")


if __name__ == "__main__":
    asyncio.run(main())
