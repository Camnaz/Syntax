-- Comprehensive fix for "Could not find the table 'public.research_log' in the schema cache"
-- This ensures proper grants and forces a complete schema cache refresh

-- 1. Ensure tables exist with proper structure (idempotent)
CREATE TABLE IF NOT EXISTS public.research_log (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id),
  query_text       TEXT NOT NULL DEFAULT '',
  response_summary TEXT,
  signal_type      TEXT NOT NULL DEFAULT 'general',
  model_used       TEXT NOT NULL DEFAULT 'unknown',
  tier             TEXT NOT NULL DEFAULT 'race',
  tokens_used      INTEGER NOT NULL DEFAULT 0,
  score            NUMERIC(4,3),
  sharpe           NUMERIC(6,3),
  drawdown         NUMERIC(6,3),
  latency_ms       INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.system_constraints (
  id             SERIAL PRIMARY KEY,
  constraint_key TEXT UNIQUE NOT NULL,
  constraint_val JSONB NOT NULL DEFAULT '{}',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enable RLS (idempotent)
ALTER TABLE public.research_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_constraints ENABLE ROW LEVEL SECURITY;

-- 3. Recreate policies to ensure they exist
DROP POLICY IF EXISTS "users_read_own_research" ON public.research_log;
CREATE POLICY "users_read_own_research" ON public.research_log
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "service_insert_research" ON public.research_log;
CREATE POLICY "service_insert_research" ON public.research_log
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_constraints" ON public.system_constraints;
CREATE POLICY "authenticated_read_constraints" ON public.system_constraints
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_write_constraints" ON public.system_constraints;
CREATE POLICY "service_write_constraints" ON public.system_constraints
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Grant SELECT to anon role as well (required for PostgREST to see the table)
-- PostgREST needs the table to be visible to the role making the request
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.research_log TO anon, authenticated;
GRANT SELECT ON TABLE public.system_constraints TO anon, authenticated;
GRANT ALL ON TABLE public.research_log TO service_role;
GRANT ALL ON TABLE public.system_constraints TO service_role;

-- 5. Grant sequence access
GRANT USAGE, SELECT ON SEQUENCE public.research_log_id_seq TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.system_constraints_id_seq TO anon, authenticated, service_role;

-- 6. Ensure functions are accessible
GRANT EXECUTE ON FUNCTION public.get_global_research_health() TO anon, authenticated;

-- 7. Fix private.upgrade_system_constraints() wrapper
DROP FUNCTION IF EXISTS private.upgrade_system_constraints();
CREATE OR REPLACE FUNCTION private.upgrade_system_constraints()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN public.upgrade_system_constraints();
END;
$$;
GRANT EXECUTE ON FUNCTION private.upgrade_system_constraints() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upgrade_system_constraints() TO authenticated, service_role;

-- 8. Force complete schema cache reload
-- Multiple notifies to ensure it propagates
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- 9. Log completion
SELECT 'Schema grants and policies updated successfully' AS status;
