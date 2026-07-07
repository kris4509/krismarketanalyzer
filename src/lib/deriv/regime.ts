import type { Tick } from "./useDerivTicks";

export type Regime = "calm" | "normal" | "choppy";

export type RegimeInfo = {
  regime: Regime;
  choppiness: number; // 0-100
  atrBps: number; // avg |Δp/p| over window, in basis points
  window: number;
  label: string;
  detail: string;
  tone: string; // css color var
};

/**
 * Choppiness Index (Dreiss) over the last N ticks.
 *   CI = 100 * log10(sum(|Δp|) / (max - min)) / log10(N)
 *
 * ≥ 61.8 → sideways/erratic (choppy — suppress signals)
 * ≤ 38.2 → trending (calm/directional)
 * between → normal
 *
 * Also returns an ATR-in-bps figure so the analyzer can show
 * a familiar "volatility" number alongside the regime label.
 */
export function computeRegime(ticks: Tick[], window = 100): RegimeInfo | null {
  if (ticks.length < Math.min(window, 30)) return null;
  const slice = ticks.slice(-window);
  let sumAbs = 0;
  let sumRelAbs = 0;
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = 0; i < slice.length; i++) {
    const q = slice[i].quote;
    if (q > hi) hi = q;
    if (q < lo) lo = q;
    if (i > 0) {
      const d = q - slice[i - 1].quote;
      sumAbs += Math.abs(d);
      sumRelAbs += Math.abs(d) / slice[i - 1].quote;
    }
  }
  const range = hi - lo || 1e-12;
  const n = slice.length;
  const choppiness = Math.max(
    0,
    Math.min(100, (100 * Math.log10(sumAbs / range)) / Math.log10(n)),
  );
  const atrBps = (sumRelAbs / (n - 1)) * 1e4;

  let regime: Regime;
  let label: string;
  let detail: string;
  let tone: string;
  if (choppiness >= 61.8) {
    regime = "choppy";
    label = "Choppy";
    detail = "Sideways / erratic — signals may misfire";
    tone = "var(--rank-least)";
  } else if (choppiness <= 38.2) {
    regime = "calm";
    label = "Trending";
    detail = "Directional flow — clean setups";
    tone = "var(--rank-most)";
  } else {
    regime = "normal";
    label = "Normal";
    detail = "Balanced volatility";
    tone = "var(--rank-second)";
  }
  return { regime, choppiness, atrBps, window: n, label, detail, tone };
}
