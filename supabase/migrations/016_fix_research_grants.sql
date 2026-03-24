-- Fix PostgREST schema cache for research_log
-- Run this in Supabase SQL Editor

-- Grant SELECT to authenticated role (required for PostgREST)
GRANT SELECT ON TABLE public.research_log TO authenticated;
GRANT SELECT ON TABLE public.system_constraints TO authenticated;

-- Grant sequence access (needed for BIGSERIAL)
GRANT USAGE, SELECT ON SEQUENCE public.research_log_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.system_constraints_id_seq TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
