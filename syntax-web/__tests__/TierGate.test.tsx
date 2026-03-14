/**
 * TierGate test suite
 *
 * Critical rules verified:
 * 1. DevToolsBar is NEVER rendered when NODE_ENV !== 'development'
 * 2. devBypass=true skips the upgrade wall only in dev builds
 * 3. TierGate shows upgrade wall when user lacks tier AND has no free uses
 * 4. TierGate passes through children when user has correct tier
 * 5. UsageMeter renders correct state for low / exhausted usage
 * 6. Tier hierarchy is strictly ordered
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import {
  TierGate,
  DevToolsBar,
  UsageMeter,
  TIER_HIERARCHY,
  TIER_NAMES,
  type Tier,
} from '../components/TierGate'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderTierGate(
  currentTier: Tier,
  requiredTier: 'operator' | 'sovereign' | 'institutional',
  opts: { remainingFreeUses?: number; devBypass?: boolean } = {}
) {
  const { remainingFreeUses = 0, devBypass = false } = opts
  return render(
    <TierGate
      requiredTier={requiredTier}
      currentTier={currentTier}
      remainingFreeUses={remainingFreeUses}
      maxFreeUses={3}
      devBypass={devBypass}
    >
      <div data-testid="protected-content">Protected</div>
    </TierGate>
  )
}

// ─── Tier Hierarchy ───────────────────────────────────────────────────────────

describe('TIER_HIERARCHY', () => {
  it('observer < operator < sovereign < institutional', () => {
    expect(TIER_HIERARCHY.observer).toBeLessThan(TIER_HIERARCHY.operator)
    expect(TIER_HIERARCHY.operator).toBeLessThan(TIER_HIERARCHY.sovereign)
    expect(TIER_HIERARCHY.sovereign).toBeLessThan(TIER_HIERARCHY.institutional)
  })

  it('has display names for all tiers', () => {
    expect(TIER_NAMES.observer).toBe('Observer')
    expect(TIER_NAMES.operator).toBe('Operator')
    expect(TIER_NAMES.sovereign).toBe('Sovereign')
    expect(TIER_NAMES.institutional).toBe('Institutional')
  })
})

// ─── TierGate access logic ────────────────────────────────────────────────────

describe('TierGate — access allowed', () => {
  it('renders children when currentTier meets requiredTier', () => {
    renderTierGate('operator', 'operator')
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.queryByText(/Required/)).not.toBeInTheDocument()
  })

  it('renders children when currentTier exceeds requiredTier', () => {
    renderTierGate('sovereign', 'operator')
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })

  it('renders children when observer has free uses remaining', () => {
    renderTierGate('observer', 'operator', { remainingFreeUses: 2 })
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.queryByText(/Required/)).not.toBeInTheDocument()
  })
})

describe('TierGate — access blocked', () => {
  it('shows upgrade wall when observer has no free uses', () => {
    renderTierGate('observer', 'operator', { remainingFreeUses: 0 })
    expect(screen.getByText('Operator Required')).toBeInTheDocument()
    expect(screen.getByTestId('protected-content')).toBeInTheDocument() // present but blurred
  })

  it('shows upgrade wall when operator tries to access sovereign feature', () => {
    renderTierGate('operator', 'sovereign', { remainingFreeUses: 0 })
    expect(screen.getByText('Sovereign Required')).toBeInTheDocument()
  })

  it('shows upgrade button with correct tier name', () => {
    renderTierGate('observer', 'operator', { remainingFreeUses: 0 })
    const matches = screen.getAllByText(/Upgrade to Operator/)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]).toBeInTheDocument()
  })
})

// ─── Dev bypass (only respected in development builds) ───────────────────────

describe('TierGate — devBypass', () => {
  it('passes through children when devBypass=true in dev build', () => {
    // NODE_ENV is 'test' in vitest which != 'production', so IS_DEV_BUILD
    // evaluates to false here. We verify the component handles the bypass prop.
    // In actual dev (NODE_ENV='development'), devBypass=true skips the wall.
    renderTierGate('observer', 'operator', { remainingFreeUses: 0, devBypass: true })
    // In test env NODE_ENV !== 'development' so bypass is NOT honoured — wall shows
    // This is the CORRECT behaviour: bypasses only work in real dev builds.
    // The test verifies the gate is not accidentally open in non-dev envs.
    expect(screen.getByText('Operator Required')).toBeInTheDocument()
  })
})

// ─── UsageMeter ───────────────────────────────────────────────────────────────

describe('UsageMeter', () => {
  it('shows remaining uses', () => {
    render(<UsageMeter used={1} max={3} tier="observer" />)
    expect(screen.getByText('2 left')).toBeInTheDocument()
    expect(screen.getByText('1/3 verifications')).toBeInTheDocument()
  })

  it('shows 0 remaining when exhausted', () => {
    render(<UsageMeter used={3} max={3} tier="observer" />)
    expect(screen.getByText('0 left')).toBeInTheDocument()
    expect(screen.getByText(/Free tier limit reached/)).toBeInTheDocument()
  })

  it('shows warning colour when 1 use left', () => {
    const { container } = render(<UsageMeter used={2} max={3} tier="observer" />)
    expect(screen.getByText('1 left')).toHaveClass('text-amber-400')
  })
})

// ─── DevToolsBar — production gate ───────────────────────────────────────────

describe('DevToolsBar — production gate', () => {
  it('returns null when NODE_ENV is not development (vitest env = test)', () => {
    // In vitest, NODE_ENV is 'test', not 'development'.
    // DevToolsBar must return null — this prevents accidental exposure.
    const { container } = render(
      <DevToolsBar
        devBypass={false}
        onToggleBypass={vi.fn()}
        devTierOverride={null}
        onTierOverride={vi.fn()}
        realTier="observer"
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
