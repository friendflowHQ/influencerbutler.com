-- Affiliates program schema
-- Adds affiliate fields to profiles and creates an affiliate_applications table.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_affiliate BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ls_affiliate_id TEXT NULL;

CREATE TABLE IF NOT EXISTS affiliate_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  website TEXT,
  social_handles JSONB NOT NULL DEFAULT '{}'::jsonb,
  audience_size TEXT,
  niche TEXT,
  promotion_strategy TEXT NOT NULL,
  agreed_to_terms BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS affiliate_applications_status_created_idx
  ON affiliate_applications (status, created_at DESC);

ALTER TABLE affiliate_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_app_select" ON affiliate_applications;
CREATE POLICY "own_app_select" ON affiliate_applications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_app_insert" ON affiliate_applications;
CREATE POLICY "own_app_insert" ON affiliate_applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_app_update_pending" ON affiliate_applications;
CREATE POLICY "own_app_update_pending" ON affiliate_applications
  FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');
