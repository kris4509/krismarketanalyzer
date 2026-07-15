import { lastDigit, type DigitStat } from "./analysis";
import type { Tick } from "./useDerivTicks";

export type DominanceSide = "EVEN" | "ODD" | "NEUTRAL";
export type DominanceTrend = "up" | "down" | "flat";
export type DominanceStrength =
  | "Neutral"
  | "Weak"
  | "Moderate"
  | "Strong"
  | "Extreme";

export type Dominance = {
  even: number;
  odd: number;
  diff: number;
  side: DominanceSide;
  strength: DominanceStrength;
  /** 0..5 discrete star rating derived from diff */
  stars: number;
  status: string;
};

export function evenPctFromStats(stats: DigitStat[] | null | undefined): number {
  if (!stats || stats.length === 0) return 50;
  return stats.filter((s) => s.digit % 2 === 0).reduce((a, s) => a + s.percent, 0);
}

export function evenPctFromTicks(ticks: Tick[], pip: number): number {
  if (ticks.length === 0) return 50;
  let even = 0;
  for (const t of ticks) if (lastDigit(t.quote, pip) % 2 === 0) even++;
  return (even / ticks.length) * 100;
}

export function classifyStrength(diff: number): DominanceStrength {
  if (diff < 3) return "Neutral";
  if (diff < 6) return "Weak";
  if (diff < 10) return "Moderate";
  if (diff < 15) return "Strong";
  return "Extreme";
}

export function starsFromDiff(diff: number): number {
  if (diff < 3) return 1;
  if (diff < 6) return 2;
  if (diff < 10) return 3;
  if (diff < 15) return 4;
  return 5;
}

export function statusLabel(side: DominanceSide, strength: DominanceStrength): string {
  if (side === "NEUTRAL" || strength === "Neutral") return "Neutral";
  const cap = side === "EVEN" ? "Even" : "Odd";
  if (strength === "Extreme") return `Extreme ${cap}`;
  if (strength === "Strong") return `Strong ${cap} Dominance`;
  if (strength === "Moderate") return `${cap} Dominance`;
  return `Weak ${cap}`;
}

export function computeDominance(evenPct: number): Dominance {
  const even = Math.max(0, Math.min(100, evenPct));
  const odd = 100 - even;
  const diff = Math.abs(even - odd);
  const strength = classifyStrength(diff);
  const side: DominanceSide =
    strength === "Neutral" ? "NEUTRAL" : even > odd ? "EVEN" : "ODD";
  return {
    even,
    odd,
    diff,
    side,
    strength,
    stars: starsFromDiff(diff),
    status: statusLabel(side, strength),
  };
}

/** Compare last value(s) of history against earlier values to classify trend. */
export function computeTrend(history: number[]): DominanceTrend {
  if (history.length < 3) return "flat";
  const tailLen = Math.min(5, Math.floor(history.length / 2));
  const tail = history.slice(-tailLen);
  const head = history.slice(-tailLen * 2, -tailLen);
  if (head.length === 0) return "flat";
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const delta = avg(tail) - avg(head);
  if (delta > 0.4) return "up";
  if (delta < -0.4) return "down";
  return "flat";
}

export function trendArrow(t: DominanceTrend): string {
  return t === "up" ? "↑" : t === "down" ? "↓" : "→";
}

export function trendLabel(t: DominanceTrend): string {
  return t === "up" ? "Rising" : t === "down" ? "Falling" : "Flat";
}

export function sideColor(side: DominanceSide): string {
  if (side === "EVEN") return "var(--rank-most)";
  if (side === "ODD") return "var(--rank-second)";
  return "var(--muted-foreground)";
}
