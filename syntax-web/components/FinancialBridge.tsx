import React, { useState } from 'react';
import { X, CheckCircle2, Shield } from 'lucide-react'
import Image from 'next/image';

interface Tier {
  id: string;
  name: string;
  price: string;
  period: string;
  verifications: string;
  features: string[];
}

interface FinancialBridgeProps {
  onClose: () => void;
  accessToken: string;
  currentTier: string;
}

export const FinancialBridge: React.FC<FinancialBridgeProps> = ({ onClose, accessToken, currentTier }) => {
  const [isUpgrading, setIsUpgrading] = useState(false);
  const nextTier = currentTier === 'observer' ? 'operator' : currentTier === 'operator' ? 'sovereign' : currentTier === 'sovereign' ? 'institutional' : null;

  const handleUpgrade = async (tier: string) => {
    setIsUpgrading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.error('Upgrade failed:', e);
    } finally {
      setIsUpgrading(false);
    }
  };

  const tiers: Tier[] = [
    { id: 'operator', name: 'Operator', price: '$5', period: '/week', verifications: '100 verifications/week', features: ['Real-time market research', 'Portfolio optimization', 'Priority support'] },
    { id: 'sovereign', name: 'Sovereign', price: '$29', period: '/mo', verifications: '500 verifications/mo', features: ['Everything in Operator', 'Advanced scenario engine', 'Custom risk profiles', 'API access'] },
    { id: 'institutional', name: 'Institutional', price: '$299', period: '/year', verifications: '10,000 verifications/year', features: ['Everything in Sovereign', 'Dedicated capacity', 'White-glove onboarding', 'SLA guarantee'] },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-olea-obsidian/40 backdrop-blur-sm" />
      <div 
        className="glass-panel relative z-10 w-full max-w-2xl rounded-2xl border border-zinc-200 p-8 shadow-2xl bg-white selection:bg-olea-evergreen/10"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-olea-obsidian transition-colors">
          <X className="h-5 w-5" />
        </button>

        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image 
              src="/images/OleaSyntaxLogo2.svg" 
              alt="Olea Syntax" 
              width={180} 
              height={48} 
              className="h-12 w-auto"
            />
          </div>
          <p className="text-sm text-zinc-500 mt-2 max-w-md mx-auto leading-relaxed text-center">
            You&apos;ve reached your free query limit. Upgrade to unlock more verifications and keep researching.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {tiers.map((tier) => {
            const isRecommended = tier.id === (nextTier || 'operator');
            return (
              <div
                key={tier.id}
                className={`relative rounded-xl border p-5 transition-all ${
                  isRecommended 
                    ? 'border-olea-evergreen bg-emerald-50 shadow-lg shadow-olea-evergreen/10' 
                    : 'border-zinc-200 bg-white hover:border-zinc-300 shadow-sm'
                }`}
              >
                {isRecommended && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-olea-evergreen text-[10px] font-bold text-olea-paper tracking-wider uppercase">
                    Recommended
                  </div>
                )}
                <div className="text-center">
                  <h3 className="text-sm font-bold text-olea-obsidian mb-1">{tier.name}</h3>
                  <div className="flex items-baseline justify-center gap-0.5 font-price">
                    <span className="text-3xl font-black text-olea-obsidian tracking-tight">{tier.price}</span>
                    <span className="text-xs text-zinc-500 font-sans">{tier.period}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{tier.verifications}</p>
                </div>
                <ul className="mt-4 space-y-1.5 flex-1">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-olea-obsidian/80 font-medium">
                      <CheckCircle2 className="h-3 w-3 text-olea-evergreen mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(tier.id)}
                  disabled={isUpgrading}
                  className={`mt-4 w-full py-2.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 shadow-sm ${
                    isRecommended
                      ? 'bg-olea-evergreen hover:bg-olea-obsidian text-olea-paper'
                      : 'bg-olea-obsidian hover:bg-olea-evergreen text-olea-paper'
                  }`}
                >
                  {isUpgrading ? 'Redirecting...' : `Choose ${tier.name}`}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-zinc-400">
          Secure payment via Stripe. Cancel anytime. Questions? <a href="mailto:support@oleacomputer.com" className="text-olea-evergreen hover:text-olea-obsidian transition-colors">Contact us</a>
        </p>
      </div>
    </div>
  );
};
