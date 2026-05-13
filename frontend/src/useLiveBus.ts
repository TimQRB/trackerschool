import { useEffect, useRef, useState } from "react";
import { WS_URL } from "./api";

export interface BusMessage {
  type: string;
  payload: any;
}

export function useLiveBus(onMessage: (m: BusMessage) => void) {
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    let ws: WebSocket | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      ws = new WebSocket(`${WS_URL}/ws?token=${encodeURIComponent(token!)}`);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(connect, 2000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "ping") return;
          cbRef.current(msg);
        } catch {}
      };
    }
    connect();

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return connected;
}
