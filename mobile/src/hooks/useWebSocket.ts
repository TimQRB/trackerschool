import { useEffect, useRef, useState, useCallback } from 'react';
import { getToken, WS_URL } from '../api/client';
import type { WSMessage } from '../api/types';

export function useWebSocket(onMessage: (msg: WSMessage) => void) {
  const [connected, setConnected] = useState(false);
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    let ws: WebSocket | null = null;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const url = `${WS_URL}/ws?token=${encodeURIComponent(token!)}`;
      ws = new WebSocket(url);

      ws.onopen = () => setConnected(true);

      ws.onclose = () => {
        setConnected(false);
        if (!stopped) {
          retryTimer = setTimeout(connect, 2000);
        }
      };

      ws.onmessage = (e) => {
        try {
          const msg: WSMessage = JSON.parse(e.data);
          if (msg.type === 'ping') return;
          cbRef.current(msg);
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        // onclose will fire after this
      };
    }

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  return connected;
}
