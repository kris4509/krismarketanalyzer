import { useEffect, useRef, useState } from "react";

const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

export type Tick = {
  epoch: number;
  quote: number;
};

export type ConnState = "connecting" | "open" | "closed" | "error";

/**
 * Subscribes to Deriv tick history + live stream for a symbol.
 * Returns a rolling buffer of the last `count` ticks.
 */
export function useDerivTicks(symbol: string, count: number) {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [pip, setPip] = useState<number | null>(null);
  const [state, setState] = useState<ConnState>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const countRef = useRef(count);
  countRef.current = count;

  useEffect(() => {
    setTicks([]);
    setPip(null);
    setState("connecting");

    let ws: WebSocket;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let staleTimer: ReturnType<typeof setInterval> | null = null;
    let lastMsgAt = Date.now();
    let attempt = 0;

    const clearTimers = () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (staleTimer) { clearInterval(staleTimer); staleTimer = null; }
    };

    const scheduleReconnect = () => {
      if (closed) return;
      if (reconnectTimer) return;
      const delay = Math.min(1000 * Math.pow(2, attempt), 15000);
      attempt++;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const forceReconnect = () => {
      clearTimers();
      try { wsRef.current?.close(); } catch { /* ignore */ }
    };

    const connect = () => {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setState("open");
        attempt = 0;
        lastMsgAt = Date.now();
        ws.send(
          JSON.stringify({
            ticks_history: symbol,
            adjust_start_time: 1,
            count: Math.max(count, 1000),
            end: "latest",
            start: 1,
            style: "ticks",
            subscribe: 1,
          }),
        );
        pingTimer = setInterval(() => {
          try { ws.send(JSON.stringify({ ping: 1 })); } catch { /* ignore */ }
        }, 20_000);
        staleTimer = setInterval(() => {
          if (Date.now() - lastMsgAt > 45_000) forceReconnect();
        }, 5_000);
      };

      ws.onmessage = (event) => {
        lastMsgAt = Date.now();
        try {
          const data = JSON.parse(event.data);
          if (data.msg_type === "ping" || data.pong) return;
          if (data.error) {
            console.error("Deriv error:", data.error);
            setState("error");
            return;
          }
          if (data.msg_type === "history" && data.history) {
            const { prices, times } = data.history as {
              prices: number[];
              times: number[];
            };
            if (typeof data.pip_size === "number") setPip(data.pip_size);
            const fresh: Tick[] = prices.map((p, i) => ({
              epoch: times[i],
              quote: p,
            }));
            setTicks(fresh.slice(-countRef.current));
          } else if (data.msg_type === "tick" && data.tick) {
            const t = data.tick as { epoch: number; quote: number; pip_size?: number };
            if (typeof t.pip_size === "number") setPip(t.pip_size);
            setTicks((prev) => {
              const next = [...prev, { epoch: t.epoch, quote: t.quote }];
              if (next.length > countRef.current) {
                return next.slice(next.length - countRef.current);
              }
              return next;
            });
          }
        } catch (e) {
          console.error("parse err", e);
        }
      };

      ws.onerror = () => setState("error");
      ws.onclose = () => {
        clearTimers();
        setState("closed");
        scheduleReconnect();
      };
    };

    const handleOnline = () => {
      if (closed) return;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      attempt = 0;
      forceReconnect();
    };
    const handleVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        if (wsRef.current?.readyState !== WebSocket.OPEN) forceReconnect();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      document.addEventListener("visibilitychange", handleVisibility);
    }

    connect();

    return () => {
      closed = true;
      clearTimers();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      try {
        wsRef.current?.send(JSON.stringify({ forget_all: "ticks" }));
      } catch {
        // ignore
      }
      wsRef.current?.close();
    };
  }, [symbol, count]);

  return { ticks, state, pip };
}
