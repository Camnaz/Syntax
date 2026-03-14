'use client'

import { LoopEvent } from '@/hooks/useSyntaxVerification'
import { CheckCircle2, XCircle, AlertCircle, Activity, Eye, Zap } from 'lucide-react'

interface AuditTerminalProps {
  events: LoopEvent[]
  isStreaming: boolean
}

export function AuditTerminal({ events, isStreaming }: AuditTerminalProps) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold">Audit Terminal</span>
        </div>
        {isStreaming && (
          <div className="flex items-center gap-2 text-emerald-400 text-sm">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Streaming
          </div>
        )}
      </div>

      <div className="p-4 space-y-2 max-h-96 overflow-y-auto font-mono text-sm">
        {events.length === 0 && !isStreaming && (
          <div className="text-zinc-500 text-center py-8">
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
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <XCircle className="h-4 w-4 text-red-400" />
        )
      case 'Attempt':
        return <Zap className="h-4 w-4 text-blue-400" />
      case 'Verified':
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      case 'Rejected':
        return <XCircle className="h-4 w-4 text-yellow-400" />
      case 'Terminated':
        return <AlertCircle className="h-4 w-4 text-red-400" />
      case 'Settled':
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      case 'Error':
        return <XCircle className="h-4 w-4 text-red-400" />
      default:
        return <Eye className="h-4 w-4 text-zinc-400" />
    }
  }

  const getColor = () => {
    switch (event.event) {
      case 'TopicCheck':
        return event.data.is_financial ? 'text-emerald-400' : 'text-red-400'
      case 'Attempt':
        return 'text-blue-400'
      case 'Verified':
        return 'text-emerald-400'
      case 'Rejected':
        return 'text-yellow-400'
      case 'Terminated':
        return 'text-red-400'
      case 'Settled':
        return 'text-emerald-400'
      case 'Error':
        return 'text-red-400'
      default:
        return 'text-zinc-400'
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
