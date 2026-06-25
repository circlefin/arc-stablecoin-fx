-- Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--
-- SPDX-License-Identifier: Apache-2.0

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
