import type { DigitStat } from "@/lib/deriv/analysis";
import { cn } from "@/lib/utils";

const rankClasses: Record<DigitStat["rank"], string> = {
  most: "border-[var(--rank-most)] text-[var(--rank-most)] shadow-[0_0_18px_-2px_var(--rank-most)]",
  second: "border-[var(--rank-second)] text-[var(--rank-second)] shadow-[0_0_14px_-4px_var(--rank-second)]",
  "second-least": "border-[var(--rank-second-least)] text-[var(--rank-second-least)]",
  least: "border-[var(--rank-least)] text-[var(--rank-least)]",
  mid: "border-border text-muted-foreground",
};

const rankPctClasses: Record<DigitStat["rank"], string> = {
  most: "text-[var(--rank-most)]",
  second: "text-[var(--rank-second)]",
  "second-least": "text-[var(--rank-second-least)]",
  least: "text-[var(--rank-least)]",
  mid: "text-muted-foreground",
};

export function DigitCircles({
  stats,
  currentDigit,
}: {
  stats: DigitStat[];
  currentDigit: number | null;
}) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-3 sm:gap-4">
      {stats.map((s) => {
        const active = s.digit === currentDigit;
        return (
          <div key={s.digit} className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "relative flex h-14 w-14 items-center justify-center rounded-full border-2 bg-card font-mono text-2xl font-semibold transition-all sm:h-16 sm:w-16 sm:text-3xl",
                rankClasses[s.rank],
                active && "scale-110 ring-2 ring-foreground/40",
              )}
            >
              {s.digit}
            </div>
            <span className={cn("font-mono text-xs tabular-nums", rankPctClasses[s.rank])}>
              {s.percent.toFixed(1)}%
            </span>
            <div
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-opacity",
                active ? "bg-foreground opacity-100" : "opacity-0",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
