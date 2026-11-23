-- One-off "please prepare for your call" notice (src/app/api/cron/call-prep-notice).
-- Stamps each booking once emailed so a re-run never sends twice.
-- Hand-applied in the Supabase SQL editor (project khutiiojhafblabtixpp), like every migration here.
ALTER TABLE call_bookings ADD COLUMN IF NOT EXISTS prep_notice_sent_at TIMESTAMPTZ;
