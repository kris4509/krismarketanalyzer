import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

type Tab = {
  to: "/" | "/scanner" | "/stats" | "/guide";
  label: string;
  search?: { variant?: "even-odd" | "over-under" };
};

export function AppHeader({ live }: { live?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as {
    variant?: "even-odd" | "over-under";
  };
  const currentVariant = search?.variant ?? "even-odd";

  const tabs: Tab[] = [
    { to: "/", label: "Analyzer" },
    { to: "/scanner", label: "E/O Scanner", search: { variant: "even-odd" } },
    { to: "/scanner", label: "O/U Scanner", search: { variant: "over-under" } },
    { to: "/stats", label: "Stats" },
    { to: "/guide", label: "Guide" },
  ];
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
        <nav className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
          {tabs.map((t) => {
            const pathMatch = path === t.to;
            const active = t.to === "/scanner"
              ? pathMatch && (t.search?.variant ?? "even-odd") === currentVariant
              : pathMatch;
            return (
              <Link
                key={`${t.to}:${t.search?.variant ?? ""}`}
                to={t.to}
                search={t.search as never}
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
