import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { SCANNERS, type ScannerMode } from "@/lib/deriv/scanner";
import { sendWhatsAppAlert } from "@/lib/whatsapp.functions";

export type WhatsAppConfig = {
  enabled: boolean;
  phone: string;
  apiKey: string;
  /** Scanner modes the user opted into. Empty = none. */
  modes: ScannerMode[];
  /** Minutes to wait before re-alerting the same market+direction. */
  cooldownMin: number;
};

const STORAGE_KEY = "digitpulse.whatsapp.v1";

const DEFAULT_CONFIG: WhatsAppConfig = {
  enabled: false,
  phone: "",
  apiKey: "",
  modes: [],
  cooldownMin: 10,
};

export function useWhatsAppConfig() {
  const [config, setConfig] = useState<WhatsAppConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const update = useCallback((patch: Partial<WhatsAppConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { config, update };
}

export function WhatsAppAlerts({
  availableModes,
  config,
  onChange,
}: {
  availableModes: ScannerMode[];
  config: WhatsAppConfig;
  onChange: (patch: Partial<WhatsAppConfig>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const send = useServerFn(sendWhatsAppAlert);

  const ready =
    config.phone.trim().length > 6 && config.apiKey.trim().length >= 4;
  const active = config.enabled && ready && config.modes.length > 0;

  const toggleMode = (m: ScannerMode) => {
    const has = config.modes.includes(m);
    onChange({
      modes: has ? config.modes.filter((x) => x !== m) : [...config.modes, m],
    });
  };

  const sendTest = async () => {
    setSending(true);
    setStatus(null);
    try {
      const res = await send({
        data: {
          phone: config.phone,
          apiKey: config.apiKey,
          text: "✅ Digit Pulse test alert — WhatsApp signal alerts are working.",
        },
      });
      setStatus(res.ok ? "Test message sent — check WhatsApp." : `Failed: ${res.message}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card/50">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-xs"
      >
        <span className="font-mono uppercase tracking-[0.18em] text-muted-foreground">
          WhatsApp alerts
        </span>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 font-mono",
            active
              ? "border-[var(--rank-most)] text-[var(--rank-most)]"
              : "border-border text-muted-foreground",
          )}
        >
          {active ? `ON · ${config.modes.length} strategies` : "OFF"}
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {open ? "Hide setup ▲" : "Setup ▼"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          <ol className="space-y-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <li>
              1. Save <span className="text-foreground">+34 644 51 95 23</span> as a
              WhatsApp contact (CallMeBot).
            </li>
            <li>
              2. Send it this message:{" "}
              <span className="text-foreground">I allow callmebot to send me messages</span>
            </li>
            <li>3. It replies with your personal API key — paste it below. Free, no billing.</li>
          </ol>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                WhatsApp number (with country code)
              </span>
              <input
                value={config.phone}
                onChange={(e) => onChange({ phone: e.target.value })}
                placeholder="+2547XXXXXXXX"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-[var(--rank-most)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                CallMeBot API key
              </span>
              <input
                value={config.apiKey}
                onChange={(e) => onChange({ apiKey: e.target.value })}
                placeholder="123456"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-[var(--rank-most)]"
              />
            </label>
          </div>

          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Alert me on these strategies (locked signals only)
            </div>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {availableModes.map((m) => {
                const on = config.modes.includes(m);
                return (
                  <button
                    key={m}
                    onClick={() => toggleMode(m)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-left font-mono text-[11px] transition-colors",
                      on
                        ? "border-[var(--rank-most)] bg-[var(--rank-most)]/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="mr-1">{on ? "☑" : "☐"}</span>
                    {SCANNERS[m].label}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex gap-2">
              <button
                onClick={() => onChange({ modes: [...availableModes] })}
                className="rounded-md border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                Select all
              </button>
              <button
                onClick={() => onChange({ modes: [] })}
                className="rounded-md border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between font-mono text-[11px]">
              <span className="uppercase tracking-[0.18em] text-muted-foreground">
                Repeat cooldown per market
              </span>
              <span className="tabular-nums text-foreground">{config.cooldownMin} min</span>
            </div>
            <input
              type="range"
              min={1}
              max={60}
              step={1}
              value={config.cooldownMin}
              onChange={(e) => onChange({ cooldownMin: Number(e.target.value) })}
              className="w-full accent-[var(--rank-second)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onChange({ enabled: !config.enabled })}
              disabled={!ready}
              className={cn(
                "rounded-md border px-3 py-1.5 font-mono text-xs disabled:opacity-40",
                config.enabled
                  ? "border-[var(--rank-most)] text-[var(--rank-most)]"
                  : "border-border text-muted-foreground",
              )}
            >
              {config.enabled ? "Alerts enabled" : "Enable alerts"}
            </button>
            <button
              onClick={sendTest}
              disabled={!ready || sending}
              className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-foreground hover:border-[var(--rank-second)] disabled:opacity-40"
            >
              {sending ? "Sending…" : "Send test message"}
            </button>
            {status && (
              <span className="font-mono text-[11px] text-muted-foreground">{status}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
