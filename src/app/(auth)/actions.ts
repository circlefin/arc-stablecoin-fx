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

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createEOAWallet } from "@/lib/circle/wallets";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AuthState = { error?: string };

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp(parsed.data);
  if (signUpError || !signUpData.user) {
    return { error: signUpError?.message ?? "Sign up failed" };
  }
  const userId = signUpData.user.id;

  const admin = createAdminClient();

  try {
    const wallet = await createEOAWallet(userId);

    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      circle_wallet_id: wallet.id,
      wallet_address: wallet.address,
    });
    if (profileError) throw new Error(profileError.message);

    const { error: balanceError } = await admin
      .from("wallet_balances")
      .insert({ user_id: userId });
    if (balanceError) throw new Error(balanceError.message);
  } catch (err) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    const message = err instanceof Error ? err.message : "Wallet provisioning failed";
    return { error: `Could not provision Circle wallet: ${message}` };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
