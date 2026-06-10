import { z } from "zod";

import { getFxBalances } from "@/lib/circle/wallets";
import { serverEnv } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";

// Circle sends a HEAD request to verify the endpoint is reachable.
export function HEAD() {
  return new Response(null, { status: 200 });
}

const notificationSchema = z.object({
  notificationType: z.string(),
  notification: z
    .object({
      walletId: z.string().optional(),
      destinationAddress: z.string().optional(),
      state: z.string().optional(),
    })
    .passthrough(),
});

export async function POST(request: Request) {
  const env = serverEnv();

  // If a webhook secret is configured, require it in the Authorization header.
  if (env.CIRCLE_WEBHOOK_SECRET) {
    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${env.CIRCLE_WEBHOOK_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const parsed = notificationSchema.safeParse(body);
  if (!parsed.success) {
    return new Response("OK", { status: 200 });
  }

  const { notificationType, notification } = parsed.data;
  console.log("[webhook/circle] type=%s state=%s walletId=%s", notificationType, notification.state, notification.walletId);

  // CONFIRMED = balance already credited by Circle on L2 chains like Arc Testnet.
  // COMPLETE  = final on-chain settlement. Handle both so we never miss an update.
  const isSettled =
    notification.state === "CONFIRMED" || notification.state === "COMPLETE";

  if (notificationType === "transactions.inbound" && isSettled) {
    await handleInboundComplete(notification.walletId, notification.destinationAddress);
  }

  return new Response("OK", { status: 200 });
}

async function handleInboundComplete(walletId?: string, destinationAddress?: string) {
  if (!walletId && !destinationAddress) {
    console.warn("[webhook/circle] notification has neither walletId nor destinationAddress — skipping");
    return;
  }

  try {
    const admin = createAdminClient();

    // Try Circle wallet UUID first, fall back to on-chain address.
    let profile: { id: string; circle_wallet_id: string } | null = null;

    if (walletId) {
      const { data } = await admin
        .from("profiles")
        .select("id, circle_wallet_id")
        .eq("circle_wallet_id", walletId)
        .maybeSingle();
      profile = data ?? null;
    }

    if (!profile && destinationAddress) {
      const { data } = await admin
        .from("profiles")
        .select("id, circle_wallet_id")
        .eq("wallet_address", destinationAddress.toLowerCase())
        .maybeSingle();
      profile = data ?? null;
    }

    if (!profile) {
      console.warn("[webhook/circle] no profile matched walletId=%s destinationAddress=%s", walletId, destinationAddress);
      return;
    }

    console.log("[webhook/circle] updating balance for userId=%s", profile.id);
    const balances = await getFxBalances(profile.circle_wallet_id);
    console.log("[webhook/circle] fetched balances", balances);

    const { error: upsertError } = await admin.from("wallet_balances").upsert({
      user_id: profile.id,
      usdc: balances.USDC,
      eurc: balances.EURC,
    });
    if (upsertError) {
      console.error("[webhook/circle] upsert failed", upsertError.message);
    } else {
      console.log("[webhook/circle] balance updated ok");
    }
  } catch (err) {
    console.error("[webhook/circle] balance update failed", err);
  }
}
