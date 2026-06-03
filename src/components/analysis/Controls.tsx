import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DERIV_SYMBOLS, TICK_COUNT_OPTIONS } from "@/lib/deriv/symbols";
import { cn } from "@/lib/utils";

export function Controls({
  symbol,
  onSymbol,
  count,
  onCount,
  state,
}: {
  symbol: string;
  onSymbol: (s: string) => void;
  count: number;
  onCount: (n: number) => void;
  state: "connecting" | "open" | "closed" | "error";
}) {
  const groups = Array.from(new Set(DERIV_SYMBOLS.map((s) => s.group)));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={symbol} onValueChange={onSymbol}>
        <SelectTrigger className="w-[260px] bg-card font-mono">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groups.map((g) => (
            <SelectGroup key={g}>
              <SelectLabel>{g}</SelectLabel>
              {DERIV_SYMBOLS.filter((s) => s.group === g).map((s) => (
                <SelectItem key={s.code} value={s.code} className="font-mono">
                  {s.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      <div className="flex overflow-hidden rounded-md border border-border bg-card">
        {TICK_COUNT_OPTIONS.map((n) => (
          <button
            key={n}
            onClick={() => onCount(n)}
            className={cn(
              "px-3 py-2 font-mono text-xs transition-colors",
              n === count
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2 font-mono text-xs">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            state === "open" && "bg-[var(--rank-most)] shadow-[0_0_8px_var(--rank-most)]",
            state === "connecting" && "bg-[var(--rank-second-least)] animate-pulse",
            (state === "error" || state === "closed") && "bg-[var(--rank-least)]",
          )}
        />
        <span className="uppercase tracking-widest text-muted-foreground">
          {state === "open" ? "Live" : state}
        </span>
      </div>
    </div>
  );
}
