import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { computeDigitStats, lastDigit, type DigitStat } from "@/lib/deriv/analysis";
import {
  computeDominance,
  computeTrend,
  evenPctFromTicks,
  sideColor,
  trendArrow,
  trendLabel,
  type Dominance,
  type DominanceSide,
  type DominanceTrend,
} from "@/lib/deriv/dominance";
import { DERIV_SYMBOLS } from "@/lib/deriv/symbols";
import type { Tick } from "@/lib/deriv/useDerivTicks";
import type { SymbolFeed } from "@/lib/deriv/useMultiDerivTicks";

const HISTORY_LIMIT = 30;
const SHIFT_FLASH_MS = 6000;

type Row = {
  code: string;
  label: string;
  dom: Dominance;
  trend: DominanceTrend;
  duration: number;
  ticksLen: number;
  shift: { from: DominanceSide; to: DominanceSide; at: number } | null;
  stats: DigitStat[] | null;
  currentDigit: number | null;
  ticks: Tick[];
  pip: number;
};

function Stars({ n }: { n: number }) {
  return (
    <span className="font-mono tracking-widest text-[13px]">
      {"★".repeat(n)}
      <span className="opacity-25">{"★".repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

function timeAgo(ms: number): string {
  if (ms < 1000) return "just now";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  return `${Math.round(ms / 60_000)}m ago`;
}

export function EvenOddMarketScanner({
  symbols,
  feeds,
}: {
  symbols: { code: string; label: string; pip: number }[];
  feeds: Record<string, SymbolFeed>;
}) {
  const navigate = useNavigate();

  // Per-symbol state that must survive across renders.
  const historyRef = useRef<Map<string, number[]>>(new Map());
  const dominanceRef = useRef<
    Map<string, { side: DominanceSide; since: number; ticksAtStart: number }>
  >(new Map());
  const shiftRef = useRef<
    Map<string, { from: DominanceSide; to: DominanceSide; at: number }>
  >(new Map());
  const prevTickCountRef = useRef<Map<string, number>>(new Map());

  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo<Row[]>(() => {
    const now = Date.now();
    const out: Row[] = [];
    for (const meta of symbols) {
      const feed = feeds[meta.code];
      const ticks = feed?.ticks ?? [];
      const pip = feed?.pip ?? meta.pip;
      const evenPct = evenPctFromTicks(ticks, pip);
      const dom = computeDominance(evenPct);

      // Push new value into history when tick count grew.
      const prevLen = prevTickCountRef.current.get(meta.code) ?? 0;
      const hist = historyRef.current.get(meta.code) ?? [];
      if (ticks.length !== prevLen) {
        hist.push(evenPct);
        if (hist.length > HISTORY_LIMIT) hist.splice(0, hist.length - HISTORY_LIMIT);
        historyRef.current.set(meta.code, hist);
        prevTickCountRef.current.set(meta.code, ticks.length);
      }

      // Dominance duration tracking.
      const domRec = dominanceRef.current.get(meta.code);
      if (!domRec || domRec.side !== dom.side) {
        if (domRec && domRec.side !== dom.side && domRec.side !== "NEUTRAL" && dom.side !== "NEUTRAL") {
          shiftRef.current.set(meta.code, {
            from: domRec.side,
            to: dom.side,
            at: now,
          });
        }
        dominanceRef.current.set(meta.code, {
          side: dom.side,
          since: now,
          ticksAtStart: ticks.length,
        });
      }
      const cur = dominanceRef.current.get(meta.code)!;
      const duration = Math.max(0, ticks.length - cur.ticksAtStart);

      const shift = shiftRef.current.get(meta.code) ?? null;
      const shiftFresh = shift && now - shift.at < SHIFT_FLASH_MS ? shift : null;

      const stats = ticks.length >= 20 ? computeDigitStats(ticks, pip) : null;
      const lastQuote = ticks[ticks.length - 1]?.quote ?? null;
      const currentDigit = lastQuote !== null ? lastDigit(lastQuote, pip) : null;

      out.push({
        code: meta.code,
        label: meta.label,
        dom,
        trend: computeTrend(hist),
        duration,
        ticksLen: ticks.length,
        shift: shiftFresh,
        stats,
        currentDigit,
        ticks,
        pip,
      });
    }
    // Sort strongest first (highest diff), neutrals last.
    out.sort((a, b) => {
      if (a.dom.side === "NEUTRAL" && b.dom.side !== "NEUTRAL") return 1;
      if (b.dom.side === "NEUTRAL" && a.dom.side !== "NEUTRAL") return -1;
      return b.dom.diff - a.dom.diff;
    });
    return out;
  }, [symbols, feeds]);

  const goToAnalyzer = (code: string) => {
    navigate({ to: "/", search: { symbol: code } });
  };

  const top4 = rows.slice(0, 4);

  return (
    <section className="space-y-4">
      {/* Ranking */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Best Even / Odd Setups
          </h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            Auto-ranked by dominance
          </span>
        </div>
        <ol className="space-y-1.5">
          {top4.map((r, i) => {
            const color = sideColor(r.dom.side);
            return (
              <li key={r.code}>
                <button
                  onClick={() => goToAnalyzer(r.code)}
                  className="grid w-full grid-cols-[24px_1fr_auto_auto] items-center gap-3 rounded-md border border-transparent bg-background/40 px-3 py-2 text-left transition-colors hover:border-border hover:bg-background/70"
                >
                  <span className="font-mono text-sm font-bold tabular-nums text-muted-foreground">
                    {i + 1}.
                  </span>
                  <span className="min-w-0 truncate font-mono text-sm font-semibold">
                    {r.label}
                  </span>
                  <span
                    className="font-mono text-xs font-bold uppercase tracking-wider tabular-nums"
                    style={{ color }}
                  >
                    {r.dom.side} · {Math.max(r.dom.even, r.dom.odd).toFixed(0)}%
                  </span>
                  <span style={{ color }}>
                    <Stars n={r.dom.stars} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Market cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <MarketCard
            key={r.code}
            row={r}
            onOpen={() => goToAnalyzer(r.code)}
          />
        ))}
      </div>
    </section>
  );
}

function MarketCard({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const color = sideColor(row.dom.side);
  const trendColor =
    row.trend === "up"
      ? "var(--rank-most)"
      : row.trend === "down"
        ? "var(--rank-least)"
        : "var(--muted-foreground)";
  const flashing = !!row.shift;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-all",
        flashing
          ? "animate-pulse border-[var(--rank-second)] shadow-[0_0_28px_-6px_var(--rank-second)]"
          : "border-border",
      )}
      style={
        flashing ? undefined : { boxShadow: `0 0 24px -14px ${color}` }
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-semibold">
            {row.label}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            {row.ticksLen} ticks
          </div>
        </div>
        <span
          className="shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
          style={{ color, borderColor: color }}
        >
          ● {row.dom.side}
        </span>
      </div>

      {row.shift && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--rank-second)]/60 bg-[var(--rank-second)]/10 px-2 py-0.5 font-mono text-[10px] text-[var(--rank-second)]">
          🔄 Dominance shift · {row.shift.from} → {row.shift.to} ·{" "}
          {timeAgo(Date.now() - row.shift.at)}
        </div>
      )}

      {/* Mini price cursor — shows how the price/digit jumps over time */}
      {row.ticks.length > 1 && (
        <div className="mt-3">
          <PriceCursor ticks={row.ticks} pip={row.pip} />
        </div>
      )}

      {/* Digit circles — same style as the analyzer page */}
      {row.stats && (
        <div className="mt-3">
          <MiniDigitCircles stats={row.stats} currentDigit={row.currentDigit} />
        </div>
      )}


      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px]">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
            Even
          </div>
          <div className="tabular-nums font-bold text-[var(--rank-most)]">
            {row.dom.even.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
            Odd
          </div>
          <div className="tabular-nums font-bold text-[var(--rank-second)]">
            {row.dom.odd.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-[var(--rank-most)] transition-all"
          style={{ width: `${row.dom.even}%` }}
        />
        <div
          className="h-full bg-[var(--rank-second)] transition-all"
          style={{ width: `${row.dom.odd}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-2 font-mono text-[10px]">
        <div>
          <div className="text-muted-foreground">Diff</div>
          <div className="tabular-nums font-bold" style={{ color }}>
            {row.dom.diff.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Strength</div>
          <span style={{ color }}>
            <Stars n={row.dom.stars} />
          </span>
        </div>
        <div>
          <div className="text-muted-foreground">Trend</div>
          <div className="font-bold" style={{ color: trendColor }}>
            {trendArrow(row.trend)} {trendLabel(row.trend)}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between font-mono text-[10px]">
        <span className="text-muted-foreground">
          Duration:{" "}
          <span className="text-foreground tabular-nums">
            {row.duration} ticks
          </span>
        </span>
        <span className="truncate font-semibold" style={{ color }}>
          {row.dom.status}
        </span>
      </div>

      <button
        onClick={onOpen}
        className="mt-3 w-full rounded-md border border-border bg-background/40 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-foreground transition-colors hover:border-[var(--rank-most)] hover:text-[var(--rank-most)]"
      >
        Open Analyzer →
      </button>
    </div>
  );
}

const rankBorder: Record<DigitStat["rank"], string> = {
  most: "border-[var(--rank-most)] text-[var(--rank-most)]",
  second: "border-[var(--rank-second)] text-[var(--rank-second)]",
  "second-least": "border-[var(--rank-second-least)] text-[var(--rank-second-least)]",
  least: "border-[var(--rank-least)] text-[var(--rank-least)]",
  mid: "border-border text-muted-foreground",
};

function MiniDigitCircles({
  stats,
  currentDigit,
}: {
  stats: DigitStat[];
  currentDigit: number | null;
}) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-1.5">
      {stats.map((s) => {
        const active = s.digit === currentDigit;
        return (
          <div key={s.digit} className="flex flex-col items-center gap-0.5">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border bg-card font-mono text-[13px] font-bold transition-all",
                rankBorder[s.rank],
                active && "scale-110 ring-1 ring-foreground/60",
              )}
            >
              {s.digit}
            </div>
            <span
              className={cn(
                "font-mono text-[9px] tabular-nums",
                rankBorder[s.rank].split(" ")[1],
              )}
            >
              {s.percent.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PriceCursor({ ticks, pip }: { ticks: Tick[]; pip: number }) {
  const slice = ticks.slice(-80);
  const quotes = slice.map((t) => t.quote);
  const min = Math.min(...quotes);
  const max = Math.max(...quotes);
  const range = max - min || 1;
  const w = 260;
  const h = 56;
  const step = quotes.length > 1 ? w / (quotes.length - 1) : w;
  const points = quotes
    .map((q, i) => `${i * step},${h - ((q - min) / range) * h}`)
    .join(" ");
  const last = quotes[quotes.length - 1];
  const cursorY = h - ((last - min) / range) * h;
  return (
    <div className="relative rounded-md border border-border bg-background/40 p-1">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-14 w-full">
        <polyline
          fill="none"
          stroke="var(--chart-line)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        <circle
          cx={w}
          cy={cursorY}
          r={3}
          fill="var(--primary)"
        />
      </svg>
      <div className="absolute right-2 top-1 rounded bg-primary/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary-foreground">
        {last.toFixed(pip)}
      </div>
    </div>
  );
}
