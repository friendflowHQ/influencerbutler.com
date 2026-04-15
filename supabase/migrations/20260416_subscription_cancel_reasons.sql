-- Stores why a user cancelled (or was offered retention) for churn analysis.
-- Rows are inserted from server routes using the service role key; users can
-- read their own rows via RLS.

CREATE TABLE IF NOT EXISTS public.subscription_cancel_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id text,
  reason text NOT NULL,
  feedback text,
  offer_shown boolean NOT NULL DEFAULT false,
  offer_accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_cancel_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cancel_reasons_select_own" ON public.subscription_cancel_reasons;
CREATE POLICY "cancel_reasons_select_own" ON public.subscription_cancel_reasons
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS subscription_cancel_reasons_user_id_idx
  ON public.subscription_cancel_reasons(user_id);
CREATE INDEX IF NOT EXISTS subscription_cancel_reasons_created_at_idx
  ON public.subscription_cancel_reasons(created_at DESC);
