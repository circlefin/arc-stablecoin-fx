"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, Settings2 } from "lucide-react";

import { executeSwapAction, quoteSwap, type QuoteState } from "@/app/(app)/dashboard/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applySlippageFloor,
  bpsToPercent,
  formatAmount,
  isPositiveDecimal,
  otherToken,
  SLIPPAGE_PRESETS_BPS,
  type FxToken,
} from "@/lib/fx";
import { createClient } from "@/lib/supabase/client";

type Balances = { usdc: string; eurc: string };

export function SwapPanel({ userId, balances: initialBalances }: { userId: string; balances: Balances }) {
  const [from, setFrom] = useState<FxToken>("USDC");
  const to = otherToken(from);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(50);
  const [minOut, setMinOut] = useState("");
  const [minOutTouched, setMinOutTouched] = useState(false);
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [open, setOpen] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [executing, startExecute] = useTransition();
  const [balances, setBalances] = useState<Balances>(initialBalances);
  const [prevInitialBalances, setPrevInitialBalances] = useState<Balances>(initialBalances);
  const requestId = useRef(0);
  const router = useRouter();

  const balanceFor = (t: FxToken) => (t === "USDC" ? balances.usdc : balances.eurc);

  if (
    prevInitialBalances.usdc !== initialBalances.usdc ||
    prevInitialBalances.eurc !== initialBalances.eurc
  ) {
    setPrevInitialBalances(initialBalances);
    setBalances(initialBalances);
  }

  const currentBalance = from === "USDC" ? balances.usdc : balances.eurc;
  if (isPositiveDecimal(amountIn) && Number(amountIn) > Number(currentBalance)) {
    setAmountIn(Number(currentBalance) > 0 ? currentBalance : "");
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`wallet_balances_swap:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallet_balances",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { usdc: string | number; eurc: string | number };
          setBalances({ usdc: String(row.usdc), eurc: String(row.eurc) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    const id = ++requestId.current;
    const handle = window.setTimeout(async () => {
      if (!isPositiveDecimal(amountIn)) {
        if (id === requestId.current) {
          setQuote(null);
          setQuoting(false);
        }
        return;
      }
      setQuoting(true);
      const result = await quoteSwap({ from, to, amountIn });
      if (id !== requestId.current) return;
      setQuote(result);
      setQuoting(false);
      if (result.ok && !minOutTouched) {
        setMinOut(applySlippageFloor(result.amountOut, slippageBps));
      }
    }, 350);
    return () => window.clearTimeout(handle);
  }, [amountIn, from, to, slippageBps, minOutTouched]);

  const insufficient = useMemo(() => {
    if (!isPositiveDecimal(amountIn)) return false;
    return Number(amountIn) > Number(balanceFor(from));
  }, [amountIn, from, balances]); // eslint-disable-line react-hooks/exhaustive-deps

  const canExecute =
    quote?.ok &&
    isPositiveDecimal(amountIn) &&
    !insufficient &&
    !quoting &&
    !executing;

  function flipTokens() {
    setFrom(to);
    setAmountIn("");
    setMinOut("");
    setMinOutTouched(false);
    setQuote(null);
    setFlipping(true);
    setTimeout(() => setFlipping(false), 380);
  }

  function onExecute() {
    if (!quote?.ok) return;
    startExecute(async () => {
      const result = await executeSwapAction({
        from,
        to,
        amountIn,
        slippageBps,
        minOut: isPositiveDecimal(minOut) ? minOut : undefined,
      });
      setOpen(false);
      if (result.ok) {
        toast.success("Swap confirmed");
        setAmountIn("");
        setMinOut("");
        setMinOutTouched(false);
        setQuote(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const estimatedOut = quote?.ok ? formatAmount(quote.amountOut) : quoting ? "…" : "0";

  return (
    <>
      <div className="w-full rounded-2xl bg-card border border-border shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-sm font-semibold">Swap</span>
          <Popover>
            <PopoverTrigger className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <Settings2 className="h-4 w-4" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Max slippage
                </Label>
                <Select
                  value={String(slippageBps)}
                  onValueChange={(v) => setSlippageBps(Number(v))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue>
                      {(value: string) => `${bpsToPercent(Number(value))}%`}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SLIPPAGE_PRESETS_BPS.map((bps) => (
                      <SelectItem key={bps} value={String(bps)}>
                        {bpsToPercent(bps)}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="minout-settings" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Min output ({to})
                </Label>
                <Input
                  id="minout-settings"
                  inputMode="decimal"
                  placeholder="Floor price"
                  value={minOut}
                  onChange={(e) => {
                    setMinOut(e.target.value);
                    setMinOutTouched(true);
                  }}
                  className="h-9"
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Sell panel */}
        <div className="mx-3 rounded-xl bg-muted/50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Sell</span>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
              disabled={Number(balanceFor(from)) === 0}
              onClick={() => setAmountIn(String(balanceFor(from)))}
            >
              Max
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              inputMode="decimal"
              placeholder="0"
              value={amountIn}
              disabled={Number(balanceFor(from)) === 0}
              onChange={(e) => {
                const val = e.target.value;
                const balance = balanceFor(from);
                const capped =
                  isPositiveDecimal(val) && Number(val) > Number(balance)
                    ? balance
                    : val;
                setAmountIn(capped);
                setMinOutTouched(false);
              }}
              className="flex-1 min-w-0 bg-transparent text-3xl font-semibold outline-none placeholder:text-muted-foreground/40 disabled:cursor-not-allowed"
            />
            <Select value={from} onValueChange={(v) => setFrom(v as FxToken)}>
              <SelectTrigger className="h-9 w-auto rounded-full border-border bg-background px-3 text-sm font-medium shadow-sm shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USDC">USDC</SelectItem>
                <SelectItem value="EURC">EURC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground tabular-nums">
              Balance: {formatAmount(balanceFor(from))}
            </span>
            {insufficient && (
              <span className="text-xs text-destructive">Insufficient balance</span>
            )}
          </div>
        </div>

        {/* Flip button */}
        <div className="relative flex justify-center -my-2 z-10">
          <button
            type="button"
            onClick={flipTokens}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card ring-[5px] ring-card hover:bg-accent transition-colors"
          >
            <ArrowDown
              className="h-4 w-4"
              style={flipping ? { animation: "flip-cw 380ms cubic-bezier(0.4,0,0.2,1)" } : undefined}
            />
          </button>
        </div>

        {/* Buy panel */}
        <div className="mx-3 rounded-xl bg-muted/50 p-4 space-y-2">
          <span className="text-sm text-muted-foreground">Buy</span>
          <div className="flex items-center gap-3">
            <span className="flex-1 min-w-0 text-3xl font-semibold text-muted-foreground tabular-nums truncate">
              {estimatedOut}
            </span>
            <div className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm font-medium shadow-sm shrink-0">
              {to}
            </div>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            Balance: {formatAmount(balanceFor(to))}
          </span>
        </div>

        {/* Quote details */}
        {quote?.ok && (
          <div className="mx-3 mt-2 rounded-xl bg-muted/30 px-4 py-3 space-y-1.5 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Rate</span>
              <span className="tabular-nums text-foreground">
                1 {from} ≈ {Number(quote.effectiveRate).toFixed(6)} {to}
              </span>
            </div>
            <div className="flex justify-between">
              <span>App fee</span>
              <span className="tabular-nums">
                {formatAmount(quote.appFeeAmount)} {from} ({bpsToPercent(quote.appFeeBps)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span>Slippage</span>
              <span>{bpsToPercent(slippageBps)}%</span>
            </div>
          </div>
        )}

        {!quote?.ok && quote?.error && (
          <div className="mx-3 mt-2">
            <Alert variant="destructive">
              <AlertDescription className="text-xs">{quote.error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Swap button */}
        <div className="p-3 pt-2">
          <Button
            className="w-full h-12 rounded-xl text-base font-semibold"
            disabled={!canExecute}
            onClick={() => setOpen(true)}
          >
            {executing
              ? "Executing…"
              : Number(balanceFor(from)) === 0
                ? `Get ${from} from the faucet`
                : `Swap ${from} → ${to}`}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm swap</DialogTitle>
            <DialogDescription>
              Review the quote. Execution is final once submitted.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Pay</dt>
              <dd className="tabular-nums">
                {formatAmount(amountIn || "0")} {from}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Receive (est.)</dt>
              <dd className="tabular-nums">
                {quote?.ok ? `${formatAmount(quote.amountOut)} ${to}` : "-"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Min output</dt>
              <dd className="tabular-nums">
                {isPositiveDecimal(minOut) ? `${formatAmount(minOut)} ${to}` : `-`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Slippage</dt>
              <dd>{bpsToPercent(slippageBps)}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">App fee</dt>
              <dd className="tabular-nums">
                {quote?.ok
                  ? `${formatAmount(quote.appFeeAmount)} ${from} (${bpsToPercent(quote.appFeeBps)}%)`
                  : "-"}
              </dd>
            </div>
          </dl>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={executing}>
              Cancel
            </Button>
            <Button onClick={onExecute} disabled={executing}>
              {executing ? "Executing…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
