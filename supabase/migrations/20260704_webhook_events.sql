-- Webhook delivery log for the Lemon Squeezy webhook.
--
-- Every verified delivery gets one row (processed / error / skipped), so a
-- failing handler is visible on /dashboard/admin/webhooks within minutes
-- instead of surfacing days later as a support ticket. This is a delivery
-- log, not an entity log: LS re-sends produce multiple rows per record_id,
-- which is what you want when debugging "did order X ever land".
--
-- Rows older than WEBHOOK_EVENTS_RETENTION_DAYS (default 60) are pruned by
-- the affiliate-funnel cron.
--
-- NOTE: prod schema is migrated by hand. Paste this file into the Supabase
-- SQL editor BEFORE deploying the logging code. If the order slips, nothing
-- breaks: logWebhookEvent swallows the missing-table error and event
-- processing continues unlogged.

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'lemonsqueezy',
  event_name TEXT,
  -- payload data.id (LS sends no dedicated delivery id in the body)
  record_id TEXT,
  -- custom_data.supabase_user_id or the payload email, for support lookups
  user_hint TEXT,
  status TEXT NOT NULL CHECK (status IN ('processed', 'error', 'skipped')),
  error_message TEXT,
  duration_ms INTEGER,
  -- full payload with license keys redacted
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_events_created_idx
  ON webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_status_created_idx
  ON webhook_events (status, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_record_idx
  ON webhook_events (record_id);

-- Service-role only, same posture as admin_audit_log.
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webhook_events_no_anon" ON webhook_events;
CREATE POLICY "webhook_events_no_anon" ON webhook_events
  FOR ALL USING (false) WITH CHECK (false);
