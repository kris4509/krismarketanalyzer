import { createFileRoute } from "@tanstack/react-router";

type CallbackItem = { Name: string; Value?: string | number };

export const Route = createFileRoute("/api/public/mpesa/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        const stk = payload?.Body?.stkCallback;
        if (!stk) {
          // Acknowledge even if shape unexpected
          return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        const checkoutId: string | undefined = stk.CheckoutRequestID;
        const resultCode: number = stk.ResultCode;
        const resultDesc: string = stk.ResultDesc;

        let receipt: string | undefined;
        if (resultCode === 0 && Array.isArray(stk.CallbackMetadata?.Item)) {
          const item = (stk.CallbackMetadata.Item as CallbackItem[]).find(
            (i) => i.Name === "MpesaReceiptNumber",
          );
          receipt = item?.Value ? String(item.Value) : undefined;
        }

        if (checkoutId) {
          await supabaseAdmin
            .from("purchases")
            .update({
              status: resultCode === 0 ? "paid" : "failed",
              result_desc: resultDesc,
              mpesa_receipt: receipt,
            })
            .eq("mpesa_checkout_request_id", checkoutId);
        }

        return new Response(
          JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
