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

import "server-only";

import { circleClient } from "./client";
import { serverEnv } from "@/lib/config";

export type FxToken = "USDC" | "EURC";

export type WalletBalances = {
  USDC: string;
  EURC: string;
};

const ZERO: WalletBalances = { USDC: "0", EURC: "0" };

export async function createEOAWallet(
  ownerLabel: string,
): Promise<{ id: string; address: string; walletSetId: string }> {
  const env = serverEnv();
  const client = circleClient();

  const setResponse = await client.createWalletSet({ name: `arc-fx-user-${ownerLabel}` });
  const walletSetId = setResponse.data?.walletSet?.id;
  if (!walletSetId) {
    throw new Error("Circle returned no wallet set on createWalletSet()");
  }

  const walletResponse = await client.createWallets({
    walletSetId,
    blockchains: [env.CIRCLE_BLOCKCHAIN as Parameters<typeof client.createWallets>[0]["blockchains"][number]],
    count: 1,
    accountType: "EOA",
  });

  const wallet = walletResponse.data?.wallets?.[0];
  if (!wallet) {
    throw new Error("Circle returned no wallet on createWallets()");
  }
  return { id: wallet.id, address: wallet.address, walletSetId };
}

export async function getFxBalances(walletId: string): Promise<WalletBalances> {
  const client = circleClient();
  const response = await client.getWalletTokenBalance({ id: walletId });
  const balances = response.data?.tokenBalances ?? [];

  const out: WalletBalances = { ...ZERO };
  for (const b of balances) {
    const symbol = b.token.symbol?.toUpperCase();
    if (symbol === "USDC" || symbol === "EURC") {
      out[symbol] = b.amount;
    }
  }
  return out;
}
