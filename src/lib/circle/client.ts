import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

import { serverEnv } from "@/lib/config";

let cached: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

export function circleClient() {
  if (cached) return cached;
  const env = serverEnv();
  cached = initiateDeveloperControlledWalletsClient({
    apiKey: env.CIRCLE_API_KEY,
    entitySecret: env.CIRCLE_ENTITY_SECRET,
  });
  return cached;
}
