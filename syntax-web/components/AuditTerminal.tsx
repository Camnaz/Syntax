'use client'

import { LoopEvent } from '@/hooks/useSyntaxVerification'
import { CheckCircle2, XCircle, AlertCircle, Activity, Eye, Zap } from 'lucide-react'

interface AuditTerminalProps {
  events: LoopEvent[]
  isStreaming: boolean
}

export function AuditTerminal({ events, isStreaming }: AuditTerminalProps) {
  return (
    <div className="bg-olea-obsidian border border-zinc-800 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/5">
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-olea-evergreen" />
          <span className="font-black text-white text-[11px] uppercase tracking-[0.2em]">Audit Terminal v1.0</span>
        </div>
        {isStreaming && (
          <div className="flex items-center gap-2 text-olea-evergreen text-[10px] font-black tracking-widest bg-olea-evergreen/10 px-2 py-1 rounded-md border border-olea-evergreen/20">
            <div className="h-1.5 w-1.5 rounded-full bg-olea-evergreen animate-pulse" />
            LIVE_LOG
          </div>
        )}
      </div>

      <div className="p-4 space-y-2.5 max-h-96 overflow-y-auto font-mono text-[11px] selection:bg-olea-evergreen/30 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {events.length === 0 && !isStreaming && (
          <div className="text-zinc-400 text-center py-8 italic">
            No events yet. Submit an inquiry to start verification.
          </div>
        )}

        {events.map((event, i) => (
          <EventLine key={i} event={event} />
        ))}

        {isStreaming && events.length > 0 && (
          <div className="text-zinc-500 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-zinc-500 animate-pulse" />
            Waiting for next event...
          </div>
        )}
      </div>
    </div>
  )
}

function EventLine({ event }: { event: LoopEvent }) {
  const getIcon = () => {
    switch (event.event) {
      case 'TopicCheck':
        return event.data.is_financial ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-olea-evergreen" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-500" />
        )
      case 'Attempt':
        return <Zap className="h-3.5 w-3.5 text-blue-500" />
      case 'Verified':
        return <CheckCircle2 className="h-3.5 w-3.5 text-olea-evergreen" />
      case 'Rejected':
        return <XCircle className="h-3.5 w-3.5 text-amber-500" />
      case 'Terminated':
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />
      case 'Settled':
        return <CheckCircle2 className="h-3.5 w-3.5 text-olea-evergreen" />
      case 'Error':
        return <XCircle className="h-3.5 w-3.5 text-red-500" />
      default:
        return <Eye className="h-3.5 w-3.5 text-zinc-400" />
    }
  }

  const getColor = () => {
    switch (event.event) {
      case 'TopicCheck':
        return event.data.is_financial ? 'text-olea-evergreen' : 'text-red-400'
      case 'Attempt':
        return 'text-blue-400'
      case 'Verified':
        return 'text-olea-evergreen font-bold'
      case 'Rejected':
        return 'text-amber-400'
      case 'Terminated':
        return 'text-red-400 font-bold'
      case 'Settled':
        return 'text-olea-evergreen font-bold'
      case 'Error':
        return 'text-red-400'
      default:
        return 'text-zinc-500'
    }
  }

  const getMessage = () => {
    switch (event.event) {
      case 'TopicCheck':
        return event.data.is_financial
          ? `✓ Topic classified as financial`
          : `✗ Topic rejected: ${event.data.reason}`
      case 'Attempt':
        return `→ Attempt ${event.data.number} (${event.data.provider})`
      case 'Verified':
        return `✓ Verified on attempt ${event.data.attempt} - Sharpe: ${event.data.projection.projected_sharpe.toFixed(2)}, Drawdown: ${(event.data.projection.projected_max_drawdown * 100).toFixed(1)}%`
      case 'Rejected':
        return `✗ Rejected: ${event.data.reason}`
      case 'Terminated':
        return `⊗ Terminated after ${event.data.total_attempts} attempts: ${event.data.reason}`
      case 'Settled':
        return `✓ SETTLED after ${event.data.total_attempts} attempts`
      case 'Error':
        return `✗ Error: ${event.data.message}`
      default:
        return 'Unknown event'
    }
  }

  return (
    <div className={`flex items-start gap-2 ${getColor()}`}>
      <div className="mt-0.5">{getIcon()}</div>
      <span className="flex-1">{getMessage()}</span>
    </div>
  )
}
