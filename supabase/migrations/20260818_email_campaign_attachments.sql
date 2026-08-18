-- Attachments + inline images for email campaigns.
--
-- Composed in the admin Emails dashboard, stored on the campaign row as base64
-- JSON so the background send cron can include them on every recipient's email.
-- `attachments` are downloadable files; `inline_images` embed in the HTML body
-- (referenced via cid:). Each element is { filename, content (base64),
-- contentType? }. Payloads are capped app-side (~3 MB total per campaign).

alter table email_campaigns
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists inline_images jsonb not null default '[]'::jsonb;
