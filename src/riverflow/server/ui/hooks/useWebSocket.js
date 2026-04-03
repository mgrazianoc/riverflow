import { useState, useEffect, useRef, useCallback } from "react";

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;

export function useWebSocket(onMessage) {
  const [online, setOnline] = useState(false);
  const wsRef = useRef(null);
  const delayRef = useRef(RECONNECT_DELAY);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${location.host}/ws`);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      setOnline(true);
      delayRef.current = RECONNECT_DELAY;
    });

    ws.addEventListener("close", () => {
      setOnline(false);
      const delay = delayRef.current;
      delayRef.current = Math.min(delay * 1.5, MAX_RECONNECT_DELAY);
      setTimeout(connect, delay);
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        onMessageRef.current(msg);
      } catch { /* ignore malformed */ }
    });
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return online;
}
