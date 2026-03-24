'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, ArrowLeft, Zap, Crown, Gem, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

const tiers = [
  {
    name: 'Observer',
    key: 'observer',
    price: 'Free',
    priceNote: '3 verifications total',
    icon: Shield,
    color: 'zinc',
    features: [
      '3 portfolio verifications',
      'Basic portfolio tracking',
      'Community support',
    ],
    cta: 'Current Plan',
    disabled: true,
  },
  {
    name: 'Operator',
    key: 'operator',
    price: '$5',
    priceNote: '/week',
    icon: Zap,
    color: 'emerald',
    features: [
      '100 verifications/week',
      'Rate-limited (profit protected)',
      'Real-time market grounding',
      'Scenario engine',
      'Stock memory system',
      'Cancel anytime',
    ],
    cta: 'Start Weekly Plan',
    popular: true,
  },
  {
    name: 'Sovereign',
    key: 'sovereign',
    price: '$29',
    priceNote: '/month',
    icon: Crown,
    color: 'purple',
    features: [
      '500 verifications/month',
      'No rate limiting',
      'Everything in Operator',
      'Advanced risk analytics',
      'Multi-portfolio support',
      'Priority support',
    ],
    cta: 'Upgrade to Sovereign',
  },
  {
    name: 'Institutional',
    key: 'institutional',
    price: '$299',
    priceNote: '/year',
    icon: Gem,
    color: 'amber',
    features: [
      '10,000 verifications/year',
      'Annual commitment only',
      'Everything in Sovereign',
      'Custom LLM routing',
      'White-glove onboarding',
      'Direct line to team',
    ],
    cta: 'Contact Sales',
  },
]

export default function PricingPage() {
  const supabase = createClient()
  const [currentTier, setCurrentTier] = useState<string>('observer')
  const [accessToken, setAccessToken] = useState<string>('')
  const [loading, setLoading] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setAccessToken(session.access_token)
        const { data } = await supabase
          .from('user_subscriptions')
          .select('tier')
          .eq('user_id', session.user.id)
          .single()
        if (data) setCurrentTier(data.tier)
      }
    }
    load()
  }, [supabase])

  const handleUpgrade = async (tierKey: string) => {
    if (tierKey === 'institutional') {
      window.location.href = 'mailto:sales@syntax.finance?subject=Institutional%20Plan%20Inquiry'
      return
    }
    if (!accessToken) {
      window.location.href = '/auth'
      return
    }

    setLoading(tierKey)
    setCheckoutError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ tier: tierKey }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (data.url) {
        window.location.href = data.url
      } else {
        setCheckoutError(data.error ?? 'Failed to create checkout session. Please try again.')
      }
    } catch (err) {
      console.error('Checkout error:', err)
      setCheckoutError('Network error. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-olea-studio-grey text-olea-obsidian">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-zinc-500 hover:text-olea-obsidian mb-12 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold tracking-tight text-olea-obsidian mb-3">Olea Syntax Plans</h1>
          <p className="text-zinc-500 text-base max-w-2xl mx-auto leading-relaxed">
            Autonomous portfolio verification powered by multi-LLM reasoning loops.
            Every trade verified against your risk constraints.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier) => {
            const isCurrent = currentTier === tier.key
            const Icon = tier.icon
            const isRecommended = tier.key === 'operator'

            return (
              <div
                key={tier.key}
                className={`relative rounded-2xl border p-6 flex flex-col transition-all duration-300 bg-white ${
                  isRecommended 
                    ? 'border-olea-evergreen shadow-xl shadow-olea-evergreen/10 ring-2 ring-olea-evergreen/20' 
                    : 'border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow-md'
                }`}
              >
                {isRecommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-olea-evergreen text-olea-paper text-[10px] font-bold px-3 py-1 rounded-full tracking-wider uppercase">
                    Recommended
                  </div>
                )}

                <div className="mb-6">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${
                    isRecommended ? 'bg-olea-evergreen/10 text-olea-evergreen' : 'bg-zinc-100 text-zinc-600'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold tracking-tight text-olea-obsidian">{tier.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-black tracking-tight text-olea-obsidian" style={{ fontFamily: 'var(--font-price)' }}>{tier.price}</span>
                    <span className="text-zinc-500 text-sm font-normal">{tier.priceNote}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-olea-obsidian/80">
                      <CheckCircle2 className="h-4 w-4 text-olea-evergreen shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => !isCurrent && !tier.disabled && handleUpgrade(tier.key)}
                  disabled={isCurrent || tier.disabled || loading === tier.key}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${
                    isRecommended 
                      ? 'bg-olea-evergreen hover:bg-olea-obsidian text-olea-paper' 
                      : 'bg-olea-obsidian hover:bg-olea-evergreen text-olea-paper'
                  }`}
                >
                  {loading === tier.key
                    ? 'Redirecting...'
                    : isCurrent
                    ? 'Current Plan'
                    : tier.cta}
                </button>
              </div>
            )
          })}
        </div>

        {checkoutError && (
          <div className="mt-6 max-w-xl mx-auto rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 text-center">
            {checkoutError}
          </div>
        )}

        <div className="text-center mt-12 space-y-2">
          <p className="text-sm text-zinc-500">All plans include end-to-end encryption and SOC 2 compliance. Cancel anytime.</p>
          <p className="text-xs text-zinc-400">Secure payment via Stripe. Questions? <a href="mailto:support@oleacomputer.com" className="text-olea-evergreen hover:text-olea-obsidian transition-colors font-medium">Contact us</a></p>
          <p className="text-xs text-zinc-400 mt-4">&copy; 2026 <a href="https://oleacomputer.com" target="_blank" rel="noopener noreferrer" className="text-olea-evergreen hover:text-olea-obsidian font-bold transition-colors">Olea Computer</a>. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
