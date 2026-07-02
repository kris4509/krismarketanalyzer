import { useMemo } from "react";
import { useMultiDerivTicks } from "@/lib/deriv/useMultiDerivTicks";
import {
  SCANNERS,
  SCANNER_MODES,
  STRATEGIES,
  type EvenOddSignal,
  type ScannerMode,
} from "@/lib/deriv/scanner";
import { DERIV_SYMBOLS } from "@/lib/deriv/symbols";
import { cn } from "@/lib/utils";

const SCAN_SYMBOLS = DERIV_SYMBOLS.filter(
  (s) => s.group === "Volatility (1s)",
);
const SCAN_CODES = SCAN_SYMBOLS.map((s) => s.code);

type Row = {
  mode: ScannerMode;
  strategyLabel?: string;
  symbol: string;
  symbolLabel: string;
  signal: EvenOddSignal;
};

/**
 * Compact live panel showing every valid signal currently detected across
 * ALL scanners (Even/Odd rank-alignment + odd-strict + even-strict, plus
 * every barrier scanner). Meant for the Analyzer sidebar so a trader
 * doesn't have to switch tabs to see opportunities.
 */
export function ValidSignalsPanel() {
  const { feeds, state } = useMultiDerivTicks(SCAN_CODES, 1000);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const meta of SCAN_SYMBOLS) {
      const feed = feeds[meta.code];
      const pip = feed?.pip ?? meta.pip;
      const ticks = feed?.ticks ?? [];
      if (ticks.length < 100) continue;

      for (const mode of SCANNER_MODES) {
        if (mode === "even-odd") {
          for (const [key, strat] of Object.entries(STRATEGIES)) {
            const sig = strat.detect(meta.code, ticks, pip);
            if (sig) {
              out.push({
                mode,
                strategyLabel: strat.label,
                symbol: meta.code,
                symbolLabel: meta.label,
                signal: sig,
              });
              break; // one hit per market per mode is enough
            }
            void key;
          }
        } else {
          const sig = SCANNERS[mode].detect(meta.code, ticks, pip);
          if (sig) {
            out.push({
              mode,
              symbol: meta.code,
              symbolLabel: meta.label,
              signal: sig,
            });
          }
        }
      }
    }
    // sort strongest first
    out.sort((a, b) => b.signal.strength - a.signal.strength);
    return out;
  }, [feeds]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Live Valid Signals
        </h3>
        <span className="font-mono text-[10px] text-muted-foreground">
          {state === "open" ? `${rows.length} active` : state}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center font-mono text-xs text-muted-foreground">
          No valid signals right now — scanning {SCAN_SYMBOLS.length} markets.
        </p>
      ) : (
        <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r, i) => (
            <li
              key={`${r.mode}-${r.symbol}-${i}`}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5"
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-xs font-semibold">
                  {r.symbolLabel}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <span className="rounded bg-secondary/60 px-1 py-0.5 uppercase">
                    {SCANNERS[r.mode].label}
                  </span>
                  {r.strategyLabel && (
                    <span className="truncate">{r.strategyLabel}</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={cn(
                    "font-mono text-xs font-bold",
                    r.signal.direction === "ODD"
                      ? "text-[var(--rank-second)]"
                      : "text-[var(--rank-most)]",
                  )}
                >
                  {r.signal.direction}
                </div>
                <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {r.signal.strength.toFixed(1)}%
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
