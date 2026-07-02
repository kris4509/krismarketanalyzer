import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
import { computeDigitStats, lastDigit } from "@/lib/deriv/analysis";
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
          "Bar-chart driven statistical breakdown of last-digit distribution, Even/Odd, High/Low and Over/Under for Deriv synthetic indices.",
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

  const chartData = stats.map((s) => ({
    digit: String(s.digit),
    percent: Number(s.percent.toFixed(2)),
    rank: s.rank,
  }));

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
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Market
        </span>
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-[260px] bg-card font-mono">
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


      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
        {/* Header row */}
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex-1 min-w-[200px]">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Last price
            </div>
            <div className="font-mono text-2xl font-bold tabular-nums">
              {currentQuote?.toFixed(pip) ?? "—"}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Last digit
            </div>
            <div className="mt-1 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--rank-most)] font-mono text-2xl font-bold text-[var(--rank-most)]">
              {currentDigit ?? "—"}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
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

        {/* Digit distribution bar chart */}
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-mono text-sm font-semibold">Digit Distribution (%)</h3>
            <span className="font-mono text-[11px] text-muted-foreground">
              {ticks.length} ticks · pip {pip}
            </span>
          </div>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="digit"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontFamily: "monospace", fontSize: 12 }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontFamily: "monospace", fontSize: 12 }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tickLine={false}
                  domain={[0, "dataMax + 4"]}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    fontFamily: "monospace",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v}%`, "Frequency"]}
                />
                <ReferenceLine y={10} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                <Bar dataKey="percent" radius={[6, 6, 0, 0]}>
                  {chartData.map((d) => (
                    <Cell key={d.digit} fill={rankColor(d.rank)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Digit distribution table — color-coded by rank */}
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-mono text-sm font-semibold">
              Digit Distribution Table
            </h3>
            <span className="font-mono text-[11px] text-muted-foreground">
              Ranked by frequency
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  <th className="py-2 pr-2">Digit</th>
                  <th className="px-2">Count</th>
                  <th className="px-2">%</th>
                  <th className="px-2">Trend</th>
                  <th className="px-2">Δ vs 1st half</th>
                  <th className="py-2 pl-2">Rank</th>
                </tr>
              </thead>
              <tbody>
                {[...stats]
                  .sort((a, b) => b.percent - a.percent)
                  .map((s) => {
                    const color = rankColor(s.rank);
                    const trendArrow =
                      s.trend === "up" ? "↑" : s.trend === "down" ? "↓" : "→";
                    return (
                      <tr
                        key={s.digit}
                        className="border-b border-border/40 last:border-0"
                      >
                        <td className="py-2 pr-2">
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 font-bold tabular-nums"
                            style={{ borderColor: color, color }}
                          >
                            {s.digit}
                          </span>
                        </td>
                        <td className="px-2 tabular-nums">{s.count}</td>
                        <td
                          className="px-2 font-bold tabular-nums"
                          style={{ color }}
                        >
                          {s.percent.toFixed(2)}%
                        </td>
                        <td
                          className="px-2 text-base"
                          style={{
                            color:
                              s.trend === "up"
                                ? "var(--rank-most)"
                                : s.trend === "down"
                                  ? "var(--rank-least)"
                                  : "hsl(var(--muted-foreground))",
                          }}
                        >
                          {trendArrow}
                        </td>
                        <td className="px-2 tabular-nums text-muted-foreground">
                          {s.trendDelta > 0 ? "+" : ""}
                          {s.trendDelta.toFixed(2)} pp
                        </td>
                        <td
                          className="py-2 pl-2 uppercase tracking-widest"
                          style={{ color }}
                        >
                          {s.rank}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>


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

function rankColor(rank: string): string {
  switch (rank) {
    case "most":
      return "var(--rank-most)";
    case "second":
      return "var(--rank-second)";
    case "second-least":
      return "var(--rank-second-least)";
    case "least":
      return "var(--rank-least)";
    default:
      return "hsl(var(--muted))";
  }
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
