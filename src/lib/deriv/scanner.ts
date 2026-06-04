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
  const strength = green.percent + red.percent;
  const oppositeStrength = blue.percent + yellow.percent;
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
