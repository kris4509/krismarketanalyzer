import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/analysis/AppHeader";
import { cn } from "@/lib/utils";
import {
  detectEvenOddSignal,
  PERSIST_MS,
  type EvenOddSignal,
  type TrackedSignal,
} from "@/lib/deriv/scanner";
import {
  DERIV_SYMBOLS,
  DEFAULT_TICK_COUNT,
  TICK_COUNT_OPTIONS,
} from "@/lib/deriv/symbols";
import { useMultiDerivTicks } from "@/lib/deriv/useMultiDerivTicks";
import type { DigitStat } from "@/lib/deriv/analysis";

// Scan all the 1s volatility markets by default — matches the user's blueprint.
const SCAN_SYMBOLS = DERIV_SYMBOLS.filter(
  (s) => s.group === "Volatility (1s)",
);
const SCAN_CODES = SCAN_SYMBOLS.map((s) => s.code);

export const Route = createFileRoute("/scanner")({
  head: () => ({
    meta: [
      { title: "Even / Odd Scanner — Digit Pulse" },
      {
        name: "description",
        content:
          "Real-time scanner for Even/Odd digit-parity setups across Deriv volatility indices, with locked persistent signals.",
      },
    ],
  }),
  component: ScannerPage,
});

function ScannerPage() {
  const [count, setCount] = useState(DEFAULT_TICK_COUNT);
  const { feeds, state } = useMultiDerivTicks(SCAN_CODES, count);
  const trackerRef = useRef<
    Map<string, { direction: "EVEN" | "ODD"; firstSeen: number }>
  >(new Map());
  const notifiedRef = useRef<Map<string, string>>(new Map()); // symbol -> direction notified
  const [, force] = useState(0);
  const [notify, setNotify] = useState<"default" | "granted" | "denied" | "unsupported">(
    typeof window !== "undefined" && "Notification" in window
      ? (Notification.permission as "default" | "granted" | "denied")
      : "unsupported",
  );
  const [sound, setSound] = useState(true);

  // Tick a re-render every second so heldMs updates smoothly.
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

  const { tracked, raw } = useMemo(() => {
    const now = Date.now();
    const raw: { meta: (typeof SCAN_SYMBOLS)[number]; signal: EvenOddSignal | null; ticksLen: number; lastQuote: number | null; pip: number | null }[] = [];
    const tracked: TrackedSignal[] = [];
    const tracker = trackerRef.current;

    for (const meta of SCAN_SYMBOLS) {
      const feed = feeds[meta.code];
      const pip = feed?.pip ?? meta.pip;
      const ticks = feed?.ticks ?? [];
      const signal = detectEvenOddSignal(meta.code, ticks, pip);
      const lastQuote = ticks[ticks.length - 1]?.quote ?? null;
      raw.push({ meta, signal, ticksLen: ticks.length, lastQuote, pip });

      if (signal) {
        const prev = tracker.get(meta.code);
        if (!prev || prev.direction !== signal.direction) {
          tracker.set(meta.code, {
            direction: signal.direction,
            firstSeen: now,
          });
        }
        const t = tracker.get(meta.code)!;
        const held = now - t.firstSeen;
        tracked.push({
          ...signal,
          firstSeen: t.firstSeen,
          lastSeen: now,
          heldMs: held,
          persistent: held >= PERSIST_MS,
        });
      } else {
        tracker.delete(meta.code);
      }
    }
    return { tracked, raw };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds]);

  const locked = tracked.filter((t) => t.persistent);
  const fresh = tracked.filter((t) => !t.persistent);
  const noSignal = raw.filter((r) => !r.signal);
  const evenCount = tracked.filter((t) => t.direction === "EVEN").length;
  const oddCount = tracked.filter((t) => t.direction === "ODD").length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader live />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">
              Even / Odd Scanner
            </h2>
            <p className="text-sm text-muted-foreground">
              Monitoring all {SCAN_SYMBOLS.length} 1s volatility markets for
              valid parity alignment.{" "}
              <span className="text-foreground/70">
                {state === "open" ? "Live feed connected." : `Status: ${state}`}
              </span>
            </p>
          </div>
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
        </section>

        <section className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Locked ≥5s" value={locked.length} tone="most" />
          <StatCard label="Fresh signals" value={fresh.length} tone="second" />
          <StatCard label="Even" value={evenCount} tone="most" />
          <StatCard label="Odd" value={oddCount} tone="second" />
        </section>

        {locked.length > 0 && (
          <Section
            title="Locked signals"
            sub={`Held ≥ ${PERSIST_MS / 1000}s — strongest conviction`}
            dotClass="bg-[var(--rank-most)] animate-pulse"
          >
            <div className="space-y-3">
              {locked.map((t) => (
                <SignalRow key={t.symbol} signal={t} locked />
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
                <SignalRow key={t.symbol} signal={t} />
              ))}
            </div>
          </Section>
        )}

        {tracked.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
            <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-muted-foreground/50" />
            <h3 className="font-mono text-sm font-semibold">
              No valid Even/Odd signals detected
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Waiting for green + red ranks to align on the same parity while
              blue + yellow align on the opposite.
            </p>
          </div>
        )}

        <Section
          title="No signal"
          sub="Watching for alignment"
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
              />
            ))}
          </div>
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

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "most" | "second";
}) {
  const color =
    tone === "most" ? "text-[var(--rank-most)]" : "text-[var(--rank-second)]";
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <div className={cn("font-mono text-3xl font-bold tabular-nums", color)}>
        {value}
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
  locked,
}: {
  signal: TrackedSignal;
  locked?: boolean;
}) {
  const meta = SCAN_SYMBOLS.find((s) => s.code === signal.symbol);
  const dirColor =
    signal.direction === "EVEN"
      ? "text-[var(--rank-most)] border-[var(--rank-most)]"
      : "text-[var(--rank-second)] border-[var(--rank-second)]";
  const held = (signal.heldMs / 1000).toFixed(1);

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-all",
        locked
          ? "border-[var(--rank-most)] shadow-[0_0_28px_-8px_var(--rank-most)]"
          : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              locked ? "bg-[var(--rank-most)]" : "bg-[var(--rank-second)]",
            )}
          />
          <div>
            <div className="font-mono text-base font-semibold">
              {meta?.label ?? signal.symbol}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {signal.lastQuote?.toFixed(signal.pip)} · {signal.tickCount} ticks
              · held {held}s
            </div>
          </div>
        </div>
        <div className="text-right">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-sm font-bold uppercase",
              dirColor,
            )}
          >
            Trade {signal.direction}
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
            {signal.strength.toFixed(1)}% signal strength
          </div>
        </div>
      </div>

      <div className="mt-4">
        <CompactCircles
          stats={signal.stats}
          showPercent
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
        Green ({signal.greenDigit}) + Red ({signal.redDigit}) on{" "}
        <span className="font-semibold">{signal.direction}</span> · Blue (
        {signal.blueDigit}) + Yellow ({signal.yellowDigit}) on{" "}
        <span className="font-semibold">
          {signal.direction === "EVEN" ? "ODD" : "EVEN"}
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
}: {
  label: string;
  quote: number | null;
  pip: number;
  ticksLen: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--rank-most)]" />
          <span className="font-mono text-sm font-semibold">{label}</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {quote !== null ? quote.toFixed(pip) : "—"}
        </span>
      </div>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
        {ticksLen} ticks buffered
      </div>
    </div>
  );
}

function CompactCircles({
  stats,
  showPercent,
}: {
  stats: DigitStat[];
  showPercent?: boolean;
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
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {s.percent.toFixed(1)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
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
