import type { Tick } from "./useDerivTicks";

export type DigitStat = {
  digit: number;
  count: number;
  percent: number;
  rank: "most" | "second" | "second-least" | "least" | "mid";
};

export function lastDigit(quote: number, pip: number): number {
  // Use the pip count to grab the last decimal digit reliably
  const fixed = quote.toFixed(pip);
  return Number(fixed[fixed.length - 1]);
}

export function computeDigitStats(ticks: Tick[], pip: number): DigitStat[] {
  const counts = new Array(10).fill(0) as number[];
  for (const t of ticks) {
    counts[lastDigit(t.quote, pip)]++;
  }
  const total = ticks.length || 1;
  const base = counts.map((c, d) => ({
    digit: d,
    count: c,
    percent: (c / total) * 100,
  }));

  // Determine ranks based on count
  const sortedDesc = [...base].sort((a, b) => b.count - a.count);
  const mostDigit = sortedDesc[0]?.digit;
  const secondDigit = sortedDesc[1]?.digit;
  const leastDigit = sortedDesc[sortedDesc.length - 1]?.digit;
  const secondLeastDigit = sortedDesc[sortedDesc.length - 2]?.digit;

  return base.map((b) => {
    let rank: DigitStat["rank"] = "mid";
    if (b.digit === mostDigit) rank = "most";
    else if (b.digit === secondDigit) rank = "second";
    else if (b.digit === leastDigit) rank = "least";
    else if (b.digit === secondLeastDigit) rank = "second-least";
    return { ...b, rank };
  });
}

export type TradeSignal = {
  direction: "OVER" | "UNDER" | "NEUTRAL";
  barrier: number; // for over/under (the digit barrier 0-9)
  confidence: number; // 0-100
  reason: string;
  evenOdd: { even: number; odd: number; pick: "EVEN" | "ODD" | "NEUTRAL" };
  riseFall: { rise: number; fall: number; pick: "RISE" | "FALL" | "NEUTRAL" };
};

export function computeTradeSignal(
  stats: DigitStat[],
  ticks: Tick[],
): TradeSignal {
  // Over/Under: pick a barrier b that maximizes the larger side's %
  let best = { barrier: 4, side: "OVER" as "OVER" | "UNDER", pct: 0 };
  for (let b = 0; b <= 8; b++) {
    const overPct = stats.filter((s) => s.digit > b).reduce((a, s) => a + s.percent, 0);
    const underPct = stats.filter((s) => s.digit < b).reduce((a, s) => a + s.percent, 0);
    if (overPct > best.pct) best = { barrier: b, side: "OVER", pct: overPct };
    if (underPct > best.pct) best = { barrier: b, side: "UNDER", pct: underPct };
  }

  // Even / Odd
  const evenPct = stats.filter((s) => s.digit % 2 === 0).reduce((a, s) => a + s.percent, 0);
  const oddPct = 100 - evenPct;
  const evenOdd = {
    even: evenPct,
    odd: oddPct,
    pick:
      Math.abs(evenPct - 50) < 1.5
        ? ("NEUTRAL" as const)
        : evenPct > oddPct
        ? ("EVEN" as const)
        : ("ODD" as const),
  };

  // Rise / Fall over the last N ticks
  let rises = 0;
  let falls = 0;
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i].quote > ticks[i - 1].quote) rises++;
    else if (ticks[i].quote < ticks[i - 1].quote) falls++;
  }
  const rfTotal = rises + falls || 1;
  const risePct = (rises / rfTotal) * 100;
  const fallPct = (falls / rfTotal) * 100;
  const riseFall = {
    rise: risePct,
    fall: fallPct,
    pick:
      Math.abs(risePct - 50) < 1.5
        ? ("NEUTRAL" as const)
        : risePct > fallPct
        ? ("RISE" as const)
        : ("FALL" as const),
  };

  const confidence = Math.min(100, Math.max(0, best.pct));
  const direction: TradeSignal["direction"] =
    confidence < 55 ? "NEUTRAL" : best.side;

  return {
    direction,
    barrier: best.barrier,
    confidence,
    reason:
      direction === "NEUTRAL"
        ? "Distribution close to uniform — no clear edge."
        : `${best.side} ${best.barrier} has appeared ${best.pct.toFixed(
            1,
          )}% of the last ${ticks.length} ticks.`,
    evenOdd,
    riseFall,
  };
}
