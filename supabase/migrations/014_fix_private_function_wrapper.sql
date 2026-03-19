-- Fix: "function private.upgrade_system_constraints() does not exist"
--
-- The function was moved to public schema in migration 012, but some queries
-- may still reference private.upgrade_system_constraints(). Create a thin
-- wrapper in the private schema that delegates to the public version.

-- Drop the old private function if it exists (should already be dropped from 012)
DROP FUNCTION IF EXISTS private.upgrade_system_constraints();

-- Create wrapper in private schema that calls the public version
CREATE OR REPLACE FUNCTION private.upgrade_system_constraints()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Delegate to the public schema version
    RETURN public.upgrade_system_constraints();
END;
$$;

-- Grant execute on the wrapper too
GRANT EXECUTE ON FUNCTION private.upgrade_system_constraints() TO authenticated;
GRANT EXECUTE ON FUNCTION private.upgrade_system_constraints() TO service_role;

-- Also ensure the public function grant is still in place
GRANT EXECUTE ON FUNCTION public.upgrade_system_constraints() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_system_constraints() TO service_role;

-- Reload schema cache to pick up both functions
NOTIFY pgrst, 'reload schema';
