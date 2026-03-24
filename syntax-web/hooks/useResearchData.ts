'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js'

export type ResearchEntry = {
  id: number
  query_text: string
  signal_type: string
  model_used: string
  tier: string
  tokens_used: number
  score: number | null
  sharpe: number | null
  drawdown: number | null
  latency_ms: number | null
  created_at: string
}

export type SystemConstraint = {
  constraint_key: string
  constraint_val: {
    query_count?: number
    avg_score?: number
    avg_sharpe?: number
    avg_tokens?: number
    avg_latency?: number
    uses?: number
    last_seen?: string
  }
  updated_at: string
}

export type GlobalHealth = {
  total_queries: number
  queries_24h: number
  unique_users: number
  avg_score: number | null
  top_signals: Array<{ signal: string; count: number }> | null
}

export function useResearchData(userId: string | undefined) {
  const supabase = useMemo(() => createClient(), [])
  const [entries, setEntries] = useState<ResearchEntry[]>([])
  const [constraints, setConstraints] = useState<SystemConstraint[]>([])
  const [globalHealth, setGlobalHealth] = useState<GlobalHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (attempt = 1) => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const [logRes, consRes, healthRes] = await Promise.all([
        supabase
          .from('research_log')
          .select('id, query_text, signal_type, model_used, tier, tokens_used, score, sharpe, drawdown, latency_ms, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('system_constraints')
          .select('constraint_key, constraint_val, updated_at')
          .order('updated_at', { ascending: false }),
        supabase.rpc('get_global_research_health'),
      ]) as [PostgrestResponse<ResearchEntry>, PostgrestResponse<SystemConstraint>, PostgrestSingleResponse<GlobalHealth>]

      if (logRes.error) {
        // Check for schema cache error and retry once
        const errorMsg = logRes.error.message || logRes.error.details || ''
        if (errorMsg.includes('schema cache') && attempt < 2) {
          // Wait 500ms and retry once
          await new Promise(r => setTimeout(r, 500))
          return refresh(attempt + 1)
        }
        // Show actual DB error rather than generic fallback
        setError(logRes.error.message || logRes.error.details || 'research_log query failed')
      } else {
        setEntries(logRes.data || [])
      }
      if (!consRes.error) setConstraints(consRes.data || [])
      if (!healthRes.error && healthRes.data) setGlobalHealth(healthRes.data)
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message
      setError(msg || String(err) || 'Failed to load research data')
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { entries, constraints, globalHealth, loading, error, refresh }
}
