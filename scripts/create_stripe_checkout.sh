#!/bin/bash
# Fix Stripe CLI checkout creation

echo "=== Getting John Smith's Customer ID ==="
CUSTOMER_JSON=$(stripe customers list --email="john.smith@example.com" --limit 1 --format json)
CUSTOMER_ID=$(echo "$CUSTOMER_JSON" | grep '"id": "cus_' | head -1 | cut -d'"' -f4)

echo "Customer ID: $CUSTOMER_ID"
echo ""

# The Stripe CLI doesn't support --line-items for checkout
# Instead, we'll use curl to the Stripe API directly
echo "=== Creating Checkout Session via API ==="
echo ""
echo "Run this curl command:"
echo ""
echo "curl -X POST https://api.stripe.com/v1/checkout/sessions \\"
echo "  -u sk_test_51TAZsVD8HZRNzPl04sMBr99RpWKyRPVrljZs4yFipxFZljuCApNTZelrj4MkSSotkqJXWs7NZB5HBZWbz9D9XN6q00OgPOwlZu: \\"
echo "  -d customer=$CUSTOMER_ID \\"
echo "  -d success_url='http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}' \\"
echo "  -d cancel_url='http://localhost:3000/pricing' \\"
echo "  -d 'line_items[0][price]=price_test_OPERATOR' \\"
echo "  -d 'line_items[0][quantity]=1' \\"
echo "  -d mode=subscription"
echo ""

# Actually run it if we have the price ID
read -p "Enter your test price ID for Operator tier (price_test_xxx): " PRICE_ID

echo ""
echo "Creating checkout session..."

SESSION_JSON=$(curl -s -X POST https://api.stripe.com/v1/checkout/sessions \
  -u sk_test_51TAZsVD8HZRNzPl04sMBr99RpWKyRPVrljZs4yFipxFZljuCApNTZelrj4MkSSotkqJXWs7NZB5HBZWbz9D9XN6q00OgPOwlZu: \
  -d customer="$CUSTOMER_ID" \
  -d success_url="http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}" \
  -d cancel_url="http://localhost:3000/pricing" \
  -d "line_items[0][price]=$PRICE_ID" \
  -d "line_items[0][quantity]=1" \
  -d mode=subscription)

SESSION_URL=$(echo "$SESSION_JSON" | grep -o '"url": "[^"]*"' | head -1 | cut -d'"' -f4)
SESSION_ID=$(echo "$SESSION_JSON" | grep -o '"id": "cs_test_[^"]*"' | head -1 | cut -d'"' -f4)

echo ""
echo "✅ Checkout Session Created!"
echo "Session ID: $SESSION_ID"
echo ""
echo "🔗 Checkout URL:"
echo "$SESSION_URL"
echo ""
echo "👉 Open this URL in browser and complete with test card:"
echo "   4242 4242 4242 4242 (any future date, any CVC)"
