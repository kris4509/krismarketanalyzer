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
    setState("connecting");

    let ws: WebSocket;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setState("open");
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
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
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
            const fresh: Tick[] = prices.map((p, i) => ({
              epoch: times[i],
              quote: p,
            }));
            setTicks(fresh.slice(-countRef.current));
          } else if (data.msg_type === "tick" && data.tick) {
            const t = data.tick as { epoch: number; quote: number };
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
        setState("closed");
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        wsRef.current?.send(JSON.stringify({ forget_all: "ticks" }));
      } catch {
        // ignore
      }
      wsRef.current?.close();
    };
  }, [symbol, count]);

  return { ticks, state };
}
