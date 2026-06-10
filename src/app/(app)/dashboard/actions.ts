"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { estimateSwap, executeSwap } from "@/lib/appkit/swap";
import { getFxBalances } from "@/lib/circle/wallets";
import { serverEnv } from "@/lib/config";
import { FX_TOKENS, type FxToken } from "@/lib/fx";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const tokenSchema = z.enum(FX_TOKENS);
const amountSchema = z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount").refine((v) => Number(v) > 0, "Must be > 0");

const quoteSchema = z.object({
  from: tokenSchema,
  to: tokenSchema,
  amountIn: amountSchema,
}).refine((v) => v.from !== v.to, { message: "From and To must differ" });

export type QuoteState =
  | { ok: true; amountOut: string; effectiveRate: string; appFeeBps: number; appFeeAmount: string }
  | { ok: false; error: string };

async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("circle_wallet_id, wallet_address")
    .eq("id", user.id)
    .single();
  if (error || !profile) throw new Error(error?.message ?? "Profile not found");
  return { user, profile };
}

export async function quoteSwap(input: {
  from: FxToken;
  to: FxToken;
  amountIn: string;
}): Promise<QuoteState> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid quote input" };
  }
  try {
    const { profile } = await getProfile();
    const env = serverEnv();
    const result = await estimateSwap({
      walletAddress: profile.wallet_address,
      tokenIn: parsed.data.from,
      tokenOut: parsed.data.to,
      amountIn: parsed.data.amountIn,
    });
    const appFeeAmount = ((Number(parsed.data.amountIn) * env.APP_FEE_BPS) / 10_000).toFixed(6);
    return {
      ok: true,
      amountOut: result.amountOut,
      effectiveRate: result.effectiveRate,
      appFeeBps: env.APP_FEE_BPS,
      appFeeAmount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch quote";
    return { ok: false, error: message };
  }
}

const executeSchema = z.object({
  from: tokenSchema,
  to: tokenSchema,
  amountIn: amountSchema,
  slippageBps: z.number().int().min(0).max(10_000),
  minOut: z.string().optional(),
}).refine((v) => v.from !== v.to, { message: "From and To must differ" });

export type ExecuteState =
  | { ok: true; swapId: string }
  | { ok: false; error: string };

export async function executeSwapAction(input: {
  from: FxToken;
  to: FxToken;
  amountIn: string;
  slippageBps: number;
  minOut?: string;
}): Promise<ExecuteState> {
  console.log("[executeSwapAction] called", { from: input.from, to: input.to, amountIn: input.amountIn, slippageBps: input.slippageBps, minOut: input.minOut });

  const parsed = executeSchema.safeParse(input);
  if (!parsed.success) {
    console.error("[executeSwapAction] validation failed", parsed.error.issues);
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let user;
  let profile;
  try {
    ({ user, profile } = await getProfile());
    console.log("[executeSwapAction] auth ok", { userId: user.id, walletAddress: profile.wallet_address, circleWalletId: profile.circle_wallet_id });
  } catch (err) {
    console.error("[executeSwapAction] auth failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Auth error" };
  }

  const env = serverEnv();
  const admin = createAdminClient();

  const { data: pending, error: insertError } = await admin
    .from("swaps")
    .insert({
      user_id: user.id,
      from_token: parsed.data.from,
      to_token: parsed.data.to,
      amount_in: parsed.data.amountIn,
      min_out: parsed.data.minOut ?? null,
      slippage_bps: parsed.data.slippageBps,
      app_fee_bps: env.APP_FEE_BPS,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !pending) {
    console.error("[executeSwapAction] DB insert failed", { insertError });
    return { ok: false, error: insertError?.message ?? "Could not create swap record" };
  }
  console.log("[executeSwapAction] swap record created", { swapId: pending.id });

  try {
    console.log("[executeSwapAction] calling executeSwap", {
      walletAddress: profile.wallet_address,
      tokenIn: parsed.data.from,
      tokenOut: parsed.data.to,
      amountIn: parsed.data.amountIn,
      slippageBps: parsed.data.slippageBps,
      stopLimit: parsed.data.minOut,
    });
    const result = await executeSwap({
      walletAddress: profile.wallet_address,
      tokenIn: parsed.data.from,
      tokenOut: parsed.data.to,
      amountIn: parsed.data.amountIn,
      slippageBps: parsed.data.slippageBps,
      stopLimit: parsed.data.minOut,
    });
    console.log("[executeSwapAction] executeSwap result", result);

    const { error: updateError } = await admin
      .from("swaps")
      .update({
        status: "confirmed",
        quoted_out: result.amountOut ?? null,
        tx_hash: result.txHash ?? null,
      })
      .eq("id", pending.id);
    if (updateError) console.error("[executeSwapAction] failed to update swap to confirmed", { updateError });

    try {
      const balances = await getFxBalances(profile.circle_wallet_id);
      await admin
        .from("wallet_balances")
        .upsert({ user_id: user.id, usdc: balances.USDC, eurc: balances.EURC });
    } catch (balanceErr) {
      console.warn("[executeSwapAction] balance refresh failed (non-fatal)", balanceErr);
    }

    revalidatePath("/dashboard");
    return { ok: true, swapId: pending.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Swap execution failed";
    console.error("[executeSwapAction] executeSwap threw", {
      name: err instanceof Error ? err.name : undefined,
      message: err instanceof Error ? err.message : err,
      cause: err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined,
      stack: err instanceof Error ? err.stack : undefined,
    });
    const { error: failError } = await admin
      .from("swaps")
      .update({ status: "failed", error: message })
      .eq("id", pending.id);
    if (failError) console.error("[executeSwapAction] failed to update swap to failed", { failError });
    return { ok: false, error: message };
  }
}
