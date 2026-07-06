-- Prebuilt ASIN membership filters for the Chrome extension: "does this
-- product have a CC / SPCC campaign?" A daily cron reads the R2 catalogue,
-- builds a compact Bloom filter, and upserts one row per kind here. The
-- extension downloads the filter once a day and checks ASINs locally, so
-- there is zero per-pageview server cost.
--
-- NOTE: prod schema is applied manually - paste this file into the Supabase
-- SQL editor. Until it is applied, the build cron and the serve route respond
-- with migrationPending and the extension simply shows no campaign badges.
--
-- Service-role only (RLS enabled, zero policies). One row per kind; the cron
-- upserts on kind and skips the rebuild when version is unchanged.
CREATE TABLE IF NOT EXISTS extension_catalogue_filters (
  kind        TEXT PRIMARY KEY CHECK (kind IN ('cc','spcc')),
  version     TEXT NOT NULL,
  m_bits      INTEGER NOT NULL,
  k_hashes    INTEGER NOT NULL,
  asin_count  INTEGER NOT NULL,
  bits_base64 TEXT NOT NULL,
  built_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE extension_catalogue_filters ENABLE ROW LEVEL SECURITY;
