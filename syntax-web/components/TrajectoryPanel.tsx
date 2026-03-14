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
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
        <div className="text-center text-zinc-500">
          <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No projection yet. Run a verification to see results.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden flex flex-col h-full max-h-[800px]">
      <div className="border-b border-zinc-800 px-6 py-4 shrink-0">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Target className="h-5 w-5 text-emerald-400" />
          Verified Trajectory
        </h3>
        <p className="text-sm text-zinc-400 mt-1">
          {new Date(projection.timestamp).toLocaleString()}
        </p>
      </div>

      <div className="p-6 space-y-6 overflow-y-auto">
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
          <h4 className="font-semibold mb-3">Proposed Allocation</h4>
          <div className="space-y-2">
            {projection.proposed_allocation.map((position, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg"
              >
                <span className="font-mono font-semibold">{position.ticker}</span>
                <div className="flex items-center gap-4">
                  <div className="w-32 h-2 bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${position.weight * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm w-16 text-right">
                    {(position.weight * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reasoning */}
        <div>
          <h4 className="font-semibold mb-3">Analysis & Action Plan</h4>
          <div className="prose prose-invert prose-emerald max-w-none text-sm leading-relaxed bg-zinc-800/30 p-6 rounded-lg">
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
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  }

  return (
    <div className={`border rounded-lg p-4 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium opacity-80">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}
