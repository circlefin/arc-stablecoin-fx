/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from "zod";
import crypto from "crypto";

import { getFxBalances } from "@/lib/circle/wallets";
import { serverEnv } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";

const publicKeyCache = new Map<string, string>();

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

  const signature = request.headers.get("x-circle-signature");
  const keyId = request.headers.get("x-circle-key-id");
  if (!signature || !keyId) {
    return new Response("Missing Circle signature headers", { status: 400 });
  }

  const isVerified = await verifyCircleSignature(rawBody, signature, keyId, env.CIRCLE_API_KEY);
  if (!isVerified) {
    return new Response("Invalid Circle signature", { status: 403 });
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

async function verifyCircleSignature(
  body: string,
  signature: string,
  keyId: string,
  apiKey: string,
): Promise<boolean> {
  try {
    const publicKey = await getCirclePublicKey(keyId, apiKey);
    const verifier = crypto.createVerify("SHA256");
    verifier.update(body, "utf8");
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(signature, "base64"));
  } catch (err) {
    console.warn("[webhook/circle] signature verification failed", err);
    return false;
  }
}

async function getCirclePublicKey(keyId: string, apiKey: string): Promise<string> {
  const cached = publicKeyCache.get(keyId);
  if (cached) return cached;

  const response = await fetch(`https://api.circle.com/v2/notifications/publicKey/${keyId}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`failed to fetch Circle public key: ${response.status}`);
  }

  const data: unknown = await response.json();
  const publicKey = z
    .object({ data: z.object({ publicKey: z.string().min(1) }) })
    .parse(data).data.publicKey;
  const pem = [
    "-----BEGIN PUBLIC KEY-----",
    ...(publicKey.match(/.{1,64}/g) ?? []),
    "-----END PUBLIC KEY-----",
  ].join("\n");

  publicKeyCache.set(keyId, pem);
  return pem;
}
