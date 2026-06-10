"use server";

import { getFxBalances } from "@/lib/circle/wallets";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type RefreshState =
  | { ok: true; balances: { usdc: string; eurc: string } }
  | { ok: false; error: string };

export async function refreshBalances(): Promise<RefreshState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("circle_wallet_id")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return { ok: false, error: profileError?.message ?? "Profile not found" };
  }

  try {
    const balances = await getFxBalances(profile.circle_wallet_id);
    const admin = createAdminClient();
    const { error } = await admin
      .from("wallet_balances")
      .upsert({
        user_id: user.id,
        usdc: balances.USDC,
        eurc: balances.EURC,
      });
    if (error) return { ok: false, error: error.message };
    return { ok: true, balances: { usdc: balances.USDC, eurc: balances.EURC } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch balances from Circle";
    return { ok: false, error: message };
  }
}
