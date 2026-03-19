-- Fix: "Could not find the table 'public.research_log' in the schema cache"
--
-- PostgREST needs an explicit GRANT SELECT on a table (in addition to RLS policies)
-- before it will expose the table via the REST API.  RLS policies alone are not enough.
-- After granting, we NOTIFY pgrst to reload the schema cache immediately without a restart.

-- ── Table-level grants ────────────────────────────────────────────────────────

GRANT SELECT ON TABLE public.research_log       TO authenticated;
GRANT SELECT ON TABLE public.system_constraints TO authenticated;

-- Service role can already do everything, but be explicit for clarity
GRANT ALL    ON TABLE public.research_log       TO service_role;
GRANT ALL    ON TABLE public.system_constraints TO service_role;

-- Sequence grants (needed for BIGSERIAL / SERIAL columns)
GRANT USAGE, SELECT ON SEQUENCE public.research_log_id_seq       TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.system_constraints_id_seq TO authenticated;

-- ── Reload PostgREST schema cache ─────────────────────────────────────────────
-- This fires a pg_notify event that PostgREST listens for.
-- It is safe to run multiple times; no-op if PostgREST is not connected.
NOTIFY pgrst, 'reload schema';
