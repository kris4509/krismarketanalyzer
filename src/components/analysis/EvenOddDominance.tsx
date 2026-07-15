import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  computeDominance,
  computeTrend,
  sideColor,
  trendArrow,
  trendLabel,
  type Dominance,
} from "@/lib/deriv/dominance";

const HISTORY_LIMIT = 60;

function Stars({ n }: { n: number }) {
  return (
    <span className="font-mono tracking-widest">
      {"★".repeat(n)}
      <span className="opacity-30">{"★".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return (
      <div className="flex h-14 items-center justify-center font-mono text-[10px] text-muted-foreground">
        Collecting…
      </div>
    );
  }
  const w = 240;
  const h = 56;
  const min = Math.min(...values, 45);
  const max = Math.max(...values, 55);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-14 w-full"
    >
      <line
        x1={0}
        x2={w}
        y1={h - ((50 - min) / range) * h}
        y2={h - ((50 - min) / range) * h}
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeDasharray="3 3"
      />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

export function EvenOddDominance({
  evenPct,
  tickKey,
}: {
  evenPct: number;
  /** Any monotonically-changing value that increments when a new tick arrives. */
  tickKey: number;
}) {
  const dom: Dominance = computeDominance(evenPct);
  const [history, setHistory] = useState<number[]>([]);
  const lastKeyRef = useRef<number>(-1);

  useEffect(() => {
    if (tickKey === lastKeyRef.current) return;
    lastKeyRef.current = tickKey;
    setHistory((prev) => {
      const next = [...prev, evenPct];
      if (next.length > HISTORY_LIMIT) next.splice(0, next.length - HISTORY_LIMIT);
      return next;
    });
  }, [tickKey, evenPct]);

  const trend = computeTrend(history);
  const color = sideColor(dom.side);
  const trendColor =
    trend === "up"
      ? "var(--rank-most)"
      : trend === "down"
        ? "var(--rank-least)"
        : "var(--muted-foreground)";

  return (
    <div className="space-y-4">
      {/* Dominance card */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Even / Odd Dominance
          </h3>
          <span
            className="rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
            style={{ color, borderColor: color }}
          >
            {dom.side === "EVEN" ? "● Even" : dom.side === "ODD" ? "● Odd" : "● Neutral"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border bg-background/40 p-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Even
            </div>
            <div className="font-mono text-xl font-bold tabular-nums text-[var(--rank-most)]">
              {dom.even.toFixed(1)}%
            </div>
          </div>
          <div className="rounded-md border border-border bg-background/40 p-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Odd
            </div>
            <div className="font-mono text-xl font-bold tabular-nums text-[var(--rank-second)]">
              {dom.odd.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Stacked bar */}
        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-[var(--rank-most)] transition-all"
            style={{ width: `${dom.even}%` }}
          />
          <div
            className="h-full bg-[var(--rank-second)] transition-all"
            style={{ width: `${dom.odd}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 font-mono text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
              Difference
            </div>
            <div className="tabular-nums font-bold" style={{ color }}>
              {dom.side === "EVEN" ? "+" : dom.side === "ODD" ? "−" : "±"}
              {dom.diff.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
              Strength
            </div>
            <div className="font-bold" style={{ color }}>
              {dom.strength}
            </div>
            <Stars n={dom.stars} />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
              Trend
            </div>
            <div className="font-bold" style={{ color: trendColor }}>
              {trendArrow(trend)} {trendLabel(trend)}
            </div>
          </div>
        </div>
      </div>

      {/* History card */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Dominance History
          </h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            Even % · last {history.length}
          </span>
        </div>
        <div className={cn("text-[var(--rank-most)]")}>
          <Sparkline values={history} color="currentColor" />
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
          <span>Trend</span>
          <span className="font-bold" style={{ color: trendColor }}>
            {trendArrow(trend)} {trendLabel(trend)}
          </span>
        </div>
      </div>
    </div>
  );
}
