# SYNTAX Testing & Profitability Analysis

## Executive Summary

**Current Cost Structure Per Verification:**
- Gemini Flash-Lite: ~$0.007 (1K input + 500 output tokens)
- Gemini Flash: ~$0.015 (1K input + 500 output tokens)
- Gemini Pro: ~$0.06 (1K input + 500 output tokens)
- Anthropic Haiku: ~$0.012 (1K input + 500 output tokens)

**Target: <6 second response time**

---

## 1. Gemini vs Claude Real-Time Data Analysis

### Gemini Advantages (WINNER for <6s target)

| Factor | Gemini | Claude |
|--------|--------|--------|
| **Built-in Search** | ✅ Google Search grounding | ❌ No native search |
| **Latency** | 2-4s typical | 4-8s typical |
| **Real-time Data** | Live via search tool | Static training data |
| **Market Data** | Current prices + news | Historical only |
| **Cost** | $0.10-1.25/1M input | $1.00-3.00/1M input |
| **Speed Optimization** | 25s timeout | 60s timeout |

### Recommendation: Gemini-First Strategy

**Primary:** Gemini 2.5 Flash with Google Search grounding
- Real-time market data via search tool
- 2-4 second response times
- Cost: ~$0.30/1M input tokens

**Fallback:** Anthropic Haiku (when Gemini fails)
- No real-time data capability
- Slower but more reliable for complex reasoning
- Cost: $1.00/1M input tokens

### Implementation for <6s Target

```rust
// Current timeouts in gemini.rs
.connect_timeout(Duration::from_secs(5))  // <- Reduce to 3s
.timeout(Duration::from_secs(25))        // <- Reduce to 10s

// Current timeouts in anthropic.rs  
.connect_timeout(Duration::from_secs(10)) // <- Reduce to 5s
.timeout(Duration::from_secs(60))         // <- Reduce to 15s
```

---

## 2. Profitability Margins by Tier

### Unit Economics

**Assumptions per verification:**
- Avg input tokens: 2,500 (system prompt + context)
- Avg output tokens: 1,500 (JSON response)
- Provider: Gemini Flash (primary)

**Cost per verification:**
```
Input:  2,500 × $0.30/1M = $0.00075
Output: 1,500 × $2.50/1M = $0.00375
Total:  $0.0045 per verification (0.45 cents)
```

### Margin Analysis

| Tier | Price | Verifications | Revenue/V | Cost/V | Margin | Total Profit |
|------|-------|---------------|-----------|--------|--------|--------------|
| **Operator** | $5/week | 100/week | $0.05 | $0.0045 | **91%** | $4.55/week |
| **Sovereign** | $29/mo | 500/mo | $0.058 | $0.0045 | **92%** | $26.75/mo |
| **Institutional** | $299/yr | 10K/yr | $0.0299 | $0.0045 | **85%** | $254/yr |

**Cost Ceiling Protection:**
- Operator: $3/week max → 600% cost buffer
- Sovereign: $12/mo max → 400% cost buffer
- Institutional: $120/yr max → 230% cost buffer

✅ **All tiers profitable even at 100% utilization**

---

## 3. Rate Limiting Test Matrix

### Expected Behavior

| Tier | Period | Limit | Reset | Test Case |
|------|--------|-------|-------|-----------|
| **Observer** | lifetime | 3 total | never | Block at 4th request |
| **Operator** | weekly | 100 | Monday 00:00 | Block at 101st/week |
| **Operator** | cost | $3/week | with weekly | Block if cost ≥ $3 |
| **Sovereign** | monthly | 500 | 1st of month | Block at 501st/mo |
| **Sovereign** | cost | $12/mo | with monthly | Block if cost ≥ $12 |
| **Institutional** | yearly | 10,000 | Jan 1 | Block at 10,001st/yr |

### Test Scenarios

#### Test 1: Free User Rate Limit
```sql
-- Create test user
INSERT INTO user_subscriptions (user_id, tier, verification_count) 
VALUES ('test-user-1', 'observer', 3);

-- 4th request should return: allowed=FALSE, period='lifetime'
SELECT * FROM increment_verification_usage('test-user-1');
```

#### Test 2: Operator Weekly Limit
```sql
-- Create test user at limit
INSERT INTO user_subscriptions (user_id, tier, weekly_verifications_used, weekly_verifications_limit) 
VALUES ('test-user-2', 'operator', 100, 100);

-- 101st request should return: allowed=FALSE, period='weekly'
SELECT * FROM increment_verification_usage('test-user-2');
```

#### Test 3: Cost Ceiling Protection
```sql
-- Create test user at cost limit
INSERT INTO user_subscriptions (user_id, tier, monthly_cost_cents, cost_limit_cents) 
VALUES ('test-user-3', 'operator', 300, 300);

-- Next request should return: allowed=FALSE, period='cost'
SELECT * FROM increment_verification_usage('test-user-3');
```

#### Test 4: Monthly Reset
```sql
-- User with old reset date
UPDATE user_subscriptions 
SET monthly_verifications_used = 500, 
    last_verification_reset = '2026-02-01'
WHERE user_id = 'test-user-4';

-- Next request should reset and return: allowed=TRUE
```

---

## 4. Stripe Sandbox Testing Setup

### Environment Variables (Test Mode)
```bash
# Use test keys from .env.local
STRIPE_SECRET_KEY=sk_test_51TAZsVD8HZRNzPl04sMBr99RpWKyRPVrljZs4yFipxFZljuCApNTZelrj4MkSSotkqJXWs7NZB5HBZWbz9D9XN6q00OgPOwlZu

# Test price IDs (from Stripe dashboard test mode)
STRIPE_PRICE_OPERATOR=price_test_operator_weekly
STRIPE_PRICE_SOVEREIGN=price_test_sovereign_monthly
STRIPE_PRICE_INSTITUTIONAL=price_test_institutional_yearly
```

### Test Cards (Stripe Sandbox)
| Card Number | Scenario |
|-------------|----------|
| 4242 4242 4242 4242 | Success |
| 4000 0000 0000 0002 | Declined |
| 4000 0000 0000 9995 | Insufficient funds |

---

## 5. Test Factory Implementation Plan

### Components Needed

1. **Mock LLM Provider** - Returns static responses, $0 cost
2. **Fake User Generator** - Creates Supabase users with tiers
3. **Load Simulator** - Simulates N concurrent users
4. **Assertion Suite** - Validates rate limiting behavior

### Files to Create
- `tests/factory/mod.rs` - Test utilities
- `tests/factory/mock_llm.rs` - Zero-cost LLM mock
- `tests/factory/user_factory.rs` - User generation
- `tests/rate_limit_tests.rs` - Rate limiting validation
- `tests/profitability_tests.rs` - Margin validation

---

## 6. Recommended Actions

### Immediate (Today)
1. ✅ Reduce Gemini timeout: 25s → 10s
2. ✅ Reduce Anthropic timeout: 60s → 15s
3. ✅ Add per-request timing logs
4. ⏳ Create test factory module

### Short-term (This Week)
1. ⏳ Implement Stripe sandbox test suite
2. ⏳ Add cost tracking to verification loop
3. ⏳ Create rate limiting integration tests
4. ⏳ Set up monitoring for <6s target

### Medium-term (Next Sprint)
1. ⏳ A/B test Gemini-only vs Gemini+Claude routing
2. ⏳ Optimize prompt compression for token savings
3. ⏳ Implement request caching for common queries
