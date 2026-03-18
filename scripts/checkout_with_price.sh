#!/bin/bash
# Quick checkout session creation with known price ID

PRICE_ID="price_1TCKKSIe7Wlb5rEUeDwPlEPe"

echo "=== Finding John Smith's Customer ID ==="
CUSTOMER_ID=$(stripe customers list --email="john.smith@example.com" --limit 5 2>/dev/null | grep -o '"id": "cus_[^"]*"' | head -1 | sed 's/"id": "//;s/"$//')

if [ -z "$CUSTOMER_ID" ]; then
    echo "❌ Customer not found. Creating..."
    CUSTOMER_JSON=$(stripe customers create --email="john.smith@example.com" --name="John Smith" 2>/dev/null)
    CUSTOMER_ID=$(echo "$CUSTOMER_JSON" | grep -o '"id": "cus_[^"]*"' | head -1 | sed 's/"id": "//;s/"$//')
fi

echo "✅ Customer ID: $CUSTOMER_ID"
echo ""

echo "=== Creating Checkout Session ==="
echo "Price ID: $PRICE_ID"
echo ""

# Create checkout using Stripe API directly
RESPONSE=$(curl -s -X POST https://api.stripe.com/v1/checkout/sessions \
  -u sk_test_51TAZsVD8HZRNzPl04sMBr99RpWKyRPVrljZs4yFipxFZljuCApNTZelrj4MkSSotkqJXWs7NZB5HBZWbz9D9XN6q00OgPOwlZu: \
  --data-urlencode "customer=$CUSTOMER_ID" \
  --data-urlencode "success_url=http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}" \
  --data-urlencode "cancel_url=http://localhost:3000/pricing" \
  --data-urlencode "line_items[0][price]=$PRICE_ID" \
  --data-urlencode "line_items[0][quantity]=1" \
  --data-urlencode "mode=subscription")

# Extract URL and ID
CHECKOUT_URL=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))" 2>/dev/null)
SESSION_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [ -n "$CHECKOUT_URL" ]; then
    echo "✅ Checkout Session Created!"
    echo ""
    echo "Session ID: $SESSION_ID"
    echo ""
    echo "🔗 Checkout URL:"
    echo "$CHECKOUT_URL"
    echo ""
    echo "👉 Copy this URL and open in browser"
    echo "👉 Use test card: 4242 4242 4242 4242"
    echo "👉 Any future expiry date (e.g., 12/30)"
    echo "👉 Any 3-digit CVC (e.g., 123)"
else
    echo "❌ Failed to create checkout. Response:"
    echo "$RESPONSE"
fi
