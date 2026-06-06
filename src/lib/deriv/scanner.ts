import { computeDigitStats, type DigitStat } from "./analysis";
import type { Tick } from "./useDerivTicks";

export type ScannerMode = "even-odd" | "under-8" | "under-7" | "over-2";

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

function buildEvenOddThresholdDetector(opts: {
  minGreenPct: number;
  minSamePartyPct: number;
  minSameParityCount: number;
}): Detector {
  return function detect(symbol, ticks, pip) {
    if (ticks.length < 100) return null;
    const stats = computeDigitStats(ticks, pip);
    const green = stats.find((s) => s.rank === "most");
    const red = stats.find((s) => s.rank === "least");
    const blue = stats.find((s) => s.rank === "second");
    const yellow = stats.find((s) => s.rank === "second-least");
    if (!green || !red || !blue || !yellow) return null;

    const gp = green.digit % 2;
    const rp = red.digit % 2;
    if (gp === rp) return null;
    if (green.percent <= opts.minGreenPct) return null;

    const direction = gp === 0 ? "EVEN" : "ODD";
    const parityValue = gp as 0 | 1;
    const sameParity = stats.filter((s) => s.digit % 2 === parityValue);
    const above = sameParity.filter(
      (s) => s.percent > opts.minSamePartyPct,
    ).length;
    if (above < opts.minSameParityCount) return null;

    const strength = sameParity.reduce((a, s) => a + s.percent, 0);
    const last = ticks[ticks.length - 1];

    return {
      symbol,
      mode: "even-odd",
      direction,
      winningDigits: evenOddWinningDigits(parityValue),
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

export const detectEvenOddSignalThreshold = buildEvenOddThresholdDetector({
  minGreenPct: 11,
  minSamePartyPct: 10,
  minSameParityCount: 4,
});

export const detectEvenOddSignalThresholdLoose = buildEvenOddThresholdDetector({
  minGreenPct: 12,
  minSamePartyPct: 10.5,
  minSameParityCount: 3,
});

export type EvenOddStrategy =
  | "rank-alignment"
  | "threshold"
  | "threshold-loose";

export const STRATEGIES: Record<
  EvenOddStrategy,
  { label: string; sub: string; detect: Detector }
> = {
  "rank-alignment": {
    label: "Rank Alignment",
    sub: "Green+Red same parity · Blue+Yellow opposite",
    detect: detectEvenOddSignal,
  },
  threshold: {
    label: "Threshold (4 × >10%)",
    sub: "Green/Red opposite · green >11% · ≥4 same-parity digits >10%",
    detect: detectEvenOddSignalThreshold,
  },
  "threshold-loose": {
    label: "Threshold Loose (3 × >10.5%)",
    sub: "Green/Red opposite · green >12% · ≥3 same-parity digits >10.5%",
    detect: detectEvenOddSignalThresholdLoose,
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
  "over-2": {
    mode: "over-2",
    label: "Over 2",
    sub: "Green 5–9 · 0, 1 & 2 below 10%",
    detect: detectOver2,
    hasStrategies: false,
  },
  "under-7": {
    mode: "under-7",
    label: "Under 7",
    sub: "Green 0–5 · 7, 8 & 9 below 10%",
    detect: detectUnder7,
    hasStrategies: false,
  },
};

export const SCANNER_MODES: ScannerMode[] = [
  "even-odd",
  "under-8",
  "over-2",
  "under-7",
];

export type TrackedSignal = EvenOddSignal & {
  firstSeen: number;
  lastSeen: number;
  heldMs: number;
  persistent: boolean;
};

export const PERSIST_MS = 5000;
