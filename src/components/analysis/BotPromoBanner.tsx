/**
 * Slim promotional banner nudging users toward the external bot marketplace
 * that pairs with these signals. Rendered on the Analyzer + Guide pages.
 */
export function BotPromoBanner() {
  return (
    <a
      href="https://botmarket-ke.vercel.app/"
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-xl border border-[var(--rank-most)]/40 bg-gradient-to-r from-[var(--rank-most)]/10 via-card to-[var(--rank-second)]/10 p-4 transition-shadow hover:shadow-[var(--shadow-glow)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--rank-most)]">
            Trade automatically
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground sm:text-base">
            Get the matching trading bots at{" "}
            <span className="underline underline-offset-4">
              botmarket-ke.vercel.app
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Even/Odd · Over · Under bots designed to run the moment a valid signal is triggered.
          </p>
        </div>
        <span className="rounded-md border border-[var(--rank-most)]/60 px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-[var(--rank-most)] transition-colors group-hover:bg-[var(--rank-most)] group-hover:text-background">
          Visit →
        </span>
      </div>
    </a>
  );
}
