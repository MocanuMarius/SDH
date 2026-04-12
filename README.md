# Deecide

An investment decision journal with structured actions, process scoring, and deliberate practice tools.

**Stack:** Vite + React 19 + TypeScript + MUI + Supabase

## Setup

1. Clone and install:
   ```bash
   npm install --legacy-peer-deps
   ```

2. Copy `.env.example` to `.env.local` and fill in your Supabase project URL + anon key.

3. Apply the database schema:
   - Paste `supabase/apply-all-migrations.sql` into Supabase Dashboard > SQL Editor and run it.
   - Or use the CLI: `npx supabase db push`

4. Run locally:
   ```bash
   npm run dev
   ```

## Deploy to Vercel

1. Push to GitHub.
2. Import in Vercel as a Vite project.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.
4. Deploy.

## Watchlist Alerts (GitHub Actions)

Price alerts run every 5 minutes via GitHub Actions and send Telegram notifications.

Add these secrets in **Settings > Secrets > Actions**:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## License

Private.
