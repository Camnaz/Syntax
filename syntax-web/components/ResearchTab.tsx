'use client'

import { useState } from 'react'
import { FlaskConical, Activity, BarChart2, Lightbulb, RefreshCw, TrendingUp, Clock, Zap, Users } from 'lucide-react'
import { useResearchData, type ResearchEntry, type SystemConstraint } from '@/hooks/useResearchData'

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function signalColor(sig: string): string {
  switch (sig.toLowerCase()) {
    case 'buy':            return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    case 'sell':           return 'text-red-400 bg-red-500/10 border-red-500/20'
    case 'hold':           return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    case 'hedge':          return 'text-purple-400 bg-purple-500/10 border-purple-500/20'
    case 'rebalance':      return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    case 'capital_deploy': return 'text-sky-400 bg-sky-500/10 border-sky-500/20'
    default:               return 'text-zinc-400 bg-zinc-800 border-zinc-700'
  }
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-zinc-600 text-xs">—</span>
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
  return <span className={`text-xs font-mono font-semibold ${color}`}>{pct}%</span>
}

function SignalRow({ entry }: { entry: ResearchEntry }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition-colors cursor-pointer" onClick={() => setExpanded(v => !v)}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide ${signalColor(entry.signal_type)}`}>{entry.signal_type}</span>
        <p className="flex-1 text-sm text-zinc-300 truncate">{entry.query_text || '(no text)'}</p>
        <div className="shrink-0 flex items-center gap-3">
          <ScoreBadge score={entry.score} />
          {entry.latency_ms != null && <span className="text-xs font-mono text-zinc-500 hidden sm:block">{(entry.latency_ms / 1000).toFixed(1)}s</span>}
          <span className="text-xs text-zinc-600 hidden sm:block">{formatDate(entry.created_at)}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-zinc-800/60 bg-zinc-900/30 grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 text-xs">
          <div><span className="text-zinc-600">Model</span><div className="text-zinc-300 font-mono mt-0.5">{entry.model_used}</div></div>
          <div><span className="text-zinc-600">Tier</span><div className="text-zinc-300 font-mono mt-0.5">{entry.tier}</div></div>
          <div><span className="text-zinc-600">Tokens</span><div className="text-zinc-300 font-mono mt-0.5">{entry.tokens_used.toLocaleString()}</div></div>
          {entry.sharpe != null && <div><span className="text-zinc-600">Sharpe</span><div className="text-emerald-400 font-mono mt-0.5">{entry.sharpe.toFixed(2)}</div></div>}
          {entry.drawdown != null && <div><span className="text-zinc-600">Drawdown</span><div className="text-red-400 font-mono mt-0.5">{entry.drawdown.toFixed(1)}%</div></div>}
        </div>
      )}
    </div>
  )
}

function PromptTips({ constraints }: { constraints: SystemConstraint[] }) {
  const signals = constraints.filter(c => c.constraint_key.startsWith('signal_'))
  const models = constraints.filter(c => c.constraint_key.startsWith('model_'))
  if (!signals.length && !models.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-600 text-sm text-center">
      <Lightbulb className="h-8 w-8 mb-3 opacity-40" />
      <p>No constraint data yet.</p>
      <p className="text-xs mt-1 text-zinc-700">Run <code className="bg-zinc-800 px-1 rounded">SELECT * FROM private.upgrade_system_constraints();</code> in Supabase SQL editor.</p>
    </div>
  )
  return (
    <div className="space-y-4">
      {signals.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Signal Performance</div>
          {signals.map(c => {
            const sig = c.constraint_key.replace('signal_', ''); const v = c.constraint_val
            return (
              <div key={c.constraint_key} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/30 mb-2">
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border uppercase ${signalColor(sig)}`}>{sig}</span>
                <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-zinc-600">Queries</span><div className="text-zinc-300 font-mono">{v.query_count ?? '—'}</div></div>
                  <div><span className="text-zinc-600">Avg Score</span><div className="text-emerald-400 font-mono">{v.avg_score != null ? `${Math.round(v.avg_score * 100)}%` : '—'}</div></div>
                  <div><span className="text-zinc-600">Avg Tokens</span><div className="text-zinc-300 font-mono">{v.avg_tokens ?? '—'}</div></div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {models.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Model Performance</div>
          {models.map(c => {
            const model = c.constraint_key.replace('model_', ''); const v = c.constraint_val
            return (
              <div key={c.constraint_key} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/30 mb-2">
                <span className="shrink-0 text-xs font-mono text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">{model}</span>
                <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-zinc-600">Uses</span><div className="text-zinc-300 font-mono">{v.uses ?? '—'}</div></div>
                  <div><span className="text-zinc-600">Avg Latency</span><div className="text-amber-400 font-mono">{v.avg_latency != null ? `${(v.avg_latency / 1000).toFixed(1)}s` : '—'}</div></div>
                  <div><span className="text-zinc-600">Avg Score</span><div className="text-emerald-400 font-mono">{v.avg_score != null ? `${Math.round(v.avg_score * 100)}%` : '—'}</div></div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type InnerTab = 'signals' | 'tips' | 'global'

export function ResearchTab({ userId }: { userId: string | undefined }) {
  const { entries, constraints, globalHealth, loading, error, refresh } = useResearchData(userId)
  const [innerTab, setInnerTab] = useState<InnerTab>('signals')

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const queriesToday = entries.filter(e => new Date(e.created_at) >= today).length
  const scored = entries.filter(e => e.score != null)
  const avgScore = scored.length > 0 ? scored.reduce((s, e) => s + (e.score ?? 0), 0) / scored.length : null
  const latencies = entries.filter(e => e.latency_ms != null)
  const avgLatency = latencies.length > 0 ? latencies.reduce((s, e) => s + (e.latency_ms ?? 0), 0) / latencies.length : null

  const tabs: { id: InnerTab; label: string; icon: React.ReactNode }[] = [
    { id: 'signals', label: 'Signals',       icon: <Activity   className="h-3.5 w-3.5" /> },
    { id: 'tips',    label: 'Prompt Tips',   icon: <Lightbulb  className="h-3.5 w-3.5" /> },
    { id: 'global',  label: 'Global Health', icon: <BarChart2  className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-950">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-emerald-500" />
            <h2 className="text-lg font-bold text-zinc-100">Research</h2>
          </div>
          <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-400 text-xs hover:bg-zinc-800 transition-colors disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>

        {error && <div className="text-amber-400 text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">{error}</div>}

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: <TrendingUp className="h-3.5 w-3.5" />, label: 'My Queries', value: entries.length, color: 'text-zinc-100' },
            { icon: <Activity   className="h-3.5 w-3.5" />, label: 'Today',      value: queriesToday,  color: 'text-zinc-100' },
            { icon: <Zap        className="h-3.5 w-3.5" />, label: 'Avg Score',  value: avgScore != null && !isNaN(avgScore) ? `${Math.round(avgScore * 100)}%` : '—', color: 'text-emerald-400' },
            { icon: <Clock      className="h-3.5 w-3.5" />, label: 'Avg Latency',value: avgLatency != null ? `${(avgLatency / 1000).toFixed(1)}s` : '—', color: 'text-zinc-100' },
          ].map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-zinc-500 mb-1.5">{s.icon}<span className="text-xs">{s.label}</span></div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Inner Tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-800">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setInnerTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${innerTab === t.id ? 'text-emerald-400 border-emerald-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {innerTab === 'signals' && (
          <div className="space-y-2">
            {loading && entries.length === 0 ? (
              <div className="flex items-center gap-2 text-zinc-500 py-12 justify-center text-sm"><RefreshCw className="h-4 w-4 animate-spin" />Loading…</div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-600 text-sm">
                <Activity className="h-8 w-8 mb-3 opacity-40" /><p>No signals yet — make your first query.</p>
              </div>
            ) : entries.map(e => <SignalRow key={e.id} entry={e} />)}
          </div>
        )}

        {innerTab === 'tips' && <PromptTips constraints={constraints} />}

        {innerTab === 'global' && (
          <div className="space-y-4">
            {!globalHealth ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-600 text-sm"><BarChart2 className="h-8 w-8 mb-3 opacity-40" /><p>No global data yet.</p></div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: <TrendingUp className="h-3.5 w-3.5" />, label: 'Total Queries', value: globalHealth.total_queries },
                    { icon: <Activity   className="h-3.5 w-3.5" />, label: 'Last 24h',      value: globalHealth.queries_24h },
                    { icon: <Users      className="h-3.5 w-3.5" />, label: 'Unique Users',  value: globalHealth.unique_users },
                    { icon: <Zap        className="h-3.5 w-3.5" />, label: 'Avg Score',     value: globalHealth.avg_score != null ? `${Math.round(globalHealth.avg_score * 100)}%` : '—' },
                  ].map(s => (
                    <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-zinc-500 mb-1.5">{s.icon}<span className="text-xs">{s.label}</span></div>
                      <div className="text-2xl font-bold text-zinc-100">{s.value}</div>
                    </div>
                  ))}
                </div>
                {globalHealth.top_signals && globalHealth.top_signals.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Top Signal Types</div>
                    <div className="space-y-2">
                      {globalHealth.top_signals.map(s => (
                        <div key={s.signal} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-zinc-800">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide ${signalColor(s.signal)}`}>{s.signal}</span>
                          <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
                            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (s.count / (globalHealth.top_signals?.[0]?.count ?? 1)) * 100)}%` }} />
                          </div>
                          <span className="text-xs font-mono text-zinc-400">{s.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
