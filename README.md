# Arc Stablecoin FX

This sample app demonstrates stablecoin FX swaps between USDC and EURC using the App Kits Swap SDK and Circle Developer Controlled Wallets on Arc.

<img alt="Arc Stablecoin Fx" src="public/screenshot.png" />

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [Project Layout](#project-layout)
- [Environment Variables](#environment-variables)
- [Security & Usage Model](#security--usage-model)

## Features

- **Sign up / sign in** (`register`/`login`) — Supabase-authenticated accounts tied to a Circle Developer-Controlled Wallet.
- **Swap panel** (`SwapPanel`) — convert between USDC and EURC via the App Kit Swap SDK, with the platform fee applied automatically.
- **Trade history** (`TradesTable`) — past swaps for the signed-in user.
- **Wallet header** (`HeaderWallet`, `WalletAddressCopy`) — shows the user's Circle wallet address and balance, copyable to clipboard.
- **Webhook-driven balance sync** (`/api/webhooks/circle`) — Circle inbound-transaction notifications update cached balances in Supabase.

## Prerequisites

- Node.js 20+ and npm
- Docker (for local Supabase)
- A [Circle](https://console.circle.com) account with API key + entity secret
- A Circle App Kit `KIT_KEY`

## Getting Started

1. Install dependencies:

   ```sh
   npm install
   ```

2. Start the local Supabase stack:

   ```sh
   npm run db:start
   ```

   This boots Postgres, Auth, etc. via the Supabase CLI and runs the migrations in
   `supabase/migrations/`. Use `npm run db:status` to print the local URLs and keys,
   `npm run db:reset` to wipe + re-migrate, and `npm run db:stop` to shut it down.

3. Set up environment variables:

   ```sh
   cp .env.example .env.local
   ```

   Then edit `.env.local` and fill in all required values (see [Environment Variables](#environment-variables) below). `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` come from `npm run db:status`.

4. Provision the platform fee wallet:

   ```sh
   npm run wallet:generate
   ```

   Creates a Circle wallet to receive swap fees and writes its address back to `.env.local` as `APP_FEE_RECIPIENT`.

5. Start the dev server:

   ```sh
   npm run dev
   ```

   The app will be available at [http://localhost:3000](http://localhost:3000).

## How It Works

- Built with [Next.js](https://nextjs.org/) App Router and [Supabase](https://supabase.com/) (auth + trade history)
- Uses [Circle Developer Controlled Wallets](https://developers.circle.com/wallets/dev-controlled) to hold each user's USDC/EURC
- Utilizes `@circle-fin/app-kit`'s Swap SDK (`kit.swap` / `kit.estimateSwap`) for USDC ⇄ EURC swaps on Arc Testnet
- A platform-level fee (`APP_FEE_BPS`) is applied to every swap and routed to `APP_FEE_RECIPIENT`, a Circle wallet provisioned via `npm run wallet:generate`
- [Circle webhooks](https://developers.circle.com/api-reference/webhook-endpoints) (`/api/webhooks/circle`) keep cached wallet balances in Supabase in sync with on-chain settlement
- Styled with [Tailwind CSS](https://tailwindcss.com) and components from [shadcn/ui](https://ui.shadcn.com/)

## Project Layout

- `src/app/(auth)/` - register / login flows
- `src/app/(app)/dashboard/` - authenticated swap panel
- `src/app/(app)/dashboard/history/` - trades history
- `src/app/api/webhooks/circle/` - Circle webhook receiver
- `src/components/swap/`, `src/components/trades/`, `src/components/wallet/` - feature UI
- `src/lib/circle/`, `src/lib/appkit/` - Circle wallets + App Kit integration
- `src/lib/supabase/` - Supabase client/server/admin helpers
- `supabase/migrations/` - database schema
- `scripts/` - one-off operator scripts

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the required values:

```bash
# Defaults for `supabase start` (local Supabase stack)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=

# Circle dev-controlled wallets
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_BLOCKCHAIN=ARC-TESTNET

# Circle App Kit
KIT_KEY=
NEXT_PUBLIC_ARC_CHAIN=Arc_Testnet

# Optional — webhook auth
CIRCLE_WEBHOOK_SECRET=

# Platform fee
APP_FEE_BPS=25
APP_FEE_RECIPIENT=
```

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL. From `npm run db:status` for local dev. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable key. From `npm run db:status` for local dev. |
| `SUPABASE_SECRET_KEY` | Server-side, secret | Supabase secret key, used only by the admin client; never exposed to the browser. |
| `CIRCLE_API_KEY` | Server-side, secret | Circle Developer-Controlled Wallets API key. |
| `CIRCLE_ENTITY_SECRET` | Server-side, secret | 32-byte hex (64 chars) entity secret. Must be registered with Circle once before use. |
| `CIRCLE_BLOCKCHAIN` | Server-side | Circle blockchain identifier. Defaults to `ARC-TESTNET`. |
| `KIT_KEY` | Server-side, secret | Circle App Kit key used for FX swaps. Being deprecated on the SDK side in favor of a unified `apiKey` field that will accept either a kit key or a plain API key — `KIT_KEY` stays supported until it's removed. |
| `NEXT_PUBLIC_ARC_CHAIN` | Public | App Kit chain identifier. Defaults to `Arc_Testnet`. |
| `CIRCLE_WEBHOOK_SECRET` | Server-side, secret | Optional. If set, required as a bearer token on `/api/webhooks/circle`; recommended for any shared or deployed environment. |
| `APP_FEE_BPS` | Server-side | Platform fee in basis points applied to every swap. Defaults to `25` (0.25%). |
| `APP_FEE_RECIPIENT` | Server-side | Address that receives swap fees. Leave blank, then run `npm run wallet:generate` to provision a wallet and auto-fill this value. |

## Security & Usage Model

This sample application:
- Assumes testnet usage only, and is not intended for production use without modification
- Handles secrets (`CIRCLE_ENTITY_SECRET`, `SUPABASE_SECRET_KEY`, `KIT_KEY`) via server-only environment variables, never exposed to the client
- Leaves webhook auth opt-in — set `CIRCLE_WEBHOOK_SECRET` in any shared or deployed environment, since without it `/api/webhooks/circle` accepts unauthenticated requests from anyone who knows the URL
- Provisions the platform fee wallet manually via `npm run wallet:generate`, with no key-rotation flow
