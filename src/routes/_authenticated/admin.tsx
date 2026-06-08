import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AppHeader } from "@/components/analysis/AppHeader";
import { supabase } from "@/integrations/supabase/client";
import {
  isAdmin, claimAdmin, listBots, createBot, getAdminUploadUrl,
  deleteBot, adminListPurchases,
} from "@/lib/bots.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Digit Pulse" }] }),
  component: AdminPage,
});

function AdminPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const adminFn = useServerFn(isAdmin);
  const botsFn = useServerFn(listBots);
  const purchasesFn = useServerFn(adminListPurchases);

  const admin = useQuery({ queryKey: ["isAdmin"], queryFn: () => adminFn() });
  const bots = useQuery({ queryKey: ["bots"], queryFn: () => botsFn() });
  const purchases = useQuery({
    queryKey: ["adminPurchases"], queryFn: () => purchasesFn(),
    enabled: !!admin.data?.admin,
  });

  async function signOut() {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/bots", replace: true });
  }

  if (admin.isLoading) {
    return <div className="min-h-screen bg-background"><AppHeader /><div className="p-8 text-sm text-muted-foreground">Loading…</div></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-mono text-xl font-bold tracking-wide">Admin Dashboard</h2>
            <p className="mt-1 text-sm text-muted-foreground">Manage bots and view purchases.</p>
          </div>
          <button onClick={signOut} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">Sign out</button>
        </div>

        {!admin.data?.admin ? (
          <ClaimAdminBanner onClaimed={() => admin.refetch()} />
        ) : (
          <>
            <AdminUpload onCreated={() => bots.refetch()} />

            <div className="mt-8">
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-muted-foreground">Bots</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bots.data?.bots.map((b) => (
                  <div key={b.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-mono text-sm font-bold">{b.name}</div>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">KES {b.price_kes}</span>
                    </div>
                    {b.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{b.description}</p>}
                    <DeleteBotButton id={b.id} onDeleted={() => bots.refetch()} />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10">
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-muted-foreground">Purchases</h3>
              <div className="mt-3 overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-card text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">When</th>
                      <th className="px-3 py-2 text-left">Bot</th>
                      <th className="px-3 py-2 text-left">Phone</th>
                      <th className="px-3 py-2 text-left">Amount</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(purchases.data?.purchases ?? []).map((p: any) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-3 py-2 text-xs">{new Date(p.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2">{p.bots?.name ?? p.bot_id.slice(0, 8)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.phone}</td>
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
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No purchases yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ClaimAdminBanner({ onClaimed }: { onClaimed: () => void }) {
  const claim = useServerFn(claimAdmin);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mt-6 rounded-md border border-dashed border-border bg-card p-4 text-sm">
      <div className="font-medium">You are signed in but not an admin yet.</div>
      <p className="mt-1 text-xs text-muted-foreground">
        If no admin exists yet, you can claim this workspace. Otherwise contact the existing admin.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true); setMsg(null);
          try {
            const r = await claim();
            if (r.ok) onClaimed();
            else setMsg(r.reason || "Cannot claim");
          } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); }
          finally { setBusy(false); }
        }}
        className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
      >Claim admin</button>
      {msg && <div className="mt-2 text-xs text-muted-foreground">{msg}</div>}
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
    <details open className="mt-6 rounded-md border border-border bg-card p-4">
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

function DeleteBotButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const del = useServerFn(deleteBot);
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        if (!confirm("Hide this bot from the marketplace?")) return;
        setBusy(true);
        try { await del({ data: { id } }); onDeleted(); }
        finally { setBusy(false); }
      }}
      className="mt-3 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
    >Remove</button>
  );
}
