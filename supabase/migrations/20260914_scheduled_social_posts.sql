-- Scheduled social posts: the backend queue behind the "click an image, schedule
-- a post" flow in the Chrome extension.
--
-- A creator clicks an image on any web page (a retailer grid, Instagram,
-- Pinterest, a blog) and schedules it to post through the desktop app's Social
-- Posting Butler, choosing a caption (optionally AI-drafted) and when/how often
-- to publish. The extension writes one row here (Bearer license key), and the
-- desktop app polls GET /api/desktop/social-queue, mirrors each row into its own
-- local Social Posting Butler library (which owns the scheduler daemon, the
-- publish pipeline and the calendar), and reports status back. The backend row is
-- the source of truth so a post scheduled while the desktop is closed is safely
-- queued and fires when the desktop next runs.
--
-- Storage of the image bytes: the default path carries only image_url (a remote
-- source URL the desktop downloads server-side). For sources the desktop cannot
-- fetch (e.g. Instagram's CDN blocks hotlinking), the extension uploads the bytes
-- to the public Storage bucket `social-post-images` and sets image_path instead.
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase SQL
-- editor. Until it is applied, the social-posts and social-queue routes soft-fail
-- with { migrationPending: true } instead of a hard 500.
--
-- Service-role only (RLS enabled, zero policies), same as the extension_* tables:
-- every read/write goes through createAdminClient() after the route has
-- authenticated the caller by license key (or, for the GET list, session cookie).

CREATE TABLE IF NOT EXISTS scheduled_social_posts (
  id                    UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Content.
  title                 TEXT,                 -- the creator's own label for the post
  caption               TEXT,
  link                  TEXT,                 -- optional link to include
  link_in_first_comment BOOLEAN NOT NULL DEFAULT false,
  first_comment_text    TEXT,

  -- Image. Exactly one source is used: 'url' (image_url set, desktop downloads),
  -- 'upload' (image_path set, bytes already in the social-post-images bucket), or
  -- 'none' (a text-only post).
  image_source          TEXT NOT NULL DEFAULT 'url', -- 'url' | 'upload' | 'none'
  image_url             TEXT,                 -- remote source URL to download
  image_path            TEXT,                 -- Storage path when bytes were uploaded

  -- Destinations. NULL means "use the creator's enabled destinations" (the
  -- desktop resolves the actual set), matching the desktop library model. A set
  -- value is a list of platform/destination keys the creator picked.
  destinations          TEXT[],

  -- Schedule. 'once' fires at scheduled_at; 'evergreen' recurs per `schedule`
  -- (an interval or weekly cadence blob mirroring the desktop's shape).
  mode                  TEXT NOT NULL DEFAULT 'once', -- 'once' | 'evergreen'
  scheduled_at          TIMESTAMPTZ,
  schedule              JSONB,

  -- Lifecycle. pending -> claimed (a desktop pulled it) -> posted, or canceled
  -- (by the creator before it was claimed) / failed (desktop could not publish).
  status                TEXT NOT NULL DEFAULT 'pending',
  claimed_at            TIMESTAMPTZ,
  posted_at             TIMESTAMPTZ,
  error                 TEXT,

  -- Provenance.
  source                TEXT NOT NULL DEFAULT 'extension', -- 'extension' | 'web' | 'desktop'
  page_url              TEXT,                 -- where the image was found

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The creator's own list (mini calendar / upcoming view), newest first.
CREATE INDEX IF NOT EXISTS scheduled_social_posts_user_created_idx
  ON scheduled_social_posts (user_id, created_at DESC);

-- The desktop claim query: pending rows for one user, oldest schedule first.
CREATE INDEX IF NOT EXISTS scheduled_social_posts_status_scheduled_idx
  ON scheduled_social_posts (status, scheduled_at);

ALTER TABLE scheduled_social_posts ENABLE ROW LEVEL SECURITY;
