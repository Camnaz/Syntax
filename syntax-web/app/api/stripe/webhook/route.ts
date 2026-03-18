import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Maps configured IDs (can be prod_ or price_ IDs) to tiers
const CONFIGURED_ID_TO_TIER: Record<string, string> = {
  [process.env.STRIPE_PRICE_OPERATOR!]: 'operator',
  [process.env.STRIPE_PRICE_SOVEREIGN!]: 'sovereign',
  [process.env.STRIPE_PRICE_INSTITUTIONAL!]: 'institutional',
}

// Weekly/monthly/yearly verification limits per tier
const TIER_LIMITS: Record<string, { weekly: number; monthly: number; yearly: number }> = {
  observer: { weekly: 0, monthly: 3, yearly: 3 },      // 3 total lifetime
  operator: { weekly: 100, monthly: 400, yearly: 5200 },  // 100/week hard limit (profit protection)
  sovereign: { weekly: 0, monthly: 500, yearly: 6000 },  // 500/month
  institutional: { weekly: 0, monthly: 833, yearly: 10000 }, // 10K/year = ~833/month
}

// Cost ceilings in cents — ensures ≥60% gross margin per tier
// Operator: $5/week = $20/month revenue, $0.70/week cost (100 × $0.007) = 86% margin ✓
const TIER_COST_LIMITS: Record<string, number> = {
  observer: 50,        // $0.50 — free tier, absorb as CAC
  operator: 300,        // $3.00/week max cost (60% margin on $5/week)
  sovereign: 1200,      // $12.00/month max cost (60% margin on $29/month)
  institutional: 12000, // $120/year max cost (60% margin on $299/year)
}

// Resolve a price ID from a webhook event to a tier
// Handles both direct price_ matches and prod_ lookups via the price's parent product
async function resolveTier(priceId: string): Promise<string | null> {
  // Direct match (works if env has price_ IDs)
  if (CONFIGURED_ID_TO_TIER[priceId]) return CONFIGURED_ID_TO_TIER[priceId]
  // Look up the price's parent product and check against prod_ IDs in config
  try {
    const price = await stripe.prices.retrieve(priceId)
    const productId = typeof price.product === 'string' ? price.product : price.product?.id
    if (productId && CONFIGURED_ID_TO_TIER[productId]) return CONFIGURED_ID_TO_TIER[productId]
  } catch { /* fall through */ }
  return null
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id
        const tier = session.metadata?.tier

        if (userId && tier) {
          const limits = TIER_LIMITS[tier] ?? TIER_LIMITS['operator']
          await supabaseAdmin
            .from('user_subscriptions')
            .update({
              tier,
              stripe_subscription_id: session.subscription as string,
              monthly_verifications_limit: limits.monthly,
              weekly_verifications_limit: limits.weekly,
              yearly_verifications_limit: limits.yearly,
              monthly_verifications_used: 0,
              cost_limit_cents: TIER_COST_LIMITS[tier] ?? 300,
              monthly_cost_cents: 0,
              billing_cycle_start: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const priceId = subscription.items.data[0]?.price?.id
        const tier = priceId ? await resolveTier(priceId) : null
        const customerId = subscription.customer as string

        if (tier) {
          const { data: sub } = await supabaseAdmin
            .from('user_subscriptions')
            .select('user_id')
            .eq('stripe_customer_id', customerId)
            .single()

          const limits = TIER_LIMITS[tier] ?? TIER_LIMITS['operator']
          if (sub) {
            await supabaseAdmin
              .from('user_subscriptions')
              .update({
                tier,
                monthly_verifications_limit: limits.monthly,
                weekly_verifications_limit: limits.weekly,
                yearly_verifications_limit: limits.yearly,
                cost_limit_cents: TIER_COST_LIMITS[tier] ?? 300,
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', sub.user_id)
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        const { data: sub } = await supabaseAdmin
          .from('user_subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (sub) {
          await supabaseAdmin
            .from('user_subscriptions')
            .update({
              tier: 'observer',
              stripe_subscription_id: null,
              monthly_verifications_limit: TIER_LIMITS['observer'].monthly,
              weekly_verifications_limit: TIER_LIMITS['observer'].weekly,
              yearly_verifications_limit: TIER_LIMITS['observer'].yearly,
              cost_limit_cents: TIER_COST_LIMITS['observer'],
              monthly_cost_cents: 0,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', sub.user_id)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        console.warn(`Payment failed for customer ${customerId}`)
        // Could send notification email or downgrade after grace period
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
