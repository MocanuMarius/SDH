-- R10: close the loop on passed ideas by forcing a retrospective review after
-- a waiting period. Adds four columns to `passed`:
--
--   follow_up_date : when to prompt for review (default = passed_date + 3 months)
--   review_status  : 'correct' | 'should_have_bought' | 'inconclusive' | NULL
--   reviewed_at    : timestamp of the user's review
--   review_notes   : short text captured at review time
--
-- Back-fill: every existing row gets a follow_up_date derived from its
-- passed_date. Rows whose follow_up_date is in the past become immediately
-- due for review in the Activity drawer.

ALTER TABLE public.passed
  ADD COLUMN IF NOT EXISTS follow_up_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS review_notes text DEFAULT NULL;

ALTER TABLE public.passed
  DROP CONSTRAINT IF EXISTS passed_review_status_check;

ALTER TABLE public.passed
  ADD CONSTRAINT passed_review_status_check
    CHECK (review_status IS NULL OR review_status IN ('correct', 'should_have_bought', 'inconclusive'));

-- Back-fill follow_up_date for any rows where it's null: 3 months after passed_date.
UPDATE public.passed
SET follow_up_date = passed_date + INTERVAL '3 months'
WHERE follow_up_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_passed_follow_up_date ON public.passed(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_passed_review_status ON public.passed(review_status);

COMMENT ON COLUMN public.passed.follow_up_date IS 'R10: date at which the Activity drawer prompts the user to score their rejection.';
COMMENT ON COLUMN public.passed.review_status IS 'R10: correct | should_have_bought | inconclusive. NULL means the review has not happened yet.';
COMMENT ON COLUMN public.passed.reviewed_at IS 'R10: when the user completed the retrospective review.';
COMMENT ON COLUMN public.passed.review_notes IS 'R10: optional free-form note captured at review time.';
