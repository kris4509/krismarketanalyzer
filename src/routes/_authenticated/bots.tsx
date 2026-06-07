import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/analysis/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import {
  listBots, myPurchases, isAdmin, claimAdmin,
  createBot, getDownloadUrl, getAdminUploadUrl,
} from "@/lib/bots.functions";
import { initiateMpesaPayment, getPurchaseStatus } from "@/lib/mpesa.functions";

export const Route = createFileRoute("/_authenticated/bots")({
  head: () => ({ meta: [{ title: "Bots Marketplace — Digit Pulse" }] }),
  component: BotsPage,
});

type Bot = {
  id: string; name: string; description: string | null;
  price_kes: number; thumbnail_url: string | null; active: boolean; created_at: string;
};

function BotsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listBots);
  const adminFn = useServerFn(isAdmin);
  const purchasesFn = useServerFn(myPurchases);

  const bots = useQuery({ queryKey: ["bots"], queryFn: () => listFn() });
  const admin = useQuery({ queryKey: ["isAdmin"], queryFn: () => adminFn() });
  const purchases = useQuery({ queryKey: ["myPurchases"], queryFn: () => purchasesFn() });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  const paidBotIds = new Set(
    (purchases.data?.purchases ?? []).filter((p: any) => p.status === "paid").map((p: any) => p.bot_id),
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-xl font-bold tracking-wide">Bots Marketplace</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pay with M-Pesa and download instantly.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {admin.data?.admin && <span className="rounded-md border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--rank-most)]">Admin</span>}
            <button onClick={signOut} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">Sign out</button>
          </div>
        </div>

        {admin.data && !admin.data.admin && (
          <ClaimAdminBanner onClaimed={() => admin.refetch()} />
        )}

        {admin.data?.admin && <AdminUpload onCreated={() => bots.refetch()} />}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bots.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {bots.data?.bots.map((b: Bot) => (
            <BotCard key={b.id} bot={b} owned={paidBotIds.has(b.id)} onChange={() => purchases.refetch()} />
          ))}
          {bots.data && bots.data.bots.length === 0 && (
            <div className="col-span-full rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No bots available yet.
            </div>
          )}
        </div>

        <div className="mt-12">
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-muted-foreground">My Purchases</h3>
          <div className="mt-3 overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Bot</th>
                  <th className="px-3 py-2 text-left">Amount</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {(purchases.data?.purchases ?? []).map((p: any) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2">{p.bots?.name ?? p.bot_id.slice(0, 8)}</td>
                    <td className="px-3 py-2">KES {p.amount}</td>
                    <td className="px-3 py-2">
                      <span className={
                        p.status === "paid" ? "text-[var(--rank-most)]" :
                        p.status === "pending" ? "text-muted-foreground" : "text-[var(--rank-second)]"
                      }>{p.status}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{p.mpesa_receipt ?? "—"}</td>
                  </tr>
                ))}
                {(!purchases.data || purchases.data.purchases.length === 0) && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No purchases yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaimAdminBanner({ onClaimed }: { onClaimed: () => void }) {
  const claim = useServerFn(claimAdmin);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <div className="mt-4 flex items-center justify-between rounded-md border border-dashed border-border bg-card px-3 py-2 text-xs">
      <span className="text-muted-foreground">First time here? If no admin exists yet, claim this workspace.</span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await claim();
            if (r.ok) onClaimed();
            else setShown(false);
          } finally { setBusy(false); }
        }}
        className="rounded-md border border-border px-2 py-1 hover:bg-accent disabled:opacity-50"
      >Claim admin</button>
    </div>
  );
}

function AdminUpload({ onCreated }: { onCreated: () => void }) {
  const getUrl = useServerFn(getAdminUploadUrl);
  const create = useServerFn(createBot);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState(500);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { path, token } = await getUrl({ data: { filename: safe } });
      const { error: upErr } = await supabase.storage
        .from("bots-files").uploadToSignedUrl(path, token, file);
      if (upErr) throw upErr;
      await create({ data: { name, description: desc, price_kes: Number(price), file_path: path } });
      setName(""); setDesc(""); setPrice(500); setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setMsg("Bot added.");
      onCreated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed");
    } finally { setBusy(false); }
  }

  return (
    <details className="mt-6 rounded-md border border-border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">+ Upload a new bot</summary>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input required placeholder="Bot name" value={name} onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input required type="number" min={0} step={1} placeholder="Price (KES)" value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <textarea placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)}
          className="sm:col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm" rows={2} />
        <input required ref={inputRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="sm:col-span-2 text-sm" />
        <button disabled={busy} className="sm:col-span-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "Uploading…" : "Add bot"}
        </button>
        {msg && <div className="sm:col-span-2 text-xs text-muted-foreground">{msg}</div>}
      </form>
    </details>
  );
}

function BotCard({ bot, owned, onChange }: { bot: Bot; owned: boolean; onChange: () => void }) {
  const initiate = useServerFn(initiateMpesaPayment);
  const status = useServerFn(getPurchaseStatus);
  const getDl = useServerFn(getDownloadUrl);
  const [showPay, setShowPay] = useState(false);
  const [phone, setPhone] = useState("");
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Poll for payment status
  useEffect(() => {
    if (!purchaseId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await status({ data: { purchase_id: purchaseId } });
        if (cancelled) return;
        setStatusText(r.status);
        if (r.status === "paid") {
          setMsg("Payment confirmed. You can now download.");
          setShowPay(false); setPurchaseId(null); onChange();
        } else if (r.status === "failed" || r.status === "cancelled") {
          setMsg(r.result_desc || "Payment did not complete");
          setPurchaseId(null);
        }
      } catch { /* ignore */ }
    };
    const id = setInterval(tick, 3000);
    tick();
    return () => { cancelled = true; clearInterval(id); };
  }, [purchaseId, status, onChange]);

  async function pay() {
    setBusy(true); setMsg(null);
    try {
      const r = await initiate({ data: { bot_id: bot.id, phone } });
      setPurchaseId(r.purchase_id);
      setStatusText("pending");
      setMsg("Check your phone for an M-Pesa prompt and enter your PIN.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not start payment");
    } finally { setBusy(false); }
  }

  async function download() {
    setBusy(true); setMsg(null);
    try {
      const { url } = await getDl({ data: { bot_id: bot.id } });
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

      {owned ? (
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
