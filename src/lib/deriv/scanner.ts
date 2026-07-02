import { computeDigitStats, type DigitStat } from "./analysis";
import type { Tick } from "./useDerivTicks";

export type ScannerMode =
  | "even-odd"
  | "under-8"
  | "under-7"
  | "under-9"
  | "over-2"
  | "over-3"
  | "over-1";

export type EvenOddSignal = {
  symbol: string;
  mode: ScannerMode;
  /** Human-readable trade direction, e.g. "EVEN", "ODD", "UNDER 8", "OVER 2". */
  direction: string;
  /** Which last-digit values win the trade — drives the parity strip colours. */
  winningDigits: number[];
  greenDigit: number;
  redDigit: number;
  blueDigit: number;
  yellowDigit: number;
  /** % of ticks landing on the winning side (50+ for even/odd, varies for barrier). */
  strength: number;
  oppositeStrength: number;
  stats: DigitStat[];
  lastQuote: number | null;
  pip: number;
  tickCount: number;
};

export type Detector = (
  symbol: string,
  ticks: Tick[],
  pip: number,
) => EvenOddSignal | null;

// ───────────────────────── Even / Odd detectors ─────────────────────────

function evenOddWinningDigits(parity: 0 | 1): number[] {
  return parity === 0 ? [0, 2, 4, 6, 8] : [1, 3, 5, 7, 9];
}

/** Rank alignment: green+red same parity, blue+yellow opposite parity. */
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

  const gp = green.digit % 2;
  const rp = red.digit % 2;
  const bp = blue.digit % 2;
  const yp = yellow.digit % 2;
  if (gp !== rp) return null;
  if (bp !== yp) return null;
  if (gp === bp) return null;

  const direction = gp === 0 ? "EVEN" : "ODD";
  const parityValue = gp as 0 | 1;
  const winningDigits = evenOddWinningDigits(parityValue);
  const strength = stats
    .filter((s) => s.digit % 2 === parityValue)
    .reduce((a, s) => a + s.percent, 0);
  const last = ticks[ticks.length - 1];

  return {
    symbol,
    mode: "even-odd",
    direction,
    winningDigits,
    greenDigit: green.digit,
    redDigit: red.digit,
    blueDigit: blue.digit,
    yellowDigit: yellow.digit,
    strength,
    oppositeStrength: 100 - strength,
    stats,
    lastQuote: last?.quote ?? null,
    pip,
    tickCount: ticks.length,
  };
}

/**
 * Odd Strategy (strict):
 *   Green & Blue on ODD digits, each ≥ 11%.
 *   Red & Yellow on EVEN digits, red ≤ 8.6%, yellow ≤ 9.5%.
 */
export function detectOddStrict(
  symbol: string,
  ticks: Tick[],
  pip: number,
): EvenOddSignal | null {
  if (ticks.length < 100) return null;
  const stats = computeDigitStats(ticks, pip);
  const green = stats.find((s) => s.rank === "most");
  const blue = stats.find((s) => s.rank === "second");
  const yellow = stats.find((s) => s.rank === "second-least");
  const red = stats.find((s) => s.rank === "least");
  if (!green || !blue || !yellow || !red) return null;

  if (green.digit % 2 !== 1 || blue.digit % 2 !== 1) return null;
  if (green.percent < 11 || blue.percent < 11) return null;
  if (red.digit % 2 !== 0 || yellow.digit % 2 !== 0) return null;
  if (red.percent > 8.6) return null;
  if (yellow.percent > 9.5) return null;

  const winningDigits = evenOddWinningDigits(1);
  const strength = stats
    .filter((s) => s.digit % 2 === 1)
    .reduce((a, s) => a + s.percent, 0);
  const last = ticks[ticks.length - 1];
  return {
    symbol,
    mode: "even-odd",
    direction: "ODD",
    winningDigits,
    greenDigit: green.digit,
    redDigit: red.digit,
    blueDigit: blue.digit,
    yellowDigit: yellow.digit,
    strength,
    oppositeStrength: 100 - strength,
    stats,
    lastQuote: last?.quote ?? null,
    pip,
    tickCount: ticks.length,
  };
}

/**
 * Even Strategy (strict):
 *   Green & Blue on EVEN digits, each > 11%.
 *   Red ≤ 8.6%, Yellow ≤ 9.5% (parity unrestricted).
 */
export function detectEvenStrict(
  symbol: string,
  ticks: Tick[],
  pip: number,
): EvenOddSignal | null {
  if (ticks.length < 100) return null;
  const stats = computeDigitStats(ticks, pip);
  const green = stats.find((s) => s.rank === "most");
  const blue = stats.find((s) => s.rank === "second");
  const yellow = stats.find((s) => s.rank === "second-least");
  const red = stats.find((s) => s.rank === "least");
  if (!green || !blue || !yellow || !red) return null;

  if (green.digit % 2 !== 0 || blue.digit % 2 !== 0) return null;
  if (green.percent <= 11 || blue.percent <= 11) return null;
  if (red.percent > 8.6) return null;
  if (yellow.percent > 9.5) return null;

  const winningDigits = evenOddWinningDigits(0);
  const strength = stats
    .filter((s) => s.digit % 2 === 0)
    .reduce((a, s) => a + s.percent, 0);
  const last = ticks[ticks.length - 1];
  return {
    symbol,
    mode: "even-odd",
    direction: "EVEN",
    winningDigits,
    greenDigit: green.digit,
    redDigit: red.digit,
    blueDigit: blue.digit,
    yellowDigit: yellow.digit,
    strength,
    oppositeStrength: 100 - strength,
    stats,
    lastQuote: last?.quote ?? null,
    pip,
    tickCount: ticks.length,
  };
}

export type EvenOddStrategy =
  | "rank-alignment"
  | "odd-strict"
  | "even-strict";

export const STRATEGIES: Record<
  EvenOddStrategy,
  { label: string; sub: string; detect: Detector }
> = {
  "rank-alignment": {
    label: "Rank Alignment",
    sub: "Green+Red same parity · Blue+Yellow opposite",
    detect: detectEvenOddSignal,
  },
  "odd-strict": {
    label: "Odd Strategy",
    sub: "G+B on odd ≥11% · R+Y on even · R≤8.6% · Y≤9.5%",
    detect: detectOddStrict,
  },
  "even-strict": {
    label: "Even Strategy",
    sub: "G+B on even >11% · R≤8.6% · Y≤9.5%",
    detect: detectEvenStrict,
  },
};


// Back-compat alias for the previous name.
export type ScannerStrategy = EvenOddStrategy;

// ───────────────────────── Barrier detectors (Under N / Over N) ─────────────────────────

function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

function buildBarrierDetector(opts: {
  mode: ScannerMode;
  direction: string;
  greenRange: [number, number]; // inclusive
  redRange?: [number, number]; // optional constraint on the least-frequent digit
  losingDigits: number[];
  winningDigits: number[];
  maxLosingPct: number; // strict <
}): Detector {
  return function detect(symbol, ticks, pip) {
    if (ticks.length < 100) return null;
    const stats = computeDigitStats(ticks, pip);
    const green = stats.find((s) => s.rank === "most");
    const red = stats.find((s) => s.rank === "least");
    const blue = stats.find((s) => s.rank === "second");
    const yellow = stats.find((s) => s.rank === "second-least");
    if (!green || !red || !blue || !yellow) return null;

    const [lo, hi] = opts.greenRange;
    if (green.digit < lo || green.digit > hi) return null;

    if (opts.redRange) {
      const [rlo, rhi] = opts.redRange;
      if (red.digit < rlo || red.digit > rhi) return null;
    }

    // every losing digit must be strictly below the threshold
    for (const d of opts.losingDigits) {
      const s = stats.find((x) => x.digit === d);
      if (!s || s.percent >= opts.maxLosingPct) return null;
    }

    const winSet = new Set(opts.winningDigits);
    const strength = stats
      .filter((s) => winSet.has(s.digit))
      .reduce((a, s) => a + s.percent, 0);
    const last = ticks[ticks.length - 1];

    return {
      symbol,
      mode: opts.mode,
      direction: opts.direction,
      winningDigits: opts.winningDigits,
      greenDigit: green.digit,
      redDigit: red.digit,
      blueDigit: blue.digit,
      yellowDigit: yellow.digit,
      strength,
      oppositeStrength: 100 - strength,
      stats,
      lastQuote: last?.quote ?? null,
      pip,
      tickCount: ticks.length,
    };
  };
}

export const detectUnder8 = buildBarrierDetector({
  mode: "under-8",
  direction: "UNDER 8",
  greenRange: [0, 6],
  losingDigits: [8, 9],
  winningDigits: range(0, 7),
  maxLosingPct: 10,
});

export const detectUnder7 = buildBarrierDetector({
  mode: "under-7",
  direction: "UNDER 7",
  greenRange: [0, 5],
  losingDigits: [7, 8, 9],
  winningDigits: range(0, 6),
  maxLosingPct: 10,
});

export const detectOver2 = buildBarrierDetector({
  mode: "over-2",
  direction: "OVER 2",
  greenRange: [5, 9],
  losingDigits: [0, 1, 2],
  winningDigits: range(3, 9),
  maxLosingPct: 10,
});

export const detectOver3 = buildBarrierDetector({
  mode: "over-3",
  direction: "OVER 3",
  greenRange: [5, 9],
  redRange: [5, 9],
  losingDigits: [0, 1, 2, 3],
  winningDigits: range(4, 9),
  maxLosingPct: 10,
});

export const detectOver1 = buildBarrierDetector({
  mode: "over-1",
  direction: "OVER 1",
  greenRange: [4, 9],
  losingDigits: [0, 1],
  winningDigits: range(2, 9),
  maxLosingPct: 10,
});

export const detectUnder9 = buildBarrierDetector({
  mode: "under-9",
  direction: "UNDER 9",
  greenRange: [0, 7],
  losingDigits: [9],
  winningDigits: range(0, 8),
  maxLosingPct: 10,
});

// ───────────────────────── Scanner registry ─────────────────────────

export type ScannerInfo = {
  mode: ScannerMode;
  label: string;
  sub: string;
  /** Default detector — used for cross-scanner alerts and as the default
   *  detector for modes without sub-strategies. */
  detect: Detector;
  hasStrategies: boolean;
};

export const SCANNERS: Record<ScannerMode, ScannerInfo> = {
  "even-odd": {
    mode: "even-odd",
    label: "Even / Odd",
    sub: "Digit-parity setups",
    detect: detectEvenOddSignal,
    hasStrategies: true,
  },
  "under-8": {
    mode: "under-8",
    label: "Under 8",
    sub: "Green 0–6 · 8 & 9 below 10%",
    detect: detectUnder8,
    hasStrategies: false,
  },
  "under-7": {
    mode: "under-7",
    label: "Under 7",
    sub: "Green 0–5 · 7, 8 & 9 below 10%",
    detect: detectUnder7,
    hasStrategies: false,
  },
  "under-9": {
    mode: "under-9",
    label: "Under 9",
    sub: "Green 0–7 · 9 below 10%",
    detect: detectUnder9,
    hasStrategies: false,
  },
  "over-1": {
    mode: "over-1",
    label: "Over 1",
    sub: "Green 4–9 · 0 & 1 below 10%",
    detect: detectOver1,
    hasStrategies: false,
  },
  "over-2": {
    mode: "over-2",
    label: "Over 2",
    sub: "Green 5–9 · 0, 1 & 2 below 10%",
    detect: detectOver2,
    hasStrategies: false,
  },
  "over-3": {
    mode: "over-3",
    label: "Over 3",
    sub: "Green & Red 5–9 · 0–3 below 10%",
    detect: detectOver3,
    hasStrategies: false,
  },
};

export const SCANNER_MODES: ScannerMode[] = [
  "even-odd",
  "under-8",
  "under-7",
  "under-9",
  "over-1",
  "over-2",
  "over-3",
];

export type TrackedSignal = EvenOddSignal & {
  firstSeen: number;
  lastSeen: number;
  heldMs: number;
  persistent: boolean;
};

export const PERSIST_MS = 5000;
