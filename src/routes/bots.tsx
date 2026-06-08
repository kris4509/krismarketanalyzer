import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/analysis/AppHeader";
import { listBots, getDownloadUrl } from "@/lib/bots.functions";
import { initiateMpesaPayment, getPurchaseStatus } from "@/lib/mpesa.functions";

export const Route = createFileRoute("/bots")({
  head: () => ({ meta: [{ title: "Bots Marketplace — Digit Pulse" }] }),
  component: BotsPage,
});

type Bot = {
  id: string; name: string; description: string | null;
  price_kes: number; thumbnail_url: string | null; active: boolean; created_at: string;
};

const LS_KEY = "dp.purchases.v1";
type LocalPurchase = { bot_id: string; purchase_id: string; status: string };

function loadLocal(): LocalPurchase[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveLocal(p: LocalPurchase[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(p));
}
function upsertLocal(item: LocalPurchase) {
  const all = loadLocal().filter((x) => x.purchase_id !== item.purchase_id);
  all.unshift(item);
  saveLocal(all.slice(0, 50));
}

function BotsPage() {
  const listFn = useServerFn(listBots);
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => listFn() });
  const [local, setLocal] = useState<LocalPurchase[]>([]);
  useEffect(() => { setLocal(loadLocal()); }, []);

  const paidByBot = new Map(local.filter((p) => p.status === "paid").map((p) => [p.bot_id, p.purchase_id]));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-xl font-bold tracking-wide">Bots Marketplace</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pay with M-Pesa and download instantly. No account required.
            </p>
          </div>
          <Link to="/auth" className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
            Admin
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bots.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {bots.data?.bots.map((b: Bot) => (
            <BotCard
              key={b.id}
              bot={b}
              paidPurchaseId={paidByBot.get(b.id) ?? null}
              onLocalChange={() => setLocal(loadLocal())}
            />
          ))}
          {bots.data && bots.data.bots.length === 0 && (
            <div className="col-span-full rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No bots available yet.
            </div>
          )}
        </div>

        {local.length > 0 && (
          <div className="mt-12">
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-muted-foreground">
              My recent purchases (this device)
            </h3>
            <div className="mt-3 overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Purchase ID</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {local.map((p) => (
                    <tr key={p.purchase_id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{p.purchase_id.slice(0, 8)}…</td>
                      <td className="px-3 py-2">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BotCard({
  bot, paidPurchaseId, onLocalChange,
}: { bot: Bot; paidPurchaseId: string | null; onLocalChange: () => void }) {
  const initiate = useServerFn(initiateMpesaPayment);
  const status = useServerFn(getPurchaseStatus);
  const getDl = useServerFn(getDownloadUrl);
  const [showPay, setShowPay] = useState(false);
  const [phone, setPhone] = useState("");
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!purchaseId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await status({ data: { purchase_id: purchaseId } });
        if (cancelled) return;
        setStatusText(r.status);
        upsertLocal({ bot_id: bot.id, purchase_id: purchaseId, status: r.status });
        onLocalChange();
        if (r.status === "paid") {
          setMsg("Payment confirmed. You can now download.");
          setShowPay(false); setPurchaseId(null);
        } else if (r.status === "failed" || r.status === "cancelled") {
          setMsg(r.result_desc || "Payment did not complete");
          setPurchaseId(null);
        }
      } catch { /* ignore */ }
    };
    const id = setInterval(tick, 3000);
    tick();
    return () => { cancelled = true; clearInterval(id); };
  }, [purchaseId, status, onLocalChange, bot.id]);

  async function pay() {
    setBusy(true); setMsg(null);
    try {
      const r = await initiate({ data: { bot_id: bot.id, phone } });
      setPurchaseId(r.purchase_id);
      setStatusText("pending");
      upsertLocal({ bot_id: bot.id, purchase_id: r.purchase_id, status: "pending" });
      onLocalChange();
      setMsg("Check your phone for an M-Pesa prompt and enter your PIN.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not start payment");
    } finally { setBusy(false); }
  }

  async function download() {
    if (!paidPurchaseId) return;
    setBusy(true); setMsg(null);
    try {
      const { url } = await getDl({ data: { purchase_id: paidPurchaseId } });
      window.location.href = url;
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Download failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-mono text-sm font-bold">{bot.name}</h3>
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">KES {bot.price_kes}</span>
      </div>
      {bot.description && <p className="mt-2 text-xs text-muted-foreground line-clamp-3">{bot.description}</p>}

      <div className="mt-4 flex-1" />

      {paidPurchaseId ? (
        <button onClick={download} disabled={busy}
          className="rounded-md bg-[var(--rank-most)] px-3 py-2 text-xs font-medium text-background disabled:opacity-50">
          {busy ? "Preparing…" : "Download"}
        </button>
      ) : !showPay ? (
        <button onClick={() => setShowPay(true)}
          className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
          Buy with M-Pesa
        </button>
      ) : (
        <div className="space-y-2">
          <input
            placeholder="07XX XXX XXX or 2547XXXXXXXX"
            value={phone} onChange={(e) => setPhone(e.target.value)}
            disabled={!!purchaseId}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
          />
          <div className="flex gap-2">
            <button onClick={pay} disabled={busy || !!purchaseId || phone.length < 9}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50">
              {purchaseId ? `Status: ${statusText}…` : busy ? "Sending…" : "Pay now"}
            </button>
            <button onClick={() => { setShowPay(false); setPurchaseId(null); setMsg(null); }}
              className="rounded-md border border-border px-3 py-2 text-xs">Cancel</button>
          </div>
        </div>
      )}

      {msg && <div className="mt-2 text-[11px] text-muted-foreground">{msg}</div>}
    </div>
  );
}
