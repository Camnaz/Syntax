-- Grant SELECT to anon role as well, in case user is in a transitional auth state
GRANT SELECT ON TABLE public.research_log TO anon;
GRANT SELECT ON TABLE public.system_constraints TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.research_log_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.system_constraints_id_seq TO anon;

-- Ensure authenticated role has full permissions again
GRANT SELECT ON TABLE public.research_log TO authenticated;
GRANT SELECT ON TABLE public.system_constraints TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.research_log_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.system_constraints_id_seq TO authenticated;

-- Reload PostgREST cache
NOTIFY pgrst, 'reload schema';
