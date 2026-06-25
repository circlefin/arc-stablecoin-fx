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

import { redirect } from "next/navigation";

import { SwapPanel } from "@/components/swap/swap-panel";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: balances }] = await Promise.all([
    supabase.from("profiles").select("wallet_address").eq("id", user.id).single(),
    supabase
      .from("wallet_balances")
      .select("usdc, eurc")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!profile) redirect("/login");

  const initialBalances = {
    usdc: String(balances?.usdc ?? "0"),
    eurc: String(balances?.eurc ?? "0"),
  };

  return (
    <div className="w-full max-w-sm">
      <SwapPanel userId={user.id} balances={initialBalances} />
    </div>
  );
}
