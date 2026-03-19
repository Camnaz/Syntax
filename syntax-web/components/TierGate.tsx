'use client'

import { useState } from 'react'
import { Crown, ArrowRight, Zap, CreditCard } from 'lucide-react'
import Link from 'next/link'

// ─────────────────────────────────────────────────────────────────────────────
// HARD PRODUCTION GATE
// DevToolsBar and all dev-mode UI is rendered only when NODE_ENV === 'development'.
// This is a BUILD-TIME constant — it is NEVER 'development' in a production build,
// so dev controls are physically absent from any production bundle.
// DO NOT remove or weaken this check.
// ─────────────────────────────────────────────────────────────────────────────

const IS_DEV_BUILD = process.env.NODE_ENV === 'development'

export type Tier = 'observer' | 'operator' | 'sovereign' | 'institutional'

export const TIER_HIERARCHY: Record<Tier, number> = {
  observer: 0,
  operator: 1,
  sovereign: 2,
  institutional: 3,
}

export const TIER_NAMES: Record<string, string> = {
  observer: 'Observer',
  operator: 'Operator',
  sovereign: 'Sovereign',
  institutional: 'Institutional',
}

const TIER_PRICES: Record<string, string> = {
  operator: '$29/mo',
  sovereign: '$99/mo',
  institutional: '$499/mo',
}

// ─────────────────────────────────────────────────────────────────────────────
// Dev Tools — ONLY rendered when NODE_ENV === 'development'
// ─────────────────────────────────────────────────────────────────────────────

interface DevToolsBarProps {
  devBypass: boolean
  onToggleBypass: (v: boolean) => void
  devTierOverride: Tier | null
  onTierOverride: (t: Tier | null) => void
  realTier: Tier
}

/** Fixed bottom-left toolbar. Only mounted in development builds. */
export function DevToolsBar({
  devBypass,
  onToggleBypass,
  devTierOverride,
  onTierOverride,
  realTier,
}: DevToolsBarProps) {
  // This guard is belt-and-suspenders; the parent must also check IS_DEV_BUILD.
  if (!IS_DEV_BUILD) return null

  const tiers: Tier[] = ['observer', 'operator', 'sovereign', 'institutional']

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 bg-zinc-900 border border-amber-500/40 rounded-xl p-4 shadow-2xl shadow-black/60 text-xs font-mono w-48">
      <div className="flex items-center justify-center gap-2 mb-1 border-b border-zinc-800 pb-3">
        <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
        <span className="text-amber-400 font-bold tracking-wider">DEV MODE</span>
      </div>

      {/* Bypass toggle */}
      <button
        onClick={() => onToggleBypass(!devBypass)}
        className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border transition-all w-full font-semibold ${
          devBypass
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500'
        }`}
        title="Toggle rate-limit bypass for observer tier"
      >
        {devBypass ? '⚡ BYPASS ON' : '⚡ BYPASS OFF'}
      </button>

      {/* Tier override */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider px-1">Force Tier</label>
        <div className="flex items-center gap-1">
          <select
            value={devTierOverride ?? realTier}
            onChange={(e) => {
              const val = e.target.value as Tier
              onTierOverride(val === realTier ? null : val)
            }}
            className="bg-zinc-950 text-zinc-200 border border-zinc-700 rounded-lg px-2 py-2 flex-1 outline-none focus:border-amber-500/50 cursor-pointer"
            title="Simulate a different subscription tier"
          >
            {tiers.map((t) => (
              <option key={t} value={t}>
                {t === realTier ? `${TIER_NAMES[t]} (real)` : TIER_NAMES[t]}
              </option>
            ))}
          </select>

          {devTierOverride && (
            <button
              onClick={() => onTierOverride(null)}
              className="h-full px-2 text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors flex items-center justify-center border border-transparent hover:border-amber-500/20"
              title="Reset to real tier"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UsageMeter
// ─────────────────────────────────────────────────────────────────────────────

export function UsageMeter({ used, max, tier }: { used: number; max: number; tier: string }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0
  const remaining = Math.max(max - used, 0)
  const isLow = remaining <= 1 && remaining > 0
  const isExhausted = remaining === 0

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400 font-mono">
          <Zap className="h-3 w-3 inline mr-1" />
          {used}/{max} verifications
        </span>
        <span className={`font-semibold ${isExhausted ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
          {remaining} left
        </span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isExhausted ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isExhausted && tier === 'observer' && (
        <p className="text-xs text-red-400 mt-1">Free tier limit reached. Upgrade to continue.</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe helpers
// ─────────────────────────────────────────────────────────────────────────────

async function handleStripeCheckout(tier: string, accessToken?: string): Promise<string | null> {
  try {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ tier }),
    })
    const data = await res.json() as { url?: string; error?: string }
    if (data.url) {
      window.location.href = data.url
      return null
    }
    return data.error ?? 'Failed to create checkout session. Please try again.'
  } catch (err) {
    console.error('Failed to initiate checkout:', err)
    return 'Network error. Please try again.'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TierGate
// ─────────────────────────────────────────────────────────────────────────────

interface TierGateProps {
  children: React.ReactNode
  requiredTier: 'operator' | 'sovereign' | 'institutional'
  currentTier: Tier
  remainingFreeUses?: number
  maxFreeUses?: number
  accessToken?: string
  /** Set by DevToolsBar — bypasses tier/usage gates in dev builds only */
  devBypass?: boolean
}

export function TierGate({
  children,
  requiredTier,
  currentTier,
  remainingFreeUses = 0,
  maxFreeUses = 3,
  accessToken,
  devBypass = false,
}: TierGateProps) {
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // Dev bypass: only honoured in development builds
  if (IS_DEV_BUILD && devBypass) {
    return <>{children}</>
  }

  const hasAccess = TIER_HIERARCHY[currentTier] >= TIER_HIERARCHY[requiredTier]
  const hasFreeUses = remainingFreeUses > 0

  if (hasAccess || hasFreeUses) {
    return <>{children}</>
  }

  // Blocked — show upgrade wall
  return (
    <div className="relative">
      <div className="absolute inset-0 backdrop-blur-sm bg-zinc-900/80 rounded-xl z-10 flex items-center justify-center">
        <div className="text-center max-w-md p-6 sm:p-8">
          <Crown className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
          <h3 className="text-2xl font-bold mb-2">{TIER_NAMES[requiredTier]} Required</h3>
          <p className="text-zinc-400 mb-4">
            Upgrade to {TIER_NAMES[requiredTier]} tier to access this feature
          </p>
          <UsageMeter used={maxFreeUses - remainingFreeUses} max={maxFreeUses} tier={currentTier} />
          <div className="flex flex-col gap-3 mt-6">
            <button
              onClick={async () => {
                setIsCheckingOut(true)
                setCheckoutError(null)
                const err = await handleStripeCheckout(requiredTier, accessToken)
                setIsCheckingOut(false)
                if (err) setCheckoutError(err)
              }}
              disabled={isCheckingOut}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 transition-colors font-semibold min-h-[48px]"
            >
              {isCheckingOut ? (
                <span className="animate-pulse">Redirecting to Stripe…</span>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  Upgrade to {TIER_NAMES[requiredTier]} ({TIER_PRICES[requiredTier]})
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
            {checkoutError && (
              <p className="text-xs text-red-400 text-center">{checkoutError}</p>
            )}
            <Link href="/pricing" className="text-sm text-zinc-400 hover:text-white transition-colors">
              View all plans
            </Link>
          </div>
        </div>
      </div>
      <div className="opacity-30 pointer-events-none">{children}</div>
    </div>
  )
}
