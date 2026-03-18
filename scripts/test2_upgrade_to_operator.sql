-- TEST 2: Upgrade John Smith (institutional user) to Operator tier
-- This simulates what happens after Stripe payment

UPDATE user_subscriptions 
SET 
    tier = 'operator',
    weekly_verifications_limit = 100,
    weekly_verifications_used = 0,
    monthly_verifications_limit = 400,
    monthly_verifications_used = 0,
    yearly_verifications_limit = 5200,
    yearly_verifications_used = 0,
    cost_limit_cents = 300,
    monthly_cost_cents = 0,
    updated_at = NOW()
WHERE user_id = '20eabd72-8f27-48cd-a7b2-ee6cbbb97f78';

-- Verify the upgrade
SELECT 
    user_id,
    tier,
    weekly_verifications_used,
    weekly_verifications_limit,
    cost_limit_cents
FROM user_subscriptions 
WHERE user_id = '20eabd72-8f27-48cd-a7b2-ee6cbbb97f78';

-- Expected: tier='operator', weekly_verifications_limit=100, cost_limit_cents=300
