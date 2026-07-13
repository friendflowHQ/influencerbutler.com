-- Store the recipient's real name on the comp grant.
--
-- Until now the admin Comps page derived a display name from the discount code
-- (compNameFromCode). That is lossy: the code's <NAME> segment is uppercased,
-- stripped of non-alphanumerics, and capped at 20 chars, so "Liz Dean Daily
-- Deals Workspace 2" came back as "Lizdeandailydealswor". Persisting the name
-- the admin actually typed lets the list show it verbatim; the code-derived
-- name stays as the fallback for older/LS rows that have no stored name.
--
-- NOTE: prod schema is migrated by hand (see the header of
-- 20260711_comp_grants.sql). Paste this into the Supabase SQL editor before
-- deploying. Safe to run more than once.

ALTER TABLE comp_grants
  ADD COLUMN IF NOT EXISTS recipient_name TEXT;
