-- Complete End-to-End Billing Test
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/zlxskwovmkidsezdxpzv/sql

-- ============================================
-- STEP 1: Check current state (before upgrade)
-- ============================================
SELECT 
    'BEFORE UPGRADE' as step,
    user_id,
    tier,
    weekly_verifications_used,
    weekly_verifications_limit,
    monthly_cost_cents,
    cost_limit_cents
FROM user_subscriptions 
WHERE user_id = '20eabd72-8f27-48cd-a7b2-ee6cbbb97f78';

-- ============================================
-- STEP 2: Simulate Stripe webhook - upgrade to operator
-- ============================================
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
    stripe_customer_id = 'cus_UAfy5WQnDVT9BQ',
    stripe_subscription_id = 'sub_test_operator',
    updated_at = NOW()
WHERE user_id = '20eabd72-8f27-48cd-a7b2-ee6cbbb97f78';

-- ============================================
-- STEP 3: Verify upgrade worked
-- ============================================
SELECT 
    'AFTER UPGRADE' as step,
    user_id,
    tier,
    weekly_verifications_limit,
    cost_limit_cents
FROM user_subscriptions 
WHERE user_id = '20eabd72-8f27-48cd-a7b2-ee6cbbb97f78';

-- ============================================
-- STEP 4: Simulate 5 verification requests
-- ============================================
-- Test message 1: "What's the current price of AAPL?"
SELECT 'Message 1: AAPL price' as test, * FROM increment_verification_usage('20eabd72-8f27-48cd-a7b2-ee6cbbb97f78');

-- Test message 2: "Analyze my portfolio risk"
SELECT 'Message 2: Risk analysis' as test, * FROM increment_verification_usage('20eabd72-8f27-48cd-a7b2-ee6cbbb97f78');

-- Test message 3: "Should I buy Tesla stock?"
SELECT 'Message 3: Tesla analysis' as test, * FROM increment_verification_usage('20eabd72-8f27-48cd-a7b2-ee6cbbb97f78');

-- Test message 4: "Compare VTI vs VOO"
SELECT 'Message 4: ETF comparison' as test, * FROM increment_verification_usage('20eabd72-8f27-48cd-a7b2-ee6cbbb97f78');

-- Test message 5: "What's the market outlook?"
SELECT 'Message 5: Market outlook' as test, * FROM increment_verification_usage('20eabd72-8f27-48cd-a7b2-ee6cbbb97f78');

-- ============================================
-- STEP 5: Verify final state
-- ============================================
SELECT 
    'FINAL STATE' as step,
    user_id,
    tier,
    weekly_verifications_used,
    weekly_verifications_limit,
    monthly_verifications_used,
    monthly_verifications_limit,
    monthly_cost_cents,
    cost_limit_cents,
    CASE 
        WHEN tier = 'operator' AND weekly_verifications_used = 5 
             AND monthly_cost_cents < cost_limit_cents 
        THEN '✅ ALL TESTS PASSED'
        ELSE '❌ TESTS FAILED'
    END as test_result
FROM user_subscriptions 
WHERE user_id = '20eabd72-8f27-48cd-a7b2-ee6cbbb97f78';
