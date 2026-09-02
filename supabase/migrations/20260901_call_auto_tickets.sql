-- Auto-file support tickets from recorded calls (follow-on to 20260802_call_scheduling).
-- When a call recording is finalized (transcript + AI notes ready), an LLM extracts
-- any concrete bugs the customer hit or explicit feature requests and files them into
-- the support queue automatically. These two columns make that idempotent: the
-- webhook and the hourly backstop cron both finalize a booking, and we must never
-- double-file. Prod Supabase is applied BY HAND (paste into the SQL editor BEFORE
-- deploying the code), same as the call-scheduling migration.
--
-- filed_ticket_ids: the fb-<uuid> ids returned by the feedback worker's /submit.
-- tickets_filed_at: set once, the moment auto-filing runs. NULL = not yet attempted.
ALTER TABLE call_bookings ADD COLUMN IF NOT EXISTS filed_ticket_ids TEXT[];
ALTER TABLE call_bookings ADD COLUMN IF NOT EXISTS tickets_filed_at TIMESTAMPTZ;
