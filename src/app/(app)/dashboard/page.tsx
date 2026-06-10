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
