-- Tracks when the post-payment welcome magic-link email was last sent to a
-- user. Used by src/app/api/webhooks/lemonsqueezy/route.ts to avoid dispatching
-- duplicate welcome emails when LS retries a webhook, while still sending the
-- link to users whose profile row pre-existed (from affiliate applications or
-- earlier signup attempts) — the payment-first flow needs a sign-in link
-- regardless of prior profile state.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ NULL;
