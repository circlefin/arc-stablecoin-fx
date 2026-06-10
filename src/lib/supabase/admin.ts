import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/config";

export function createAdminClient() {
  const env = serverEnv();
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
