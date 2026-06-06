import { computeDigitStats, type DigitStat } from "./analysis";
import type { Tick } from "./useDerivTicks";

export type EvenOddDirection = "EVEN" | "ODD";

export type EvenOddSignal = {
  symbol: string;
  direction: EvenOddDirection;
  // The four ranked digits
  greenDigit: number;
  redDigit: number;
  blueDigit: number;
  yellowDigit: number;
  // Sum of green+red percent (the "tradable side") for strength
  strength: number; // 0-100, percent of ticks landing on the tradable parity (top+bottom rank combined)
  oppositeStrength: number; // percent on the opposite parity (blue+yellow)
  stats: DigitStat[];
  lastQuote: number | null;
  pip: number;
  tickCount: number;
};

/**
 * Detect if green+red (most + least frequent) share the same parity AND
 * blue+yellow (2nd most + 2nd least) share the OPPOSITE parity.
 * That is the user's "Even/Odd scanner" rule.
 */
export function detectEvenOddSignal(
  symbol: string,
  ticks: Tick[],
  pip: number,
): EvenOddSignal | null {
  if (ticks.length < 100) return null;
  const stats = computeDigitStats(ticks, pip);
  const green = stats.find((s) => s.rank === "most");
  const red = stats.find((s) => s.rank === "least");
  const blue = stats.find((s) => s.rank === "second");
  const yellow = stats.find((s) => s.rank === "second-least");
  if (!green || !red || !blue || !yellow) return null;

  const greenParity = green.digit % 2;
  const redParity = red.digit % 2;
  const blueParity = blue.digit % 2;
  const yellowParity = yellow.digit % 2;

  if (greenParity !== redParity) return null;
  if (blueParity !== yellowParity) return null;
  if (greenParity === blueParity) return null; // need opposite parities

  const direction: EvenOddDirection = greenParity === 0 ? "EVEN" : "ODD";
  // Strength = total % of all ticks whose last digit shares the tradable parity.
  // This naturally sits around 50 and rises with bias — matching the
  // "50%+" range seen in similar tools.
  const parityValue = direction === "EVEN" ? 0 : 1;
  const strength = stats
    .filter((s) => s.digit % 2 === parityValue)
    .reduce((a, s) => a + s.percent, 0);
  const oppositeStrength = 100 - strength;
  const last = ticks[ticks.length - 1];

  return {
    symbol,
    direction,
    greenDigit: green.digit,
    redDigit: red.digit,
    blueDigit: blue.digit,
    yellowDigit: yellow.digit,
    strength,
    oppositeStrength,
    stats,
    lastQuote: last?.quote ?? null,
    pip,
    tickCount: ticks.length,
  };
}

export type TrackedSignal = EvenOddSignal & {
  /** ms timestamp when signal first appeared in current run */
  firstSeen: number;
  /** ms timestamp of latest confirmation */
  lastSeen: number;
  /** ms duration current signal has held */
  heldMs: number;
  /** persistent if held >= PERSIST_MS */
  persistent: boolean;
};

export const PERSIST_MS = 5000;

/**
 * Strategy B — Threshold rule:
 *   - Green (most frequent) digit must sit on the tradable parity.
 *   - Red (least frequent) digit must sit on the OPPOSITE parity.
 *   - Green percent must be > 11%.
 *   - At least 4 of the 5 digits sharing the tradable parity must be > 10%.
 */
export function detectEvenOddSignalThreshold(
  symbol: string,
  ticks: Tick[],
  pip: number,
): EvenOddSignal | null {
  if (ticks.length < 100) return null;
  const stats = computeDigitStats(ticks, pip);
  const green = stats.find((s) => s.rank === "most");
  const red = stats.find((s) => s.rank === "least");
  const blue = stats.find((s) => s.rank === "second");
  const yellow = stats.find((s) => s.rank === "second-least");
  if (!green || !red || !blue || !yellow) return null;

  const greenParity = green.digit % 2;
  const redParity = red.digit % 2;
  if (greenParity === redParity) return null; // need opposite

  const direction: EvenOddDirection = greenParity === 0 ? "EVEN" : "ODD";
  const parityValue = direction === "EVEN" ? 0 : 1;
  const sameParity = stats.filter((s) => s.digit % 2 === parityValue);
  const aboveTen = sameParity.filter((s) => s.percent > 10).length;
  const aboveTenFive = sameParity.filter((s) => s.percent > 10.5).length;

  // Rule A: green > 11% AND ≥4 same-parity digits > 10%
  const ruleA = green.percent > 11 && aboveTen >= 4;
  // Rule B (looser): green > 12% AND ≥3 same-parity digits > 10.5%
  const ruleB = green.percent > 12 && aboveTenFive >= 3;
  if (!ruleA && !ruleB) return null;


  const strength = sameParity.reduce((a, s) => a + s.percent, 0);
  const oppositeStrength = 100 - strength;
  const last = ticks[ticks.length - 1];

  return {
    symbol,
    direction,
    greenDigit: green.digit,
    redDigit: red.digit,
    blueDigit: blue.digit,
    yellowDigit: yellow.digit,
    strength,
    oppositeStrength,
    stats,
    lastQuote: last?.quote ?? null,
    pip,
    tickCount: ticks.length,
  };
}

export type ScannerStrategy = "rank-alignment" | "threshold";

export const STRATEGIES: Record<
  ScannerStrategy,
  { label: string; sub: string; detect: typeof detectEvenOddSignal }
> = {
  "rank-alignment": {
    label: "Rank Alignment",
    sub: "Green+Red same parity · Blue+Yellow opposite",
    detect: detectEvenOddSignal,
  },
  threshold: {
    label: "Threshold",
    sub: "Green/Red opposite parity · (≥4 same-parity >10% & green >11%) OR (≥3 same-parity >10.5% & green >12%)",
    detect: detectEvenOddSignalThreshold,
  },

};

