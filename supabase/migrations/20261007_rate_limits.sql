-- Durable rate-limit counters for public endpoints (login-link, newsletter,
-- affiliate notify, ...). Used by src/lib/rate-limit.ts. Keys are SHA-256
-- hashed by the caller, so no email or IP is stored in the clear.
--
-- NOT applied automatically: run by hand in the Supabase SQL editor. Until it
-- is applied the app falls back to a per-instance in-memory limiter.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Service role only: RLS on with no policies denies anon and authenticated.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key TEXT, p_window_seconds INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_count  INTEGER;
BEGIN
  IF p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    p_window_seconds := 60;
  END IF;

  v_window := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.rate_limits AS r (key, window_start, count)
  VALUES (p_key, v_window, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = r.count + 1
  RETURNING r.count INTO v_count;

  -- Opportunistic cleanup so the table stays small.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE window_start < now() - INTERVAL '2 days';
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INTEGER) TO service_role;
