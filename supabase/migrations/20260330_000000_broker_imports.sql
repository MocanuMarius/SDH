-- ============================================================================
-- Broker Import Tracking & Deduplication
--
-- This migration creates tables and columns to track broker statement imports,
-- enabling:
-- 1. Audit trail (who imported what statement, when)
-- 2. Deduplication (file_hash prevents re-importing same statement)
-- 3. Re-import capability (parsed_data cached for reproducibility)
-- 4. Entry/Outcome linkage (trace entry back to original broker statement)
--
-- Tables created:
-- - broker_imports: Track each statement file imported
--
-- Columns added to existing tables:
-- - entries: broker_import_id, broker_trade_id, broker_name, is_auto_imported
-- - outcomes: linked_dividend_id (for income tracking)
-- ============================================================================

-- ============================================================================
-- Create broker_imports table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.broker_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User who performed the import
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Broker and statement type identification
  broker_name VARCHAR(50) NOT NULL,
  statement_type VARCHAR(50) NOT NULL,

  -- File tracking for deduplication
  file_name VARCHAR(255) NOT NULL,
  file_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA256(file_content)

  -- Import timing
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Statistics from this import
  trade_count INT DEFAULT 0,
  dividend_count INT DEFAULT 0,

  -- Import result
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, success, partial, failed
  error_message TEXT,

  -- Complete parsed statement data (stored as JSON for audit trail)
  -- Allows re-parsing, searching, and reproducibility
  parsed_data JSONB NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for common queries
CREATE INDEX idx_broker_imports_user_id ON public.broker_imports(user_id);
CREATE INDEX idx_broker_imports_file_hash ON public.broker_imports(file_hash);
CREATE INDEX idx_broker_imports_status ON public.broker_imports(status);
CREATE INDEX idx_broker_imports_created_at ON public.broker_imports(created_at DESC);

-- ============================================================================
-- Add tracking columns to entries table
-- ============================================================================
-- Link entries to the broker import they came from (for audit trail)
ALTER TABLE public.entries
ADD COLUMN IF NOT EXISTS broker_import_id UUID REFERENCES public.broker_imports(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS broker_trade_id VARCHAR(100),   -- Unique ID from broker (IBKR tradeID)
ADD COLUMN IF NOT EXISTS broker_name VARCHAR(50),        -- 'IBKR', 'XTB', etc.
ADD COLUMN IF NOT EXISTS is_auto_imported BOOLEAN DEFAULT false; -- true if created via import

-- Create indexes for broker tracking
CREATE INDEX IF NOT EXISTS idx_entries_broker_import ON public.entries(broker_import_id);
CREATE INDEX IF NOT EXISTS idx_entries_broker_trade_id ON public.entries(broker_trade_id, broker_name);
CREATE INDEX IF NOT EXISTS idx_entries_is_auto_imported ON public.entries(is_auto_imported);

-- ============================================================================
-- Add tracking columns to outcomes table
-- ============================================================================
-- Link outcomes to dividend records from imports (for income tracking)
ALTER TABLE public.outcomes
ADD COLUMN IF NOT EXISTS linked_dividend_id UUID REFERENCES public.broker_imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outcomes_linked_dividend ON public.outcomes(linked_dividend_id);

-- ============================================================================
-- Add RLS policies for broker_imports
-- ============================================================================
ALTER TABLE public.broker_imports ENABLE ROW LEVEL SECURITY;

-- Allow users to see only their own imports
CREATE POLICY "Users can view their own broker imports" ON public.broker_imports
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to create imports for themselves
CREATE POLICY "Users can create their own imports" ON public.broker_imports
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users cannot delete imports (immutable audit trail)
-- Deletion policy is intentionally NOT included for data integrity

-- ============================================================================
-- Add RLS policy updates for entries
-- ============================================================================
-- The existing policies on entries should still apply, but we need to ensure
-- that the new broker tracking columns don't bypass any security
-- (No changes needed - existing RLS policies remain in effect)

-- ============================================================================
-- Migration validation
-- ============================================================================
-- Verify tables and columns were created
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('broker_imports');
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'entries' AND column_name LIKE 'broker%';
