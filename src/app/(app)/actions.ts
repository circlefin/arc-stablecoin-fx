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
