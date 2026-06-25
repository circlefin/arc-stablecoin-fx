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

import { z } from "zod";

const serverSchema = z.object({
  CIRCLE_API_KEY: z.string().min(1),
  CIRCLE_ENTITY_SECRET: z.string().regex(/^[0-9a-f]{64}$/, "must be 32 bytes hex (64 chars)"),
  CIRCLE_BLOCKCHAIN: z.string().default("ARC-TESTNET"),
  CIRCLE_WEBHOOK_SECRET: z.string().min(1).optional(),
  KIT_KEY: z.string().min(1),
  APP_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(25),
  APP_FEE_RECIPIENT: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed EVM address"),
  SUPABASE_SECRET_KEY: z.string().min(1),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_ARC_CHAIN: z.string().default("Arc_Testnet"),
});

let cachedServer: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_ARC_CHAIN: process.env.NEXT_PUBLIC_ARC_CHAIN,
});
