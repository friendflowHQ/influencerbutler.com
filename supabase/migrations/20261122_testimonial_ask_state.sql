-- Testimonial ask frequency control: lifetime cap + cooldown.
-- Apply by hand (prod migrations are manual). The app tolerates these columns
-- being absent: until applied, the cap and cooldown are simply not enforced.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS testimonial_ask_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS testimonial_last_asked_at TIMESTAMPTZ;

-- Backfill: anyone already emailed counts as one ask, dated from that email.
UPDATE subscriptions
   SET testimonial_ask_count = 1,
       testimonial_last_asked_at = testimonial_requested_at
 WHERE testimonial_requested_at IS NOT NULL
   AND testimonial_ask_count = 0;
