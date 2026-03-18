-- SYNTAX v2.1 — Weekly Rate Limiting & Cost Protection
-- Adds weekly/yearly tracking and hard rate limits for Operator tier

-- Add new limit columns for multi-period tracking
ALTER TABLE user_subscriptions
    ADD COLUMN IF NOT EXISTS weekly_verifications_limit INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS weekly_verifications_used INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS yearly_verifications_limit INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS yearly_verifications_used INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_weekly_reset TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_yearly_reset TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing tiers with proper weekly/monthly/yearly limits
UPDATE user_subscriptions SET
    weekly_verifications_limit = CASE tier
        WHEN 'operator' THEN 100
        ELSE 0
    END,
    yearly_verifications_limit = CASE tier
        WHEN 'operator' THEN 5200
        WHEN 'sovereign' THEN 6000
        WHEN 'institutional' THEN 10000
        ELSE 3
    END;

-- Cost tracking columns (if not already present from 007_usage_limits.sql)
ALTER TABLE user_subscriptions
    ADD COLUMN IF NOT EXISTS cost_limit_cents INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS monthly_cost_cents INTEGER NOT NULL DEFAULT 0;

-- Backfill cost limits for existing users
UPDATE user_subscriptions SET
    cost_limit_cents = CASE tier
        WHEN 'observer' THEN 50
        WHEN 'operator' THEN 300      -- $3/week max cost (60% margin on $5/week)
        WHEN 'sovereign' THEN 1200    -- $12/month max cost
        WHEN 'institutional' THEN 12000 -- $120/year max cost
        ELSE 50
    END;

-- Enhanced usage function with weekly rate limiting for Operator tier
CREATE OR REPLACE FUNCTION public.increment_verification_usage(p_user_id UUID)
RETURNS TABLE(allowed BOOLEAN, current_count INTEGER, max_count INTEGER, period TEXT) AS $$
DECLARE
    v_tier VARCHAR(20);
    v_weekly_used INTEGER;
    v_weekly_limit INTEGER;
    v_monthly_used INTEGER;
    v_monthly_limit INTEGER;
    v_yearly_used INTEGER;
    v_yearly_limit INTEGER;
    v_cost_limit INTEGER;
    v_current_cost INTEGER;
    v_weekly_reset TIMESTAMPTZ;
    v_monthly_reset TIMESTAMPTZ;
    v_yearly_reset TIMESTAMPTZ;
BEGIN
    -- Get current usage and limits
    SELECT 
        tier,
        weekly_verifications_used,
        weekly_verifications_limit,
        monthly_verifications_used,
        monthly_verifications_limit,
        yearly_verifications_used,
        yearly_verifications_limit,
        cost_limit_cents,
        monthly_cost_cents,
        last_weekly_reset,
        last_verification_reset,
        last_yearly_reset
    INTO 
        v_tier, v_weekly_used, v_weekly_limit, v_monthly_used, v_monthly_limit,
        v_yearly_used, v_yearly_limit, v_cost_limit, v_current_cost,
        v_weekly_reset, v_monthly_reset, v_yearly_reset
    FROM user_subscriptions
    WHERE user_id = p_user_id;

    -- Auto-reset weekly counter if week has rolled over
    IF v_weekly_reset < date_trunc('week', NOW()) THEN
        UPDATE user_subscriptions
        SET weekly_verifications_used = 0,
            last_weekly_reset = date_trunc('week', NOW()),
            updated_at = NOW()
        WHERE user_id = p_user_id;
        v_weekly_used := 0;
    END IF;

    -- Auto-reset monthly counter if month has rolled over
    IF v_monthly_reset < date_trunc('month', NOW()) THEN
        UPDATE user_subscriptions
        SET monthly_verifications_used = 0,
            monthly_cost_cents = 0,  -- Reset cost tracking too
            last_verification_reset = date_trunc('month', NOW()),
            updated_at = NOW()
        WHERE user_id = p_user_id;
        v_monthly_used := 0;
        v_current_cost := 0;
    END IF;

    -- Auto-reset yearly counter if year has rolled over
    IF v_yearly_reset < date_trunc('year', NOW()) THEN
        UPDATE user_subscriptions
        SET yearly_verifications_used = 0,
            last_yearly_reset = date_trunc('year', NOW()),
            updated_at = NOW()
        WHERE user_id = p_user_id;
        v_yearly_used := 0;
    END IF;

    -- Observer (free) tier: 3 total lifetime
    IF v_tier = 'observer' THEN
        SELECT verification_count INTO v_monthly_used 
        FROM user_subscriptions WHERE user_id = p_user_id;
        
        IF v_monthly_used >= 3 THEN
            RETURN QUERY SELECT FALSE, v_monthly_used, 3, 'lifetime'::TEXT;
            RETURN;
        END IF;
        
        UPDATE user_subscriptions
        SET verification_count = verification_count + 1,
            updated_at = NOW()
        WHERE user_id = p_user_id;
        
        RETURN QUERY SELECT TRUE, v_monthly_used + 1, 3, 'lifetime'::TEXT;
        RETURN;
    END IF;

    -- Operator tier: Weekly rate limiting (profit protection)
    IF v_tier = 'operator' THEN
        -- Hard weekly limit - can't exceed 100/week
        IF v_weekly_used >= v_weekly_limit AND v_weekly_limit > 0 THEN
            RETURN QUERY SELECT FALSE, v_weekly_used, v_weekly_limit, 'weekly'::TEXT;
            RETURN;
        END IF;
        
        -- Cost ceiling protection - can't exceed $3/week in compute costs
        IF v_current_cost >= v_cost_limit THEN
            RETURN QUERY SELECT FALSE, v_current_cost, v_cost_limit, 'cost'::TEXT;
            RETURN;
        END IF;
        
        UPDATE user_subscriptions
        SET weekly_verifications_used = weekly_verifications_used + 1,
            monthly_verifications_used = monthly_verifications_used + 1,
            yearly_verifications_used = yearly_verifications_used + 1,
            updated_at = NOW()
        WHERE user_id = p_user_id;
        
        RETURN QUERY SELECT TRUE, v_weekly_used + 1, v_weekly_limit, 'weekly'::TEXT;
        RETURN;
    END IF;

    -- Sovereign tier: Monthly limiting
    IF v_tier = 'sovereign' THEN
        IF v_monthly_used >= v_monthly_limit AND v_monthly_limit > 0 THEN
            RETURN QUERY SELECT FALSE, v_monthly_used, v_monthly_limit, 'monthly'::TEXT;
            RETURN;
        END IF;
        
        -- Cost ceiling protection
        IF v_current_cost >= v_cost_limit THEN
            RETURN QUERY SELECT FALSE, v_current_cost, v_cost_limit, 'cost'::TEXT;
            RETURN;
        END IF;
        
        UPDATE user_subscriptions
        SET monthly_verifications_used = monthly_verifications_used + 1,
            yearly_verifications_used = yearly_verifications_used + 1,
            updated_at = NOW()
        WHERE user_id = p_user_id;
        
        RETURN QUERY SELECT TRUE, v_monthly_used + 1, v_monthly_limit, 'monthly'::TEXT;
        RETURN;
    END IF;

    -- Institutional tier: Yearly limiting
    IF v_tier = 'institutional' THEN
        IF v_yearly_used >= v_yearly_limit AND v_yearly_limit > 0 THEN
            RETURN QUERY SELECT FALSE, v_yearly_used, v_yearly_limit, 'yearly'::TEXT;
            RETURN;
        END IF;
        
        UPDATE user_subscriptions
        SET yearly_verifications_used = yearly_verifications_used + 1,
            updated_at = NOW()
        WHERE user_id = p_user_id;
        
        RETURN QUERY SELECT TRUE, v_yearly_used + 1, v_yearly_limit, 'yearly'::TEXT;
        RETURN;
    END IF;

    -- Fallback (shouldn't reach here)
    RETURN QUERY SELECT FALSE, 0, 0, 'unknown'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add function to track verification cost (called by backend after each verification)
CREATE OR REPLACE FUNCTION public.add_verification_cost(p_user_id UUID, p_cost_cents INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE user_subscriptions
    SET monthly_cost_cents = monthly_cost_cents + p_cost_cents,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for faster limit checks
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier_limits 
ON user_subscriptions(user_id, tier, weekly_verifications_used, weekly_verifications_limit);
