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

import { beforeEach, describe, expect, it, vi } from "vitest";

const estimateSwapMock = vi.fn();
const swapMock = vi.fn();

vi.mock("@circle-fin/app-kit", () => ({
  AppKit: vi.fn().mockImplementation(() => ({
    estimateSwap: estimateSwapMock,
    swap: swapMock,
  })),
  SwapChain: { Arc_Testnet: "Arc_Testnet" },
}));

vi.mock("@circle-fin/adapter-circle-wallets", () => ({
  createCircleWalletsAdapter: vi.fn().mockReturnValue({}),
}));

import { estimateSwap, executeSwap } from "./swap";
import { UNSUPPORTED_DIRECTION_MESSAGE } from "@/lib/fx";

describe("estimateSwap / executeSwap — EURC -> USDC short-circuit (issue #1)", () => {
  beforeEach(() => {
    estimateSwapMock.mockReset();
    swapMock.mockReset();
  });

  it("estimateSwap rejects EURC -> USDC without calling the AppKit SDK", async () => {
    await expect(
      estimateSwap({
        walletAddress: "0x0000000000000000000000000000000000dEaD",
        tokenIn: "EURC",
        tokenOut: "USDC",
        amountIn: "5",
      }),
    ).rejects.toThrow(UNSUPPORTED_DIRECTION_MESSAGE);
    expect(estimateSwapMock).not.toHaveBeenCalled();
  });

  it("executeSwap rejects EURC -> USDC without calling the AppKit SDK", async () => {
    await expect(
      executeSwap({
        walletAddress: "0x0000000000000000000000000000000000dEaD",
        tokenIn: "EURC",
        tokenOut: "USDC",
        amountIn: "5",
        slippageBps: 50,
      }),
    ).rejects.toThrow(UNSUPPORTED_DIRECTION_MESSAGE);
    expect(swapMock).not.toHaveBeenCalled();
  });

  it("estimateSwap still calls the SDK for the supported USDC -> EURC direction", async () => {
    estimateSwapMock.mockResolvedValue({ estimatedOutput: { amount: "4.9" } });
    const result = await estimateSwap({
      walletAddress: "0x0000000000000000000000000000000000dEaD",
      tokenIn: "USDC",
      tokenOut: "EURC",
      amountIn: "5",
    });
    expect(estimateSwapMock).toHaveBeenCalledOnce();
    expect(result.amountOut).toBe("4.9");
  });
});
