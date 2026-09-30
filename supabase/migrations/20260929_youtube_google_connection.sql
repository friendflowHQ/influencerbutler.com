-- Separate Google connection for YouTube uploads (events), distinct from the
-- scheduling/calls Google account (Meet + Calendar). The calls account lives in
-- call_config.google_refresh_token / google_calendar_email; these two columns
-- hold the dedicated YouTube channel account that event recordings publish to.
-- Deny-all RLS is inherited from call_config (service-role access only).
ALTER TABLE call_config
  ADD COLUMN IF NOT EXISTS youtube_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS youtube_account_email TEXT;
