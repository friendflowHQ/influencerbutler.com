-- Affiliate conversion funnel
-- Tracks auto-approved applications and the three conversion email sends
-- (1h / 3d / 5d after approval). The 5-day tier stores a unique Lemon Squeezy
-- discount code generated per-affiliate when the email fires.

ALTER TABLE affiliate_applications
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conversion_email_1h_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conversion_email_3d_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conversion_email_5d_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unique_discount_code_50 TEXT;

-- Let the cron find pending-for-long-enough apps quickly.
CREATE INDEX IF NOT EXISTS affiliate_applications_pending_created_idx
  ON affiliate_applications (created_at)
  WHERE status = 'pending';

-- And let it find approved apps needing follow-up emails.
CREATE INDEX IF NOT EXISTS affiliate_applications_approved_reviewed_idx
  ON affiliate_applications (reviewed_at)
  WHERE status = 'approved';
