-- Move upgrade_system_constraints() from private to public schema.
-- The private schema is not accessible from the Supabase SQL editor by default.

-- Drop the private version if it was created
DROP FUNCTION IF EXISTS private.upgrade_system_constraints();

-- Re-create in public schema with SECURITY DEFINER so it can read research_log
-- across all users and write to system_constraints.
-- Call with: SELECT * FROM public.upgrade_system_constraints();
CREATE OR REPLACE FUNCTION public.upgrade_system_constraints()
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

-- Allow authenticated users to call it (read-only effect from their perspective)
GRANT EXECUTE ON FUNCTION public.upgrade_system_constraints() TO authenticated;
