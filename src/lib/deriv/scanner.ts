import { computeDigitStats, type DigitStat } from "./analysis";
import type { Tick } from "./useDerivTicks";

export type ScannerMode =
  | "even-odd"
  | "under-8"
  | "under-7"
  | "under-9"
  | "under-9-c4"
  | "over-2"
  | "over-3"
  | "over-1"
  | "under-hnr"
  | "over-hnr"
  | "under-destroyer"
  | "over-destroyer"
  | "over-2-pro"
  | "under-7-pro"
  | "over-killer"
  | "under-killer";



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
 * Even Strategy (positional):
 *   Red (least) on {0, 2, 4} AND Green (most) on {5, 7, 9}.
 */
export function detectEvenStrict(
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

  const redAllowed = new Set([0, 2, 4]);
  const greenAllowed = new Set([5, 7, 9]);
  if (!redAllowed.has(red.digit)) return null;
  if (!greenAllowed.has(green.digit)) return null;

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

/**
 * Odd Strategy (positional):
 *   Red (least) on {1, 3, 5} AND Green (most) on {6, 8}.
 */
export function detectOddStrict(
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

  const redAllowed = new Set([1, 3, 5]);
  const greenAllowed = new Set([6, 8]);
  if (!redAllowed.has(red.digit)) return null;
  if (!greenAllowed.has(green.digit)) return null;

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
  "even-strict": {
    label: "Even Strategy",
    sub: "Red on 0/2/4 · Green on 5/7/9",
    detect: detectEvenStrict,
  },
  "odd-strict": {
    label: "Odd Strategy",
    sub: "Red on 1/3/5 · Green on 6/8",
    detect: detectOddStrict,
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
  blueRange?: [number, number]; // optional constraint on the 2nd-most-frequent digit
  redRange?: [number, number]; // optional constraint on the least-frequent digit
  yellowRange?: [number, number]; // optional constraint on the 2nd-least-frequent digit
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

    if (opts.blueRange) {
      const [blo, bhi] = opts.blueRange;
      if (blue.digit < blo || blue.digit > bhi) return null;
    }
    if (opts.redRange) {
      const [rlo, rhi] = opts.redRange;
      if (red.digit < rlo || red.digit > rhi) return null;
    }
    if (opts.yellowRange) {
      const [ylo, yhi] = opts.yellowRange;
      if (yellow.digit < ylo || yellow.digit > yhi) return null;
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
  blueRange: [0, 6],
  losingDigits: [8, 9],
  winningDigits: range(0, 7),
  maxLosingPct: 10,
});

export const detectUnder7 = buildBarrierDetector({
  mode: "under-7",
  direction: "UNDER 7",
  greenRange: [0, 5],
  blueRange: [0, 5],
  losingDigits: [7, 8, 9],
  winningDigits: range(0, 6),
  maxLosingPct: 10,
});

export const detectOver2 = buildBarrierDetector({
  mode: "over-2",
  direction: "OVER 2",
  greenRange: [5, 9],
  blueRange: [5, 9],
  losingDigits: [0, 1, 2],
  winningDigits: range(3, 9),
  maxLosingPct: 10,
});

export const detectOver3 = buildBarrierDetector({
  mode: "over-3",
  direction: "OVER 3",
  greenRange: [5, 9],
  blueRange: [5, 9],
  losingDigits: [0, 1, 2, 3],
  winningDigits: range(4, 9),
  maxLosingPct: 10,
});

export const detectOver1 = buildBarrierDetector({
  mode: "over-1",
  direction: "OVER 1",
  greenRange: [3, 9],
  blueRange: [3, 9],
  losingDigits: [0, 1],
  winningDigits: range(2, 9),
  maxLosingPct: 10,
});

// Basic Under 9 — green & blue on 0–7, only 9 must be < 10%.
export const detectUnder9 = buildBarrierDetector({
  mode: "under-9",
  direction: "UNDER 9",
  greenRange: [0, 7],
  blueRange: [0, 7],
  losingDigits: [9],
  winningDigits: range(0, 8),
  maxLosingPct: 10,
});

// Auto C4 Under 9 — tighter: green & blue on 0–4.
export const detectUnder9C4 = buildBarrierDetector({
  mode: "under-9-c4",
  direction: "UNDER 9",
  greenRange: [0, 4],
  blueRange: [0, 4],
  losingDigits: [9],
  winningDigits: range(0, 8),
  maxLosingPct: 10,
});

// ─────────── HnR / Destroyer detectors (rank-exclusion based) ───────────

/**
 * Rule detector for the HnR / Destroyer families:
 *  - `caps`: digit → max percent (strict <)
 *  - `noRankDigits`: digits that must NOT hold the green (most) or red (least) bar
 *  - `notBothRankDigits`: green and red may not BOTH sit inside this digit set
 */
function buildRuleDetector(opts: {
  mode: ScannerMode;
  direction: string;
  winningDigits: number[];
  caps: Record<number, number>;
  /** digit → minimum percent (strict >) */
  floors?: Record<number, number>;
  noRankDigits: number[];
  /** digits that must NOT hold the green (most) bar */
  noGreenDigits?: number[];
  notBothRankDigits?: number[];
}): Detector {


  return function detect(symbol, ticks, pip) {
    if (ticks.length < 100) return null;
    const stats = computeDigitStats(ticks, pip);
    const green = stats.find((s) => s.rank === "most");
    const red = stats.find((s) => s.rank === "least");
    const blue = stats.find((s) => s.rank === "second");
    const yellow = stats.find((s) => s.rank === "second-least");
    if (!green || !red || !blue || !yellow) return null;

    for (const [d, cap] of Object.entries(opts.caps)) {
      const s = stats.find((x) => x.digit === Number(d));
      if (!s || s.percent >= cap) return null;
    }

    if (opts.floors) {
      for (const [d, floor] of Object.entries(opts.floors)) {
        const s = stats.find((x) => x.digit === Number(d));
        if (!s || s.percent <= floor) return null;
      }
    }

    const banned = new Set(opts.noRankDigits);
    if (banned.has(green.digit) || banned.has(red.digit)) return null;

    if (opts.noGreenDigits && opts.noGreenDigits.includes(green.digit)) return null;




    if (opts.notBothRankDigits) {
      const set = new Set(opts.notBothRankDigits);
      if (set.has(green.digit) && set.has(red.digit)) return null;
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

export const detectUnderHnR = buildRuleDetector({
  mode: "under-hnr",
  direction: "UNDER 8",
  winningDigits: range(0, 7),
  caps: { 8: 10, 9: 10 },
  noRankDigits: [8, 9],
});

export const detectOverHnR = buildRuleDetector({
  mode: "over-hnr",
  direction: "OVER 1",
  winningDigits: range(2, 9),
  caps: { 0: 10, 1: 10 },
  noRankDigits: [0, 1],
  notBothRankDigits: [5, 6],
});

// Destroyers: the losing block is suppressed below 10.3% and may hold neither
// the Green nor the Red bar.
export const detectUnderDestroyer = buildRuleDetector({
  mode: "under-destroyer",
  direction: "UNDER 6",
  winningDigits: range(0, 5),
  caps: { 6: 10.3, 7: 10.3, 8: 10.3, 9: 10.3 },
  noRankDigits: [6, 7, 8, 9],
});

export const detectOverDestroyer = buildRuleDetector({
  mode: "over-destroyer",
  direction: "OVER 3",
  winningDigits: range(4, 9),
  caps: { 0: 10.3, 1: 10.3, 2: 10.3, 3: 10.3 },
  noRankDigits: [0, 1, 2, 3],
});

// Pro Bot: losing digits below 10.3% with no Green/Red bar on them.
export const detectOver2Pro = buildRuleDetector({
  mode: "over-2-pro",
  direction: "OVER 2",
  winningDigits: range(3, 9),
  caps: { 0: 10.3, 1: 10.3, 2: 10.3 },
  noRankDigits: [0, 1, 2],
});

export const detectUnder7Pro = buildRuleDetector({
  mode: "under-7-pro",
  direction: "UNDER 7",
  winningDigits: range(0, 6),
  caps: { 7: 10.3, 8: 10.3, 9: 10.3 },
  noRankDigits: [7, 8, 9],
});

// Market Killer: losing digits below 10% with no Green bar on them.
export const detectOverKiller = buildRuleDetector({
  mode: "over-killer",
  direction: "OVER 2",
  winningDigits: range(3, 9),
  caps: { 0: 10, 1: 10, 2: 10 },
  noRankDigits: [],
  noGreenDigits: [0, 1, 2],
});

export const detectUnderKiller = buildRuleDetector({
  mode: "under-killer",
  direction: "UNDER 7",
  winningDigits: range(0, 6),
  caps: { 7: 10, 8: 10, 9: 10 },
  noRankDigits: [],
  noGreenDigits: [7, 8, 9],
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
    label: "Under 9 · Basic",
    sub: "Green & Blue 0–7 · 9 below 10%",
    detect: detectUnder9,
    hasStrategies: false,
  },
  "under-9-c4": {
    mode: "under-9-c4",
    label: "Under 9 · Auto C4",
    sub: "Green & Blue 0–4 · 9 below 10%",
    detect: detectUnder9C4,
    hasStrategies: false,
  },
  "over-1": {
    mode: "over-1",
    label: "Over 1",
    sub: "Green & Blue 3–9 · 0 & 1 below 10%",
    detect: detectOver1,
    hasStrategies: false,
  },
  "over-2": {
    mode: "over-2",
    label: "Over 2",
    sub: "Green & Blue 5–9 · 0, 1 & 2 below 10%",
    detect: detectOver2,
    hasStrategies: false,
  },
  "over-3": {
    mode: "over-3",
    label: "Over 3",
    sub: "Green & Blue 5–9 · 0–3 below 10%",
    detect: detectOver3,
    hasStrategies: false,
  },
  "under-hnr": {
    mode: "under-hnr",
    label: "Under HnR",
    sub: "8 & 9 below 10% · no Green/Red on 8 or 9",
    detect: detectUnderHnR,
    hasStrategies: false,
  },
  "over-hnr": {
    mode: "over-hnr",
    label: "Over HnR",
    sub: "0 & 1 below 10% (no G/R) · G+R not both on 5/6",
    detect: detectOverHnR,
    hasStrategies: false,
  },
  "under-destroyer": {
    mode: "under-destroyer",
    label: "Under Destroyer",
    sub: "6–9 below 10.3% · no Green/Red on 6–9",
    detect: detectUnderDestroyer,
    hasStrategies: false,
  },
  "over-destroyer": {
    mode: "over-destroyer",
    label: "Over Destroyer",
    sub: "0–3 below 10.3% · no Green/Red on 0–3",
    detect: detectOverDestroyer,
    hasStrategies: false,
  },
  "over-2-pro": {
    mode: "over-2-pro",
    label: "Over 2 Pro Bot",
    sub: "0, 1 & 2 below 10.3% · no Green/Red on them",
    detect: detectOver2Pro,
    hasStrategies: false,
  },
  "under-7-pro": {
    mode: "under-7-pro",
    label: "Under 7 Pro Bot",
    sub: "7, 8 & 9 below 10.3% · no Green/Red on them",
    detect: detectUnder7Pro,
    hasStrategies: false,
  },
  "over-killer": {
    mode: "over-killer",
    label: "Over Market Killer",
    sub: "0, 1 & 2 below 10% · no Green bar on them",
    detect: detectOverKiller,
    hasStrategies: false,
  },
  "under-killer": {
    mode: "under-killer",
    label: "Under Market Killer",
    sub: "7, 8 & 9 below 10% · no Green bar on them",
    detect: detectUnderKiller,
    hasStrategies: false,
  },
};


export const SCANNER_MODES: ScannerMode[] = [
  "even-odd",
  "under-8",
  "under-7",
  "under-9",
  "under-9-c4",
  "over-1",
  "over-2",
  "over-3",
  "under-hnr",
  "over-hnr",
  "under-destroyer",
  "over-destroyer",
  "over-2-pro",
  "under-7-pro",
  "over-killer",
  "under-killer",
];



export type TrackedSignal = EvenOddSignal & {
  firstSeen: number;
  lastSeen: number;
  heldMs: number;
  persistent: boolean;
};

export const PERSIST_MS = 5000;
