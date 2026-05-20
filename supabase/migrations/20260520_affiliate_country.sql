-- Affiliate country (ISO 3166-1 alpha-2)
--
-- Light analytics + tax-treaty hints. The actual tax form submission is
-- handled inside Lemon Squeezy's hosted affiliate portal — we do not collect
-- W-9 / W-8BEN / W-8BEN-E ourselves. See public/legal/affiliate-terms.html.

ALTER TABLE affiliate_applications
  ADD COLUMN IF NOT EXISTS country CHAR(2);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS country CHAR(2);

-- Used by the funnel cron + admin dashboards to slice approvals by region.
CREATE INDEX IF NOT EXISTS affiliate_applications_country_idx
  ON affiliate_applications (country)
  WHERE country IS NOT NULL;
