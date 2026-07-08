-- Comp (free-code) grants: tracking + automation state for subscriptions that
-- were started with a 100%-off comp discount code.
--
-- The admin Comps page (/dashboard/admin/comps) derives the comp list live from
-- orders (a fully-discounted order = total 0 with a discount applied) joined to
-- subscriptions; this table exists only to (a) let the owner override the
-- duration when a legacy code does not encode it, and (b) give the comp-expiry
-- cron idempotent markers so it warns once and cancels once. A subscription
-- with no row here is still shown on the page - it just has no override and no
-- automation history yet.
--
-- NOTE: prod schema is migrated by hand. Paste this file into the Supabase SQL
-- editor before deploying the Comps code. If the order slips, nothing breaks:
-- the loader and cron treat a missing table as "no overrides / no markers" and
-- degrade to read-only.

CREATE TABLE IF NOT EXISTS comp_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The subscription this comp is attached to; one row per subscription.
  ls_subscription_id TEXT NOT NULL UNIQUE,
  user_id UUID,
  user_email TEXT,
  -- The discount code the comp was redeemed with (orders.discount_code).
  discount_code TEXT,
  -- Effective comp length in months. 'parsed' when derived from the code,
  -- 'manual' when the owner set it on the page (manual always wins).
  months INTEGER,
  months_source TEXT CHECK (months_source IN ('parsed', 'manual')),
  -- When the comp was issued (the comp order's created_at) and when the free
  -- window ends (issued_at + months).
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  -- Idempotent automation markers, stamped by the comp-expiry cron.
  warn7_sent_at TIMESTAMPTZ,
  warn1_sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comp_grants_expires_idx ON comp_grants (expires_at);
CREATE INDEX IF NOT EXISTS comp_grants_user_idx ON comp_grants (user_id);

-- Service-role only, same posture as admin_audit_log / webhook_events.
ALTER TABLE comp_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comp_grants_no_anon" ON comp_grants;
CREATE POLICY "comp_grants_no_anon" ON comp_grants
  FOR ALL USING (false) WITH CHECK (false);
