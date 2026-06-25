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

import { TradesTable, type SwapRow } from "@/components/trades/trades-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: swaps, count: swapsCount } = await supabase
    .from("swaps")
    .select(
      "id, from_token, to_token, amount_in, quoted_out, min_out, status, tx_hash, created_at",
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(0, 9);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>Updates live as new swaps complete.</CardDescription>
      </CardHeader>
      <CardContent>
        <TradesTable
          userId={user.id}
          initial={(swaps ?? []) as SwapRow[]}
          initialTotal={swapsCount ?? 0}
        />
      </CardContent>
    </Card>
  );
}
