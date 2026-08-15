import { createServerFn } from "@tanstack/react-start";

/**
 * Free WhatsApp relay via CallMeBot (personal use, no cost).
 * The user pairs their own number once with the CallMeBot number and gets an
 * API key; we simply forward the alert text server-side to avoid CORS.
 */
export const sendWhatsAppAlert = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; apiKey: string; text: string }) => {
    const phone = String(input.phone ?? "").replace(/[^\d+]/g, "");
    const apiKey = String(input.apiKey ?? "").trim();
    const text = String(input.text ?? "").slice(0, 900);
    if (!/^\+?\d{7,15}$/.test(phone)) throw new Error("Invalid phone number");
    if (!/^\d{4,12}$/.test(apiKey)) throw new Error("Invalid CallMeBot API key");
    if (!text) throw new Error("Empty message");
    return { phone, apiKey, text };
  })
  .handler(async ({ data }) => {
    const url =
      `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(data.phone)}` +
      `&text=${encodeURIComponent(data.text)}&apikey=${encodeURIComponent(data.apiKey)}`;
    try {
      const res = await fetch(url, { method: "GET" });
      const body = (await res.text()).slice(0, 400);
      if (!res.ok) {
        console.error(`CallMeBot failed [${res.status}]: ${body}`);
        return { ok: false as const, status: res.status, message: body };
      }
      return { ok: true as const, status: res.status, message: body };
    } catch (err) {
      console.error("CallMeBot request error", err);
      return { ok: false as const, status: 0, message: "Network error" };
    }
  });
