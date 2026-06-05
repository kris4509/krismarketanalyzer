import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/analysis/AppHeader";
import { Controls } from "@/components/analysis/Controls";
import { DigitCircles } from "@/components/analysis/DigitCircles";
import { SignalPanel } from "@/components/analysis/SignalPanel";
import { TickChart } from "@/components/analysis/TickChart";
import {
  computeDigitStats,
  computeTradeSignal,
  lastDigit,
} from "@/lib/deriv/analysis";
import {
  DEFAULT_SYMBOL,
  DEFAULT_TICK_COUNT,
  DERIV_SYMBOLS,
} from "@/lib/deriv/symbols";
import { useDerivTicks } from "@/lib/deriv/useDerivTicks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Digit Pulse — Live Deriv Last-Digit Analyzer" },
      {
        name: "description",
        content:
          "Real-time last-digit frequency analysis for Deriv synthetic indices. Spot the hottest and coldest digits at a glance.",
      },
      { property: "og:title", content: "Digit Pulse — Live Deriv Analyzer" },
      {
        property: "og:description",
        content:
          "Live last-digit distribution for Volatility, Crash/Boom, Jump and Step indices with rank-colored signal circles.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [count, setCount] = useState(DEFAULT_TICK_COUNT);

  const symbolMeta = useMemo(
    () => DERIV_SYMBOLS.find((s) => s.code === symbol) ?? DERIV_SYMBOLS[0],
    [symbol],
  );

  const { ticks, state, pip: livePip } = useDerivTicks(symbol, count);
  const pip = livePip ?? symbolMeta.pip;

  const stats = useMemo(
    () => computeDigitStats(ticks, pip),
    [ticks, pip],
  );

  const signal = useMemo(() => computeTradeSignal(stats, ticks), [stats, ticks]);

  const currentTick = ticks[ticks.length - 1];
  const prevTick = ticks[ticks.length - 2];
  const currentDigit = currentTick
    ? lastDigit(currentTick.quote, pip)
    : null;
  const change = currentTick && prevTick ? currentTick.quote - prevTick.quote : 0;
  const changePct =
    currentTick && prevTick ? (change / prevTick.quote) * 100 : 0;
  const up = change >= 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader live={state === "open"} />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <Controls
          symbol={symbol}
          onSymbol={setSymbol}
          count={count}
          onCount={setCount}
          state={state}
        />

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6 rounded-xl border border-border bg-card p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {symbolMeta.group}
                </div>
                <h2 className="mt-1 font-mono text-xl font-semibold sm:text-2xl">
                  {symbolMeta.label}
                </h2>
              </div>
              <div className="text-right">
                <div className="font-mono text-3xl font-bold tabular-nums sm:text-4xl">
                  {currentTick ? currentTick.quote.toFixed(pip) : "—"}
                </div>
                {currentTick && prevTick && (
                  <div
                    className={
                      "font-mono text-xs " +
                      (up ? "text-[var(--rank-most)]" : "text-[var(--rank-least)]")
                    }
                  >
                    {up ? "▲" : "▼"} {change.toFixed(pip)} (
                    {changePct.toFixed(3)}%)
                  </div>
                )}
              </div>
            </div>

            <TickChart ticks={ticks} pip={pip} />

            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Last-digit distribution
                  <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">
                    <span className="text-[var(--rank-most)]">↑</span> rising{" "}
                    <span className="text-[var(--rank-least)]">↓</span> falling{" "}
                    <span>→</span> flat
                  </span>
                </h3>
                <span className="font-mono text-xs text-muted-foreground">
                  {ticks.length} / {count} ticks
                </span>
              </div>
              <DigitCircles stats={stats} currentDigit={currentDigit} />
              <Legend />
            </div>
          </div>

          <aside className="space-y-4">
            <SignalPanel signal={signal} />
            <div className="rounded-lg border border-border bg-card p-4 text-[11px] leading-relaxed text-muted-foreground">
              <p className="font-semibold uppercase tracking-widest text-foreground">
                Risk disclaimer
              </p>
              <p className="mt-2">
                Past digit frequencies do not predict future ticks. Deriv
                synthetic indices are driven by an independent RNG per tick.
                This tool is for visualization and study only.
              </p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

function Legend() {
  const items = [
    { label: "Most", color: "var(--rank-most)" },
    { label: "2nd most", color: "var(--rank-second)" },
    { label: "2nd least", color: "var(--rank-second-least)" },
    { label: "Least", color: "var(--rank-least)" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-2 text-[11px] text-muted-foreground">
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
