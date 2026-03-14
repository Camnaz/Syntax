'use client'

import { useState, useCallback, useRef } from 'react'

export type UsageWarningData = {
  warning_level: 'soft' | 'urgent' | 'blocked'
  current_cost_cents: number
  limit_cents: number
  message: string
}

export type LoopEvent =
  | { event: 'TopicCheck'; data: { is_financial: boolean; reason: string } }
  | { event: 'Attempt'; data: { number: number; provider: string } }
  | { event: 'Verified'; data: { attempt: number; projection: TrajectoryProjection; score: number; is_new_best: boolean; sharpe: number; drawdown: number; confidence: number } }
  | { event: 'Rejected'; data: { attempt: number; reason: string } }
  | { event: 'Terminated'; data: { total_attempts: number; reason: string } }
  | { event: 'Settled'; data: { total_attempts: number; final_projection: TrajectoryProjection } }
  | { event: 'Error'; data: { message: string } }
  | { event: 'Slow'; data: { attempt: number; timeout_secs: number } }
  | { event: 'UsageWarning'; data: UsageWarningData }
  | { event: 'NeedsTopup'; data: { status: string; reason: string } }

export interface ScenarioChartParams {
  enabled: boolean
  initial_capital: number
  time_horizon_days: number
  bull_annual_return: number
  base_annual_return: number
  bear_annual_return: number
  volatility: number
  dca_monthly_amount: number
  suggested_sell_points: number[]
}

export type PendingAction = {
  id: string
  type: 'update_risk_profile' | 'update_position' | 'add_position' | 'remove_position' | 'update_cash'
  description: string
  data: Record<string, unknown>
  status: 'pending' | 'confirmed' | 'dismissed'
}

export interface TrajectoryProjection {
  portfolio_id: string
  timestamp: string
  proposed_allocation: Array<{ ticker: string; weight: number }>
  projected_sharpe: number
  projected_max_drawdown: number
  confidence_score: number
  scenario_chart?: ScenarioChartParams
  pending_actions?: PendingAction[]
  reasoning: string
}

export interface VerificationState {
  events: LoopEvent[]
  isStreaming: boolean
  startedAt: number | null
  error: string | null
  finalProjection: TrajectoryProjection | null
  isTopicRejected: boolean
  isTerminated: boolean
  usageWarning: UsageWarningData | null
  needsTopup: boolean
}

export interface VerificationResult {
  finalProjection: TrajectoryProjection | null
  terminatedReason: string | null
  error: string | null
  usageWarning: UsageWarningData | null
  needsTopup: boolean
}

export function useSyntaxVerification() {
  const [state, setState] = useState<VerificationState>({
    events: [],
    isStreaming: false,
    startedAt: null,
    error: null,
    finalProjection: null,
    isTopicRejected: false,
    isTerminated: false,
    usageWarning: null,
    needsTopup: false,
  })

  const eventSourceRef = useRef<EventSource | null>(null)

  const verify = useCallback(
    async (
      inquiry: string,
      portfolioId: string,
      jwt: string,
      chatHistory?: { role: string; content: string }[],
      stockMemories?: { ticker: string; fact: string }[],
      livePrices?: { ticker: string; price: number }[]
    ): Promise<VerificationResult> => {
      // Reset state
      setState({
        events: [],
        isStreaming: true,
        startedAt: Date.now(),
        error: null,
        finalProjection: null,
        isTopicRejected: false,
        isTerminated: false,
        usageWarning: null,
        needsTopup: false,
      })

      let finalProjection: TrajectoryProjection | null = null
      let terminatedReason: string | null = null
      let errorMsg: string | null = null
      let usageWarning: UsageWarningData | null = null
      let needsTopup = false

      try {
        const apiUrl = process.env.NEXT_PUBLIC_SYNTAX_API_URL || 'http://localhost:8080'
        const url = `${apiUrl}/v1/verify`

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            inquiry,
            portfolio_id: portfolioId,
            chat_history: chatHistory,
            stock_memories: stockMemories,
            live_prices: livePrices,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        if (!response.body) {
          throw new Error('No response body')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        const processLine = (line: string) => {
          if (!line.startsWith('data: ')) return
          const data = line.slice(6)
          if (!data.trim()) return

          try {
            const event = JSON.parse(data) as LoopEvent

            // Update local variables immediately so the return value is correct
            if (event.event === 'TopicCheck' && !event.data.is_financial) {
              terminatedReason = `Topic rejected: ${event.data.reason}`
            } else if (event.event === 'Settled') {
              finalProjection = event.data.final_projection
            } else if (event.event === 'Terminated') {
              terminatedReason = event.data.reason
            } else if (event.event === 'Error') {
              errorMsg = event.data.message
            } else if (event.event === 'UsageWarning') {
              usageWarning = event.data
            } else if (event.event === 'NeedsTopup') {
              needsTopup = true
            }

            // Then update React state
            setState((prev) => {
              const newEvents = [...prev.events, event]
              const newState: Partial<VerificationState> = { events: newEvents }

              if (event.event === 'TopicCheck' && !event.data.is_financial) {
                newState.isTopicRejected = true
                newState.isStreaming = false
              } else if (event.event === 'Settled') {
                newState.finalProjection = event.data.final_projection
                newState.isStreaming = false
              } else if (event.event === 'Terminated') {
                newState.isTerminated = true
                newState.isStreaming = false
              } else if (event.event === 'Error') {
                newState.error = event.data.message
                // NOTE: do NOT set isStreaming=false here — Error is a retry notification,
                // not a terminal event. The stream continues until Settled or Terminated.
              } else if (event.event === 'UsageWarning') {
                newState.usageWarning = event.data
                if (event.data.warning_level === 'blocked') {
                  newState.isStreaming = false
                }
              } else if (event.event === 'NeedsTopup') {
                newState.needsTopup = true
                newState.isStreaming = false
              }

              return { ...prev, ...newState }
            })
          } catch (e) {
            console.error('Failed to parse SSE event:', e, 'Raw data:', data.substring(0, 200))
          }
        }

        while (true) {
          const { done, value } = await reader.read()

          if (value) {
            buffer += decoder.decode(value, { stream: !done })
          } else if (done) {
            // Flush the decoder
            buffer += decoder.decode()
          }

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            processLine(line)
          }

          if (done) {
            // Process any remaining data in the buffer after stream ends
            if (buffer.trim()) {
              processLine(buffer)
            }
            break
          }
        }
        
        return { finalProjection, terminatedReason, error: errorMsg, usageWarning, needsTopup }
      } catch (error: any) {
        const msg = error.message || 'Verification failed'
        setState((prev) => ({
          ...prev,
          error: msg,
          isStreaming: false,
        }))
        return { finalProjection: null, terminatedReason: null, error: msg, usageWarning: null, needsTopup: false }
      } finally {
        setState((prev) => ({ ...prev, isStreaming: false }))
      }
    },
    []
  )

  const reset = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setState({
      events: [],
      isStreaming: false,
      startedAt: null,
      error: null,
      finalProjection: null,
      isTopicRejected: false,
      isTerminated: false,
      usageWarning: null,
      needsTopup: false,
    })
  }, [])

  const loadHistoricalProjection = useCallback((projection: TrajectoryProjection) => {
    setState({
      events: [{ event: 'Settled', data: { total_attempts: 1, final_projection: projection } }] as unknown as LoopEvent[],
      isStreaming: false,
      startedAt: null,
      error: null,
      finalProjection: projection,
      isTopicRejected: false,
      isTerminated: false,
      usageWarning: null,
      needsTopup: false,
    })
  }, [])

  return {
    ...state,
    verify,
    reset,
    loadHistoricalProjection,
  }
}
