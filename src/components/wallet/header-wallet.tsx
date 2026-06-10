"use client";

import { RefreshCwIcon, WalletIcon } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { refreshBalances } from "@/app/(app)/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { CIRCLE_FAUCET_URL, formatAmount } from "@/lib/fx";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Balances = { usdc: string; eurc: string };

export function FundWalletButton() {
  return (
    <a
      href={CIRCLE_FAUCET_URL}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
    >
      <WalletIcon />
      Fund wallet
    </a>
  );
}

export function HeaderBalances({
  userId,
  initial,
}: {
  userId: string;
  initial: Balances;
}) {
  const [balances, setBalances] = useState<Balances>(initial);
  const [prevInitial, setPrevInitial] = useState<Balances>(initial);
  const [pending, startTransition] = useTransition();
  const balancesRef = useRef<Balances>(initial);
  const router = useRouter();

  if (prevInitial.usdc !== initial.usdc || prevInitial.eurc !== initial.eurc) {
    setPrevInitial(initial);
    setBalances(initial);
  }

  useEffect(() => {
    balancesRef.current = balances;
  }, [balances]);

  // Apply a balance update, showing a toast when funds arrive.
  const applyBalances = useRef((newUsdc: string, newEurc: string) => {
    const prev = balancesRef.current;
    if (Number(newUsdc) > Number(prev.usdc) || Number(newEurc) > Number(prev.eurc)) {
      toast.success("Funds received", { description: "Your wallet balance has been updated." });
    }
    setBalances({ usdc: newUsdc, eurc: newEurc });
  });

  // Supabase Realtime — fires immediately when the DB row changes.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`wallet_balances_header:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallet_balances", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { usdc: string | number; eurc: string | number };
          applyBalances.current(String(row.usdc), String(row.eurc));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  // Polling fallback — keeps the balance fresh even when Realtime is unavailable
  // (common in local Supabase dev environments with postgres_changes + RLS).
  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const poll = async () => {
      const { data } = await supabase
        .from("wallet_balances")
        .select("usdc, eurc")
        .eq("user_id", userId)
        .maybeSingle();
      if (active && data) {
        applyBalances.current(String(data.usdc), String(data.eurc));
      }
    };

    const id = setInterval(poll, 10_000);
    return () => { active = false; clearInterval(id); };
  }, [userId]);

  function onRefresh() {
    startTransition(async () => {
      const result = await refreshBalances();
      if (result.ok) {
        setBalances(result.balances);
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not refresh balances");
      }
    });
  }

  return (
    <div className="hidden items-center gap-3 text-xs sm:flex">
      <span className="tabular-nums">
        <span className="text-muted-foreground">USDC:</span>{" "}
        <span className="font-medium">{formatAmount(balances.usdc, 2)}</span>
      </span>
      <span className="tabular-nums">
        <span className="text-muted-foreground">EURC:</span>{" "}
        <span className="font-medium">{formatAmount(balances.eurc, 2)}</span>
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={pending}
        onClick={onRefresh}
        aria-label={pending ? "Refreshing balances" : "Refresh balances"}
        title="Refresh balances"
      >
        <RefreshCwIcon className={cn(pending && "animate-spin")} />
      </Button>
    </div>
  );
}
