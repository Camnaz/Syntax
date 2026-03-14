-- SYNTAX v2.1 — Cost-Based Usage Protection
-- Tracks LLM costs per user to ensure margin safety across all tiers.
--
-- Tier cost ceilings (≥60% gross margin):
--   Observer (free):       50 cents  — 3 verifications max, absorb as CAC
--   Operator ($29/mo):   1000 cents  — 65.5% margin
--   Sovereign ($99/mo):  3500 cents  — 64.6% margin
--   Institutional ($499): 17500 cents — 64.9% margin

ALTER TABLE user_subscriptions
    ADD COLUMN IF NOT EXISTS monthly_cost_cents INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cost_limit_cents INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS last_cost_reset TIMESTAMPTZ DEFAULT NOW();

-- Set cost ceilings for existing rows based on current tier
UPDATE user_subscriptions SET cost_limit_cents = 50    WHERE tier = 'observer';
UPDATE user_subscriptions SET cost_limit_cents = 1000  WHERE tier = 'operator';
UPDATE user_subscriptions SET cost_limit_cents = 3500  WHERE tier = 'sovereign';
UPDATE user_subscriptions SET cost_limit_cents = 17500 WHERE tier = 'institutional';

-- Function: check cost ceiling before allowing a verification
-- Returns: allowed, current_cost_cents, limit_cents, warning_level ('none','soft','urgent','blocked')
CREATE OR REPLACE FUNCTION public.check_cost_ceiling(p_user_id UUID)
RETURNS TABLE(
    allowed BOOLEAN,
    current_cost_cents INTEGER,
    limit_cents INTEGER,
    warning_level TEXT
) AS $$
DECLARE
    v_cost INTEGER;
    v_limit INTEGER;
    v_cycle_start TIMESTAMPTZ;
    v_pct FLOAT;
BEGIN
    SELECT monthly_cost_cents, cost_limit_cents, last_cost_reset
    INTO v_cost, v_limit, v_cycle_start
    FROM user_subscriptions
    WHERE user_id = p_user_id;

    -- Auto-reset if month rolled over
    IF v_cycle_start IS NOT NULL AND v_cycle_start < date_trunc('month', NOW()) THEN
        UPDATE user_subscriptions
        SET monthly_cost_cents = 0,
            last_cost_reset = date_trunc('month', NOW()),
            updated_at = NOW()
        WHERE user_id = p_user_id;
        v_cost := 0;
    END IF;

    v_pct := CASE WHEN v_limit > 0 THEN v_cost::FLOAT / v_limit ELSE 0 END;

    IF v_pct >= 1.0 THEN
        RETURN QUERY SELECT FALSE, v_cost, v_limit, 'blocked'::TEXT;
    ELSIF v_pct >= 0.90 THEN
        RETURN QUERY SELECT TRUE, v_cost, v_limit, 'urgent'::TEXT;
    ELSIF v_pct >= 0.75 THEN
        RETURN QUERY SELECT TRUE, v_cost, v_limit, 'soft'::TEXT;
    ELSE
        RETURN QUERY SELECT TRUE, v_cost, v_limit, 'none'::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: add cost after a verification completes
CREATE OR REPLACE FUNCTION public.add_verification_cost(p_user_id UUID, p_cost_cents INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE user_subscriptions
    SET monthly_cost_cents = monthly_cost_cents + p_cost_cents,
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
