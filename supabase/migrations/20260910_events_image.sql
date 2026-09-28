-- Auto-generated branded image for each event.
-- Stores the public URL of the event's cover image (an AI backdrop in the blog
-- hero style with the title, date, and time overlaid), produced by
-- src/lib/event-image.ts and hosted in the Supabase Storage bucket
-- "event-images". Null until the image has been generated; the feature degrades
-- to "no image" while this column is absent.
alter table events add column if not exists image_url text;
