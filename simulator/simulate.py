"""SafeMektep device simulator.

Simulates a child's tracker walking from home → school → home.
Press Ctrl+C to stop. Type 's' + Enter to fire SOS, 'b' to drop battery.

Usage:
    python simulate.py --api-key <KEY> [--api http://localhost:8000] [--interval 2]
"""
import argparse
import math
import select
import sys
import time

import requests


# Demo route: home (Almaty) → school
HOME = (43.2310, 76.9190)
SCHOOL = (43.2390, 76.9290)


def interpolate(a, b, steps):
    for i in range(steps):
        t = i / max(steps - 1, 1)
        yield (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def stationary(point, count):
    for _ in range(count):
        # tiny jitter to look like real GPS
        yield (point[0] + (math.sin(time.time()) * 0.00005),
               point[1] + (math.cos(time.time()) * 0.00005))


def build_route():
    yield from stationary(HOME, 5)
    yield from interpolate(HOME, SCHOOL, 30)
    yield from stationary(SCHOOL, 60)
    yield from interpolate(SCHOOL, HOME, 30)
    yield from stationary(HOME, 5)


def stdin_has_data() -> bool:
    if sys.platform == "win32":
        import msvcrt
        return msvcrt.kbhit()
    return select.select([sys.stdin], [], [], 0)[0] != []


def read_command() -> str | None:
    if not stdin_has_data():
        return None
    line = sys.stdin.readline().strip().lower()
    return line or None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--interval", type=float, default=2.0)
    args = parser.parse_args()

    url = f"{args.api}/api/ingest/location"
    headers = {"X-API-Key": args.api_key, "Content-Type": "application/json"}

    battery = 100
    print(f"[sim] sending to {url} every {args.interval}s")
    print("[sim] type 's' + Enter to fire SOS, 'b' to drop battery to 10%, 'q' to quit")

    while True:  # loop forever — restart route
        for lat, lon in build_route():
            sos = False
            cmd = read_command()
            if cmd == "q":
                print("[sim] quit"); return
            if cmd == "s":
                print("[sim] *** firing SOS ***")
                sos = True
            if cmd == "b":
                print("[sim] battery -> 10%")
                battery = 10

            payload = {
                "lat": lat,
                "lon": lon,
                "accuracy": 8.0,
                "speed": 1.2,
                "battery": battery,
                "sos": sos,
            }
            try:
                r = requests.post(url, json=payload, headers=headers, timeout=5)
                if r.status_code >= 400:
                    print(f"[sim] HTTP {r.status_code}: {r.text}")
                else:
                    print(f"[sim] sent ({lat:.5f}, {lon:.5f}) battery={battery}% sos={sos}")
            except requests.RequestException as e:
                print(f"[sim] request failed: {e}")

            battery = max(1, battery - (1 if battery > 0 and time.time() % 30 < 1 else 0))
            time.sleep(args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[sim] stopped")
