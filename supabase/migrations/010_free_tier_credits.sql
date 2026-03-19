-- SYNTAX v2.1 — Free Tier & Credits System
-- Extends user_subscriptions with credit-based usage tracking

-- ── Extend user_subscriptions with credit/free-tier columns ──────────────
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS free_queries_used  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_balance     INTEGER NOT NULL DEFAULT 0
    CHECK (credit_balance >= 0),
  ADD COLUMN IF NOT EXISTS credits_updated_at TIMESTAMPTZ;

-- ── query_log — append-only usage history ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.query_log (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  query_tier   TEXT NOT NULL,
  model_used   TEXT NOT NULL,
  tokens_used  INTEGER NOT NULL DEFAULT 0,
  cost_credits INTEGER NOT NULL DEFAULT 0,
  was_free     BOOLEAN NOT NULL DEFAULT FALSE,
  rust_valid   BOOLEAN NOT NULL DEFAULT TRUE,
  latency_ms   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_query_log_user ON public.query_log(user_id);
ALTER TABLE public.query_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read_own_log" ON public.query_log;
CREATE POLICY "users_read_own_log" ON public.query_log
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "service_insert_log" ON public.query_log;
CREATE POLICY "service_insert_log" ON public.query_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ── Auto-create subscription row on signup ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_subscription_row()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, free_queries_used, credit_balance)
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ensure_sub_on_signup ON auth.users;
CREATE TRIGGER ensure_sub_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.ensure_subscription_row();

-- ── consume_query() — atomic gate called from Rust ────────────────────────
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.consume_query(
  p_user_id    UUID,
  p_credits    INTEGER DEFAULT 1,
  p_tier       TEXT    DEFAULT 'race',
  p_model      TEXT    DEFAULT 'unknown',
  p_tokens     INTEGER DEFAULT 0,
  p_latency_ms INTEGER DEFAULT 0,
  p_rust_valid BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance        INTEGER;
  v_free_used      INTEGER;
  v_free_remaining INTEGER;
  FREE_LIMIT       CONSTANT INTEGER := 3;
BEGIN
  SELECT credit_balance, free_queries_used
  INTO   v_balance, v_free_used
  FROM   public.user_subscriptions
  WHERE  user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_subscriptions (user_id, credit_balance, free_queries_used)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    v_balance   := 0;
    v_free_used := 0;
  END IF;

  v_free_remaining := GREATEST(0, FREE_LIMIT - v_free_used);

  -- Free query
  IF v_free_remaining > 0 THEN
    UPDATE public.user_subscriptions
    SET free_queries_used  = free_queries_used + 1,
        credits_updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO public.query_log
      (user_id, query_tier, model_used, tokens_used, cost_credits, was_free, rust_valid, latency_ms)
    VALUES (p_user_id, p_tier, p_model, p_tokens, 0, TRUE, p_rust_valid, p_latency_ms);

    RETURN jsonb_build_object(
      'ok', TRUE, 'reason', 'free_query',
      'free_remaining', v_free_remaining - 1,
      'balance', v_balance
    );

  -- Paid credits
  ELSIF v_balance >= p_credits THEN
    UPDATE public.user_subscriptions
    SET credit_balance     = credit_balance - p_credits,
        credits_updated_at = NOW()
    WHERE user_id = p_user_id;

    INSERT INTO public.query_log
      (user_id, query_tier, model_used, tokens_used, cost_credits, was_free, rust_valid, latency_ms)
    VALUES (p_user_id, p_tier, p_model, p_tokens, p_credits, FALSE, p_rust_valid, p_latency_ms);

    RETURN jsonb_build_object(
      'ok', TRUE, 'reason', 'credits_deducted',
      'free_remaining', 0,
      'balance', v_balance - p_credits
    );

  -- No entitlement
  ELSE
    RETURN jsonb_build_object(
      'ok', FALSE, 'reason', 'payment_required',
      'free_remaining', 0,
      'balance', v_balance
    );
  END IF;
END;
$$;
