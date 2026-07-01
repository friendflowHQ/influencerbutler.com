-- Testimonial collection & management.
--
-- One table plus a few subscription lifecycle columns power the whole flow:
--
--   testimonials : customer-submitted reviews (star rating + quote + optional
--                  photo). The in-app form writes rows here; the admin dashboard
--                  moderates them; the marketing site reads approved ones through
--                  a service-role feed route (public-safe fields only).
--   subscriptions.testimonial_* : lifecycle stamps so the day-45 "leave a
--                  testimonial" ask (banner + email) is targeted and idempotent,
--                  mirroring the existing pro_email_*_sent_at / trial_* pattern.
--   app_config('testimonials') : moderation config (auto-approve on/off, the
--                  rating threshold that auto-publishes, feed size, feed on/off).
--
-- NOTE: prod Supabase is applied by hand and lags this folder. Paste this into
-- the Supabase SQL editor BEFORE deploying the code that reads/writes these.
-- Writes are best-effort (never throw), so a missing table only means the
-- feature stays inert until this is applied. The storage bucket at the bottom
-- must be created too (Storage > New bucket, or the SQL block provided).

CREATE TABLE IF NOT EXISTS testimonials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email          TEXT,
  author_name    TEXT NOT NULL,
  author_role    TEXT,
  plan_name      TEXT,
  rating         INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body           TEXT NOT NULL,
  photo_url      TEXT,
  avatar_url     TEXT,
  consent        BOOLEAN NOT NULL DEFAULT true,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'hidden')),
  auto_approved  BOOLEAN NOT NULL DEFAULT false,
  featured       BOOLEAN NOT NULL DEFAULT false,
  team_response  TEXT,
  responded_at   TIMESTAMPTZ,
  responded_by   TEXT,
  source         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at    TIMESTAMPTZ
);

-- The admin queue query: newest-first within a status filter.
CREATE INDEX IF NOT EXISTS testimonials_status_created_at_idx
  ON testimonials (status, created_at DESC);

-- The public feed query: approved rows, featured first, then newest.
CREATE INDEX IF NOT EXISTS testimonials_public_idx
  ON testimonials (featured DESC, approved_at DESC)
  WHERE status = 'approved';

-- Service-role only. The in-app submit route and the admin dashboard both go
-- through server routes using the service-role key; the public marketing feed
-- is a service-role route that returns only non-identifying fields. No anon or
-- authenticated browser client touches this table directly.
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

-- Lifecycle stamps on subscriptions for the day-45 ask. Nullable, no backfill:
-- an existing subscriber simply becomes eligible once they cross day 45.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS testimonial_requested_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS testimonial_submitted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS testimonial_banner_dismissed_at TIMESTAMPTZ;

-- Default moderation config. auto_approve_min_rating = 4 means 4 and 5 star
-- reviews publish instantly; anything lower is held for review. ON CONFLICT
-- keeps whatever an admin has already set if this migration is re-run.
INSERT INTO app_config (key, value)
VALUES (
  'testimonials',
  '{"enabled": true, "auto_approve": true, "auto_approve_min_rating": 4, "public_max_count": 12}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Public bucket for submitted testimonial photos. Mirrors the avatars bucket.
-- (Run once; safe to re-run.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('testimonials', 'testimonials', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own testimonial photo (path prefixed
-- with their user id, e.g. "<uid>/photo.webp"), and allow public read.
DROP POLICY IF EXISTS "testimonials_photo_public_read" ON storage.objects;
CREATE POLICY "testimonials_photo_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'testimonials');

DROP POLICY IF EXISTS "testimonials_photo_owner_write" ON storage.objects;
CREATE POLICY "testimonials_photo_owner_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'testimonials'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
