-- Self-serve "downgrade to Beginner, effective at next renewal": records a
-- pending plan change so the switch lands at the subscription's next renewal
-- instead of an immediate prorated swap. Set by /api/subscription/schedule-downgrade
-- and applied (variant swapped, columns cleared) by the
-- /api/cron/apply-scheduled-downgrades cron once scheduled_plan_effective_at passes.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS scheduled_plan TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS scheduled_plan_effective_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS scheduled_plan_applied_at TIMESTAMPTZ;
