#!/bin/bash
# Complete end-to-end billing test for Syntax
# Run this in your terminal from /Users/cnazarko/OleaComputers/SYNTAX/v1/syntax

echo "======================================"
echo "SYNTAX END-TO-END BILLING TEST"
echo "======================================"

# ============================================
# TEST 1: Verify observer user is rate limited
# ============================================
echo ""
echo "TEST 1: Check observer is rate limited"
echo "User: 516771b3-3693-457e-b489-e2706feda715"
echo "Cost: 56 cents | Limit: 50 cents"
echo "Expected: ❌ RATE LIMITED"
echo ""
echo "SQL to verify:"
cat scripts/test1_rate_limit_check.sql
echo ""

# ============================================
# TEST 2: Create Stripe customer for John Smith
# ============================================
echo ""
echo "TEST 2: Create Stripe customer 'John Smith'"
echo ""

# Check if customer exists
echo "Checking for existing John Smith customer..."
CUSTOMER_ID=$(stripe customers list --limit 100 --format json 2>/dev/null | grep -B5 "john.smith" | grep "id" | head -1 | cut -d'"' -f4)

if [ -z "$CUSTOMER_ID" ]; then
    echo "Creating new customer..."
    CUSTOMER=$(stripe customers create \
        --email="john.smith.test@example.com" \
        --name="John Smith" \
        --description="Test customer for Syntax Operator tier" \
        --format json 2>/dev/null)
    CUSTOMER_ID=$(echo $CUSTOMER | grep '"id"' | head -1 | cut -d'"' -f4)
    echo "✅ Created customer: $CUSTOMER_ID"
else
    echo "✅ Found existing customer: $CUSTOMER_ID"
fi

# ============================================
# TEST 3: Create checkout session for Operator tier
# ============================================
echo ""
echo "TEST 3: Create checkout session for Operator tier ($5/week)"
echo ""

# Note: You'll need to replace price_test_xxx with your actual test price ID
# You can get this from: https://dashboard.stripe.com/test/products

echo "To create a checkout session, run:"
echo "stripe checkout sessions create \\"
echo "  --customer=$CUSTOMER_ID \\"
echo "  --success-url='http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}' \\"
echo "  --cancel-url='http://localhost:3000/pricing' \\"
echo "  --line-items='[{\"price\": \"YOUR_PRICE_ID_HERE\", \"quantity\": 1}]' \\"
echo "  --mode='subscription' \\"
echo "  --format json"
echo ""

# ============================================
# TEST 4: Manual upgrade (simulating webhook)
# ============================================
echo ""
echo "TEST 4: Upgrade user to Operator tier"
echo "Run this SQL in Supabase:"
cat scripts/test2_upgrade_to_operator.sql
echo ""

# ============================================
# TEST 5: Send 5 test messages
# ============================================
echo ""
echo "TEST 5: Send 5 messages with these prompts:"
echo ""
echo "1. 'What's the current price of AAPL?'"
echo "   → Should return real-time stock price"
echo ""
echo "2. 'Analyze my portfolio risk'"
echo "   → Should analyze portfolio and provide risk metrics"
echo ""
echo "3. 'Should I buy Tesla stock?'"
echo "   → Should provide analysis with real-time data"
echo ""
echo "4. 'Compare VTI vs VOO'"
echo "   → Should compare the two ETFs"
echo ""
echo "5. 'What's the market outlook for this week?'"
echo "   → Should provide market outlook"
echo ""

# ============================================
# TEST 6: Verify usage tracking
# ============================================
echo ""
echo "TEST 6: Verify usage was tracked"
echo "Run this SQL after sending messages:"
cat scripts/test3_five_verifications.sql
echo ""

echo "======================================"
echo "TEST SCRIPT COMPLETE"
echo "======================================"
echo ""
echo "To run this test:"
echo "1. Execute test1 SQL in Supabase (should show rate limited)"
echo "2. Run the Stripe commands above to create checkout"
echo "3. Complete checkout with test card: 4242 4242 4242 4242"
echo "4. Execute test2 SQL to upgrade user"
echo "5. Open Syntax app and send the 5 messages"
echo "6. Execute test3 SQL to verify usage tracking"
echo ""
echo "Stripe Test Card: 4242 4242 4242 4242 (any future date, any CVC)"
