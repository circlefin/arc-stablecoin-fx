export const FX_TOKENS = ["USDC", "EURC"] as const;
export type FxToken = (typeof FX_TOKENS)[number];

export const SLIPPAGE_PRESETS_BPS = [10, 50, 100] as const;

export const TOKEN_LABEL: Record<FxToken, string> = {
  USDC: "USDC (USD)",
  EURC: "EURC (EUR)",
};

export function otherToken(t: FxToken): FxToken {
  return t === "USDC" ? "EURC" : "USDC";
}

export function bpsToPercent(bps: number) {
  return bps / 100;
}

export function percentToBps(pct: number) {
  return Math.round(pct * 100);
}

export function applySlippageFloor(amountOut: string, slippageBps: number): string {
  const n = Number(amountOut);
  if (!Number.isFinite(n) || n <= 0) return "0";
  const floor = n * (1 - slippageBps / 10_000);
  return floor.toFixed(6);
}

export function formatAmount(value: string | number, decimals = 6): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

export function isPositiveDecimal(s: string): boolean {
  return /^\d+(\.\d+)?$/.test(s) && Number(s) > 0;
}

export const CIRCLE_FAUCET_URL = "https://faucet.circle.com/";

export function faucetUrl(address: string, token: FxToken): string {
  const params = new URLSearchParams({ address, token });
  return `${CIRCLE_FAUCET_URL}?${params.toString()}`;
}

export const ARC_EXPLORER_TX_URL = "https://testnet.arcscan.app/tx";

export function explorerTxUrl(hash: string): string {
  return `${ARC_EXPLORER_TX_URL}/${hash}`;
}
