/**
 * Slim promotional banner nudging users toward PrintPesa — a 3rd-party
 * Deriv trading platform that also ships free trading bots.
 */
export function BotPromoBanner() {
  return (
    <a
      href="https://printpesa.netlify.app/"
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-xl border border-[var(--rank-most)]/40 bg-gradient-to-r from-[var(--rank-most)]/10 via-card to-[var(--rank-second)]/10 p-4 transition-shadow hover:shadow-[var(--shadow-glow)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--rank-most)]">
            Trade on the signal
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground sm:text-base">
            Trade &amp; grab free bots at{" "}
            <span className="underline underline-offset-4">
              printpesa.netlify.app
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A 3rd-party Deriv trading platform bundled with every bot you need — free to run alongside these signals.
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-[var(--rank-most)]/60 px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-[var(--rank-most)] transition-colors group-hover:bg-[var(--rank-most)] group-hover:text-background">
          Visit →
        </span>
      </div>
    </a>
  );
}
