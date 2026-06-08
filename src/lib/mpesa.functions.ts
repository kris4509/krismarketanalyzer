import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
  if (digits.startsWith("7") && digits.length === 9) return "254" + digits;
  return digits;
}

async function getMpesaToken(env: string, key: string, secret: string): Promise<string> {
  const base = env === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Mpesa auth failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export const initiateMpesaPayment = createServerFn({ method: "POST" })
  .inputValidator((d: { bot_id: string; phone: string }) =>
    z.object({
      bot_id: z.string().uuid(),
      phone: z.string().min(9).max(15),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: bot, error: bErr } = await supabaseAdmin
      .from("bots").select("id,price_kes,name,active").eq("id", data.bot_id).single();
    if (bErr || !bot || !bot.active) throw new Error("Bot unavailable");

    const phone = normalizePhone(data.phone);
    if (!/^2547\d{8}$/.test(phone)) throw new Error("Enter a valid Safaricom phone number");

    const env = process.env.MPESA_ENV || "sandbox";
    const key = process.env.MPESA_CONSUMER_KEY!;
    const secret = process.env.MPESA_CONSUMER_SECRET!;
    const shortcode = process.env.MPESA_SHORTCODE!;
    const passkey = process.env.MPESA_PASSKEY!;

    const token = await getMpesaToken(env, key, secret);
    const ts = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");

    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const host = getRequestHeader("host") || "krismarketanalyzer.lovable.app";
    const proto = host.includes("localhost") ? "http" : "https";
    const callbackUrl = `${proto}://${host}/api/public/mpesa/callback`;

    const amount = Math.max(1, Math.round(Number(bot.price_kes)));
    const base = env === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: `BOT-${bot.id.slice(0, 8)}`,
        TransactionDesc: `Bot: ${bot.name.slice(0, 20)}`,
      }),
    });
    const stk = (await stkRes.json()) as {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResponseCode?: string;
      errorMessage?: string;
      ResponseDescription?: string;
    };
    if (stk.ResponseCode !== "0" || !stk.CheckoutRequestID) {
      throw new Error(stk.errorMessage || stk.ResponseDescription || "Could not start payment");
    }

    const { data: purchase, error: pErr } = await supabaseAdmin
      .from("purchases").insert({
        user_id: null,
        bot_id: bot.id,
        amount,
        phone,
        mpesa_checkout_request_id: stk.CheckoutRequestID,
        mpesa_merchant_request_id: stk.MerchantRequestID,
        status: "pending",
      }).select().single();
    if (pErr) throw new Error(pErr.message);

    return { purchase_id: purchase.id, checkout_request_id: stk.CheckoutRequestID };
  });

export const getPurchaseStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { purchase_id: string }) => z.object({ purchase_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("purchases")
      .select("id,status,result_desc,mpesa_receipt,bot_id")
      .eq("id", data.purchase_id).maybeSingle();
    if (error || !row) throw new Error(error?.message || "Purchase not found");
    return row;
  });
