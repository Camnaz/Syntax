'use client'

import { TrajectoryProjection } from '@/hooks/useSyntaxVerification'
import { TrendingUp, TrendingDown, Target, Brain } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface TrajectoryPanelProps {
  projection: TrajectoryProjection | null
}

export function TrajectoryPanel({ projection }: TrajectoryPanelProps) {
  if (!projection) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-8 shadow-sm">
        <div className="text-center text-zinc-400">
          <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium">No projection yet. Run a verification to see results.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden flex flex-col h-full max-h-[800px] shadow-sm">
      <div className="border-b border-zinc-200 px-6 py-5 shrink-0 bg-white">
        <h3 className="text-xl font-black flex items-center gap-2 text-olea-obsidian uppercase tracking-tight">
          <Target className="h-5 w-5 text-olea-evergreen" strokeWidth={2.5} />
          Verified Trajectory
        </h3>
        <p className="text-[10px] font-black text-zinc-400 mt-1 uppercase tracking-widest">
          {new Date(projection.timestamp).toLocaleString()}
        </p>
      </div>

      <div className="p-6 space-y-8 overflow-y-auto selection:bg-olea-evergreen/10">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
          <MetricCard
            label="Sharpe Ratio"
            value={projection.projected_sharpe.toFixed(2)}
            icon={<TrendingUp className="h-5 w-5" />}
            color="emerald"
          />
          <MetricCard
            label="Max Drawdown"
            value={`${(projection.projected_max_drawdown * 100).toFixed(1)}%`}
            icon={<TrendingDown className="h-5 w-5" />}
            color="red"
          />
          <MetricCard
            label="Confidence"
            value={`${(projection.confidence_score * 100).toFixed(0)}%`}
            icon={<Brain className="h-5 w-5" />}
            color="blue"
          />
          <MetricCard
            label="Positions"
            value={projection.proposed_allocation.length.toString()}
            icon={<Target className="h-5 w-5" />}
            color="purple"
          />
        </div>

        {/* Allocation Table */}
        <div className="shrink-0">
          <h4 className="text-sm font-bold text-olea-obsidian uppercase tracking-wider mb-4">Proposed Allocation</h4>
          <div className="space-y-2">
            {projection.proposed_allocation.map((position, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3.5 bg-olea-studio-grey/50 border border-zinc-100 rounded-xl hover:bg-white hover:border-zinc-200 transition-all group"
              >
                <span className="font-mono font-bold text-olea-obsidian">{position.ticker}</span>
                <div className="flex items-center gap-4">
                  <div className="w-32 h-2 bg-zinc-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-olea-evergreen"
                      style={{ width: `${position.weight * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm w-16 text-right font-bold text-olea-obsidian">
                    {(position.weight * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reasoning */}
        <div>
          <h4 className="text-sm font-black text-olea-obsidian uppercase tracking-widest mb-4">Analysis & Action Plan</h4>
          <div className="prose prose-zinc max-w-none text-[15px] leading-loose bg-white border border-zinc-200 p-6 rounded-2xl text-olea-obsidian shadow-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {projection.reasoning}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: string
  icon: React.ReactNode
  color: 'emerald' | 'red' | 'blue' | 'purple'
}) {
  const colorClasses = {
    emerald: 'text-olea-evergreen bg-emerald-50 border-olea-evergreen/20',
    red: 'text-red-700 bg-red-50 border-red-200',
    blue: 'text-blue-700 bg-blue-50 border-blue-200',
    purple: 'text-purple-700 bg-purple-50 border-purple-200',
  }

  return (
    <div className={`border rounded-xl p-4 shadow-sm ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
    </div>
  )
}
