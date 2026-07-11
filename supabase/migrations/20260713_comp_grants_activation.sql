-- Track whether a comped user has actually activated / is using their in-house
-- license. The site's /api/licenses/inhouse-validate endpoint (called by the
-- desktop licensing worker on every launch + heartbeat) stamps these: activated_at
-- the first time the key is seen, last_seen_at on every check. The Comps page then
-- shows "Active" vs "Not activated" and how recently the app checked in.
--
-- Only in-house comps flow through that endpoint, so these stay null for
-- Lemon-Squeezy-originated comps (whose activations live in LS).
--
-- NOTE: prod schema is migrated by hand. Paste this into the Supabase SQL editor.

ALTER TABLE comp_grants ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE comp_grants ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
