# Spider Coin (SPC) Telegram Mini App

Cloudflare Worker + static frontend + D1 database starter.

## Features
- Telegram WebApp identity verification on backend (initData HMAC)
- Mining claim: 10 SPC/day (configurable in D1 settings)
- Referral: 200 SPC after invited user starts mining (one-time)
- Admin-only panel/API, secured by Telegram numeric user ID
- Admin task create/delete and reward configuration
- Wallet card and wallet-only transaction history
- No deposit feature. Withdrawal UI says "Starts in 2027" only.
- GitHub repository deploys to Cloudflare Workers via Wrangler.

## Setup
1. Create a Telegram bot with BotFather. Set its Mini App URL to your deployed Worker URL.
2. Create a Cloudflare D1 database named `spc-db`.
3. Copy `database_id` into `wrangler.toml`.
4. Install Node.js 20+ and run:
   ```bash
   npm install
   npx wrangler d1 execute spc-db --file=./schema.sql
   npx wrangler secret put BOT_TOKEN
   ```
   Paste your BotFather token when prompted. Never commit it.
5. Set your own Telegram numeric ID:
   ```bash
   npx wrangler secret put ADMIN_TELEGRAM_ID
   ```
6. Deploy:
   ```bash
   npx wrangler deploy
   ```
7. Open the Worker URL in Telegram Mini App.

## GitHub auto-deploy
Add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; edit `wrangler.toml` database_id. GitHub Actions deploys on push to main.

## Important
This is a production-oriented starter, not a guarantee of production readiness. Review security, abuse prevention, rate limits, privacy policy, and reward economics before public launch. All balances are server-side. Telegram initData is verified on every API request. Use HTTPS and keep secrets in Cloudflare secrets.
