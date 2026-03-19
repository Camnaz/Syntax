'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, Check, ArrowLeft, Zap, Crown, Gem } from 'lucide-react'
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

const colorMap: Record<string, { bg: string; border: string; text: string; btn: string }> = {
  zinc: { bg: 'bg-zinc-900/50', border: 'border-zinc-800', text: 'text-zinc-400', btn: 'bg-zinc-800 text-zinc-300' },
  emerald: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/30', text: 'text-emerald-400', btn: 'bg-emerald-500 hover:bg-emerald-600 text-zinc-950' },
  purple: { bg: 'bg-purple-500/5', border: 'border-purple-500/30', text: 'text-purple-400', btn: 'bg-purple-500 hover:bg-purple-600 text-white' },
  amber: { bg: 'bg-amber-500/5', border: 'border-amber-500/30', text: 'text-amber-400', btn: 'bg-amber-500 hover:bg-amber-600 text-zinc-950' },
}

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
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-12 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="h-8 w-8 text-emerald-500" />
            <h1 className="text-4xl font-bold tracking-tight">SYNTAX Pricing</h1>
          </div>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Autonomous portfolio verification powered by multi-LLM reasoning loops. 
            Every trade verified against your risk constraints before it reaches your portfolio.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier) => {
            const colors = colorMap[tier.color]
            const isCurrent = currentTier === tier.key
            const Icon = tier.icon

            return (
              <div
                key={tier.key}
                className={`relative rounded-2xl border ${colors.border} ${colors.bg} p-6 flex flex-col ${
                  tier.popular ? 'ring-2 ring-emerald-500/50' : ''
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-zinc-950 text-xs font-bold px-3 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}

                <div className="mb-6">
                  <Icon className={`h-8 w-8 ${colors.text} mb-3`} />
                  <h3 className="text-xl font-bold">{tier.name}</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{tier.price}</span>
                    <span className="text-zinc-400 text-sm">{tier.priceNote}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <Check className={`h-4 w-4 ${colors.text} shrink-0 mt-0.5`} />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => !isCurrent && !tier.disabled && handleUpgrade(tier.key)}
                  disabled={isCurrent || tier.disabled || loading === tier.key}
                  className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colors.btn}`}
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
          <div className="mt-6 max-w-xl mx-auto rounded-lg bg-red-950/40 border border-red-500/40 px-4 py-3 text-sm text-red-400 text-center">
            {checkoutError}
          </div>
        )}

        <div className="text-center mt-12 text-sm text-zinc-500">
          All plans include end-to-end encryption and SOC 2 compliance. Cancel anytime.
        </div>
      </div>
    </div>
  )
}
