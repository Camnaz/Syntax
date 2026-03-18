-- TEST 3: Simulate 5 verification requests
-- This increments usage and cost for the upgraded operator user

-- Simulate 5 verifications (each costs ~4.5 cents)
-- Call increment_verification_usage 5 times
SELECT increment_verification_usage('20eabd72-8f27-48cd-a7b2-ee6cbbb97f78');
SELECT increment_verification_usage('20eabd72-8f27-48cd-a7b2-ee6cbbb97f78');
SELECT increment_verification_usage('20eabd72-8f27-48cd-a7b2-ee6cbbb97f78');
SELECT increment_verification_usage('20eabd72-8f27-48cd-a7b2-ee6cbbb97f78');
SELECT increment_verification_usage('20eabd72-8f27-48cd-a7b2-ee6cbbb97f78');

-- Check results after 5 calls
SELECT 
    user_id,
    tier,
    weekly_verifications_used,
    weekly_verifications_limit,
    monthly_cost_cents,
    cost_limit_cents,
    CASE 
        WHEN weekly_verifications_used >= weekly_verifications_limit THEN '❌ Weekly limit reached'
        WHEN monthly_cost_cents >= cost_limit_cents THEN '❌ Cost limit reached'
        ELSE '✅ Within all limits'
    END as status
FROM user_subscriptions 
WHERE user_id = '20eabd72-8f27-48cd-a7b2-ee6cbbb97f78';

-- Expected: weekly_verifications_used=5, monthly_cost_cents=~23, status='✅ Within all limits'
