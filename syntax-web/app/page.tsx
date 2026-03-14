import Link from "next/link";
import { Eye, Shield, Crown, Building2, ArrowRight, CheckCircle2 } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-black text-white">
      <nav className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-400" />
            <span className="text-xl font-bold">SYNTAX</span>
          </div>
          <Link
            href="/auth"
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 transition-colors font-medium"
          >
            Get Started
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center mb-20">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            AI-Powered Portfolio Verification
          </h1>
          <p className="text-xl md:text-2xl text-zinc-400 max-w-3xl mx-auto mb-8">
            Real-time constraint validation and trajectory projection for institutional-grade portfolio management
          </p>
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 transition-colors font-semibold text-lg"
          >
            Start Free Trial
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          <TierCard
            icon={<Eye className="h-8 w-8" />}
            name="Observer"
            price="Free"
            description="Monitor portfolio insights without execution"
            features={[
              "Read-only access",
              "View projections",
              "Basic analytics",
            ]}
            cta="Start Free"
            href="/auth"
          />
          <TierCard
            icon={<Shield className="h-8 w-8" />}
            name="Operator"
            price="$29/mo"
            description="Execute verified trades with confidence"
            features={[
              "Full verification",
              "Trade execution",
              "Advanced analytics",
              "Priority support",
            ]}
            cta="Upgrade"
            href="/auth"
            highlighted
          />
          <TierCard
            icon={<Crown className="h-8 w-8" />}
            name="Sovereign"
            price="$99/mo"
            description="Unlimited power for serious traders"
            features={[
              "Unlimited verifications",
              "Custom constraints",
              "API access",
              "White-glove support",
            ]}
            cta="Go Sovereign"
            href="/auth"
          />
          <TierCard
            icon={<Building2 className="h-8 w-8" />}
            name="Institutional"
            price="$499/mo"
            description="Enterprise-grade infrastructure"
            features={[
              "Multi-user access",
              "Custom integrations",
              "SLA guarantee",
              "Dedicated account manager",
            ]}
            cta="Contact Sales"
            href="/auth"
          />
        </div>

        <div className="text-center text-zinc-500 text-sm">
          <p>Powered by Claude Haiku 4-5 and Gemini 1.5 Flash</p>
          <p className="mt-2">Real-time SSE streaming • Constraint validation • Error injection loop</p>
        </div>
      </main>
    </div>
  );
}

function TierCard({
  icon,
  name,
  price,
  description,
  features,
  cta,
  href,
  highlighted = false,
}: {
  icon: React.ReactNode;
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-6 border ${
        highlighted
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-zinc-800 bg-zinc-900/50"
      }`}
    >
      <div className="mb-4 text-emerald-400">{icon}</div>
      <h3 className="text-2xl font-bold mb-2">{name}</h3>
      <p className="text-3xl font-bold mb-2">{price}</p>
      <p className="text-zinc-400 text-sm mb-6">{description}</p>
      <ul className="space-y-2 mb-6">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`block text-center px-4 py-2 rounded-lg font-medium transition-colors ${
          highlighted
            ? "bg-emerald-500 hover:bg-emerald-600"
            : "bg-zinc-800 hover:bg-zinc-700"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}
