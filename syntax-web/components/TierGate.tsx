'use client'

import { useState } from 'react'
import { Crown, ArrowRight, Zap, CreditCard } from 'lucide-react'
import Link from 'next/link'
import { FinancialBridge } from './FinancialBridge'

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
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 bg-olea-obsidian border border-amber-500/40 rounded-xl p-4 shadow-2xl shadow-black/60 text-xs font-mono w-48">
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
            className="bg-zinc-950 text-olea-paper border border-zinc-700 rounded-lg px-2 py-2 flex-1 outline-none focus:border-amber-500/50 cursor-pointer"
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
        <span className="text-zinc-500 font-mono">
          <Zap className="h-3 w-3 inline mr-1" />
          {used}/{max} verifications
        </span>
        <span className={`font-semibold ${isExhausted ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-olea-evergreen'}`}>
          {remaining} left
        </span>
      </div>
      <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isExhausted ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-olea-evergreen'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isExhausted && tier === 'observer' && (
        <p className="text-xs text-red-600 mt-1 font-medium">Free tier limit reached. Upgrade to continue.</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TierGate
// ─────────────────────────────────────────────────────────────────────────────

interface TierGateProps {
  children: React.ReactNode
  requiredTier: 'operator' | 'sovereign' | 'institutional'
  currentTier: Tier
  remainingFreeUses?: number
  /** Set by DevToolsBar — bypasses tier/usage gates in dev builds only */
  devBypass?: boolean
  accessToken?: string
}

export function TierGate({
  children,
  requiredTier,
  currentTier,
  remainingFreeUses = 0,
  devBypass = false,
  accessToken = '',
}: TierGateProps) {
  const [showFinancialBridge, setShowFinancialBridge] = useState(false)

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
    <div className="relative rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
      {showFinancialBridge && (
        <FinancialBridge 
          onClose={() => setShowFinancialBridge(false)}
          accessToken={accessToken}
          currentTier={currentTier}
        />
      )}
      <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-10 flex items-center justify-center p-6 border border-zinc-100 rounded-xl selection:bg-olea-evergreen/10">
        <div className="text-center max-w-sm w-full animate-in fade-in zoom-in duration-300">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-olea-evergreen/10 mb-5 border border-olea-evergreen/20 shadow-sm transition-transform hover:scale-110">
            <Crown className="h-8 w-8 text-olea-evergreen" />
          </div>
          <h3 className="text-xl font-black text-olea-obsidian mb-1 tracking-tight text-center uppercase">{TIER_NAMES[requiredTier]} Required</h3>
          <p className="text-olea-evergreen text-lg font-black mb-2 text-center tracking-tighter">$5<span className="text-xs font-medium text-olea-evergreen/60">/week</span></p>
          <p className="text-olea-obsidian/70 text-sm mb-7 leading-relaxed text-center font-medium">
            You&apos;ve reached the free query limit. Upgrade to keep using Olea Syntax&apos;s autonomous intelligence.
          </p>
          
          <div className="space-y-3">
            <button
              onClick={() => setShowFinancialBridge(true)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-olea-evergreen hover:bg-olea-obsidian transition-all font-bold text-olea-paper shadow-lg shadow-olea-evergreen/10 active:scale-[0.98] group"
            >
              <CreditCard className="h-4 w-4 group-hover:scale-110 transition-transform" />
              <span>Upgrade to {TIER_NAMES[requiredTier]}</span>
              <ArrowRight className="h-4 w-4 opacity-60 group-hover:translate-x-1 transition-transform" />
            </button>
            
            <Link 
              href="/pricing" 
              className="block text-sm font-bold text-olea-obsidian/40 hover:text-olea-evergreen transition-colors py-1 uppercase tracking-widest"
            >
              Compare all plans
            </Link>
          </div>
        </div>
      </div>
      
      {/* Background Content (Visible but disabled) */}
      <div className="opacity-10 pointer-events-none select-none filter blur-[1px]">
        {children}
      </div>
    </div>
  )
}
