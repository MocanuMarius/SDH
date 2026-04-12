-- Add 'cover' to action_type_enum so closing-short trades can be stored.
-- The TypeScript ACTION_TYPES constant already includes it; the DB enum was missing it,
-- causing IBKR seeding to fail on short-cover events.
-- Postgres requires ALTER TYPE to add values; use IF NOT EXISTS for idempotency.

ALTER TYPE public.action_type_enum ADD VALUE IF NOT EXISTS 'cover';
