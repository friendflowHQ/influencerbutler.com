-- Manual ordering for homepage testimonials.
--
-- Adds a nullable display_order to testimonials so the team can arrange the
-- featured reviews in any order from the admin dashboard (Testimonials >
-- "Featured order"). The public feed sorts featured, approved rows by
-- display_order ascending, with any not-yet-ordered review falling back to most
-- recently approved (NULLS LAST).
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Apply this in the
-- Supabase SQL editor BEFORE deploying the code that selects display_order. This
-- migration is apply-first, not best-effort: the code selects/orders by
-- display_order, so if the column is missing the feed query errors and
-- getPublicTestimonials() returns empty, which HIDES the homepage testimonials
-- section. Once the column exists, all-null display_order sorts identically to
-- the old approved_at-only order, so there is no visible change until the team
-- reorders.

ALTER TABLE testimonials
  ADD COLUMN IF NOT EXISTS display_order INT;

-- The public feed query: featured + approved rows, in display order first, then
-- most recently approved. Matches getPublicTestimonials()/listFeaturedTestimonials().
CREATE INDEX IF NOT EXISTS testimonials_featured_order_idx
  ON testimonials (display_order ASC NULLS LAST, approved_at DESC)
  WHERE status = 'approved' AND featured = true;
