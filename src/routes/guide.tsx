import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/analysis/AppHeader";
import { BotPromoBanner } from "@/components/analysis/BotPromoBanner";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "Signal Guide — How to Trade Digit Pulse Signals" },
      {
        name: "description",
        content:
          "Entry rules and bot recommendations for every Digit Pulse strategy: Rank Alignment, Even, Odd, Under 8/7, Over 1/2/3.",
      },
    ],
  }),
  component: GuidePage,
});

type Strategy = {
  id: string;
  title: string;
  scanner: string;
  entry: string[];
  bot: string;
  note?: string;
};

const STRATS: Strategy[] = [
  {
    id: "rank",
    title: "Even / Odd — Rank Alignment",
    scanner: "Scanner → Even/Odd → Rank Alignment",
    entry: [
      "Wait for a valid EVEN or ODD signal to appear on the scanner.",
      "On the bot, wait until a RED or YELLOW digit (the two least-appearing) shows on the tick pointer.",
      "Press RUN on the bot immediately to enter the trade in the signal's direction.",
    ],
    bot: "Even/Odd Analyzer Pro (or any Even/Odd auto-trader)",
  },
  {
    id: "even",
    title: "Even Strategy (strict)",
    scanner: "Scanner → Even/Odd → Even Strategy",
    entry: [
      "Wait for a valid EVEN signal on the scanner.",
      "Wait for the tick pointer to land on the ODD digit among the least-appearing pair (RED & YELLOW).",
      "If within the next 3 TICKS an EVEN digit is picked, ENTER IMMEDIATELY.",
    ],
    bot: "Even-market auto bot",
    note: "After 3 to 7 winning runs, stop the bot, re-confirm market conditions, and wait for a fresh trigger.",
  },
  {
    id: "odd",
    title: "Odd Strategy (strict)",
    scanner: "Scanner → Even/Odd → Odd Strategy",
    entry: [
      "Wait for a valid ODD signal on the scanner.",
      "Wait for the tick pointer to land on the least-appearing digit among RED & YELLOW.",
      "Then wait for 2 CONSECUTIVE odd digits within the next 5 ticks — enter immediately.",
    ],
    bot: "Odd-market auto bot",
    note: "After 3 to 7 winning runs, stop the bot, re-confirm market conditions, and wait for a fresh trigger.",
  },
  {
    id: "under-8",
    title: "Under 8",
    scanner: "Scanner → Under 8",
    entry: [
      "Wait for a valid Under 8 signal.",
      "Load the Under 8 AI bot and let it wait for its own entry trigger.",
    ],
    bot: "AI-powered Under 8 bot",
  },
  {
    id: "under-7",
    title: "Under 7",
    scanner: "Scanner → Under 7",
    entry: [
      "Wait for a valid Under 7 signal.",
      "Run the AI Over/Under bot configured for Under 7.",
    ],
    bot: "AI-powered Over/Under bot",
  },
  {
    id: "under-9",
    title: "Under 9",
    scanner: "Scanner → Under 9",
    entry: [
      "Wait for a valid Under 9 signal (9 below 10%, green in 0–7).",
      "Run the Under 9 AI bot and let it wait for its own entry trigger.",
    ],
    bot: "AI-powered Under 9 bot",
  },
  {
    id: "over-1",
    title: "Over 1",
    scanner: "Scanner → Over 1",
    entry: [
      "Wait for a valid Over 1 signal (0 & 1 below 10%, green ≥ 4).",
      "Run the Over 1 AI bot — it will wait for its own entry point.",
    ],
    bot: "AI-powered Over 1 bot",
  },
  {
    id: "over-2",
    title: "Over 2",
    scanner: "Scanner → Over 2",
    entry: [
      "Wait for a valid Over 2 signal.",
      "Run the AI Over 2 bot immediately when the signal is detected.",
    ],
    bot: "AI-powered Over 2 bot",
  },
  {
    id: "over-3",
    title: "Over 3",
    scanner: "Scanner → Over 3",
    entry: [
      "Wait for a valid Over 3 signal.",
      "Cross-check on the Analyzer / Stats page that digits 0, 1, 3 are each below 10% over the last 1000 ticks.",
      "Run the Over 3 AI bot to trade.",
    ],
    bot: "AI-powered Over 3 bot",
  },
];

function GuidePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader live />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <header className="space-y-1">
          <h2 className="font-mono text-2xl font-bold sm:text-3xl">
            How to Trade Digit Pulse Signals
          </h2>
          <p className="text-sm text-muted-foreground">
            Every strategy on this site is designed to be traded with a
            matching bot. Use the entry rules below and grab the bots from{" "}
            <a
              href="https://botmarket-ke.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--rank-most)] underline underline-offset-4"
            >
              botmarket-ke.vercel.app
            </a>
            .
          </p>
        </header>

        <BotPromoBanner />

        <section className="grid gap-4 md:grid-cols-2">
          {STRATS.map((s) => (
            <article
              key={s.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <h3 className="font-mono text-base font-bold">{s.title}</h3>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {s.scanner}
              </div>

              <div className="mt-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Entry point
                </div>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-foreground/90">
                  {s.entry.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ol>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Recommended bot
                </span>
                <span className="font-mono text-xs font-semibold text-[var(--rank-most)]">
                  {s.bot}
                </span>
              </div>

              {s.note && (
                <p className="mt-2 rounded-md border border-[var(--rank-second)]/40 bg-[var(--rank-second)]/5 p-2 font-mono text-[11px] text-muted-foreground">
                  NB: {s.note}
                </p>
              )}
            </article>
          ))}
        </section>

        <p className="pb-4 text-center text-[11px] text-muted-foreground">
          Educational content only. Trade responsibly — signals show statistical
          bias, not certainty.
        </p>
      </main>
    </div>
  );
}
