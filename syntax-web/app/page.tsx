import Link from "next/link";
import Image from "next/image";
import { MarketStatus } from "@/components/MarketStatus";
import { Shield, ArrowRight, CheckCircle2, Zap, Gem, Search, Activity, Lock, Crown } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-olea-studio-grey text-olea-obsidian font-sans selection:bg-emerald-500/30">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-olea-evergreen/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-olea-evergreen/5 blur-[120px] rounded-full" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-zinc-200/50 bg-olea-studio-grey/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image 
              src="/images/OleaSyntaxLogo2.svg" 
              alt="Olea Syntax" 
              width={200} 
              height={50} 
              className="h-12 w-auto"
              priority
            />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-600">
            <a href="#features" className="hover:text-olea-evergreen transition-colors">Features</a>
            <a href="#pricing" className="hover:text-olea-evergreen transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth" className="text-sm font-medium text-zinc-600 hover:text-olea-obsidian transition-colors">
              Log in
            </Link>
            <Link
              href="/auth"
              className="px-6 py-2.5 rounded-full bg-olea-evergreen hover:bg-olea-obsidian transition-all font-bold text-olea-paper shadow-lg shadow-olea-evergreen/20 active:scale-95 text-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative">
        {/* Hero Section */}
        <section className="mx-auto max-w-7xl px-6 flex min-h-[calc(100vh-80px)] items-center justify-center pt-20 pb-32">
          <div className="max-w-5xl mx-auto flex flex-col items-center text-center relative z-10">
            <div className="mb-10 animate-fade-in">
              <MarketStatus />
            </div>
            
            <h1 className="text-6xl md:text-8xl font-bold mb-8 tracking-tight leading-[0.95] text-olea-obsidian">
              Verify every trade.
              <br />
              <span className="text-zinc-400">Secure every trajectory.</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-zinc-600 max-w-2xl mx-auto mb-12 leading-relaxed font-normal">
              Olea Syntax uses autonomous reasoning loops to verify portfolio changes against strict risk constraints before they reach the market.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Link
                href="/auth"
                className="group flex items-center gap-3 px-8 py-5 rounded-full bg-olea-evergreen hover:bg-olea-obsidian transition-all font-bold text-xl text-olea-paper shadow-2xl shadow-olea-evergreen/20 active:scale-95"
              >
                Launch Dashboard
                <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-1" />
              </Link>
              <div className="flex items-center gap-4 text-zinc-500 text-sm font-medium px-2">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-olea-evergreen" />
                  Free Trial
                </span>
                <span className="w-1 h-1 rounded-full bg-zinc-300" />
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-olea-evergreen" />
                  No card required
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="border-t border-zinc-200 bg-white/30 py-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid md:grid-cols-3 gap-12">
              <FeatureItem 
                icon={<Search className="h-6 w-6" />}
                title="Deep Verification"
                description="Every proposed allocation is run through multi-LLM reasoning loops to ensure alignment with your custom risk profile."
              />
              <FeatureItem 
                icon={<Activity className="h-6 w-6" />}
                title="Trajectory Analysis"
                description="Visualize the probabilistic future of your portfolio. See how today's trades impact tomorrow's drawdowns."
              />
              <FeatureItem 
                icon={<Lock className="h-6 w-6" />}
                title="Constraint Guardrails"
                description="Hard-coded safety limits that even the AI cannot bypass. Your capital remains protected by deterministic rules."
              />
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="mx-auto max-w-7xl px-6 py-40">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-zinc-900">Institutional-Grade Intelligence</h2>
            <p className="text-zinc-600 max-w-2xl mx-auto text-lg">
              Choose the level of autonomy that matches your capital requirements.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <TierCard
              icon={<Shield className="h-6 w-6" />}
              name="Observer"
              price="Free"
              description="Basic portfolio tracking and view-only insights."
              features={[
                "3 verifications total",
                "Basic trajectory view",
                "Community support",
              ]}
              cta="Start Free"
              href="/auth"
            />
            <TierCard
              icon={<Zap className="h-6 w-6" />}
              name="Operator"
              price="$5"
              priceNote="/week"
              description="Full verification engine for active traders."
              features={[
                "100 verifications/week",
                "Real-time grounding",
                "Scenario engine access",
                "Priority support",
              ]}
              cta="Upgrade Now"
              href="/auth"
              highlighted
            />
            <TierCard
              icon={<Crown className="h-6 w-6" />}
              name="Sovereign"
              price="$29"
              priceNote="/mo"
              description="Unlimited reasoning power for serious capital."
              features={[
                "500 verifications/mo",
                "Custom constraints",
                "No rate limiting",
                "API access",
              ]}
              cta="Go Sovereign"
              href="/auth"
            />
            <TierCard
              icon={<Gem className="h-6 w-6" />}
              name="Institutional"
              price="$299"
              priceNote="/yr"
              description="Enterprise infrastructure for teams."
              features={[
                "10,000 verifications/yr",
                "Dedicated capacity",
                "SLA guarantees",
                "White-glove setup",
              ]}
              cta="Contact Sales"
              href="/auth"
            />
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-zinc-200 bg-white pt-20 pb-10">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col md:flex-row justify-between items-start gap-12 mb-20">
              <div className="flex flex-col gap-6 max-w-sm">
                <Link href="/" className="flex items-center gap-3">
                  <Image 
                    src="/images/OleaSyntaxLogo.svg" 
                    alt="Olea Syntax" 
                    width={140} 
                    height={36} 
                    className="h-9 w-auto" 
                  />
                </Link>
                <p className="text-zinc-600 text-sm leading-relaxed">
                  The world&apos;s first autonomous portfolio verification engine. Powered by high-reasoning loops and deterministic risk guardrails.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-12">
                <FooterGroup title="Product" links={['Features', 'Pricing', 'Security', 'Roadmap']} />
                <FooterGroup title="Company" links={['About', 'Blog', 'Careers', 'Contact']} />
                <FooterGroup title="Legal" links={['Privacy', 'Terms', 'Security', 'Disclosures']} />
              </div>
            </div>
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-10 border-t border-zinc-100">
              <p className="text-zinc-500 text-xs text-center md:text-left leading-relaxed">
                © 2026 <a href="https://oleacomputer.com" target="_blank" rel="noopener noreferrer" className="text-olea-evergreen hover:text-olea-obsidian font-bold transition-colors">Olea Computer</a>. All rights reserved. Olea Syntax is a product of <a href="https://oleacomputer.com" target="_blank" rel="noopener noreferrer" className="text-olea-evergreen hover:text-olea-obsidian font-bold transition-colors">Olea Computer</a>.
              </p>
              <div className="flex items-center gap-6">
                <a href="#" className="text-zinc-400 hover:text-zinc-900 transition-colors"><span className="sr-only">Twitter</span>𝕏</a>
                <a href="#" className="text-zinc-400 hover:text-zinc-900 transition-colors"><span className="sr-only">GitHub</span>GitHub</a>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function FeatureItem({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-12 w-12 rounded-2xl bg-olea-evergreen/10 border border-olea-evergreen/20 flex items-center justify-center text-olea-evergreen">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-olea-obsidian tracking-tight">{title}</h3>
      <p className="text-zinc-600 text-sm leading-relaxed">{description}</p>
    </div>
  )
}

function FooterGroup({ title, links }: { title: string, links: string[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-widest">{title}</h4>
      <ul className="flex flex-col gap-2">
        {links.map(l => (
          <li key={l}>
            <a href="#" className="text-sm text-zinc-500 hover:text-emerald-600 transition-colors">{l}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TierCard({
  icon,
  name,
  price,
  priceNote,
  description,
  features,
  cta,
  href,
  highlighted = false,
}: {
  icon: React.ReactNode;
  name: string;
  price: string;
  priceNote?: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`relative rounded-3xl p-8 flex flex-col transition-all duration-300 ${
        highlighted
          ? "bg-white border-2 border-olea-evergreen shadow-2xl shadow-olea-evergreen/10 scale-105 z-10"
          : "bg-white border border-zinc-200 hover:border-zinc-300 shadow-sm"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-olea-evergreen text-[10px] font-black text-olea-paper tracking-widest uppercase">
          Recommended
        </div>
      )}
      <div className={`mb-6 p-3 rounded-2xl w-fit ${highlighted ? 'bg-olea-evergreen/10 text-olea-evergreen' : 'bg-zinc-100 text-zinc-600'}`}>
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2 text-olea-obsidian">{name}</h3>
      <div className="flex items-baseline gap-1 mb-4">
        <span className="text-4xl font-black text-olea-obsidian" style={{ fontFamily: 'var(--font-price)' }}>{price}</span>
        {priceNote && <span className="text-sm text-zinc-500 font-medium">{priceNote}</span>}
      </div>
      <p className="text-zinc-600 text-sm mb-8 leading-relaxed font-medium">{description}</p>
      <ul className="space-y-4 mb-10 flex-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3 text-sm font-medium text-zinc-700">
            <CheckCircle2 className="h-5 w-5 text-olea-evergreen shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`block text-center px-6 py-4 rounded-2xl font-bold transition-all ${
          highlighted
            ? "bg-olea-evergreen hover:bg-olea-obsidian text-olea-paper shadow-lg shadow-olea-evergreen/20 active:scale-95"
            : "bg-olea-obsidian hover:bg-olea-evergreen text-olea-paper active:scale-95"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}
