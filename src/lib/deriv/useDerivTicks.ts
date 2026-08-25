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
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let staleTimer: ReturnType<typeof setInterval> | null = null;
    let lastMsgAt = Date.now();
    let lastResyncAt = Date.now();
    let attempt = 0;


    const clearTimers = () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
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

    const requestWindow = () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(
        JSON.stringify({
          ticks_history: symbolRef.current,
          adjust_start_time: 1,
          count: Math.max(countRef.current, 1000),
          end: "latest",
          start: 1,
          style: "ticks",
          req_id: 2,
        }),
      );
    };

    const startPolling = () => {
      if (tickTimer) return;
      tickTimer = setInterval(requestWindow, 2_000);
    };


    const connect = () => {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setState("open");
        attempt = 0;
        lastMsgAt = Date.now();
        // Stream the tick history: one request returns the full window and
        // then pushes every new tick. Streaming avoids the request-rate limit
        // that polling used to hit (which caused freezes and stale digits).
        ws.send(
          JSON.stringify({
            ticks_history: symbol,
            adjust_start_time: 1,
            count: Math.max(count, 1000),
            end: "latest",
            start: 1,
            style: "ticks",
            subscribe: 1,
            req_id: 1,
          }),
        );
        pingTimer = setInterval(() => {
          try { ws.send(JSON.stringify({ ping: 1 })); } catch { /* ignore */ }
        }, 20_000);
        staleTimer = setInterval(() => {
          if (Date.now() - lastMsgAt > 45_000) forceReconnect();
          // Periodic authoritative resync so a single dropped tick can never
          // leave our 1000-tick window out of step with Deriv's own window.
          if (Date.now() - lastResyncAt > 15_000) {
            lastResyncAt = Date.now();
            requestWindow();
          }
        }, 5_000);
      };

      ws.onmessage = (event) => {
        lastMsgAt = Date.now();
        try {
          const data = JSON.parse(event.data);
          if (data.msg_type === "ping" || data.pong) return;
          if (data.error) {
            // Rate limits are transient; anything else means the stream was
            // refused, so fall back to periodic full-window refreshes.
            if (data.error.code !== "RateLimit") startPolling();
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
            // A full window from Deriv is always authoritative — replace.
            setTicks((prev) =>
              fresh.length > 1 || prev.length === 0
                ? fresh.slice(-countRef.current)
                : mergeTicks(prev, fresh, countRef.current),
            );
          } else if (data.msg_type === "tick" && data.tick) {
            const t = data.tick as { epoch: number; quote: number; pip_size?: number };
            if (typeof t.pip_size === "number") setPip(t.pip_size);
            setTicks((prev) =>
              mergeTicks(prev, [{ epoch: t.epoch, quote: t.quote }], countRef.current),
            );
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
      wsRef.current?.close();
    };
  }, [symbol, count]);

  return { ticks, state, pip };
}

/**
 * Merge incoming ticks into the rolling buffer, de-duplicating by epoch and
 * keeping chronological order. Prevents duplicated or out-of-order ticks from
 * skewing the digit percentages away from Deriv's own window.
 */
export function mergeTicks(prev: Tick[], incoming: Tick[], max: number): Tick[] {
  if (incoming.length === 0) return prev;

  // Fast path: a single live tick that is newer than everything we hold.
  // Avoids rebuilding a Set + re-sorting a 1000-item buffer on every tick,
  // which is what made the UI stall while many markets streamed at once.
  if (incoming.length === 1 && prev.length > 0) {
    const t = incoming[0];
    const last = prev[prev.length - 1];
    if (t.epoch === last.epoch) return prev;
    if (t.epoch > last.epoch) {
      const next = prev.length >= max ? prev.slice(prev.length - max + 1) : prev.slice();
      next.push(t);
      return next;
    }
  }

  const seen = new Set(prev.map((t) => t.epoch));
  let next = prev;
  let changed = false;
  for (const t of incoming) {
    if (seen.has(t.epoch)) continue;
    if (!changed) { next = [...prev]; changed = true; }
    seen.add(t.epoch);
    next.push(t);
  }
  if (!changed) return prev;
  next.sort((a, b) => a.epoch - b.epoch);
  return next.length > max ? next.slice(next.length - max) : next;
}
