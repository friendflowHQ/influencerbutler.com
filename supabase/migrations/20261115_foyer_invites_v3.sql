-- Foyer page pilot v3: the creator's own posts that are on sale today or have
-- an open Creator Connections campaign, instead of a 0-100 score.
--
-- opportunities = {posts:[{postUrl, thumbUrl, kind, title, asin, deal?, campaign?,
-- perSale:{baseRatePct, base, campaign}, caption}], counts:{deals, campaigns, both},
-- postsRead, dealsSnapshotAt, readAt}, written by scripts/outreach/build-invite.js
-- in the app repo. The page shows every on-sale post; campaign posts (labelled for
-- Gold and Platinum creators) show the first 3 and the rest unlock on claim.
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor AFTER 20261112_foyer_invites_v2.sql. Idempotent.

ALTER TABLE foyer_invites ADD COLUMN IF NOT EXISTS opportunities JSONB;
