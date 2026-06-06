import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/analysis/AppHeader";
import { cn } from "@/lib/utils";
import {
  PERSIST_MS,
  SCANNERS,
  SCANNER_MODES,
  STRATEGIES,
  type EvenOddSignal,
  type EvenOddStrategy,
  type ScannerMode,
  type TrackedSignal,
} from "@/lib/deriv/scanner";

import {
  DERIV_SYMBOLS,
  DEFAULT_TICK_COUNT,
  TICK_COUNT_OPTIONS,
} from "@/lib/deriv/symbols";
import { useMultiDerivTicks } from "@/lib/deriv/useMultiDerivTicks";
import { computeDigitStats, lastDigit, type DigitStat } from "@/lib/deriv/analysis";

const SCAN_SYMBOLS = DERIV_SYMBOLS.filter(
  (s) => s.group === "Volatility (1s)",
);
const SCAN_CODES = SCAN_SYMBOLS.map((s) => s.code);
const HISTORY_LIMIT = 20;

type HistoryEvent = {
  ts: number;
  symbol: string;
  label: string;
  type: "signal" | "cleared";
  direction?: string;
  strength?: number;
};

// Tone helper used in many places — colours direction badges/labels.
function directionTone(direction: string) {
  if (direction === "ODD") {
    return {
      text: "text-[var(--rank-second)]",
      border: "border-[var(--rank-second)]",
      bg: "bg-[var(--rank-second)]",
      ring: "[var(--rank-second)]",
    };
  }
  // EVEN, UNDER N, OVER N — all use the "green" rank tone.
  return {
    text: "text-[var(--rank-most)]",
    border: "border-[var(--rank-most)]",
    bg: "bg-[var(--rank-most)]",
    ring: "[var(--rank-most)]",
  };
}

export const Route = createFileRoute("/scanner")({
  head: () => ({
    meta: [
      { title: "Digit Scanner — Even/Odd · Under · Over" },
      {
        name: "description",
        content:
          "Real-time digit scanner for Even/Odd, Under 8, Under 7 and Over 2 setups across Deriv volatility indices, with locked persistent signals and cross-scanner alerts.",
      },
    ],
  }),
  component: ScannerPage,
});

function ScannerPage() {
  const [count, setCount] = useState(DEFAULT_TICK_COUNT);
  const [mode, setMode] = useState<ScannerMode>("even-odd");
  const [strategy, setStrategy] = useState<EvenOddStrategy>("rank-alignment");
  const activeScanner = SCANNERS[mode];
  const detect =
    mode === "even-odd"
      ? STRATEGIES[strategy].detect
      : activeScanner.detect;
  const { feeds, state } = useMultiDerivTicks(SCAN_CODES, count);

  // Tracker keyed by "mode:symbol" so we can hold state across all scanners.
  const trackerRef = useRef<
    Map<string, { direction: string; firstSeen: number }>
  >(new Map());
  const notifiedRef = useRef<Map<string, string>>(new Map());
  const historyRef = useRef<HistoryEvent[]>([]);
  const lastSignalDirRef = useRef<Map<string, string>>(new Map());
  const [, force] = useState(0);
  const [notify, setNotify] = useState<"default" | "granted" | "denied" | "unsupported">("default");
  const [sound, setSound] = useState(true);
  const [crossAlerts, setCrossAlerts] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotify("unsupported");
    } else {
      setNotify(Notification.permission as "default" | "granted" | "denied");
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const requestNotify = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setNotify(perm as "default" | "granted" | "denied");
  };

  const beep = () => {
    try {
      const AC =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.18);
      setTimeout(() => ctx.close(), 400);
    } catch {
      /* ignore */
    }
  };

  type RawRow = {
    meta: (typeof SCAN_SYMBOLS)[number];
    signal: EvenOddSignal | null;
    ticksLen: number;
    lastQuote: number | null;
    pip: number;
    stats: DigitStat[] | null;
    last20: number[];
  };

  // Build raw rows + tracked signals for the ACTIVE scanner.
  const { tracked, raw, last20Map } = useMemo(() => {
    const now = Date.now();
    const raw: RawRow[] = [];
    const tracked: TrackedSignal[] = [];
    const last20Map: Record<string, number[]> = {};
    const tracker = trackerRef.current;

    for (const meta of SCAN_SYMBOLS) {
      const feed = feeds[meta.code];
      const pip = feed?.pip ?? meta.pip;
      const ticks = feed?.ticks ?? [];
      const signal = detect(meta.code, ticks, pip);
      const lastQuote = ticks[ticks.length - 1]?.quote ?? null;
      const stats = ticks.length >= 20 ? computeDigitStats(ticks, pip) : null;
      const last20 = ticks.slice(-20).map((t) => lastDigit(t.quote, pip));
      last20Map[meta.code] = last20;
      raw.push({ meta, signal, ticksLen: ticks.length, lastQuote, pip, stats, last20 });

      const key = `${mode}:${meta.code}`;
      if (signal) {
        const prev = tracker.get(key);
        if (!prev || prev.direction !== signal.direction) {
          tracker.set(key, { direction: signal.direction, firstSeen: now });
        }
        const t = tracker.get(key)!;
        const held = now - t.firstSeen;
        tracked.push({
          ...signal,
          firstSeen: t.firstSeen,
          lastSeen: now,
          heldMs: held,
          persistent: held >= PERSIST_MS,
        });
      } else {
        tracker.delete(key);
      }
    }
    return { tracked, raw, last20Map };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds, mode, strategy]);

  // ─── Cross-scanner alerts: detect locked signals on the OTHER modes. ───
  const crossSignals = useMemo(() => {
    const now = Date.now();
    const tracker = trackerRef.current;
    const out: Record<
      ScannerMode,
      { locked: number; fresh: number; signals: TrackedSignal[] }
    > = {
      "even-odd": { locked: 0, fresh: 0, signals: [] },
      "under-8": { locked: 0, fresh: 0, signals: [] },
      "over-2": { locked: 0, fresh: 0, signals: [] },
      "under-7": { locked: 0, fresh: 0, signals: [] },
    };
    for (const m of SCANNER_MODES) {
      if (m === mode) {
        // reuse the already-computed tracked list for the active mode
        for (const t of tracked) {
          out[m].signals.push(t);
          if (t.persistent) out[m].locked++;
          else out[m].fresh++;
        }
        continue;
      }
      const det = SCANNERS[m].detect;
      for (const meta of SCAN_SYMBOLS) {
        const feed = feeds[meta.code];
        const pip = feed?.pip ?? meta.pip;
        const ticks = feed?.ticks ?? [];
        const sig = det(meta.code, ticks, pip);
        const key = `${m}:${meta.code}`;
        if (!sig) {
          tracker.delete(key);
          continue;
        }
        const prev = tracker.get(key);
        if (!prev || prev.direction !== sig.direction) {
          tracker.set(key, { direction: sig.direction, firstSeen: now });
        }
        const t = tracker.get(key)!;
        const held = now - t.firstSeen;
        const ts: TrackedSignal = {
          ...sig,
          firstSeen: t.firstSeen,
          lastSeen: now,
          heldMs: held,
          persistent: held >= PERSIST_MS,
        };
        out[m].signals.push(ts);
        if (ts.persistent) out[m].locked++;
        else out[m].fresh++;
      }
    }
    return out;
  }, [feeds, mode, tracked]);

  const locked = tracked.filter((t) => t.persistent);
  const fresh = tracked.filter((t) => !t.persistent);
  const noSignal = raw.filter((r) => !r.signal);

  // For the two right-most stat cards we show context-aware totals.
  const evenCount =
    mode === "even-odd"
      ? tracked.filter((t) => t.direction === "EVEN").length
      : 0;
  const oddCount =
    mode === "even-odd"
      ? tracked.filter((t) => t.direction === "ODD").length
      : 0;
  const avgStrength =
    tracked.length === 0
      ? 0
      : tracked.reduce((a, t) => a + t.strength, 0) / tracked.length;

  // ─── History bookkeeping (active mode only) ───
  const currentDirs = new Map<string, string>();
  for (const t of tracked) currentDirs.set(t.symbol, t.direction);
  const prevDirs = lastSignalDirRef.current;
  const newEvents: HistoryEvent[] = [];
  const now = Date.now();
  for (const [sym, dir] of currentDirs) {
    const prev = prevDirs.get(sym);
    if (prev !== dir) {
      const meta = SCAN_SYMBOLS.find((s) => s.code === sym);
      const sig = tracked.find((t) => t.symbol === sym);
      newEvents.push({
        ts: now,
        symbol: sym,
        label: meta?.label ?? sym,
        type: "signal",
        direction: dir,
        strength: sig?.strength,
      });
    }
  }
  for (const [sym, prevDir] of prevDirs) {
    if (!currentDirs.has(sym)) {
      const meta = SCAN_SYMBOLS.find((s) => s.code === sym);
      newEvents.push({
        ts: now,
        symbol: sym,
        label: meta?.label ?? sym,
        type: "cleared",
        direction: prevDir,
      });
    }
  }
  if (newEvents.length) {
    historyRef.current = [...newEvents.reverse(), ...historyRef.current].slice(
      0,
      HISTORY_LIMIT,
    );
  }
  lastSignalDirRef.current = currentDirs;
  const history = historyRef.current;
  // Reset history when switching modes so user isn't confused.
  useEffect(() => {
    historyRef.current = [];
    lastSignalDirRef.current = new Map();
  }, [mode]);

  // ─── Fire notifications across ALL scanners when a signal locks ───
  // Build a stable key listing every currently-locked (mode, symbol, direction).
  const allLocked: Array<{ mode: ScannerMode; sig: TrackedSignal }> = [];
  for (const m of SCANNER_MODES) {
    for (const s of crossSignals[m].signals) {
      if (s.persistent) allLocked.push({ mode: m, sig: s });
    }
  }
  const lockedKey = allLocked
    .map((l) => `${l.mode}:${l.sig.symbol}:${l.sig.direction}`)
    .join("|");
  useEffect(() => {
    const notified = notifiedRef.current;
    const activeKeys = new Set(allLocked.map((l) => `${l.mode}:${l.sig.symbol}`));
    for (const k of Array.from(notified.keys())) {
      if (!activeKeys.has(k)) notified.delete(k);
    }
    for (const { mode: m, sig } of allLocked) {
      // Skip cross-scanner alerts entirely when the user disabled them
      // (active-scanner alerts are always on).
      if (m !== mode && !crossAlerts) continue;
      const k = `${m}:${sig.symbol}`;
      if (notified.get(k) === sig.direction) continue;
      notified.set(k, sig.direction);
      const meta = SCAN_SYMBOLS.find((s) => s.code === sig.symbol);
      const scannerLabel = SCANNERS[m].label;
      const title = `[${scannerLabel}] ${meta?.label ?? sig.symbol} — Trade ${sig.direction}`;
      const body = `Locked · ${sig.strength.toFixed(1)}% strength · ${sig.tickCount} ticks`;
      if (notify === "granted" && typeof window !== "undefined" && "Notification" in window) {
        try {
          const n = new Notification(title, { body, tag: `digitpulse-${m}-${sig.symbol}` });
          n.onclick = () => {
            window.focus();
            setMode(m);
            n.close();
          };
        } catch {
          /* ignore */
        }
      }
      if (sound) beep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedKey, notify, sound, crossAlerts]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader live />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">
              {activeScanner.label} Scanner
            </h2>
            <p className="text-sm text-muted-foreground">
              Monitoring all {SCAN_SYMBOLS.length} 1s volatility markets.{" "}
              <span className="text-foreground/70">
                {state === "open" ? "Live feed connected." : `Status: ${state}`}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
              {TICK_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-mono text-xs transition-colors",
                    count === n
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Scanner mode tabs ─── */}
        <section className="rounded-lg border border-border bg-card p-2">
          <div className="mb-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Scanner
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
            {SCANNER_MODES.map((m) => {
              const info = SCANNERS[m];
              const active = m === mode;
              const cs = crossSignals[m];
              const totalCount = cs.locked + cs.fresh;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "relative rounded-md px-3 py-2 text-left transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                      : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-xs font-bold uppercase tracking-wider">
                      {info.label}
                    </div>
                    {totalCount > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums",
                          cs.locked > 0
                            ? "bg-[var(--rank-most)] text-background"
                            : "bg-[var(--rank-second)] text-background",
                        )}
                        title={`${cs.locked} locked · ${cs.fresh} fresh`}
                      >
                        {cs.locked > 0 ? `● ${cs.locked}` : cs.fresh}
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 font-mono text-[10px]",
                      active ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {info.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── Sub-strategy selector (Even/Odd only) ─── */}
        {activeScanner.hasStrategies && (
          <section className="rounded-lg border border-border bg-card p-2">
            <div className="mb-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Strategy
            </div>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(STRATEGIES) as EvenOddStrategy[]).map((k) => {
                const active = strategy === k;
                return (
                  <button
                    key={k}
                    onClick={() => setStrategy(k)}
                    className={cn(
                      "flex-1 min-w-[200px] rounded-md px-3 py-2 text-left transition-colors",
                      active
                        ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                        : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
                    )}
                  >
                    <div className="font-mono text-xs font-bold uppercase tracking-wider">
                      {STRATEGIES[k].label}
                    </div>
                    <div
                      className={cn(
                        "mt-0.5 font-mono text-[10px]",
                        active ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {STRATEGIES[k].sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Cross-scanner banner: locked signals on OTHER scanners ─── */}
        <CrossScannerBanner
          mode={mode}
          crossSignals={crossSignals}
          onJump={setMode}
        />

        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2 text-xs">
          <span className="font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Alerts
          </span>
          {notify === "unsupported" ? (
            <span className="text-muted-foreground">
              Desktop notifications not supported in this browser.
            </span>
          ) : notify === "granted" ? (
            <span className="rounded-md border border-[var(--rank-most)]/60 px-2 py-0.5 font-mono text-[var(--rank-most)]">
              Desktop ON
            </span>
          ) : (
            <button
              onClick={requestNotify}
              className="rounded-md border border-border bg-background px-2 py-1 font-mono text-foreground hover:border-[var(--rank-most)]"
            >
              {notify === "denied"
                ? "Notifications blocked — enable in browser settings"
                : "Enable desktop notifications"}
            </button>
          )}
          <button
            onClick={() => setSound((s) => !s)}
            className={cn(
              "rounded-md border px-2 py-1 font-mono",
              sound
                ? "border-[var(--rank-second)] text-[var(--rank-second)]"
                : "border-border text-muted-foreground",
            )}
          >
            Sound {sound ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => setCrossAlerts((s) => !s)}
            className={cn(
              "rounded-md border px-2 py-1 font-mono",
              crossAlerts
                ? "border-[var(--rank-most)] text-[var(--rank-most)]"
                : "border-border text-muted-foreground",
            )}
            title="Notify when locked signals appear on OTHER scanners while you're on this one"
          >
            Cross-scanner alerts {crossAlerts ? "ON" : "OFF"}
          </button>
          <span className="ml-auto text-[11px] text-muted-foreground">
            Fires once when a signal locks (≥{PERSIST_MS / 1000}s).
          </span>
        </section>

        <section className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Locked ≥5s" value={locked.length} tone="most" />
          <StatCard label="Fresh signals" value={fresh.length} tone="second" />
          {mode === "even-odd" ? (
            <>
              <StatCard label="Even" value={evenCount} tone="most" />
              <StatCard label="Odd" value={oddCount} tone="second" />
            </>
          ) : (
            <>
              <StatCard label="Valid markets" value={tracked.length} tone="most" />
              <StatCard
                label="Avg strength"
                value={Number(avgStrength.toFixed(1))}
                tone="second"
                suffix="%"
              />
            </>
          )}
        </section>

        {locked.length > 0 && (
          <Section
            title="Locked signals"
            sub={`Held ≥ ${PERSIST_MS / 1000}s — strongest conviction`}
            dotClass="bg-[var(--rank-most)] animate-pulse"
          >
            <div className="space-y-3">
              {locked.map((t) => (
                <SignalRow
                  key={t.symbol}
                  signal={t}
                  last20={last20Map[t.symbol] ?? []}
                  locked
                />
              ))}
            </div>
          </Section>
        )}

        {fresh.length > 0 && (
          <Section
            title="Active signals"
            sub="Just appeared — keep watching"
            dotClass="bg-[var(--rank-second)]"
          >
            <div className="space-y-3">
              {fresh.map((t) => (
                <SignalRow
                  key={t.symbol}
                  signal={t}
                  last20={last20Map[t.symbol] ?? []}
                />
              ))}
            </div>
          </Section>
        )}

        {tracked.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
            <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-muted-foreground/50" />
            <h3 className="font-mono text-sm font-semibold">
              No valid {activeScanner.label} signals detected
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              {activeScanner.sub}.
            </p>
          </div>
        )}

        <Section
          title="No signal"
          sub="Live digit distribution — watching for alignment"
          dotClass="bg-muted-foreground/50"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {noSignal.map((r) => (
              <MarketCard
                key={r.meta.code}
                label={r.meta.label}
                quote={r.lastQuote}
                pip={r.pip ?? r.meta.pip}
                ticksLen={r.ticksLen}
                stats={r.stats}
              />
            ))}
          </div>
        </Section>

        <Section
          title="Signal history"
          sub={`Last ${HISTORY_LIMIT} on/off events`}
          dotClass="bg-[var(--rank-second-least)]"
        >
          <HistoryList events={history} />
        </Section>

        <Legend />
        <p className="pb-4 text-center text-[11px] text-muted-foreground">
          Past digit frequencies do not predict future ticks. This tool is for
          visualization and study only.
        </p>
      </main>
    </div>
  );
}

function CrossScannerBanner({
  mode,
  crossSignals,
  onJump,
}: {
  mode: ScannerMode;
  crossSignals: Record<
    ScannerMode,
    { locked: number; fresh: number; signals: TrackedSignal[] }
  >;
  onJump: (m: ScannerMode) => void;
}) {
  const others = SCANNER_MODES.filter((m) => m !== mode);
  const anyLocked = others.some((m) => crossSignals[m].locked > 0);
  const anyFresh = others.some((m) => crossSignals[m].fresh > 0);
  if (!anyLocked && !anyFresh) return null;
  return (
    <section
      className={cn(
        "rounded-lg border bg-card/60 px-3 py-2",
        anyLocked
          ? "border-[var(--rank-most)]/60 shadow-[0_0_24px_-12px_var(--rank-most)]"
          : "border-border",
      )}
    >
      <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            anyLocked ? "bg-[var(--rank-most)] animate-pulse" : "bg-[var(--rank-second)]",
          )}
        />
        Other scanners
      </div>
      <div className="flex flex-wrap gap-2">
        {others.map((m) => {
          const info = SCANNERS[m];
          const cs = crossSignals[m];
          const isHot = cs.locked > 0;
          const isWarm = cs.fresh > 0;
          return (
            <button
              key={m}
              onClick={() => onJump(m)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors",
                isHot
                  ? "border-[var(--rank-most)] bg-[var(--rank-most)]/10 text-[var(--rank-most)]"
                  : isWarm
                  ? "border-[var(--rank-second)]/60 bg-[var(--rank-second)]/10 text-[var(--rank-second)]"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="font-bold uppercase tracking-wider">
                {info.label}
              </span>
              <span className="tabular-nums">
                {cs.locked > 0 && <>● {cs.locked} locked</>}
                {cs.locked > 0 && cs.fresh > 0 && " · "}
                {cs.fresh > 0 && <>{cs.fresh} fresh</>}
                {cs.locked === 0 && cs.fresh === 0 && "—"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  tone,
  suffix,
}: {
  label: string;
  value: number;
  tone: "most" | "second";
  suffix?: string;
}) {
  const color =
    tone === "most" ? "text-[var(--rank-most)]" : "text-[var(--rank-second)]";
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <div className={cn("font-mono text-3xl font-bold tabular-nums", color)}>
        {value}
        {suffix && (
          <span className="ml-0.5 text-base font-semibold">{suffix}</span>
        )}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Section({
  title,
  sub,
  dotClass,
  children,
}: {
  title: string;
  sub?: string;
  dotClass?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className={cn("h-2 w-2 rounded-full", dotClass)} />
        <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.2em]">
          {title}
        </h3>
        {sub && (
          <span className="text-[11px] text-muted-foreground">{sub}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function SignalRow({
  signal,
  last20,
  locked,
}: {
  signal: TrackedSignal;
  last20: number[];
  locked?: boolean;
}) {
  const meta = SCAN_SYMBOLS.find((s) => s.code === signal.symbol);
  const tone = directionTone(signal.direction);
  const held = (signal.heldMs / 1000).toFixed(1);
  const currentDigit =
    signal.lastQuote !== null ? lastDigit(signal.lastQuote, signal.pip) : null;
  const currentStat =
    currentDigit !== null
      ? signal.stats.find((s) => s.digit === currentDigit)
      : null;
  const rankToneMap: Record<DigitStat["rank"], string> = {
    most: "border-[var(--rank-most)] text-[var(--rank-most)] shadow-[0_0_28px_-4px_var(--rank-most)]",
    second:
      "border-[var(--rank-second)] text-[var(--rank-second)] shadow-[0_0_24px_-6px_var(--rank-second)]",
    "second-least":
      "border-[var(--rank-second-least)] text-[var(--rank-second-least)] shadow-[0_0_22px_-8px_var(--rank-second-least)]",
    least:
      "border-[var(--rank-least)] text-[var(--rank-least)] shadow-[0_0_24px_-6px_var(--rank-least)]",
    mid: "border-border text-foreground",
  };
  const lastDigitTone = currentStat
    ? rankToneMap[currentStat.rank]
    : "border-border text-muted-foreground";

  // Strength meter — for even/odd, anchored at 50%. For barriers, the
  // tradable side already covers most digits so strength is naturally high.
  const strengthPct = Math.max(0, Math.min(100, signal.strength));
  const isEvenOdd = signal.mode === "even-odd";
  const strengthTone = isEvenOdd
    ? strengthPct >= 58
      ? "bg-[var(--rank-most)]"
      : strengthPct >= 53
      ? "bg-[var(--rank-second)]"
      : "bg-[var(--rank-second-least)]"
    : strengthPct >= 80
    ? "bg-[var(--rank-most)]"
    : strengthPct >= 70
    ? "bg-[var(--rank-second)]"
    : "bg-[var(--rank-second-least)]";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-all",
        locked
          ? "border-[var(--rank-most)] shadow-[0_0_28px_-8px_var(--rank-most)]"
          : "border-border",
      )}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                locked ? "bg-[var(--rank-most)]" : "bg-[var(--rank-second)]",
              )}
            />
            <div className="min-w-0">
              <div className="font-mono text-base font-semibold truncate">
                {meta?.label ?? signal.symbol}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {signal.tickCount} ticks · held {held}s
              </div>
            </div>
          </div>

          <div className="mt-4">
            <CompactCircles stats={signal.stats} showPercent showTrend />
          </div>

          <div className="mt-4">
            <PatternStrip
              digits={last20}
              winningDigits={signal.winningDigits}
              mode={signal.mode}
              direction={signal.direction}
            />
          </div>

          <div
            className={cn(
              "mt-3 rounded-md border-l-2 bg-background/30 px-3 py-2 text-[12px]",
              locked
                ? "border-[var(--rank-most)]"
                : "border-[var(--rank-second)]",
            )}
          >
            {isEvenOdd ? (
              <>
                Green ({signal.greenDigit}) + Red ({signal.redDigit}) on{" "}
                <span className="font-semibold">{signal.direction}</span> · Blue
                ({signal.blueDigit}) + Yellow ({signal.yellowDigit}) on{" "}
                <span className="font-semibold">
                  {signal.direction === "EVEN" ? "ODD" : "EVEN"}
                </span>
              </>
            ) : (
              <>
                Green ({signal.greenDigit}) on{" "}
                <span className="font-semibold">{signal.direction}</span> · Red
                ({signal.redDigit}) · losing-side digits all below 10%
              </>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-2 border-t border-border pt-3 sm:w-44 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Last digit
          </span>
          <div
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full border-2 bg-card font-mono text-4xl font-bold tabular-nums transition-all",
              lastDigitTone,
            )}
          >
            {currentDigit ?? "—"}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {signal.lastQuote?.toFixed(signal.pip)}
          </div>
          <div
            className={cn(
              "mt-1 inline-flex items-center gap-2 rounded-md border px-3 py-1 font-mono text-xs font-bold uppercase",
              tone.text,
              tone.border,
            )}
          >
            Trade {signal.direction}
          </div>
          <div className="w-full">
            <div className="flex items-baseline justify-between font-mono text-[10px] text-muted-foreground">
              <span>Strength</span>
              <span className="tabular-nums text-foreground">
                {strengthPct.toFixed(1)}%
              </span>
            </div>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
              title={`${strengthPct.toFixed(1)}% of the last ${signal.tickCount} ticks landed on the ${signal.direction} side.`}
            >
              <div
                className={cn("h-full transition-all", strengthTone)}
                style={{ width: `${strengthPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PatternStrip({
  digits,
  winningDigits,
  mode,
  direction,
}: {
  digits: number[];
  winningDigits: number[];
  mode: ScannerMode;
  direction: string;
}) {
  if (digits.length === 0) return null;
  const winSet = new Set(winningDigits);
  const wins = digits.filter((d) => winSet.has(d)).length;
  const losses = digits.length - wins;
  const winPct = (wins / digits.length) * 100;
  const lossPct = 100 - winPct;
  const isEvenOdd = mode === "even-odd";

  return (
    <div className="rounded-lg border border-border/60 bg-background/30 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {isEvenOdd ? "Even/Odd" : direction} pattern (last {digits.length})
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {digits.map((d, i) => {
          const isWin = winSet.has(d);
          const display = isEvenOdd ? (d % 2 === 0 ? "E" : "O") : String(d);
          return (
            <span
              key={i}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md border font-mono text-[11px] font-bold",
                isWin
                  ? "border-[var(--rank-most)]/50 bg-[var(--rank-most)]/10 text-[var(--rank-most)]"
                  : "border-[var(--rank-least)]/50 bg-[var(--rank-least)]/10 text-[var(--rank-least)]",
              )}
              title={`digit ${d}`}
            >
              {display}
            </span>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[11px]">
        <span className="text-muted-foreground">
          {isEvenOdd ? "Even" : "Win"}:{" "}
          <span className="font-bold text-[var(--rank-most)] tabular-nums">
            {winPct.toFixed(1)}%
          </span>
        </span>
        <span className="text-muted-foreground">
          {isEvenOdd ? "Odd" : "Loss"}:{" "}
          <span className="font-bold text-[var(--rank-least)] tabular-nums">
            {lossPct.toFixed(1)}%
          </span>
        </span>
        <span className="text-muted-foreground">
          Total:{" "}
          <span className="font-bold text-foreground tabular-nums">
            {digits.length}
          </span>
        </span>
      </div>
    </div>
  );
}

function MarketCard({
  label,
  quote,
  pip,
  ticksLen,
  stats,
}: {
  label: string;
  quote: number | null;
  pip: number;
  ticksLen: number;
  stats: DigitStat[] | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--rank-most)]" />
          <span className="truncate font-mono text-sm font-semibold">
            {label}
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {quote !== null ? quote.toFixed(pip) : "—"}
        </span>
      </div>
      {stats ? (
        <div className="mt-2">
          <CompactCircles stats={stats} showPercent />
        </div>
      ) : (
        <div className="mt-2 font-mono text-[10px] text-muted-foreground">
          Buffering ticks…
        </div>
      )}
      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
        {ticksLen} ticks
      </div>
    </div>
  );
}

function HistoryList({ events }: { events: HistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/30 p-6 text-center font-mono text-[11px] text-muted-foreground">
        Waiting for the first signal event…
      </div>
    );
  }
  return (
    <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-card">
      <ul className="divide-y divide-border">
        {events.map((e, i) => {
          const time = new Date(e.ts).toLocaleTimeString();
          const isSignal = e.type === "signal";
          const tone = e.direction ? directionTone(e.direction) : null;
          const dotColor = !isSignal || !tone ? "bg-muted-foreground/40" : tone.bg;
          const badge = !isSignal
            ? { text: "cleared", cls: "border-border text-muted-foreground" }
            : {
                text: `${e.direction} · ${e.strength?.toFixed(0) ?? "—"}%`,
                cls: cn(tone?.border, tone?.text, "bg-card/60"),
              };
          return (
            <li
              key={`${e.ts}-${e.symbol}-${i}`}
              className="flex items-center gap-3 px-3 py-2"
            >
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {time}
              </span>
              <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {e.label}
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider",
                  badge.cls,
                )}
              >
                {badge.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CompactCircles({
  stats,
  showPercent,
  showTrend,
}: {
  stats: DigitStat[];
  showPercent?: boolean;
  showTrend?: boolean;
}) {
  const cls: Record<DigitStat["rank"], string> = {
    most: "border-[var(--rank-most)] text-[var(--rank-most)]",
    second: "border-[var(--rank-second)] text-[var(--rank-second)]",
    "second-least":
      "border-[var(--rank-second-least)] text-[var(--rank-second-least)]",
    least: "border-[var(--rank-least)] text-[var(--rank-least)]",
    mid: "border-border text-muted-foreground",
  };
  return (
    <div className="flex flex-wrap items-end justify-center gap-2">
      {stats.map((s) => (
        <div key={s.digit} className="flex flex-col items-center gap-1">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border-2 bg-background/40 font-mono text-xs font-bold",
              cls[s.rank],
            )}
          >
            {s.digit}
          </div>
          {showPercent && (
            <span className="flex items-center gap-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
              {s.percent.toFixed(1)}%
              {showTrend && <TrendArrow trend={s.trend} />}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function TrendArrow({ trend }: { trend: DigitStat["trend"] }) {
  if (trend === "up")
    return <span className="text-[var(--rank-most)]">↑</span>;
  if (trend === "down")
    return <span className="text-[var(--rank-least)]">↓</span>;
  return <span className="text-muted-foreground">→</span>;
}

function Legend() {
  const items = [
    { label: "Green = Most frequent", color: "var(--rank-most)" },
    { label: "Blue = 2nd most", color: "var(--rank-second)" },
    { label: "Yellow = 2nd least", color: "var(--rank-second-least)" },
    { label: "Red = Least frequent", color: "var(--rank-least)" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full border-2"
            style={{ borderColor: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
