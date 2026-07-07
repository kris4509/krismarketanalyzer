import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppHeader } from "@/components/analysis/AppHeader";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { computeDigitStats, lastDigit, type DigitStat } from "@/lib/deriv/analysis";
import {
  DEFAULT_SYMBOL,
  DERIV_SYMBOLS,
  TICK_COUNT_OPTIONS,
} from "@/lib/deriv/symbols";
import { useDerivTicks } from "@/lib/deriv/useDerivTicks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Statistics — Digit Pulse" },
      {
        name: "description",
        content:
          "Deep statistical breakdown of last-digit distribution with deviation, rank badges, Even/Odd, High/Low and Over/Under for Deriv synthetic indices.",
      },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [count, setCount] = useState(1000);
  const [barrier, setBarrier] = useState(5);

  const symbolMeta = useMemo(
    () => DERIV_SYMBOLS.find((s) => s.code === symbol) ?? DERIV_SYMBOLS[0],
    [symbol],
  );

  const { ticks, state, pip: livePip } = useDerivTicks(symbol, count);
  const pip = livePip ?? symbolMeta.pip;
  const stats = useMemo(() => computeDigitStats(ticks, pip), [ticks, pip]);

  const evenPct = stats.filter((s) => s.digit % 2 === 0).reduce((a, s) => a + s.percent, 0);
  const oddPct = 100 - evenPct;
  const highPct = stats.filter((s) => s.digit >= 5).reduce((a, s) => a + s.percent, 0);
  const lowPct = 100 - highPct;
  const overPct = stats.filter((s) => s.digit > barrier).reduce((a, s) => a + s.percent, 0);
  const underPct = stats.filter((s) => s.digit < barrier).reduce((a, s) => a + s.percent, 0);
  const exactPct = stats.find((s) => s.digit === barrier)?.percent ?? 0;

  const groups = Array.from(new Set(DERIV_SYMBOLS.map((s) => s.group)));
  const currentDigit = ticks.length ? lastDigit(ticks[ticks.length - 1].quote, pip) : null;
  const currentQuote = ticks.length ? ticks[ticks.length - 1].quote : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader live={state === "open"} />

      <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 pt-4 sm:px-4">
        <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Market
        </span>
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-[200px] bg-card font-mono sm:w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectGroup key={g}>
                <SelectLabel>{g}</SelectLabel>
                {DERIV_SYMBOLS.filter((s) => s.group === g).map((s) => (
                  <SelectItem key={s.code} value={s.code} className="font-mono">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-3 py-6 sm:px-4">
        {/* Header row */}
        <section className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto]">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Last price
            </div>
            <div className="truncate font-mono text-2xl font-bold tabular-nums">
              {currentQuote?.toFixed(pip) ?? "—"}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Last digit
            </div>
            <div className="mt-1 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--rank-most)] font-mono text-xl font-bold text-[var(--rank-most)] sm:h-14 sm:w-14 sm:text-2xl">
              {currentDigit ?? "—"}
            </div>
          </div>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Ticks
            </span>
            <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
              <SelectTrigger className="w-[120px] bg-card font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICK_COUNT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)} className="font-mono">
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <DigitDistributionPanel
          stats={stats}
          ticksLen={ticks.length}
          count={count}
          live={state === "open"}
        />

        {/* Even/Odd */}
        <StatBarCard title="EVEN / ODD">
          <StatBar label="Even (0,2,4,6,8)" percent={evenPct} tone="var(--rank-second)" />
          <StatBar label="Odd (1,3,5,7,9)" percent={oddPct} tone="hsl(var(--foreground))" />
        </StatBarCard>

        {/* High/Low */}
        <StatBarCard title="HIGH / LOW">
          <StatBar label="High (5-9)" percent={highPct} tone="var(--rank-second)" />
          <StatBar label="Low (0-4)" percent={lowPct} tone="hsl(var(--foreground))" />
        </StatBarCard>

        {/* Over/Under with barrier */}
        <StatBarCard
          title="OVER / UNDER"
          right={
            <Select value={String(barrier)} onValueChange={(v) => setBarrier(Number(v))}>
              <SelectTrigger className="h-8 w-[130px] bg-card font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, i) => i).map((n) => (
                  <SelectItem key={n} value={String(n)} className="font-mono">
                    Barrier {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        >
          <StatBar label={`Over ${barrier}`} percent={overPct} tone="var(--rank-most)" />
          <StatBar label={`Under ${barrier}`} percent={underPct} tone="var(--rank-least)" />
          <StatBar label={`Exactly ${barrier}`} percent={exactPct} tone="hsl(var(--muted-foreground))" />
        </StatBarCard>

        <p className="pb-4 text-center text-[11px] text-muted-foreground">
          Educational statistics only. Past frequencies do not predict future ticks.
        </p>
      </main>
    </div>
  );
}

// ─────────────────────── Digit Distribution ───────────────────────

const DIGIT_PALETTE: Record<number, string> = {
  0: "hsl(220 8% 60%)",
  1: "hsl(150 65% 55%)",
  2: "hsl(200 90% 55%)",
  3: "hsl(280 70% 62%)",
  4: "hsl(20 90% 55%)",
  5: "hsl(180 65% 50%)",
  6: "hsl(145 70% 45%)",
  7: "hsl(250 85% 65%)",
  8: "hsl(45 90% 55%)",
  9: "hsl(0 80% 55%)",
};

const EXPECTED_PCT = 10;

function DigitDistributionPanel({
  stats,
  ticksLen,
  count,
  live,
}: {
  stats: DigitStat[];
  ticksLen: number;
  count: number;
  live: boolean;
}) {
  const sorted = useMemo(
    () => [...stats].sort((a, b) => b.percent - a.percent),
    [stats],
  );
  const rankOf = useMemo(() => {
    const m = new Map<number, number>();
    sorted.forEach((s, i) => m.set(s.digit, i + 1));
    return m;
  }, [sorted]);
  const maxPct = Math.max(...stats.map((s) => s.percent), EXPECTED_PCT + 4);

  const most = sorted[0];
  const least = sorted[sorted.length - 1];
  const stableBand = 1.5;
  const balance =
    most && least && most.percent - least.percent < stableBand * 2
      ? "Stable"
      : most && least && most.percent - least.percent > 4
        ? "Skewed"
        : "Balanced";

  const insights: string[] = [];
  if (most) {
    insights.push(
      `Digit ${most.digit} is currently dominating the market (${signed(
        most.percent - EXPECTED_PCT,
      )} vs expected).`,
    );
  }
  if (least) {
    insights.push(
      `Digit ${least.digit} remains the least frequent (${signed(
        least.percent - EXPECTED_PCT,
      )} vs expected).`,
    );
  }
  const suppressUnder = sorted
    .filter((s) => s.percent < EXPECTED_PCT - 0.6)
    .filter((s) => s.digit >= 7)
    .map((s) => s.digit);
  if (suppressUnder.length >= 2) {
    insights.push(
      `Digits ${suppressUnder.join(" and ")} continue supporting UNDER strategies.`,
    );
  }
  insights.push(`Overall distribution is within a ${balance.toLowerCase()} range.`);

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-sm font-semibold sm:text-base">
            Digit Distribution
          </h3>
          <span className="font-mono text-[11px] text-muted-foreground">
            ({ticksLen} Ticks)
          </span>
          <span
            className={cn(
              "flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest",
              live ? "text-[var(--rank-most)]" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                live ? "bg-[var(--rank-most)] animate-pulse" : "bg-muted",
              )}
            />
            {live ? "LIVE" : "OFFLINE"}
          </span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Last {count} Ticks
        </div>
      </header>

      {/* Column headers (hidden on very small screens) */}
      <div className="hidden grid-cols-[3rem_minmax(0,1fr)_5.5rem_5rem_3.5rem] items-center gap-3 px-4 pt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:grid">
        <span>Digit</span>
        <span className="text-center">Frequency</span>
        <span className="text-right">%</span>
        <span className="text-right">Deviation</span>
        <span className="text-right">Rank</span>
      </div>

      <ul className="divide-y divide-border/40 px-2 py-2 sm:px-4">
        {sorted.map((s) => {
          const color = DIGIT_PALETTE[s.digit] ?? "hsl(var(--muted-foreground))";
          const dev = s.percent - EXPECTED_PCT;
          const trendArrow =
            dev > 0.15 ? "↑" : dev < -0.15 ? "↓" : "=";
          const devTone =
            dev > 0.15
              ? "text-[var(--rank-most)]"
              : dev < -0.15
                ? "text-[var(--rank-least)]"
                : "text-muted-foreground";
          const rank = rankOf.get(s.digit) ?? 0;
          const rankBadge =
            rank === 1
              ? { label: "Most Frequent", tone: "text-[var(--rank-most)] border-[var(--rank-most)]/50" }
              : rank === 2
                ? { label: "High", tone: "text-[var(--rank-most)] border-[var(--rank-most)]/40" }
                : rank === 10
                  ? { label: "Least Frequent", tone: "text-[var(--rank-least)] border-[var(--rank-least)]/50" }
                  : null;

          const barWidth = Math.min(100, (s.percent / maxPct) * 100);
          const expectedLeft = Math.min(100, (EXPECTED_PCT / maxPct) * 100);

          return (
            <li
              key={s.digit}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 py-2 sm:grid-cols-[3rem_minmax(0,1fr)_5.5rem_5rem_3.5rem] sm:gap-3"
            >
              {/* Digit chip */}
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border-2 font-mono text-sm font-bold tabular-nums sm:h-9 sm:w-9"
                style={{ borderColor: color, color }}
              >
                {s.digit}
              </span>

              {/* Frequency bar */}
              <div className="relative min-w-0">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/50 sm:h-3">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${barWidth}%`,
                      background: color,
                      boxShadow: `0 0 12px -4px ${color}`,
                    }}
                  />
                </div>
                <div
                  className="pointer-events-none absolute top-1/2 h-4 w-px -translate-y-1/2 bg-foreground/40"
                  style={{ left: `${expectedLeft}%` }}
                  aria-hidden
                />
              </div>

              {/* Percent */}
              <span
                className="text-right font-mono text-sm font-bold tabular-nums"
                style={{ color }}
              >
                {s.percent.toFixed(1)}%
              </span>

              {/* Deviation (sm+) */}
              <span
                className={cn(
                  "hidden text-right font-mono text-xs tabular-nums sm:inline",
                  devTone,
                )}
              >
                {signed(dev)} {trendArrow}
              </span>

              {/* Rank badge (sm+) */}
              <span className="hidden justify-self-end sm:inline-flex">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border font-mono text-[11px] tabular-nums",
                    rankBadge?.tone ?? "border-border text-muted-foreground",
                  )}
                  title={rankBadge?.label ?? `Rank ${rank}`}
                >
                  {rank}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-baseline justify-between px-4 pb-3 font-mono text-[10px] text-muted-foreground">
        <span>0%</span>
        <span>
          {EXPECTED_PCT}% <span className="text-muted-foreground/70">expected</span>
        </span>
        <span>{maxPct.toFixed(0)}%</span>
      </div>

      {/* AI summary + quick stats */}
      <div className="grid gap-3 border-t border-border bg-background/40 p-4 sm:grid-cols-[1fr_auto]">
        <div className="rounded-lg border border-border/60 p-3">
          <div className="mb-2 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-[var(--rank-most)]">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--rank-most)]/10">
              ⚙
            </span>
            AI Summary
          </div>
          <ul className="space-y-1 text-[12px] leading-relaxed">
            {insights.map((line, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="mr-1 text-[var(--rank-most)]">•</span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-1 sm:w-56">
          <QuickStat
            label="Most Frequent"
            value={most ? `${most.digit} (${most.percent.toFixed(1)}%)` : "—"}
            tone="text-[var(--rank-most)]"
          />
          <QuickStat
            label="Least Frequent"
            value={least ? `${least.digit} (${least.percent.toFixed(1)}%)` : "—"}
            tone="text-[var(--rank-least)]"
          />
          <QuickStat label="Market Balance" value={balance} tone="text-foreground" />
        </div>
      </div>

      <p className="border-t border-border px-4 py-2 text-center font-mono text-[10px] text-muted-foreground">
        Bars update in real time with every new tick.
      </p>
    </section>
  );
}

function QuickStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 font-mono text-sm font-bold tabular-nums", tone)}>
        {value}
      </div>
    </div>
  );
}

function signed(n: number) {
  const s = n.toFixed(1);
  return n >= 0 ? `+${s}%` : `${s}%`;
}

function StatBarCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </h3>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function StatBar({
  label,
  percent,
  tone,
}: {
  label: string;
  percent: number;
  tone: string;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between font-mono">
        <span className="text-sm font-semibold">{label}</span>
        <span
          className={cn("text-sm font-bold tabular-nums")}
          style={{ color: tone }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: tone }}
        />
      </div>
    </div>
  );
}
