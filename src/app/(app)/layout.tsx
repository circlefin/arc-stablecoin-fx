import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "../(auth)/actions";
import { NavLinks } from "@/components/nav-links";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FundWalletButton, HeaderBalances } from "@/components/wallet/header-wallet";
import { WalletAddressCopy } from "@/components/wallet/wallet-address-copy";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: balances }] = await Promise.all([
    supabase.from("profiles").select("wallet_address").eq("id", user.id).maybeSingle(),
    supabase
      .from("wallet_balances")
      .select("usdc, eurc")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/dashboard"
              className="rounded-md px-3 py-1.5 font-medium hover:bg-accent"
            >
              Arc FX
            </Link>
            <NavLinks />
            {profile?.wallet_address ? (
              <>
                <FundWalletButton />
              </>
            ) : null}
          </nav>
          <div className="flex items-center gap-3">
            <HeaderBalances
              userId={user.id}
              initial={{
                usdc: String(balances?.usdc ?? "0"),
                eurc: String(balances?.eurc ?? "0"),
              }}
            />
            {profile?.wallet_address ? (
              <>
                <Separator orientation="vertical" className="hidden h-5 data-vertical:self-center sm:block" />
                <WalletAddressCopy
                  address={profile.wallet_address}
                  className="hidden sm:inline-flex"
                />
              </>
            ) : null}
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-8">
        {children}
      </main>
    </div>
  );
}
