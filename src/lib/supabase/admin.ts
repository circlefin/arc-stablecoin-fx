import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { serverEnv, clientEnv } from "@/lib/config";

export function createAdminClient() {
  const env = serverEnv();
  return createSupabaseClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
