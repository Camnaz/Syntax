-- SYNTAX v2.0 — Usage Limits & Billing Tracking
-- Adds verification counting columns for rate limiting

-- Add verification count tracking (if not already present via monthly_verifications_used)
-- The initial schema already has monthly_verifications_used and monthly_verifications_limit,
-- so we add a dedicated per-verification timestamp tracker for fine-grained billing.

ALTER TABLE user_subscriptions
    ADD COLUMN IF NOT EXISTS verification_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_verification_reset TIMESTAMPTZ DEFAULT NOW();

-- Function to increment usage and check limit
CREATE OR REPLACE FUNCTION public.increment_verification_usage(p_user_id UUID)
RETURNS TABLE(allowed BOOLEAN, current_count INTEGER, max_count INTEGER) AS $$
DECLARE
    v_tier VARCHAR(20);
    v_used INTEGER;
    v_limit INTEGER;
    v_cycle_start TIMESTAMPTZ;
BEGIN
    SELECT tier, monthly_verifications_used, monthly_verifications_limit, billing_cycle_start
    INTO v_tier, v_used, v_limit, v_cycle_start
    FROM user_subscriptions
    WHERE user_id = p_user_id;

    -- Auto-reset if billing cycle has rolled over (monthly)
    IF v_cycle_start IS NOT NULL AND v_cycle_start < date_trunc('month', NOW()) THEN
        UPDATE user_subscriptions
        SET monthly_verifications_used = 0,
            billing_cycle_start = date_trunc('month', NOW()),
            updated_at = NOW()
        WHERE user_id = p_user_id;
        v_used := 0;
    END IF;

    -- Observer (free) tier gets 3 total, not monthly
    IF v_tier = 'observer' THEN
        SELECT verification_count INTO v_used FROM user_subscriptions WHERE user_id = p_user_id;
        IF v_used >= 3 THEN
            RETURN QUERY SELECT FALSE, v_used, 3;
            RETURN;
        END IF;
        UPDATE user_subscriptions
        SET verification_count = verification_count + 1,
            updated_at = NOW()
        WHERE user_id = p_user_id;
        RETURN QUERY SELECT TRUE, v_used + 1, 3;
        RETURN;
    END IF;

    -- Paid tiers: check monthly limit
    IF v_used >= v_limit AND v_limit > 0 THEN
        RETURN QUERY SELECT FALSE, v_used, v_limit;
        RETURN;
    END IF;

    UPDATE user_subscriptions
    SET monthly_verifications_used = monthly_verifications_used + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT TRUE, v_used + 1, v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
