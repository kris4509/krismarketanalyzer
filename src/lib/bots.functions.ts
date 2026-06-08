import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ----------------- PUBLIC (no auth) -----------------

export const listBots = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("bots")
    .select("id,name,description,price_kes,thumbnail_url,active,created_at")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return { bots: data ?? [] };
});

// Anonymous download: requires purchase_id (uuid acts as bearer token).
export const getDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((d: { purchase_id: string }) =>
    z.object({ purchase_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p, error } = await supabaseAdmin
      .from("purchases").select("status,bot_id").eq("id", data.purchase_id).maybeSingle();
    if (error || !p) throw new Error("Purchase not found");
    if (p.status !== "paid") throw new Error("Payment not completed");

    const { data: bot, error: bErr } = await supabaseAdmin
      .from("bots").select("file_path,name").eq("id", p.bot_id).single();
    if (bErr || !bot) throw new Error("Bot not found");

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("bots-files").createSignedUrl(bot.file_path, 300, { download: bot.name + ".xml" });
    if (sErr || !signed) throw new Error(sErr?.message || "Could not create download link");
    return { url: signed.signedUrl };
  });

// ----------------- ADMIN (auth + role required) -----------------

export const isAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    return { admin: !!data };
  });

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) return { ok: false, reason: "Admin already exists" };
    const { error } = await supabaseAdmin
      .from("user_roles").insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; description?: string; price_kes: number; file_path: string }) =>
    z.object({
      name: z.string().min(1).max(120),
      description: z.string().max(2000).optional(),
      price_kes: z.number().min(0).max(1_000_000),
      file_path: z.string().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { data: bot, error } = await supabaseAdmin.from("bots").insert(data).select().single();
    if (error) throw new Error(error.message);
    return { bot };
  });

export const deleteBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("bots").update({ active: false }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAdminUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { filename: string }) =>
    z.object({ filename: z.string().min(1).max(200).regex(/^[a-zA-Z0-9._-]+$/) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const path = `uploads/${Date.now()}-${data.filename}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("bots-files").createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message || "Upload URL failed");
    return { path, token: signed.token };
  });

// Admin view of all purchases
export const adminListPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { data, error } = await supabaseAdmin
      .from("purchases")
      .select("id,bot_id,amount,phone,status,mpesa_receipt,created_at,bots(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { purchases: data ?? [] };
  });
