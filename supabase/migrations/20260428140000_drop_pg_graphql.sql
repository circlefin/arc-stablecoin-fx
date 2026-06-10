-- Resolves database linter warning 0027 pg_graphql_authenticated_table_exposed
-- on public.profiles, public.swaps and public.wallet_balances.
--
-- pg_graphql has no per-table "hide from schema" directive, so the only ways
-- to silence the lint are to revoke SELECT from `authenticated` (which breaks
-- PostgREST reads via @supabase/ssr and Realtime fan-out for BalancesPanel)
-- or to remove the extension. The app does not use the auto-generated GraphQL
-- schema, so dropping pg_graphql is the surgical fix: REST + Realtime keep
-- working under the authenticated role with RLS, and no table is exposed
-- through GraphQL anymore.

drop extension if exists pg_graphql cascade;
