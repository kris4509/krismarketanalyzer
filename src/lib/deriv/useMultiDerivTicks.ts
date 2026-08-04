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
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let staleTimer: ReturnType<typeof setInterval> | null = null;
    let subscribeTimers: ReturnType<typeof setTimeout>[] = [];
    let lastMsgAt = Date.now();
    let attempt = 0;

    const clearTimers = () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
      if (staleTimer) { clearInterval(staleTimer); staleTimer = null; }
      subscribeTimers.forEach(clearTimeout);
      subscribeTimers = [];
    };

    const scheduleReconnect = () => {
      if (closed) return;
      if (reconnectTimer) return;
      // exponential backoff, capped at 15s
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

    const requestHistory = (s: string, latestOnly = false) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(
        JSON.stringify({
          ticks_history: s,
          adjust_start_time: 1,
          count: latestOnly ? 1 : Math.max(countRef.current, 1000),
          end: "latest",
          start: 1,
          style: "ticks",
          ...(latestOnly ? {} : { subscribe: 1 }),
          req_id: latestOnly ? hashSymbol(s) + 1_000_000 : hashSymbol(s),
        }),
      );
    };

    // Symbols whose stream was refused — polled slowly, one per tick of the
    // fallback timer, so we never trip Deriv's request-rate limit.
    const fallback: string[] = [];
    let fallbackIdx = 0;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setState("open");
        attempt = 0;
        lastMsgAt = Date.now();
        // Subscribe to each symbol, staggered so the burst of requests stays
        // under Deriv's rate limit. One subscription streams every new tick,
        // keeping our digit percentages identical to Deriv's own feed.
        symbols.forEach((symbol, i) => {
          const t = setTimeout(() => requestHistory(symbol), i * 250);
          subscribeTimers.push(t);
        });

        // Slow round-robin poller, only used for symbols that refused to stream.
        tickTimer = setInterval(() => {
          if (fallback.length === 0) return;
          const sym = fallback[fallbackIdx % fallback.length];
          fallbackIdx++;
          requestHistory(sym, true);
        }, 1_500);

        // Heartbeat: send a lightweight ping every 20s.
        pingTimer = setInterval(() => {
          try { ws.send(JSON.stringify({ ping: 1 })); } catch { /* ignore */ }
        }, 20_000);

        // If no message received in 45s, assume the socket is dead.
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
            const sym: string | undefined = data.echo_req?.ticks_history;
            const code = data.error.code;
            if (sym && code !== "RateLimit" && !fallback.includes(sym)) {
              fallback.push(sym);
            } else if (sym && code === "RateLimit") {
              // Retry this symbol's subscription shortly.
              const t = setTimeout(() => requestHistory(sym), 4_000);
              subscribeTimers.push(t);
            }
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
            setFeeds((prev) => {
              const current = prev[sym];
              const latestOnly = data.req_id === hashSymbol(sym) + 1_000_000;
              if (!latestOnly || !current) {
                return {
                  ...prev,
                  [sym]: { ticks: fresh.slice(-countRef.current), pip },
                };
              }
              const latest = fresh[fresh.length - 1];
              if (!latest || current.ticks[current.ticks.length - 1]?.epoch === latest.epoch) {
                return prev;
              }
              const next = [...current.ticks, latest].slice(-countRef.current);
              return {
                ...prev,
                [sym]: { ticks: next, pip: pip ?? current.pip },
              };
            });
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
        clearTimers();
        setState("closed");
        scheduleReconnect();
      };
    };

    const handleOnline = () => {
      // Network came back — force a fresh connect right away.
      if (closed) return;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      attempt = 0;
      forceReconnect();
    };
    const handleVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        // If we've been backgrounded and the socket is dead, reconnect.
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
