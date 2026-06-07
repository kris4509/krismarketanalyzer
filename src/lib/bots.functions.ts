import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listBots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("bots")
      .select("id,name,description,price_kes,thumbnail_url,active,created_at")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { bots: data ?? [] };
  });

export const myPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("purchases")
      .select("id,bot_id,amount,status,created_at,mpesa_receipt,bots(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { purchases: data ?? [] };
  });

export const isAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { admin: !!data };
  });

// One-time claim: if no admin exists, grant admin to caller.
export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) return { ok: false, reason: "Admin already exists" };
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
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
    const { data: bot, error } = await supabaseAdmin
      .from("bots").insert(data).select().single();
    if (error) throw new Error(error.message);
    return { bot };
  });

export const getDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bot_id: string }) => z.object({ bot_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check admin OR a paid purchase exists
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", context.userId).eq("role", "admin").maybeSingle();

    if (!roleRow) {
      const { data: paid } = await supabaseAdmin
        .from("purchases").select("id")
        .eq("user_id", context.userId).eq("bot_id", data.bot_id).eq("status", "paid").limit(1).maybeSingle();
      if (!paid) throw new Error("Payment required");
    }

    const { data: bot, error } = await supabaseAdmin
      .from("bots").select("file_path,name").eq("id", data.bot_id).single();
    if (error || !bot) throw new Error("Bot not found");

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("bots-files").createSignedUrl(bot.file_path, 300, { download: bot.name + ".xml" });
    if (sErr || !signed) throw new Error(sErr?.message || "Could not create download link");
    return { url: signed.signedUrl };
  });

// Get a short-lived upload URL so admin can upload directly from browser
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
