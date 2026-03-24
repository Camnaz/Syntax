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
    case 'buy':            return 'text-olea-evergreen bg-emerald-50 border-olea-evergreen/20'
    case 'sell':           return 'text-red-700 bg-red-50 border-red-200'
    case 'hold':           return 'text-amber-700 bg-amber-50 border-amber-200'
    case 'hedge':          return 'text-purple-700 bg-purple-50 border-purple-200'
    case 'rebalance':      return 'text-blue-700 bg-blue-50 border-blue-200'
    case 'capital_deploy': return 'text-sky-700 bg-sky-50 border-sky-200'
    default:               return 'text-zinc-600 bg-zinc-100 border-zinc-200'
  }
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-zinc-300 text-[10px] font-black uppercase tracking-widest">—</span>
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? 'text-olea-evergreen' : pct >= 50 ? 'text-amber-600' : 'text-red-600'
  return (
    <div className="flex flex-col items-end">
      <span className={`text-sm font-mono font-black ${color}`}>{pct}%</span>
      <span className="text-[8px] font-black text-zinc-400 uppercase tracking-tighter">Confidence</span>
    </div>
  )
}

function SignalRow({ entry }: { entry: ResearchEntry }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-zinc-200 rounded-2xl overflow-hidden hover:border-olea-evergreen/40 hover:shadow-lg transition-all cursor-pointer bg-white shadow-sm" onClick={() => setExpanded(v => !v)}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${signalColor(entry.signal_type)}`}>{entry.signal_type}</span>
        <p className="flex-1 text-sm text-olea-obsidian font-bold truncate">{entry.query_text || '(no text)'}</p>
        <div className="shrink-0 flex items-center gap-4">
          <ScoreBadge score={entry.score} />
          {entry.latency_ms != null && <span className="text-[10px] font-black font-mono text-zinc-400 hidden sm:block uppercase tracking-tighter">{(entry.latency_ms / 1000).toFixed(1)}s</span>}
          <span className="text-[10px] font-black text-zinc-400 hidden sm:block uppercase tracking-tighter">{formatDate(entry.created_at)}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-100 bg-olea-studio-grey/30 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs">
          <div><span className="text-zinc-400 uppercase text-[9px] font-black tracking-[0.15em]">Model</span><div className="text-olea-obsidian font-mono font-bold mt-1 text-[11px]">{entry.model_used}</div></div>
          <div><span className="text-zinc-400 uppercase text-[9px] font-black tracking-[0.15em]">Tier</span><div className="text-olea-obsidian font-mono font-bold mt-1 text-[11px] uppercase tracking-wider">{entry.tier}</div></div>
          <div><span className="text-zinc-400 uppercase text-[9px] font-black tracking-[0.15em]">Tokens</span><div className="text-olea-obsidian font-mono font-bold mt-1 text-[11px]">{entry.tokens_used.toLocaleString()}</div></div>
          {entry.sharpe != null && <div><span className="text-zinc-400 uppercase text-[9px] font-black tracking-[0.15em]">Sharpe</span><div className="text-olea-evergreen font-mono font-black mt-1 text-[11px]">{entry.sharpe.toFixed(2)}</div></div>}
          {entry.drawdown != null && <div><span className="text-zinc-400 uppercase text-[9px] font-black tracking-[0.15em]">Drawdown</span><div className="text-red-600 font-mono font-black mt-1 text-[11px]">{entry.drawdown.toFixed(1)}%</div></div>}
        </div>
      )}
    </div>
  )
}

function PromptTips({ constraints }: { constraints: SystemConstraint[] }) {
  const signals = constraints.filter(c => c.constraint_key.startsWith('signal_'))
  const models = constraints.filter(c => c.constraint_key.startsWith('model_'))
  if (!signals.length && !models.length) return (
    <div className="flex flex-col items-center justify-center py-24 text-zinc-400 text-sm text-center selection:bg-olea-evergreen/10">
      <div className="p-4 bg-olea-evergreen/5 rounded-full mb-6">
        <Lightbulb className="h-10 w-10 opacity-40 text-olea-evergreen" />
      </div>
      <p className="text-olea-obsidian font-black uppercase tracking-widest text-base">No patterns found</p>
      <p className="text-xs mt-3 text-olea-obsidian/50 max-w-[240px] leading-loose font-medium">Olea Syntax autonomous engine learns from your research loops over time. Continue verifying to see insights.</p>
    </div>
  )
  return (
    <div className="space-y-8 selection:bg-olea-evergreen/10">
      {signals.length > 0 && (
        <div>
          <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-4 px-1">Signal Intelligence</div>
          {signals.map(c => {
            const sig = c.constraint_key.replace('signal_', ''); const v = c.constraint_val
            return (
              <div key={c.constraint_key} className="flex items-center gap-4 px-5 py-4 rounded-2xl border border-zinc-200 bg-white shadow-sm mb-3 hover:border-olea-evergreen/40 hover:shadow-lg transition-all group">
                <span className={`shrink-0 text-[10px] font-black px-2.5 py-1 rounded border uppercase tracking-[0.15em] ${signalColor(sig)}`}>{sig}</span>
                <div className="flex-1 grid grid-cols-3 gap-6 text-xs">
                  <div><span className="text-zinc-400 font-black uppercase text-[9px] tracking-widest">Loops</span><div className="text-olea-obsidian font-mono font-black text-sm mt-0.5">{v.query_count ?? '—'}</div></div>
                  <div><span className="text-zinc-400 font-black uppercase text-[9px] tracking-widest">Accuracy</span><div className="text-olea-evergreen font-mono font-black text-sm mt-0.5">{v.avg_score != null ? `${Math.round(v.avg_score * 100)}%` : '—'}</div></div>
                  <div><span className="text-zinc-400 font-black uppercase text-[9px] tracking-widest">Intensity</span><div className="text-olea-obsidian font-mono font-black text-sm mt-0.5">{v.avg_tokens ?? '—'}</div></div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {models.length > 0 && (
        <div>
          <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-4 px-1">Routing Performance</div>
          {models.map(c => {
            const model = c.constraint_key.replace('model_', ''); const v = c.constraint_val
            return (
              <div key={c.constraint_key} className="flex items-center gap-4 px-5 py-4 rounded-2xl border border-zinc-200 bg-white shadow-sm mb-3 hover:border-olea-evergreen/40 hover:shadow-lg transition-all group">
                <span className="shrink-0 text-[10px] font-mono font-black text-olea-obsidian bg-olea-studio-grey px-2.5 py-1 rounded-lg border border-zinc-200 uppercase tracking-tighter shadow-inner">{model}</span>
                <div className="flex-1 grid grid-cols-3 gap-6 text-xs">
                  <div><span className="text-zinc-400 font-black uppercase text-[9px] tracking-widest">Uses</span><div className="text-olea-obsidian font-mono font-black text-sm mt-0.5">{v.uses ?? '—'}</div></div>
                  <div><span className="text-zinc-400 font-black uppercase text-[9px] tracking-widest">Speed</span><div className="text-amber-600 font-mono font-black text-sm mt-0.5">{v.avg_latency != null ? `${(v.avg_latency / 1000).toFixed(1)}s` : '—'}</div></div>
                  <div><span className="text-zinc-400 font-black uppercase text-[9px] tracking-widest">Confidence</span><div className="text-olea-evergreen font-mono font-black text-sm mt-0.5">{v.avg_score != null ? `${Math.round(v.avg_score * 100)}%` : '—'}</div></div>
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
    <div className="flex-1 overflow-y-auto bg-olea-studio-grey selection:bg-olea-evergreen/10">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-olea-evergreen/10 rounded-xl shadow-sm border border-olea-evergreen/10">
              <FlaskConical className="h-5 w-5 text-olea-evergreen" />
            </div>
            <h2 className="text-xl font-black text-olea-obsidian uppercase tracking-tight">Loop Analytics</h2>
          </div>
          <button 
            onClick={() => refresh()} 
            disabled={loading} 
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 bg-white text-olea-obsidian text-xs font-black uppercase tracking-widest hover:bg-olea-paper hover:border-zinc-300 transition-all disabled:opacity-50 shadow-sm active:scale-[0.98]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync Data</span>
          </button>
        </div>

        {error && <div className="text-red-700 text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-3 font-medium flex items-center gap-2"><Zap className="h-4 w-4" />{error}</div>}

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: <TrendingUp className="h-3.5 w-3.5" />, label: 'Queries', value: entries.length, color: 'text-olea-obsidian' },
            { icon: <Clock      className="h-3.5 w-3.5" />, label: 'Today',   value: queriesToday,  color: 'text-olea-obsidian' },
            { icon: <Zap        className="h-3.5 w-3.5" />, label: 'Avg Accuracy',  value: avgScore != null && !isNaN(avgScore) ? `${Math.round(avgScore * 100)}%` : '—', color: 'text-olea-evergreen' },
            { icon: <Activity   className="h-3.5 w-3.5" />, label: 'Latency', value: avgLatency != null ? `${(avgLatency / 1000).toFixed(1)}s` : '—', color: 'text-amber-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center gap-2 text-zinc-400 mb-2 group-hover:text-olea-obsidian transition-colors">{s.icon}<span className="text-[10px] font-black uppercase tracking-[0.15em]">{s.label}</span></div>
              <div className={`text-2xl font-black tracking-tighter ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Inner Tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-200 pt-2">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setInnerTab(t.id)} className={`flex items-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 -mb-px ${innerTab === t.id ? 'text-olea-evergreen border-olea-evergreen' : 'text-zinc-400 border-transparent hover:text-olea-obsidian'}`}>
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
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400 text-sm">
                <Activity className="h-8 w-8 mb-3 opacity-30" /><p>No signals yet — make your first query.</p>
              </div>
            ) : entries.map(e => <SignalRow key={e.id} entry={e} />)}
          </div>
        )}

        {innerTab === 'tips' && <PromptTips constraints={constraints} />}

        {innerTab === 'global' && (
          <div className="space-y-4">
            {!globalHealth ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400 text-sm"><BarChart2 className="h-8 w-8 mb-3 opacity-30" /><p>No global data yet.</p></div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { icon: <TrendingUp className="h-3.5 w-3.5" />, label: 'Total Loops', value: globalHealth.total_queries },
                    { icon: <Activity   className="h-3.5 w-3.5" />, label: 'Last 24h',      value: globalHealth.queries_24h },
                    { icon: <Users      className="h-3.5 w-3.5" />, label: 'Unique Users',  value: globalHealth.unique_users },
                    { icon: <Zap        className="h-3.5 w-3.5" />, label: 'System Accuracy',     value: globalHealth.avg_score != null ? `${Math.round(globalHealth.avg_score * 100)}%` : '—' },
                  ].map(s => (
                    <div key={s.label} className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group">
                      <div className="flex items-center gap-2 text-zinc-400 mb-2 group-hover:text-olea-obsidian transition-colors">{s.icon}<span className="text-[10px] font-black uppercase tracking-[0.15em]">{s.label}</span></div>
                      <div className="text-2xl font-black tracking-tighter text-olea-obsidian">{s.value}</div>
                    </div>
                  ))}
                </div>
                {globalHealth.top_signals && globalHealth.top_signals.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-4 px-1">Network Signal Distribution</div>
                    <div className="space-y-3">
                      {globalHealth.top_signals.map(s => (
                        <div key={s.signal} className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-zinc-200 bg-white shadow-sm hover:border-olea-evergreen/20 transition-all group">
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded border uppercase tracking-widest ${signalColor(s.signal)}`}>{s.signal}</span>
                          <div className="flex-1 bg-olea-studio-grey rounded-full h-2 overflow-hidden shadow-inner">
                            <div className="bg-olea-evergreen h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min(100, (s.count / (globalHealth.top_signals?.[0]?.count ?? 1)) * 100)}%` }} />
                          </div>
                          <span className="text-xs font-mono text-olea-obsidian font-black w-12 text-right">{s.count}</span>
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
