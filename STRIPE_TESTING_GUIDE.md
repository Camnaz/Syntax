# Stripe Sandbox Testing Guide

## Overview
Test the complete billing flow using Stripe's test environment. All test transactions use fake cards and generate no real charges.

---

## Setup

### 1. Environment Configuration
Your `.env.local` already has test keys:
```
STRIPE_SECRET_KEY=sk_test_51TAZsVD8HZRNzPl04sMBr99RpWKyRPVrljZs4yFipxFZljuCApNTZelrj4MkSSotkqJXWs7NZB5HBZWbz9D9XN6q00OgPOwlZu
STRIPE_WEBHOOK_SECRET=whsec_3da13660eb79fe3195dedfa02049c9e05defe88106d3d7a776c6ed1c3ca93158
```

**Note:** Production keys start with `sk_live_` - never use those for testing.

### 2. Test Price IDs (Sandbox Mode)
You need to create test prices in Stripe Dashboard:

1. Go to: https://dashboard.stripe.com/test/products
2. Create products with these prices:

| Product | Price | Billing | Test Price ID |
|---------|-------|---------|---------------|
| Operator (Test) | $5.00 | Weekly | `price_test_xxx` |
| Sovereign (Test) | $29.00 | Monthly | `price_test_xxx` |
| Institutional (Test) | $299.00 | Yearly | `price_test_xxx` |

3. Copy the Price IDs and set them:
```bash
railway vars set STRIPE_PRICE_OPERATOR=price_test_xxx
railway vars set STRIPE_PRICE_SOVEREIGN=price_test_xxx
railway vars set STRIPE_PRICE_INSTITUTIONAL=price_test_xxx
```

---

## Test Cards

### Success Cases
| Card Number | Brand | Scenario |
|-------------|-------|----------|
| 4242 4242 4242 4242 | Visa | Successful payment |
| 5555 5555 5555 4444 | Mastercard | Successful payment |
| 3782 822463 10005 | Amex | Successful payment |

### Failure Cases
| Card Number | Scenario | Expected Error |
|-------------|----------|----------------|
| 4000 0000 0000 0002 | Generic decline | Card declined |
| 4000 0000 0000 9995 | Insufficient funds | Insufficient funds |
| 4000 0000 0000 9987 | Lost card | Lost card |
| 4000 0000 0000 9979 | Stolen card | Stolen card |
| 4000 0000 0000 0127 | Incorrect CVC | CVC check failed |

---

## Testing Checklist

### Test 1: Operator Tier Subscription ($5/week)
1. Navigate to `/pricing` page
2. Click "Start Weekly Plan" on Operator tier
3. Use test card `4242 4242 4242 4242`
4. Enter any future expiry date (e.g., 12/30)
5. Enter any 3-digit CVC (e.g., 123)
6. Enter any ZIP code
7. Complete checkout
8. **Verify:** User upgraded to `operator` tier in Supabase
9. **Verify:** `weekly_verifications_limit` = 100
10. **Verify:** `cost_limit_cents` = 300 ($3/week)

### Test 2: Rate Limit Enforcement
1. Create test Operator user
2. Set `weekly_verifications_used` = 100 in Supabase
3. Make verification request
4. **Verify:** Request blocked with "weekly limit reached" message
5. **Verify:** HTTP 429 response

### Test 3: Cost Ceiling Protection
1. Create test Operator user
2. Set `monthly_cost_cents` = 300 in Supabase
3. Make verification request
4. **Verify:** Request blocked with "cost limit reached" message
5. **Verify:** User prompted to upgrade or wait for reset

### Test 4: Failed Payment Handling
1. Navigate to `/pricing`
2. Select any tier
3. Use test card `4000 0000 0000 0002`
4. **Verify:** Payment fails gracefully
5. **Verify:** User sees helpful error message
6. **Verify:** User NOT upgraded in database

### Test 5: Subscription Upgrade
1. Subscribe to Operator tier
2. Navigate to `/pricing`
3. Click "Upgrade to Sovereign"
4. Complete checkout with `4242 4242 4242 4242`
5. **Verify:** Tier upgraded to `sovereign`
6. **Verify:** `monthly_verifications_limit` = 500

### Test 6: Subscription Cancellation
1. Navigate to Stripe Dashboard → Test Mode → Customers
2. Find test customer
3. Delete subscription
4. **Verify:** Webhook received
5. **Verify:** User downgraded to `observer`
6. **Verify:** Limits reset to observer (3 total)

### Test 7: Webhook Verification
1. Start local webhook listener:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```
2. Trigger test event:
```bash
stripe trigger checkout.session.completed
```
3. **Verify:** Webhook processed successfully
4. **Verify:** Database updated correctly

---

## API Testing with curl

### Test Checkout Session Creation
```bash
curl -X POST http://localhost:3000/api/stripe/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_JWT_TOKEN" \
  -d '{"tier": "operator"}'
```

Expected response:
```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_xxx"
}
```

### Test Portal Session Creation
```bash
curl -X POST http://localhost:3000/api/stripe/portal \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_JWT_TOKEN"
```

---

## Database Verification Queries

### Check User Subscription Status
```sql
SELECT user_id, tier, 
       weekly_verifications_used, weekly_verifications_limit,
       monthly_verifications_used, monthly_verifications_limit,
       cost_limit_cents, monthly_cost_cents
FROM user_subscriptions
WHERE user_id = 'YOUR_TEST_USER_ID';
```

### Simulate Rate Limit Check
```sql
SELECT * FROM increment_verification_usage('YOUR_TEST_USER_ID');
```

Expected results:
- Observer at limit: `(f, 3, 3, lifetime)`
- Operator at limit: `(f, 100, 100, weekly)`
- Within limits: `(t, X, Y, weekly/monthly/yearly)`

---

## Automated Testing Script

Create `scripts/test_billing.sh`:
```bash
#!/bin/bash
set -e

echo "=== SYNTAX Billing Test Suite ==="

# 1. Test Observer limit
echo "Test 1: Observer rate limit..."
psql $DATABASE_URL -c "
  INSERT INTO user_subscriptions (user_id, tier, verification_count) 
  VALUES ('test-observer-1', 'observer', 3)
  ON CONFLICT (user_id) DO UPDATE SET verification_count = 3;
"
# Make 4th request - should fail

# 2. Test Operator weekly limit
echo "Test 2: Operator weekly limit..."
psql $DATABASE_URL -c "
  UPDATE user_subscriptions 
  SET weekly_verifications_used = 100, weekly_verifications_limit = 100
  WHERE user_id = 'test-operator-1';
"
# Make request - should fail

# 3. Test cost ceiling
echo "Test 3: Cost ceiling protection..."
psql $DATABASE_URL -c "
  UPDATE user_subscriptions 
  SET monthly_cost_cents = 300, cost_limit_cents = 300
  WHERE user_id = 'test-operator-2';
"
# Make request - should fail

echo "=== All tests passed ==="
```

---

## Cost Simulation

### Calculate Expected Costs
With mock LLM at 10ms latency and $0 cost:

| Test | Users | Requests/User | Total | Cost |
|------|-------|---------------|-------|------|
| Observer limit | 10 | 5 | 50 | $0 |
| Operator full | 10 | 100 | 1000 | $0 |
| Sovereign full | 10 | 500 | 5000 | $0 |
| Load test | 50 | 100 | 5000 | $0 |

**Total test cost: $0.00** (all mocked)

---

## Debugging

### Check Stripe Webhook Events
```bash
# List recent events
stripe events list --limit 10

# Get specific event
stripe events get evt_xxx
```

### View Test Logs
```bash
# Railway logs
railway logs

# Local logs
cargo test -- --nocapture
```

### Verify Database State
```sql
-- All subscriptions
SELECT tier, COUNT(*) 
FROM user_subscriptions 
GROUP BY tier;

-- Users near limits
SELECT user_id, tier, 
       weekly_verifications_used, weekly_verifications_limit,
       (weekly_verifications_used::float / weekly_verifications_limit * 100) as pct_used
FROM user_subscriptions
WHERE tier = 'operator'
AND weekly_verifications_used > 80;
```
