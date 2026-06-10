import "server-only";

import { AppKit, SwapChain } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

import { clientEnv, serverEnv } from "@/lib/config";
import type { FxToken } from "@/lib/fx";

let cachedKit: AppKit | null = null;
let cachedAdapter: ReturnType<typeof createCircleWalletsAdapter> | null = null;

function kit() {
  if (!cachedKit) cachedKit = new AppKit();
  return cachedKit;
}

function adapter() {
  if (cachedAdapter) return cachedAdapter;
  const env = serverEnv();
  cachedAdapter = createCircleWalletsAdapter({
    apiKey: env.CIRCLE_API_KEY,
    entitySecret: env.CIRCLE_ENTITY_SECRET,
  });
  return cachedAdapter;
}

function chain(): SwapChain {
  const value = clientEnv.NEXT_PUBLIC_ARC_CHAIN as keyof typeof SwapChain;
  const resolved = SwapChain[value];
  if (!resolved) {
    throw new Error(
      `NEXT_PUBLIC_ARC_CHAIN must be a SwapChain identifier (got "${clientEnv.NEXT_PUBLIC_ARC_CHAIN}")`,
    );
  }
  return resolved;
}

export type QuoteInput = {
  walletAddress: string;
  tokenIn: FxToken;
  tokenOut: FxToken;
  amountIn: string;
};

export type QuoteResult = {
  amountOut: string;
  appFeeBps: number;
  effectiveRate: string;
};

export async function estimateSwap({
  walletAddress,
  tokenIn,
  tokenOut,
  amountIn,
}: QuoteInput): Promise<QuoteResult> {
  const env = serverEnv();
  const result = await kit().estimateSwap({
    from: { adapter: adapter(), chain: chain(), address: walletAddress },
    tokenIn,
    tokenOut,
    amountIn,
    config: { kitKey: env.KIT_KEY },
  });

  const amountOut = result.estimatedOutput.amount;
  const inNum = Number(amountIn);
  const outNum = Number(amountOut);
  const effectiveRate = inNum > 0 ? (outNum / inNum).toString() : "0";

  return { amountOut, appFeeBps: env.APP_FEE_BPS, effectiveRate };
}

export type ExecuteInput = QuoteInput & {
  slippageBps: number;
  stopLimit?: string;
};

export type ExecuteResult = {
  amountOut?: string;
  txHash?: string;
};

export async function executeSwap({
  walletAddress,
  tokenIn,
  tokenOut,
  amountIn,
  slippageBps,
  stopLimit,
}: ExecuteInput): Promise<ExecuteResult> {
  const env = serverEnv();
  const baseConfig = {
    kitKey: env.KIT_KEY,
    slippageBps,
    ...(stopLimit ? { stopLimit } : {}),
    customFee: {
      percentageBps: env.APP_FEE_BPS,
      recipientAddress: env.APP_FEE_RECIPIENT,
    },
  };
  const params = {
    from: { adapter: adapter(), chain: chain(), address: walletAddress },
    tokenIn,
    tokenOut,
    amountIn,
  };

  let result;
  try {
    result = await kit().swap({ ...params, config: baseConfig });
  } catch (err) {
    // Counterfactual Circle smart wallets cannot produce EIP-1271 signatures
    // until they are deployed on-chain. Fall back to an on-chain approval,
    // which deploys the wallet as a side effect of the first transaction.
    if (isUndeployedWalletError(err)) {
      result = await kit().swap({
        ...params,
        config: { ...baseConfig, allowanceStrategy: "approve" },
      });
    } else {
      const cause = (err as Record<string, unknown>)?.cause as Record<string, unknown> | undefined;
      const trace = cause?.trace as Record<string, unknown> | undefined;
      const rawError = trace?.rawError as Record<string, unknown> | undefined;
      console.error("[executeSwap] kit().swap() failed — top-level:", String(err));
      console.error("[executeSwap] cause.trace.chain:", trace?.chain);
      console.error("[executeSwap] cause.trace.rawError (string):", String(rawError));
      console.error("[executeSwap] cause.trace.rawError.message:", rawError?.message);
      console.error("[executeSwap] cause.trace.rawError.name:", rawError?.name);
      console.error("[executeSwap] cause.trace.rawError.stack:", rawError?.stack);
      console.error("[executeSwap] cause.trace.rawError (full JSON):", JSON.stringify(rawError, Object.getOwnPropertyNames(rawError ?? {})));
      throw err;
    }
  }

  return {
    amountOut: result.amountOut,
    txHash: result.txHash,
  };
}

function isUndeployedWalletError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  return /undeployed wallet/i.test(message);
}
