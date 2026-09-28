-- Events: auto-upload the recorded group call to the owner's YouTube channel.
-- After Recall finalizes an event recording (recording_status = 'ready' with a
-- recording_url), a dedicated cron streams that video to YouTube (Public) and
-- stores the resulting video id + watch URL here. Kept as its own columns (not
-- folded into recording_*) so the upload is retryable and its status is visible
-- in the admin without touching the recording pipeline's own state machine.
--
-- Prod Supabase is applied BY HAND: paste this into the Supabase SQL editor
-- BEFORE deploying the code. Safe to re-run (IF NOT EXISTS).
--
-- Prereqs for the upload to actually run (one-time, separate from this SQL):
--   1. Enable "YouTube Data API v3" in the same Google Cloud project as the
--      GOOGLE_OAUTH_CLIENT_ID used for Meet.
--   2. Reconnect Google in the Scheduling admin so the new youtube.upload scope
--      is granted (the refresh token in call_config gains the scope).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS youtube_status      TEXT NOT NULL DEFAULT 'none',
  -- none|pending|uploading|uploaded|failed|skipped
  ADD COLUMN IF NOT EXISTS youtube_video_id    TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url         TEXT,
  ADD COLUMN IF NOT EXISTS youtube_error       TEXT,
  ADD COLUMN IF NOT EXISTS youtube_uploaded_at TIMESTAMPTZ;

-- The upload cron scans for events waiting to be pushed to YouTube.
CREATE INDEX IF NOT EXISTS idx_events_youtube_status ON events(youtube_status);
