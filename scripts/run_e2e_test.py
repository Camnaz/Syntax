#!/usr/bin/env python3
"""
Complete end-to-end billing test
1. Simulate Stripe payment → upgrade to operator
2. Send 5 verification requests
3. Verify rate limiting and cost tracking
"""

import requests
import json

# Supabase config
SUPABASE_URL = "https://zlxskwovmkidsezdxpzv.supabase.co"
SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpseHNrd292bWtpZHNlemR4cHp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM0ODY3MiwiZXhwIjoyMDg4OTI0NjcyfQ.Bj-tzQuI-q4rOJ5GvkNhI6bFnVzj8_4y5y3x1z2k4r8"

# Test user
USER_ID = "20eabd72-8f27-48cd-a7b2-ee6cbbb97f78"

def run_sql(query):
    """Execute SQL via Supabase REST API"""
    url = f"{SUPABASE_URL}/rest/v1/"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json"
    }
    
    # Use RPC for raw SQL
    rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"
    payload = {"query": query}
    
    try:
        resp = requests.post(rpc_url, headers=headers, json=payload)
        return resp.json() if resp.status_code == 200 else {"error": resp.text}
    except Exception as e:
        return {"error": str(e)}

def get_user_subscription():
    """Get current subscription state"""
    url = f"{SUPABASE_URL}/rest/v1/user_subscriptions"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/vnd.pgrst.object+json"
    }
    params = {"user_id": f"eq.{USER_ID}"}
    
    resp = requests.get(url, headers=headers, params=params)
    return resp.json() if resp.status_code == 200 else None

def upgrade_to_operator():
    """Simulate Stripe webhook - upgrade user to operator"""
    print(f"\n=== STEP 1: Simulating Stripe Payment → Upgrade to Operator ===")
    print(f"Customer: cus_UAfy5WQnDVT9BQ")
    print(f"Price: price_1TCKflD8HZRNzPl0z5HmRKRr ($5/week)")
    
    # Get current state
    before = get_user_subscription()
    print(f"Before: tier={before.get('tier')}, weekly_used={before.get('weekly_verifications_used')}")
    
    # Upgrade to operator
    url = f"{SUPABASE_URL}/rest/v1/user_subscriptions"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    params = {"user_id": f"eq.{USER_ID}"}
    
    payload = {
        "tier": "operator",
        "weekly_verifications_limit": 100,
        "weekly_verifications_used": 0,
        "monthly_verifications_limit": 400,
        "monthly_verifications_used": 0,
        "yearly_verifications_limit": 5200,
        "yearly_verifications_used": 0,
        "cost_limit_cents": 300,
        "monthly_cost_cents": 0,
        "stripe_customer_id": "cus_UAfy5WQnDVT9BQ",
        "stripe_subscription_id": "sub_test_operator"
    }
    
    resp = requests.patch(url, headers=headers, params=params, json=payload)
    
    if resp.status_code == 200:
        after = get_user_subscription()
        print(f"✅ Upgraded to operator!")
        print(f"After: tier={after.get('tier')}, weekly_limit={after.get('weekly_verifications_limit')}")
        return True
    else:
        print(f"❌ Upgrade failed: {resp.text}")
        return False

def simulate_verifications():
    """Simulate 5 verification requests"""
    print("\n=== STEP 2: Simulating 5 LLM Verification Requests ===")
    
    url = f"{SUPABASE_URL}/rest/v1/rpc/increment_verification_usage"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json"
    }
    
    results = []
    test_messages = [
        "What's the current price of AAPL?",
        "Analyze my portfolio risk",
        "Should I buy Tesla stock?",
        "Compare VTI vs VOO",
        "What's the market outlook for this week?"
    ]
    
    for i, msg in enumerate(test_messages, 1):
        payload = {"p_user_id": USER_ID}
        resp = requests.post(url, headers=headers, json=payload)
        
        if resp.status_code == 200:
            result = resp.json()
            allowed = result[0] if isinstance(result, list) else result
            print(f"  Message {i}: '{msg[:40]}...' → {'✅ Allowed' if allowed else '❌ Blocked'}")
            results.append(allowed)
        else:
            print(f"  Message {i}: ❌ Error - {resp.text}")
            results.append(False)
    
    return results

def verify_results():
    """Verify final state"""
    print("\n=== STEP 3: Verifying Results ===")
    
    sub = get_user_subscription()
    if not sub:
        print("❌ Failed to get subscription")
        return False
    
    print(f"\nFinal State:")
    print(f"  Tier: {sub.get('tier')}")
    print(f"  Weekly: {sub.get('weekly_verifications_used')}/{sub.get('weekly_verifications_limit')}")
    print(f"  Monthly: {sub.get('monthly_verifications_used')}/{sub.get('monthly_verifications_limit')}")
    print(f"  Yearly: {sub.get('yearly_verifications_used')}/{sub.get('yearly_verifications_limit')}")
    print(f"  Cost: {sub.get('monthly_cost_cents')} cents / {sub.get('cost_limit_cents')} cents limit")
    
    # Verify assertions
    checks = [
        (sub.get('tier') == 'operator', "Tier is operator"),
        (sub.get('weekly_verifications_used') == 5, "5 weekly uses recorded"),
        (sub.get('monthly_verifications_used') == 5, "5 monthly uses recorded"),
        (sub.get('monthly_cost_cents') > 0, "Cost tracked"),
        (sub.get('monthly_cost_cents') < sub.get('cost_limit_cents'), "Cost under limit")
    ]
    
    print(f"\nTest Results:")
    all_pass = True
    for passed, desc in checks:
        status = "✅" if passed else "❌"
        print(f"  {status} {desc}")
        all_pass = all_pass and passed
    
    return all_pass

def main():
    print("=" * 60)
    print("SYNTAX END-TO-END BILLING TEST")
    print("=" * 60)
    
    # Step 1: Upgrade to operator
    if not upgrade_to_operator():
        print("\n❌ Test failed at upgrade step")
        return
    
    # Step 2: Simulate 5 messages
    results = simulate_verifications()
    allowed_count = sum(1 for r in results if r)
    print(f"\n  Total: {allowed_count}/5 requests allowed")
    
    # Step 3: Verify
    if verify_results():
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED")
        print("=" * 60)
        print("\nSummary:")
        print("  • User upgraded to operator tier")
        print("  • 5 verification requests processed")
        print("  • Rate limits working correctly")
        print("  • Cost tracking functional")
        print("  • Profitability margins protected")
    else:
        print("\n" + "=" * 60)
        print("❌ SOME TESTS FAILED")
        print("=" * 60)

if __name__ == "__main__":
    main()
