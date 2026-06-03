import type { TradeSignal } from "@/lib/deriv/analysis";
import { cn } from "@/lib/utils";

export function SignalPanel({ signal }: { signal: TradeSignal }) {
  const tone =
    signal.direction === "OVER"
      ? "text-[var(--rank-most)] border-[var(--rank-most)]"
      : signal.direction === "UNDER"
      ? "text-[var(--rank-least)] border-[var(--rank-least)]"
      : "text-muted-foreground border-border";

  return (
    <div className="space-y-4">
      <div className={cn("rounded-lg border-2 bg-card p-4", tone)}>
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Suggested trade
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {signal.confidence.toFixed(1)}% conf
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-bold">
            {signal.direction === "NEUTRAL" ? "WAIT" : signal.direction}
          </span>
          {signal.direction !== "NEUTRAL" && (
            <span className="font-mono text-2xl text-muted-foreground">
              {signal.barrier}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{signal.reason}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatBar
          label="Even / Odd"
          left={{ name: "Even", pct: signal.evenOdd.even }}
          right={{ name: "Odd", pct: signal.evenOdd.odd }}
          pick={signal.evenOdd.pick}
        />
        <StatBar
          label="Rise / Fall"
          left={{ name: "Rise", pct: signal.riseFall.rise }}
          right={{ name: "Fall", pct: signal.riseFall.fall }}
          pick={signal.riseFall.pick === "RISE" ? "EVEN" : signal.riseFall.pick === "FALL" ? "ODD" : "NEUTRAL"}
        />
      </div>
    </div>
  );
}

function StatBar({
  label,
  left,
  right,
  pick,
}: {
  label: string;
  left: { name: string; pct: number };
  right: { name: string; pct: number };
  pick: "EVEN" | "ODD" | "NEUTRAL";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 flex items-baseline justify-between font-mono text-sm">
        <span className={pick === "EVEN" ? "text-[var(--rank-most)] font-semibold" : ""}>
          {left.name} {left.pct.toFixed(1)}%
        </span>
        <span className={pick === "ODD" ? "text-[var(--rank-most)] font-semibold" : ""}>
          {right.pct.toFixed(1)}% {right.name}
        </span>
      </div>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="bg-[var(--rank-most)]"
          style={{ width: `${left.pct}%` }}
        />
        <div
          className="bg-[var(--rank-second)]"
          style={{ width: `${right.pct}%` }}
        />
      </div>
    </div>
  );
}
