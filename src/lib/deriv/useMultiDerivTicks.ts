import { useEffect, useRef, useState } from "react";
import type { Tick } from "./useDerivTicks";

const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

export type SymbolFeed = {
  ticks: Tick[];
  pip: number | null;
};

export type MultiFeedState = "connecting" | "open" | "closed" | "error";

/**
 * Single shared WebSocket subscribing to multiple Deriv symbols at once.
 * Returns a map keyed by symbol code with rolling tick buffer + pip size.
 */
export function useMultiDerivTicks(symbols: string[], count: number) {
  const [feeds, setFeeds] = useState<Record<string, SymbolFeed>>({});
  const [state, setState] = useState<MultiFeedState>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const countRef = useRef(count);
  countRef.current = count;
  const symbolsKey = symbols.join(",");

  useEffect(() => {
    setFeeds({});
    setState("connecting");

    let ws: WebSocket;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const requestHistory = (s: string) => {
      ws.send(
        JSON.stringify({
          ticks_history: s,
          adjust_start_time: 1,
          count: Math.max(countRef.current, 1000),
          end: "latest",
          start: 1,
          style: "ticks",
          subscribe: 1,
          req_id: hashSymbol(s),
        }),
      );
    };

    const connect = () => {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setState("open");
        symbols.forEach(requestHistory);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            console.error("Deriv scanner error:", data.error);
            return;
          }
          if (data.msg_type === "history" && data.history && data.echo_req) {
            const sym: string = data.echo_req.ticks_history;
            const { prices, times } = data.history as {
              prices: number[];
              times: number[];
            };
            const pip =
              typeof data.pip_size === "number" ? data.pip_size : null;
            const fresh: Tick[] = prices.map((p, i) => ({
              epoch: times[i],
              quote: p,
            }));
            setFeeds((prev) => ({
              ...prev,
              [sym]: {
                ticks: fresh.slice(-countRef.current),
                pip,
              },
            }));
          } else if (data.msg_type === "tick" && data.tick) {
            const t = data.tick as {
              symbol: string;
              epoch: number;
              quote: number;
              pip_size?: number;
            };
            setFeeds((prev) => {
              const cur = prev[t.symbol] ?? { ticks: [], pip: null };
              const next = [
                ...cur.ticks,
                { epoch: t.epoch, quote: t.quote },
              ];
              if (next.length > countRef.current) {
                next.splice(0, next.length - countRef.current);
              }
              return {
                ...prev,
                [t.symbol]: {
                  ticks: next,
                  pip:
                    typeof t.pip_size === "number" ? t.pip_size : cur.pip,
                },
              };
            });
          }
        } catch (e) {
          console.error("parse err", e);
        }
      };

      ws.onerror = () => setState("error");
      ws.onclose = () => {
        setState("closed");
        if (!closed) reconnectTimer = setTimeout(connect, 2000);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, count]);

  return { feeds, state };
}

function hashSymbol(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 1_000_000;
}
