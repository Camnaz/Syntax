import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  httpClient: Stripe.createFetchHttpClient(),
})

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const TIER_PRICE_MAP: Record<string, string> = {
      operator: process.env.STRIPE_PRICE_OPERATOR || 'price_1TCJRnIe7Wlb5rEUvSWylDL7',
      sovereign: process.env.STRIPE_PRICE_SOVEREIGN || 'price_1TCJ50Ie7Wlb5rEUZDBcbwWS',
      institutional: process.env.STRIPE_PRICE_INSTITUTIONAL || 'price_1TCJ50Ie7Wlb5rEUlpMXlZqo',
    }

    const { tier } = await req.json() as { tier: string }
    let priceId = TIER_PRICE_MAP[tier]
    console.log('Checkout request:', { tier, priceId, operator: TIER_PRICE_MAP.operator ? 'set' : 'MISSING' })
    if (!priceId) {
      return NextResponse.json({ error: `Invalid tier: ${tier}. Price ID missing.` }, { status: 400 })
    }

    // If a product ID (prod_...) was provided instead of a price ID, resolve the default price
    if (priceId.startsWith('prod_')) {
      const prices = await stripe.prices.list({ product: priceId, active: true, limit: 1 })
      if (prices.data.length === 0) {
        return NextResponse.json({ error: 'No active price found for product' }, { status: 400 })
      }
      priceId = prices.data[0].id
    }

    // Check if user already has a Stripe customer ID
    const { data: subscription } = await supabaseAdmin
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    let customerId = subscription?.stripe_customer_id

    // Verify customer exists in Stripe - if not (e.g., test mode customer with live key), create new
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId)
      } catch {
        customerId = null // Customer doesn't exist in this Stripe mode, create new
      }
    }

    if (!customerId) {
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      // Save customer ID
      await supabaseAdmin
        .from('user_subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id)
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard?cancelled=true`,
      metadata: {
        supabase_user_id: user.id,
        tier,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('Stripe checkout error:', errMsg)
    return NextResponse.json(
      { error: `Checkout failed: ${errMsg}` },
      { status: 500 }
    )
  }
}
