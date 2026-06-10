-- Security hardening for the Supabase database linter.
--
-- Addresses:
--   * 0011 function_search_path_mutable on public.set_updated_at
--   * 0026 pg_graphql_anon_table_exposed on profiles, swaps, wallet_balances
--
-- Note on lint 0027 (pg_graphql_authenticated_table_exposed): we intentionally
-- keep SELECT for `authenticated` on these tables. The app reads them through
-- the cookie-based SSR client under the authenticated role with RLS filtering,
-- and BalancesPanel subscribes to wallet_balances via Realtime, which also
-- requires the grant. Existence of these tables is not sensitive; per-row
-- access is enforced by RLS.

-- 1. Pin the search_path on the trigger function and qualify the built-in.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- 2. Strip anon's default grants. Login is required everywhere in the app, so
-- anon should not be able to see or touch these tables (and they should not
-- appear in the public GraphQL schema).
revoke all on table public.profiles from anon;
revoke all on table public.swaps from anon;
revoke all on table public.wallet_balances from anon;
