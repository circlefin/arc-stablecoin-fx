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
