-- TEST 1: Verify observer is rate limited (cost 56 > 50)
-- This user should be blocked from making new verifications

SELECT 
    user_id,
    tier,
    monthly_cost_cents,
    cost_limit_cents,
    CASE 
        WHEN monthly_cost_cents >= cost_limit_cents THEN '❌ RATE LIMITED'
        ELSE '✅ Within limit'
    END as status
FROM user_subscriptions 
WHERE user_id = '516771b3-3693-457e-b489-e2706feda715';

-- Expected: Shows "❌ RATE LIMITED" because 56 >= 50
