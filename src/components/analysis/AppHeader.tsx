import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function AppHeader({ live }: { live?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/", label: "Analyzer" },
    { to: "/scanner", label: "Scanner" },
    { to: "/bots", label: "Bots" },
  ] as const;
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground shadow-[var(--shadow-glow)]">
            DP
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="font-mono text-base font-bold tracking-wide">
              Digit Pulse
            </h1>
            {live && (
              <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--rank-most)]" />
                Live
              </span>
            )}
          </div>
        </div>
        <nav className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {tabs.map((t) => {
            const active = path === t.to || (t.to === "/bots" && path.startsWith("/bots"));
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors sm:text-sm",
                  active
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
