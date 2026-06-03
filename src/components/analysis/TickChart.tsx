import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import type { Tick } from "@/lib/deriv/useDerivTicks";

export function TickChart({ ticks, pip }: { ticks: Tick[]; pip: number }) {
  const data = ticks.slice(-150).map((t, i) => ({ i, quote: t.quote }));
  const last = data[data.length - 1]?.quote ?? 0;

  return (
    <div className="relative h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 56, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis
            domain={["dataMin - 0.5", "dataMax + 0.5"]}
            orientation="right"
            width={56}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v.toFixed(pip)}
          />
          <Area
            type="monotone"
            dataKey="quote"
            stroke="var(--chart-line)"
            strokeWidth={1.5}
            fill="url(#chartFill)"
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      {last > 0 && (
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-primary px-2 py-1 font-mono text-xs font-semibold text-primary-foreground shadow-[var(--shadow-glow)]">
          {last.toFixed(pip)}
        </div>
      )}
    </div>
  );
}
