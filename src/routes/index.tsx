import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/analysis/AppHeader";
import { BotPromoBanner } from "@/components/analysis/BotPromoBanner";
import { Controls } from "@/components/analysis/Controls";
import { DigitCircles } from "@/components/analysis/DigitCircles";
import { EvenOddDominance } from "@/components/analysis/EvenOddDominance";
import { TickChart } from "@/components/analysis/TickChart";
import { ValidSignalsPanel } from "@/components/analysis/ValidSignalsPanel";
import { computeDigitStats, lastDigit } from "@/lib/deriv/analysis";
import { evenPctFromStats } from "@/lib/deriv/dominance";
import { computeRegime } from "@/lib/deriv/regime";
import {
  DEFAULT_SYMBOL,
  DEFAULT_TICK_COUNT,
  DERIV_SYMBOLS,
} from "@/lib/deriv/symbols";
import { useDerivTicks } from "@/lib/deriv/useDerivTicks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    symbol: typeof search.symbol === "string" ? search.symbol : undefined,
  }),
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
  const { symbol: symbolParam } = Route.useSearch();
  const navigate = useNavigate();
  const [symbol, setSymbol] = useState(symbolParam ?? DEFAULT_SYMBOL);

  // Keep URL and internal state in sync when a deep link arrives.
  useEffect(() => {
    if (symbolParam && symbolParam !== symbol) setSymbol(symbolParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolParam]);

  const handleSymbol = (next: string) => {
    setSymbol(next);
    navigate({ to: "/", search: { symbol: next }, replace: true });
  };
  const [count, setCount] = useState(DEFAULT_TICK_COUNT);
  const [suppressChoppy, setSuppressChoppy] = useState(true);
  const [minStrength, setMinStrength] = useState(0);

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

  const regime = useMemo(() => computeRegime(ticks, 100), [ticks]);

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

      <main className="mx-auto max-w-7xl space-y-6 px-3 py-5 sm:px-6 sm:py-6">
        <Controls
          symbol={symbol}
          onSymbol={setSymbol}
          count={count}
          onCount={setCount}
          state={state}
        />

        <BotPromoBanner />

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6 rounded-xl border border-border bg-card p-3 sm:p-6">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {symbolMeta.group}
                </div>
                <h2 className="mt-1 truncate font-mono text-lg font-semibold sm:text-2xl">
                  {symbolMeta.label}
                </h2>
              </div>
              <div className="text-right">
                <div className="font-mono text-2xl font-bold tabular-nums sm:text-4xl">
                  {currentTick ? currentTick.quote.toFixed(pip) : "—"}
                </div>
                {currentTick && prevTick && (
                  <div
                    className={
                      "font-mono text-[11px] sm:text-xs " +
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

          <aside className="min-w-0 space-y-4">
            <RegimeCard
              regime={regime}
              suppress={suppressChoppy}
              onSuppress={setSuppressChoppy}
              minStrength={minStrength}
              onMinStrength={setMinStrength}
            />
            <ValidSignalsPanel
              suppressed={
                suppressChoppy && regime?.regime === "choppy" ? regime : null
              }
              minStrength={minStrength}
            />
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

function RegimeCard({
  regime,
  suppress,
  onSuppress,
  minStrength,
  onMinStrength,
}: {
  regime: ReturnType<typeof computeRegime>;
  suppress: boolean;
  onSuppress: (v: boolean) => void;
  minStrength: number;
  onMinStrength: (v: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Market Regime
        </h3>
        <span className="font-mono text-[10px] text-muted-foreground">
          Choppiness · ATR
        </span>
      </div>
      {!regime ? (
        <p className="py-2 font-mono text-[11px] text-muted-foreground">
          Collecting ticks…
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div
                className="font-mono text-lg font-bold uppercase tracking-wider"
                style={{ color: regime.tone }}
              >
                {regime.label}
              </div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                {regime.detail}
              </div>
            </div>
            <div className="text-right font-mono text-[11px] tabular-nums">
              <div>
                CI{" "}
                <span className="font-bold" style={{ color: regime.tone }}>
                  {regime.choppiness.toFixed(0)}
                </span>
              </div>
              <div className="text-muted-foreground">
                ATR {regime.atrBps.toFixed(1)}bp
              </div>
            </div>
          </div>
          {/* CI meter — 0 trending, 100 choppy */}
          <div className="mt-3 relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full transition-all",
                regime.regime === "choppy"
                  ? "bg-[var(--rank-least)]"
                  : regime.regime === "calm"
                    ? "bg-[var(--rank-most)]"
                    : "bg-[var(--rank-second)]",
              )}
              style={{ width: `${regime.choppiness}%` }}
            />
            <div
              className="absolute top-0 h-full w-px bg-foreground/40"
              style={{ left: "38.2%" }}
            />
            <div
              className="absolute top-0 h-full w-px bg-foreground/40"
              style={{ left: "61.8%" }}
            />
          </div>
        </>
      )}

      <div className="mt-4 space-y-3 border-t border-border pt-3">
        <label className="flex items-center justify-between gap-2 font-mono text-[11px]">
          <span className="text-muted-foreground">Suppress on choppy</span>
          <button
            type="button"
            onClick={() => onSuppress(!suppress)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-widest",
              suppress
                ? "border-[var(--rank-most)] text-[var(--rank-most)]"
                : "border-border text-muted-foreground",
            )}
          >
            {suppress ? "ON" : "OFF"}
          </button>
        </label>
        <div>
          <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
            <span>Min strength</span>
            <span className="tabular-nums text-foreground">
              {minStrength}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={90}
            step={1}
            value={minStrength}
            onChange={(e) => onMinStrength(Number(e.target.value))}
            className="w-full accent-[var(--rank-most)]"
          />
        </div>
      </div>
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
