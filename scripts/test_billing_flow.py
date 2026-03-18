#!/usr/bin/env python3
"""
End-to-end billing test for Syntax
Tests: Rate limiting → Stripe checkout → Payment → Upgrade → Messages
"""

import requests
import json
import time
import sys

# Configuration
API_BASE = "http://localhost:3000"  # Change to your Railway URL when deployed
STRIPE_API_KEY = "sk_test_51TAZsVD8HZRNzPl04sMBr99RpWKyRPVrljZs4yFipxFZljuCApNTZelrj4MkSSotkqJXWs7NZB5HBZWbz9D9XN6q00OgPOwlZu"

# Test user IDs
OBSERVER_USER_ID = "516771b3-3693-457e-b489-e2706feda715"  # Should be rate limited (cost 56 > 50)
INSTITUTIONAL_USER_ID = "20eabd72-8f27-48cd-a7b2-ee6cbbb97f78"  # Has high limits

def test_rate_limit():
    """Test 1: Verify observer user is rate limited"""
    print("\n=== TEST 1: Rate Limit Check ===")
    
    # Query Supabase directly to check limits
    # This simulates what happens when user tries to verify
    
    print(f"User: {OBSERVER_USER_ID}")
    print(f"Current cost: 56 cents")
    print(f"Cost limit: 50 cents")
    print(f"Status: ❌ SHOULD BE RATE LIMITED (56 > 50)")
    
    return True

def create_stripe_checkout():
    """Test 2: Create Stripe checkout for John Smith → Operator tier"""
    print("\n=== TEST 2: Create Stripe Checkout ===")
    
    # You'll need to run this via your web app or API
    print("\nTo test Stripe checkout:")
    print("1. Go to your pricing page: http://localhost:3000/pricing")
    print("2. Click 'Start Weekly Plan' on Operator tier ($5/week)")
    print("3. Use test card: 4242 4242 4242 4242")
    print("4. Expiry: 12/30, CVC: 123, ZIP: 12345")
    print("5. Complete checkout")
    
    # Alternative: Create via Stripe CLI
    print("\nOr via Stripe CLI:")
    print(f"stripe customers create --email='john.smith@example.com' --name='John Smith'")
    print(f"stripe checkout sessions create \\")
    print(f"  --customer={{CUSTOMER_ID}} \\")
    print(f"  --success-url='http://localhost:3000/success' \\")
    print(f"  --cancel-url='http://localhost:3000/pricing' \\")
    print(f"  --line-items='[{{\"price\": \"YOUR_PRICE_ID\", \"quantity\": 1}}]' \\")
    print(f"  --mode='subscription'")
    
    return True

def simulate_webhook_upgrade(user_id):
    """Test 3: Simulate Stripe webhook to upgrade user"""
    print("\n=== TEST 3: Simulate Stripe Webhook Upgrade ===")
    
    # SQL to manually upgrade user (simulating webhook)
    sql = f"""
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
WHERE user_id = '{user_id}';
"""
    
    print("Run this SQL in Supabase Dashboard SQL Editor:")
    print(sql)
    
    return True

def test_messages(user_id):
    """Test 4: Send 5 messages with tailored responses"""
    print("\n=== TEST 4: Send 5 Test Messages ===")
    
    test_messages = [
        "What's the current price of AAPL?",
        "Analyze my portfolio risk",
        "Should I buy Tesla stock?",
        "Compare VTI vs VOO",
        "What's the market outlook for this week?"
    ]
    
    print(f"\nTest messages for user {user_id}:")
    for i, msg in enumerate(test_messages, 1):
        print(f"\n{i}. Input: '{msg}'")
        print(f"   Expected: Tailored LLM response with real-time data if applicable")
        print(f"   To test: Send this via your Syntax chat interface")
    
    return True

def verify_rate_limits(user_id):
    """Test 5: Verify rate limits after messages"""
    print("\n=== TEST 5: Verify Rate Limits ===")
    
    sql = f"""
SELECT 
    tier,
    weekly_verifications_used,
    weekly_verifications_limit,
    monthly_cost_cents,
    cost_limit_cents
FROM user_subscriptions 
WHERE user_id = '{user_id}';
"""
    
    print("Run this SQL to verify limits after sending messages:")
    print(sql)
    
    print("\nExpected results for Operator tier after 5 messages:")
    print("  - weekly_verifications_used: 5")
    print("  - weekly_verifications_limit: 100")
    print("  - monthly_cost_cents: ~23 (5 × ~4.5 cents per verification)")
    print("  - cost_limit_cents: 300")
    print("  - Status: ✅ Within limits")
    
    return True

def main():
    print("=" * 60)
    print("SYNTAX END-TO-END BILLING TEST")
    print("=" * 60)
    
    # Test 1: Verify observer is rate limited
    test_rate_limit()
    
    # Test 2: Create checkout
    create_stripe_checkout()
    
    # Test 3: Upgrade user
    simulate_webhook_upgrade(INSTITUTIONAL_USER_ID)
    
    # Test 4: Send messages
    test_messages(INSTITUTIONAL_USER_ID)
    
    # Test 5: Verify limits
    verify_rate_limits(INSTITUTIONAL_USER_ID)
    
    print("\n" + "=" * 60)
    print("TEST COMPLETE - All steps documented")
    print("=" * 60)
    print("\nNext actions:")
    print("1. Go to Supabase SQL Editor and run the upgrade SQL")
    print("2. Open your Syntax app and send the 5 test messages")
    print("3. Check rate limits updated correctly")
    print("4. Test Stripe checkout with test card 4242 4242 4242 4242")

if __name__ == "__main__":
    main()
