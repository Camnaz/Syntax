-- SYNTAX Research Engine v1
-- Adds research_log, system_constraints, and helper functions.
-- Existing tables (001–010) are untouched.

-- ── research_log — append-only query analytics ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.research_log (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id),
  query_text       TEXT NOT NULL DEFAULT '',
  response_summary TEXT,
  signal_type      TEXT NOT NULL DEFAULT 'general',
  model_used       TEXT NOT NULL DEFAULT 'unknown',
  tier             TEXT NOT NULL DEFAULT 'race',
  tokens_used      INTEGER NOT NULL DEFAULT 0,
  score            NUMERIC(4,3),      -- overall quality 0.000–1.000
  sharpe           NUMERIC(6,3),      -- portfolio Sharpe at query time
  drawdown         NUMERIC(6,3),      -- portfolio drawdown % at query time
  latency_ms       INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_log_user    ON public.research_log(user_id);
CREATE INDEX IF NOT EXISTS idx_research_log_signal  ON public.research_log(signal_type);
CREATE INDEX IF NOT EXISTS idx_research_log_created ON public.research_log(created_at DESC);

ALTER TABLE public.research_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read_own_research" ON public.research_log;
CREATE POLICY "users_read_own_research" ON public.research_log
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "service_insert_research" ON public.research_log;
CREATE POLICY "service_insert_research" ON public.research_log
  FOR INSERT TO service_role WITH CHECK (true);

-- ── system_constraints — constraint engine output (readable by all auth users) ──
CREATE TABLE IF NOT EXISTS public.system_constraints (
  id             SERIAL PRIMARY KEY,
  constraint_key TEXT UNIQUE NOT NULL,
  constraint_val JSONB NOT NULL DEFAULT '{}',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.system_constraints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_constraints" ON public.system_constraints;
CREATE POLICY "authenticated_read_constraints" ON public.system_constraints
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "service_write_constraints" ON public.system_constraints;
CREATE POLICY "service_write_constraints" ON public.system_constraints
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── get_global_research_health() — aggregate stats for the Research tab ───────
CREATE OR REPLACE FUNCTION public.get_global_research_health()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'total_queries', COUNT(*),
    'queries_24h',   COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'),
    'unique_users',  COUNT(DISTINCT user_id),
    'avg_score',     ROUND(AVG(score)::numeric, 3),
    'top_signals',   (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT signal_type AS signal, COUNT(*) AS count
        FROM public.research_log
        GROUP BY signal_type
        ORDER BY count DESC
        LIMIT 8
      ) t
    )
  )
  FROM public.research_log;
$$;

-- ── log_research() — called from Rust after each verify ──────────────────────
CREATE OR REPLACE FUNCTION public.log_research(
  p_user_id     UUID,
  p_query_text  TEXT,
  p_response    TEXT    DEFAULT NULL,
  p_signal_type TEXT    DEFAULT 'general',
  p_model       TEXT    DEFAULT 'unknown',
  p_tier        TEXT    DEFAULT 'race',
  p_tokens      INTEGER DEFAULT 0,
  p_score       NUMERIC DEFAULT NULL,
  p_sharpe      NUMERIC DEFAULT NULL,
  p_drawdown    NUMERIC DEFAULT NULL,
  p_latency_ms  INTEGER DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.research_log
    (user_id, query_text, response_summary, signal_type, model_used, tier,
     tokens_used, score, sharpe, drawdown, latency_ms)
  VALUES
    (p_user_id, p_query_text, p_response, p_signal_type, p_model, p_tier,
     p_tokens, p_score, p_sharpe, p_drawdown, p_latency_ms);
END;
$$;

-- ── private.upgrade_system_constraints() — reads research_log, no LLM ───────
-- Run: SELECT * FROM private.upgrade_system_constraints();
-- Returns JSON describing what changed.
CREATE OR REPLACE FUNCTION private.upgrade_system_constraints()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_changes JSONB := '[]'::JSONB;
  v_rec     RECORD;
BEGIN
  -- Aggregate by signal type (30-day window)
  FOR v_rec IN
    SELECT
      signal_type,
      COUNT(*)                             AS query_count,
      ROUND(AVG(score)::numeric,    3)     AS avg_score,
      ROUND(AVG(sharpe)::numeric,   3)     AS avg_sharpe,
      ROUND(AVG(tokens_used)::numeric, 0)  AS avg_tokens,
      MAX(created_at)                      AS last_seen
    FROM public.research_log
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY signal_type
  LOOP
    INSERT INTO public.system_constraints (constraint_key, constraint_val, updated_at)
    VALUES (
      'signal_' || v_rec.signal_type,
      jsonb_build_object(
        'query_count', v_rec.query_count,
        'avg_score',   v_rec.avg_score,
        'avg_sharpe',  v_rec.avg_sharpe,
        'avg_tokens',  v_rec.avg_tokens,
        'last_seen',   v_rec.last_seen
      ),
      NOW()
    )
    ON CONFLICT (constraint_key) DO UPDATE
      SET constraint_val = EXCLUDED.constraint_val,
          updated_at     = NOW();

    v_changes := v_changes || jsonb_build_array(
      jsonb_build_object('key', 'signal_' || v_rec.signal_type, 'count', v_rec.query_count)
    );
  END LOOP;

  -- Aggregate by model (30-day window)
  FOR v_rec IN
    SELECT
      model_used,
      COUNT(*)                              AS uses,
      ROUND(AVG(latency_ms)::numeric, 0)    AS avg_latency,
      ROUND(AVG(score)::numeric,      3)    AS avg_score
    FROM public.research_log
    WHERE created_at > NOW() - INTERVAL '30 days'
      AND latency_ms IS NOT NULL
    GROUP BY model_used
  LOOP
    INSERT INTO public.system_constraints (constraint_key, constraint_val, updated_at)
    VALUES (
      'model_' || v_rec.model_used,
      jsonb_build_object(
        'uses',        v_rec.uses,
        'avg_latency', v_rec.avg_latency,
        'avg_score',   v_rec.avg_score
      ),
      NOW()
    )
    ON CONFLICT (constraint_key) DO UPDATE
      SET constraint_val = EXCLUDED.constraint_val,
          updated_at     = NOW();
  END LOOP;

  RETURN jsonb_build_object('changes', v_changes, 'upgraded_at', NOW());
END;
$$;
