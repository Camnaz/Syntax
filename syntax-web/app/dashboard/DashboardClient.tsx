'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchStockPrices } from '@/lib/stockPrices'
import { useSyntaxVerification, PendingAction, TrajectoryProjection, LoopEvent, UsageWarningData } from '@/hooks/useSyntaxVerification'
import { TierGate, DevToolsBar, type Tier } from '@/components/TierGate'
import { PortfolioSidebar } from '@/components/portfolio/PortfolioSidebar'
import { Shield, LogOut, Send, MessageSquare, Plus, ChevronDown, ChevronRight, Activity, Zap, CheckCircle2, XCircle, AlertCircle, Settings, Newspaper, Check, X, TrendingUp, ExternalLink, Search, CreditCard, FlaskConical } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Area, AreaChart } from 'recharts'

const NEW_PORTFOLIO_PROMPTS = [
  "What stock should I buy right now? I have $1000 in cash and want to maximize growth with moderate risk.",
  "Is it a good time to buy more VTI, or should I wait for a market pullback?",
  "If I wanted to buy a stock that is highly undervalued right now, what stock should I buy with $500?",
  "What are the top 3 tech stocks to invest in for the next 5 years?",
  "I want to build a dividend portfolio with $5000. What should I buy?",
  "What is a safe ETF to park cash in while waiting for the market to cool down?"
]

const ACTIVE_PORTFOLIO_PROMPTS = [
  "How should I position my portfolio for upcoming rate cuts based on my current holdings?",
  "Analyze rotating 20% of my portfolio into BND for drawdown protection.",
  "Should I rebalance my portfolio? I feel like I'm too heavily weighted in tech.",
  "Are any of my current positions at risk due to recent news?",
  "What is the best way to hedge my current portfolio against a market crash?",
  "Do you see any immediate red flags with my current allocation?"
]

type ChatMsg = {
  role: 'user' | 'assistant'
  content: string
  projection_data?: TrajectoryProjection
}

type ChatSession = {
  id: string
  title: string
  created_at: string
}

type NewsItem = {
  id: number
  headline: string
  summary: string
  source: string
  url: string
  datetime: number
  category: string
  related: string
}

type StockMemory = {
  id: string
  ticker: string
  fact: string
  source: string | null
}

const TRENDING_QUERIES = [
  { query: 'Best defensive stocks during a recession', category: 'Strategy' },
  { query: 'How to hedge a concentrated tech portfolio', category: 'Risk' },
  { query: 'Dividend stocks with 5%+ yield that are still growing', category: 'Income' },
  { query: 'Should I buy the dip or wait for confirmation?', category: 'Timing' },
  { query: 'How much of my portfolio should be in cash right now?', category: 'Allocation' },
  { query: 'Best ETFs for long-term passive investing', category: 'ETFs' },
  { query: 'How to build a portfolio that beats inflation', category: 'Strategy' },
  { query: 'When should I rebalance my portfolio?', category: 'Rebalance' },
]

export default function DashboardClient() {
  const router = useRouter()
  const supabase = createClient()
  const verification = useSyntaxVerification()
  
  const [user, setUser] = useState<User | null>(null)
  const [currentTier, setCurrentTier] = useState<Tier>('observer')
  // Dev-only state — never set in production builds (NODE_ENV guard inside DevToolsBar)
  const [devBypass, setDevBypass] = useState(true)
  const [devTierOverride, setDevTierOverride] = useState<Tier | null>(null)
  const [inquiry, setInquiry] = useState('')
  const [portfolioId, setPortfolioId] = useState<string>('')
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([])
  
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isPortfolioSidebarOpen, setIsPortfolioSidebarOpen] = useState(false)
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([])
  const [showHomepage, setShowHomepage] = useState(false)
  const [newsItems, setNewsItems] = useState<NewsItem[]>([])
  const [newsContext, setNewsContext] = useState<string[]>([])
  const [stockMemories, setStockMemories] = useState<StockMemory[]>([])
  const [verificationCount, setVerificationCount] = useState(0)
  const [verificationLimit, setVerificationLimit] = useState(3)
  const [accessToken, setAccessToken] = useState<string>('')
  const [positionTickers, setPositionTickers] = useState<string[]>([])
  const [showResearchLog, setShowResearchLog] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const maxFreeUses = Number(process.env.NEXT_PUBLIC_OBSERVER_FREE_VERIFICATIONS ?? 3)
  const remainingFreeUses = Math.max(verificationLimit - verificationCount, 0)
  // effectiveTier: in dev builds a developer can simulate any tier; in prod always the real tier
  const effectiveTier: Tier = (process.env.NODE_ENV === 'development' && devTierOverride) ? devTierOverride : currentTier

  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([])

  const loadSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId)
    setShowHomepage(false)
    verification.reset()
    
    const { data } = await supabase
      .from('chat_messages')
      .select('role, content, projection_data')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (data) {
      setChatHistory(data.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content, projection_data: m.projection_data as unknown as TrajectoryProjection | undefined })))
    }
  }

  const handleNewChat = () => {
    setCurrentSessionId(null)
    setChatHistory([])
    setInquiry('')
    setShowHomepage(false)
    verification.reset()
  }

  const deleteSession = async (sessionId: string) => {
    await supabase.from('chat_messages').delete().eq('session_id', sessionId)
    await supabase.from('chat_sessions').delete().eq('id', sessionId)
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    if (currentSessionId === sessionId) {
      handleNewChat()
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/auth')
        return
      }
      setUser(session.user)
      setAccessToken(session.access_token)

      // Fetch user profile for tier + usage
      // Cast to any: verification_count was added via migration but generated types are stale
      const { data: subscription } = await (supabase as any)
        .from('user_subscriptions')
        .select('tier, monthly_verifications_used, monthly_verifications_limit, verification_count')
        .eq('user_id', session.user.id)
        .single()
      
      if (subscription) {
        setCurrentTier(subscription.tier)
        if (subscription.tier === 'observer') {
          setVerificationCount(subscription.verification_count ?? 0)
          setVerificationLimit(maxFreeUses)
        } else {
          setVerificationCount(subscription.monthly_verifications_used ?? 0)
          setVerificationLimit(subscription.monthly_verifications_limit ?? 100)
        }
      }

      // Fetch the first portfolio they own
      const { data: portfolios } = await supabase
        .from('portfolios')
        .select('id')
        .eq('user_id', session.user.id)
        .limit(1)
      
      let activePortfolioId = ''
      
      if (portfolios && portfolios.length > 0) {
        activePortfolioId = portfolios[0].id
        setPortfolioId(activePortfolioId)
      } else {
        // Auto-create default portfolio if none exists
        const { data: newPortfolio, error } = await supabase
          .from('portfolios')
          .insert({
            user_id: session.user.id,
            name: 'Primary Portfolio',
            total_capital: 10000.00
          })
          .select('id')
          .single()
          
        if (newPortfolio) {
          activePortfolioId = newPortfolio.id
          setPortfolioId(activePortfolioId)
        } else if (error) {
          console.error("Failed to create default portfolio:", error)
        }
      }

      // Load chat sessions for this user
      const { data: chatSessions } = await supabase
        .from('chat_sessions')
        .select('id, title, created_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })

      if (chatSessions) {
        setSessions(chatSessions.map(s => ({
          id: s.id,
          title: s.title || 'Untitled',
          created_at: s.created_at,
        })))
      }

      // Check for holdings to set dynamic prompts + store tickers for live price fetching
      if (activePortfolioId) {
        const { data: posData } = await supabase
          .from('positions')
          .select('ticker')
          .eq('portfolio_id', activePortfolioId)
        
        const tickers = posData?.map(p => p.ticker) ?? []
        setPositionTickers(tickers)
        const promptsToUse = (tickers.length > 0) ? ACTIVE_PORTFOLIO_PROMPTS : NEW_PORTFOLIO_PROMPTS
        setSuggestedPrompts([...promptsToUse].sort(() => 0.5 - Math.random()).slice(0, 4))
      }

      // Load stock memories (verified corrections)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: memories } = await (supabase as any)
        .from('stock_memories')
        .select('id, ticker, fact, source')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
      if (memories) {
        setStockMemories(memories as StockMemory[])
      }
    }
    checkAuth()
  }, [router, supabase])

  // Fetch live news on mount and every 5 minutes
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch('/api/news')
        if (res.ok) {
          const data = await res.json()
          if (data.news) {
            setNewsItems(data.news)
            // Passively absorb headlines into context for chat
            setNewsContext(data.news.slice(0, 10).map((n: NewsItem) => `[${n.source}] ${n.headline}`))
          }
        }
      } catch (e) {
        console.error('Failed to fetch news:', e)
      }
    }
    fetchNews()
    const interval = setInterval(fetchNews, 300_000) // 5 min
    return () => clearInterval(interval)
  }, [])

  const handleNewsClick = (item: NewsItem) => {
    const prompt = `NEWS IMPACT ANALYSIS: "${item.headline}" (Source: ${item.source}, ${item.url})\n\nAnalyze how this news affects my current portfolio positions. What are the direct and indirect impacts? What actions should I consider?`
    setInquiry(prompt)
    setShowHomepage(false)
    setTimeout(() => {
      const form = document.querySelector('form')
      if (form) form.requestSubmit()
    }, 50)
  }

  // Scroll to bottom when messages or verification state changes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatHistory, verification.events, verification.isStreaming])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inquiry.trim() || verification.isStreaming || !user || !portfolioId) return

    const currentInquiry = inquiry
    setInquiry('')
    
    // Add user message to UI immediately
    const newHistory: ChatMsg[] = [...chatHistory, { role: 'user', content: currentInquiry }]
    setChatHistory(newHistory)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      // Ensure we have an active session
      let activeSessionId = currentSessionId

      if (!activeSessionId) {
        // 1. Create a new chat session if none exists
        const sessionTitle = currentInquiry.substring(0, 60) + (currentInquiry.length > 60 ? '...' : '')
        const { data: sessionData, error: sessionError } = await supabase
          .from('chat_sessions')
          .insert({
            user_id: user.id,
            title: sessionTitle
          })
          .select()
          .single()
        
        if (sessionError) throw sessionError
        activeSessionId = sessionData.id
        setCurrentSessionId(activeSessionId)
        
        // Add new session to sidebar immediately
        setSessions(prev => [{
          id: sessionData.id,
          title: sessionTitle,
          created_at: sessionData.created_at,
        }, ...prev])
      } else {
        // Update updated_at on existing session so it sorts to top
        await supabase
          .from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', activeSessionId)
      }

      // 2. Save user message
      await supabase.from('chat_messages').insert({
        session_id: activeSessionId,
        role: 'user',
        content: currentInquiry
      })

      // 3. Format history for backend
      const historyForBackend = newHistory.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content
      }))

      // 4. Fetch live prices for all current positions and pass to backend
      const livePriceMap = positionTickers.length > 0
        ? await fetchStockPrices(positionTickers)
        : new Map()
      const livePricesForBackend = Array.from(livePriceMap.entries())
        .map(([ticker, sp]) => ({ ticker, price: sp.currentPrice }))

      // 4b. Run verification (inject news for context)
      const newsPrefix = newsContext.length > 0 
        ? `[RECENT MARKET NEWS FOR CONTEXT — do not respond to these unless the user asks about them:\n${newsContext.join('\n')}\n]\n\n`
        : ''
      const result = await verification.verify(
        newsPrefix + currentInquiry,
        portfolioId,
        session.access_token,
        historyForBackend,
        stockMemories,
        livePricesForBackend
      )

      // 4b. Handle blocked usage warning — no verification ran
      if (result.usageWarning?.warning_level === 'blocked') {
        const blockedMsg = `**Usage Limit Reached**\n\nYou've used your full usage allocation for this billing period ($${(result.usageWarning.current_cost_cents / 100).toFixed(2)} / $${(result.usageWarning.limit_cents / 100).toFixed(2)}). Please upgrade your plan to continue using SYNTAX.`
        setChatHistory(prev => [...prev, { role: 'assistant', content: blockedMsg }])
        await supabase.from('chat_messages').insert({
          session_id: activeSessionId,
          role: 'assistant',
          content: blockedMsg
        })
        return
      }

      // 5. Construct assistant message content
      let assistantContent = ''
      if (result.finalProjection) {
        assistantContent = result.finalProjection.reasoning
        
        // Auto-queue any pending actions
        if (result.finalProjection.pending_actions && result.finalProjection.pending_actions.length > 0) {
          setPendingActions(prev => {
            const newActions = [...prev];
            for (const a of result.finalProjection!.pending_actions!) {
              if (!newActions.some(ext => ext.id === a.id)) {
                newActions.push({ ...a, status: 'pending' as const })
              }
            }
            return newActions;
          })
        }
      } else if (result.error) {
        assistantContent = `**Error:** ${result.error}\n\nPlease try rephrasing your question or check your portfolio settings.`
      } else if (result.terminatedReason) {
        assistantContent = `**Verification Terminated:** ${result.terminatedReason}\n\nThe AI attempted multiple times but couldn't generate a valid portfolio projection that meets your risk constraints. Try adjusting your constraints or asking a different question.`
      } else {
        assistantContent = `**Processing Issue:** The verification completed but didn't return a final result. This may be a temporary issue. Please try again.\n\nDebug info: ${JSON.stringify({ hasProjection: !!result.finalProjection, hasError: !!result.error, hasTermination: !!result.terminatedReason })}`
      }

      // 5b. Parse and persist any MEMORY_SAVE tags from the response
      const memoryRegex = /<!--MEMORY_SAVE\s+ticker="([^"]+)"\s+fact="([^"]+)"\s+source="([^"]+)"\s*-->/g
      let memMatch
      while ((memMatch = memoryRegex.exec(assistantContent)) !== null) {
        const [, ticker, fact, source] = memMatch
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('stock_memories')
            .upsert({
              user_id: user?.id,
              ticker: ticker.toUpperCase(),
              fact,
              source: source || 'verified',
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,ticker,fact' })
          // Update local state
          setStockMemories(prev => {
            const exists = prev.find(m => m.ticker === ticker.toUpperCase() && m.fact === fact)
            if (exists) return prev
            return [{ id: crypto.randomUUID(), ticker: ticker.toUpperCase(), fact, source }, ...prev]
          })
          console.log(`Memory saved: ${ticker} — ${fact}`)
        } catch (err) {
          console.error('Failed to save stock memory:', err)
        }
      }
      // Strip MEMORY_SAVE tags from displayed content (they're HTML comments, invisible in markdown, but clean up anyway)
      assistantContent = assistantContent.replace(/<!--MEMORY_SAVE[^>]*-->/g, '').trim()

      // 6. Save assistant message
      await supabase.from('chat_messages').insert({
        session_id: activeSessionId,
        role: 'assistant',
        content: assistantContent,
        projection_data: result.finalProjection as any
      })

      // 7. Update UI
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: assistantContent,
        projection_data: result.finalProjection || undefined
      }])

      // 8. Increment local usage count (DB is incremented server-side or via RPC)
      setVerificationCount(prev => prev + 1)

    } catch (err) {
      console.error('Submission error:', err)
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: 'Failed to process inquiry due to a network or authentication error.' 
      }])
    }
  }

  const handlePromptClick = (prompt: string) => {
    setInquiry(prompt)
  }

  const executeAction = async (action: PendingAction) => {
    if (!portfolioId) return
    let successMessage = ''
    try {
      if (action.type === 'update_risk_profile') {
        const updates: Record<string, unknown> = {}
        if (action.data.max_drawdown !== undefined) updates.max_drawdown_limit = action.data.max_drawdown
        if (action.data.min_sharpe !== undefined) updates.min_sharpe_ratio = action.data.min_sharpe
        if (action.data.max_position !== undefined) updates.max_position_size = action.data.max_position
        await supabase.from('portfolios').update(updates).eq('id', portfolioId)
        successMessage = `System: Successfully updated risk profile.`
      } else if (action.type === 'update_cash') {
        await supabase.from('portfolios').update({ available_cash: action.data.cash_amount as number }).eq('id', portfolioId)
        successMessage = `System: Successfully updated available cash to $${action.data.cash_amount}.`
      } else if (action.type === 'add_position' || action.type === 'update_position') {
        const ticker = String(action.data.ticker).toUpperCase()
        await supabase.from('positions').upsert({
          portfolio_id: portfolioId,
          ticker,
          shares: action.data.shares as number,
          average_purchase_price: action.data.avg_price as number || null,
        }, { onConflict: 'portfolio_id,ticker' })
        // Keep positionTickers in sync
        setPositionTickers(prev => [...new Set([...prev, ticker])])
        successMessage = `System: Successfully ${action.type === 'add_position' ? 'added' : 'updated'} ${action.data.ticker} position to ${action.data.shares} shares.`
      } else if (action.type === 'remove_position') {
        const ticker = String(action.data.ticker).toUpperCase()
        await supabase.from('positions').delete()
          .eq('portfolio_id', portfolioId)
          .eq('ticker', ticker)
        // Keep positionTickers in sync
        setPositionTickers(prev => prev.filter(t => t !== ticker))
        successMessage = `System: Successfully removed ${action.data.ticker} from the portfolio.`
      }
      
      // Auto-trigger a hidden follow-up to the LLM so it acknowledges the change
      if (successMessage) {
        setInquiry(successMessage)
        setTimeout(() => {
          const form = document.querySelector('form')
          if (form) form.requestSubmit()
        }, 100)
      }
    } catch (err) {
      console.error('Failed to execute action:', err)
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setInquiry(`System: Failed to execute action ${action.type} for ${action.description}. Error: ${errorMsg}`)
      setTimeout(() => {
        const form = document.querySelector('form')
        if (form) form.requestSubmit()
      }, 100)
    }
  }

  // Usage tracking is loaded from DB in checkAuth effect above

  return (
    <div className="h-screen bg-zinc-950 text-zinc-50 flex overflow-hidden">
      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar — overlay on mobile, inline on md+ */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-30
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${isSidebarOpen ? 'md:w-64 lg:w-72' : 'md:w-0 md:overflow-hidden'}
        w-72 shrink-0 border-r border-zinc-800 bg-zinc-900 md:bg-zinc-900/30 flex flex-col transition-all duration-300
      `}>
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <button 
            onClick={() => { setShowHomepage(true); setCurrentSessionId(null); setChatHistory([]); verification.reset() }}
            className="flex items-center gap-2 font-bold text-lg tracking-tight hover:text-emerald-400 transition-colors"
          >
            <Shield className="h-5 w-5 text-emerald-500" />
            <span>SYNTAX</span>
          </button>
        </div>

        <div className="p-4 border-b border-zinc-800">
          <button 
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-lg py-2.5 transition-colors font-medium text-sm"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-2 mt-2">
            Recent Chats
          </div>
          {sessions.length === 0 ? (
            <div className="text-sm text-zinc-500 px-2 italic">No recent chats</div>
          ) : (
            sessions.map(session => (
              <div
                key={session.id}
                className={`group relative flex items-center rounded-lg transition-colors ${
                  currentSessionId === session.id 
                    ? 'bg-zinc-800 text-emerald-400' 
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
              >
                <button
                  onClick={() => loadSession(session.id)}
                  className="flex-1 text-left px-3 py-2 text-sm flex items-center gap-3 min-w-0"
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <span className="truncate">{session.title}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id) }}
                  className="hidden group-hover:flex shrink-0 items-center justify-center h-6 w-6 mr-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Delete chat"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">{user?.email}</span>
            <div className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
              effectiveTier === 'operator' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
              effectiveTier === 'sovereign' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 
              effectiveTier === 'institutional' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
              'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}>
              {effectiveTier.toUpperCase()}{devTierOverride ? ' ★' : ''}
            </div>
          </div>
          {effectiveTier !== 'observer' && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch('/api/stripe/portal', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${accessToken}`,
                    },
                  })
                  const data = await res.json()
                  if (data.url) window.location.href = data.url
                } catch (err) {
                  console.error('Portal error:', err)
                }
              }}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-emerald-400 transition-colors w-full"
            >
              <CreditCard className="h-4 w-4" />
              Manage Subscription
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors w-full"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Dev tools bar — NODE_ENV guard inside DevToolsBar ensures zero production exposure */}
      {process.env.NODE_ENV === 'development' && (
        <DevToolsBar
          devBypass={devBypass}
          onToggleBypass={setDevBypass}
          devTierOverride={devTierOverride}
          onTierOverride={setDevTierOverride}
          realTier={currentTier}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Header */}
        <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950/80 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-zinc-800 active:bg-zinc-700 text-zinc-400 transition-colors"
            >
              <MessageSquare className="h-5 w-5" />
            </button>
            <h1 className="font-semibold text-zinc-200">
              {currentSessionId ? sessions.find(s => s.id === currentSessionId)?.title : 'New Chat'}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setShowResearchLog(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
                showResearchLog
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Research
            </button>
            <button 
              onClick={() => setIsPortfolioSidebarOpen(true)}
              className="font-mono text-zinc-300 bg-zinc-900 px-3 py-1.5 rounded hover:bg-zinc-800 transition-colors border border-zinc-800 flex items-center gap-2"
            >
              {portfolioId ? portfolioId.substring(0, 8) + '...' : 'Loading...'}
              <Settings className="h-3 w-3 text-zinc-500" />
            </button>
          </div>
        </header>

        {/* Portfolio Sidebar */}
        <PortfolioSidebar 
          portfolioId={portfolioId} 
          isOpen={isPortfolioSidebarOpen} 
          onCloseAction={() => setIsPortfolioSidebarOpen(false)} 
        />

        {/* Auto-Research Log Panel */}
        {showResearchLog && (
          <ResearchLogPanel
            accessToken={accessToken}
            onClose={() => setShowResearchLog(false)}
          />
        )}

        {/* Live News Ticker */}
        {newsItems.length > 0 && (
          <NewsTicker items={newsItems} onHeadlineClick={handleNewsClick} />
        )}

        {/* Pending Action Confirmations */}
        {pendingActions.filter(a => a.status === 'pending').length > 0 && (
          <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-2">
            <div className="max-w-4xl mx-auto space-y-2">
              {pendingActions.filter(a => a.status === 'pending').map(action => (
                <ActionConfirmation 
                  key={action.id} 
                  action={action}
                  onConfirm={async () => {
                    await executeAction(action)
                    setPendingActions(prev => prev.map(a => a.id === action.id ? { ...a, status: 'confirmed' } : a))
                    // Trigger portfolio sidebar refresh to show updated positions
                    window.dispatchEvent(new CustomEvent('portfolio-updated'))
                  }}
                  onDismiss={() => {
                    setPendingActions(prev => prev.map(a => a.id === action.id ? { ...a, status: 'dismissed' } : a))
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto pb-36 md:pb-32">
          {showHomepage ? (
            <SyntaxHomepage 
              newsItems={newsItems}
              onNewsClick={handleNewsClick}
              onQueryClick={(query) => {
                setInquiry(query)
                setShowHomepage(false)
                setTimeout(() => {
                  const form = document.querySelector('form')
                  if (form) form.requestSubmit()
                }, 50)
              }}
              onStartChat={() => setShowHomepage(false)}
            />
          ) : chatHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 max-w-3xl mx-auto w-full">
              <div className="h-16 w-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/20">
                <Shield className="h-8 w-8 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2 text-center">How can I assist your portfolio today?</h2>
              <p className="text-zinc-400 text-center mb-10 max-w-lg">
                SYNTAX uses an autonomous agent loop to verify trades against strict risk constraints before proposing an allocation.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {suggestedPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handlePromptClick(prompt)}
                    disabled={!portfolioId}
                    className="text-left p-4 min-h-[56px] rounded-xl bg-zinc-900/50 border border-zinc-800 active:bg-zinc-700 hover:bg-zinc-800 hover:border-zinc-700 transition-colors text-sm text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 space-y-6">
              {chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={i === chatHistory.length - 1 && !verification.isStreaming ? 'animate-[fadeSlideIn_0.25s_ease-out]' : ''}
                >
                  <ChatBubble
                    message={msg}
                    isStreaming={verification.isStreaming}
                    onFollowUp={(text) => {
                      setInquiry(text)
                      setTimeout(() => {
                        const form = document.querySelector('form')
                        if (form) form.requestSubmit()
                      }, 50)
                    }}
                  />
                </div>
              ))}

              {verification.isStreaming && (
                <div className="space-y-3 animate-[fadeSlideIn_0.15s_ease-out]">
                  {/* Placeholder SYNTAX bubble — appears instantly, replaced by real response */}
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-zinc-500 mb-1 font-medium">SYNTAX</div>
                      <ThinkingProcess events={verification.events} startedAt={verification.startedAt} />
                    </div>
                  </div>
                </div>
              )}
              {verification.usageWarning && (
                <UsageWarningBanner
                  warning={verification.usageWarning}
                  accessToken={accessToken}
                  currentTier={effectiveTier}
                />
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent pt-10 pb-[env(safe-area-inset-bottom,0px)] px-3 sm:px-4" style={{paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1.5rem)'}}>
          <div className="max-w-4xl mx-auto relative">
            <TierGate
              requiredTier="operator"
              currentTier={effectiveTier}
              remainingFreeUses={remainingFreeUses}
              maxFreeUses={verificationLimit}
              accessToken={accessToken}
              devBypass={devBypass}
            >
              <form 
                onSubmit={handleSubmit}
                className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/50 transition-all"
              >
                <textarea
                  value={inquiry}
                  onChange={(e) => setInquiry(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  placeholder="Ask a question about your portfolio..."
                  className="w-full bg-transparent p-4 pr-14 outline-none resize-none min-h-[56px] max-h-48"
                  rows={1}
                  disabled={verification.isStreaming}
                  style={{ height: 'auto' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${Math.min(target.scrollHeight, 192)}px`;
                  }}
                />
                <button
                  type="submit"
                  disabled={verification.isStreaming || !inquiry.trim()}
                  className="absolute right-2 bottom-2 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 hover:bg-emerald-400 active:bg-emerald-300 disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <div className="text-center mt-3 text-xs text-zinc-500 flex items-center justify-center gap-4">
                <span>SYNTAX verifies all trades against risk bounds.</span>
                {!devBypass && effectiveTier === 'observer' && (
                  <span className="text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {remainingFreeUses}/{verificationLimit} free uses
                  </span>
                )}
              </div>
            </TierGate>
          </div>
        </div>
      </div>
    </div>
  )
}

// Extract text from React children recursively (for question detection in markdown)
function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (!children) return ''
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('')
  if (typeof children === 'object' && 'props' in children) {
    return extractTextFromChildren((children as React.ReactElement<{ children?: React.ReactNode }>).props?.children)
  }
  return ''
}

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

// Compact inline reply button that expands into a text input
function InlineReply({ onSubmit, isStreaming }: { onSubmit: (text: string) => void; isStreaming?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [replyText, setReplyText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isExpanded])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyText.trim()) return
    onSubmit(replyText)
    setReplyText('')
    setIsExpanded(false)
  }

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        disabled={isStreaming}
        className="inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all disabled:opacity-50 align-middle"
      >
        <MessageSquare className="h-2.5 w-2.5" />
        Reply
      </button>
    )
  }

  return (
    <div className="mt-1.5 mb-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
        <div className="flex-1 flex items-center gap-1.5 bg-zinc-950 border border-emerald-500/30 rounded-lg px-2.5 py-1.5">
          <input
            ref={inputRef}
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your reply..."
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 outline-none min-w-0"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
              if (e.key === 'Escape') setIsExpanded(false)
            }}
          />
          <button
            type="submit"
            disabled={!replyText.trim()}
            className="shrink-0 p-1 rounded bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
        <button type="button" onClick={() => setIsExpanded(false)} className="text-zinc-500 hover:text-zinc-300 p-1">
          <X className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  )
}

function ChatBubble({ message, isStreaming, onFollowUp }: { 
  message: ChatMsg; 
  isStreaming?: boolean; 
  onFollowUp?: (text: string) => void;
}) {
  const isUser = message.role === 'user'

  // Custom markdown components that inject inline reply buttons after question-containing paragraphs/list items
  const mdComponents: Record<string, React.ComponentType<Record<string, unknown>>> = {
    img: ({ src, alt, ...props }: Record<string, unknown>) => {
      // Custom image renderer to handle thumbnails better
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <img 
          src={src as string} 
          alt={alt as string || 'Image'} 
          className="rounded-lg border border-zinc-800 max-h-48 object-cover my-2 hover:opacity-80 transition-opacity" 
          {...props} 
        />
      )
    },
    a: ({ href, children, ...props }: Record<string, unknown>) => {
      const isUrlText = typeof children === 'string' && children.startsWith('http');
      
      try {
        const url = new URL(href as string);
        const domain = url.hostname.replace('www.', '');
        
        // Render as a rich, polished card-like pill rather than a raw text link
        return (
          <a 
            href={href as string} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="inline-flex items-center gap-2 px-2.5 py-1 my-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/50 hover:border-emerald-500/50 rounded-lg text-emerald-400 text-sm transition-all group max-w-full shadow-sm align-middle" 
            title={href as string} 
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-emerald-500/70 group-hover:text-emerald-400" />
            <span className="truncate max-w-[250px] sm:max-w-[400px] font-medium">
              {isUrlText ? domain : children as React.ReactNode}
            </span>
            <span className="text-[10px] text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded-md ml-1 shrink-0 group-hover:text-zinc-400 truncate max-w-[100px]">
              {domain}
            </span>
          </a>
        )
      } catch {
        // Fallback with extreme break-all for invalid URLs
        return (
          <a href={href as string} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-4 break-all" {...props}>
            {children as React.ReactNode}
          </a>
        )
      }
    },
    p: ({ children, ...props }: Record<string, unknown>) => {
      const text = extractTextFromChildren(children as React.ReactNode)
      const hasQuestion = text.includes('?')
      const isHighlight = text.includes('!!') 
      
      let content = children as React.ReactNode;
      if (isHighlight) {
         const str = text.replace(/!!(.*?)!!/g, '<mark class="bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded-md font-medium border border-emerald-500/20">$1</mark>');
         content = <span dangerouslySetInnerHTML={{ __html: str }} />
      }

      if (hasQuestion && onFollowUp && !isUser) {
        return (
          <div className="my-5 bg-zinc-900/40 border border-zinc-800/60 p-4 rounded-xl">
            <p className="text-[15px] text-zinc-200 leading-relaxed tracking-wide" {...props}>{content}</p>
            <div className="mt-3">
              <InlineReply onSubmit={(reply) => onFollowUp(`> ${text}\n\n**User Reply:** ${reply}`)} isStreaming={isStreaming} />
            </div>
          </div>
        )
      }
      return <p className="text-[15px] text-zinc-300 leading-loose my-4" {...props}>{content}</p>
    },
    strong: ({ children, ...props }: Record<string, unknown>) => (
      <strong className="font-semibold text-zinc-100" {...props}>
        {children as React.ReactNode}
      </strong>
    ),
    h1: ({ children, ...props }: Record<string, unknown>) => <h1 className="text-xl font-semibold text-zinc-100 mt-8 mb-4 pb-2 border-b border-zinc-800/50" {...props}>{children as React.ReactNode}</h1>,
    h2: ({ children, ...props }: Record<string, unknown>) => <h2 className="text-lg font-medium text-zinc-200 mt-7 mb-3" {...props}>{children as React.ReactNode}</h2>,
    h3: ({ children, ...props }: Record<string, unknown>) => <h3 className="text-base font-medium text-zinc-300 mt-6 mb-2" {...props}>{children as React.ReactNode}</h3>,
    ul: ({ children, ...props }: Record<string, unknown>) => <ul className="list-disc pl-6 my-4 space-y-2.5 marker:text-zinc-500" {...props}>{children as React.ReactNode}</ul>,
    ol: ({ children, ...props }: Record<string, unknown>) => <ol className="list-decimal pl-6 my-4 space-y-2.5 marker:text-zinc-500" {...props}>{children as React.ReactNode}</ol>,
    li: ({ children, ...props }: Record<string, unknown>) => {
      const text = extractTextFromChildren(children as React.ReactNode)
      const hasQuestion = text.includes('?')
      if (hasQuestion && onFollowUp && !isUser) {
        return (
          <li className="text-[15px] text-zinc-300 leading-relaxed" {...props}>
            <span className="block mb-2">{children as React.ReactNode}</span>
            <InlineReply onSubmit={(reply) => onFollowUp(`> ${text}\n\n**User Reply:** ${reply}`)} isStreaming={isStreaming} />
          </li>
        )
      }
      return <li className="text-[15px] text-zinc-300 leading-relaxed pl-1" {...props}>{children as React.ReactNode}</li>
    },
  }

  // Detect if this message implies deep research (heuristics based on text)
  const isDeepResearch = !isUser && isStreaming && message.content.toLowerCase().includes('research');

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex gap-4 max-w-[90%] sm:max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center mt-1 shadow-sm ${
          isUser ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-950 border border-emerald-500/30 text-emerald-500'
        }`}>
          {isUser ? <div className="text-xs font-medium">ME</div> : <Zap className="h-4 w-4" />}
        </div>
        
        {/* Message Bubble */}
        <div className={`flex flex-col gap-2 min-w-0 flex-1 ${isUser ? 'items-end' : 'items-start'}`}>
          <div className={`px-5 py-3.5 rounded-2xl shadow-sm break-words w-full ${
            isUser 
              ? 'bg-zinc-800 text-zinc-100 rounded-tr-sm' 
              : 'bg-zinc-950 border border-zinc-800/80 text-zinc-300 rounded-tl-sm'
          }`}>
            {isDeepResearch && (
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 mb-3 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-md w-fit">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Deep Market Research Active
              </div>
            )}
            <div className="prose prose-invert prose-zinc max-w-none w-full marker:text-zinc-500 prose-p:break-words prose-a:break-all overflow-hidden">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {message.content}
              </ReactMarkdown>
            </div>
          </div>

          {/* Projection artifact with charts */}
          {message.projection_data && (
            <div className="mt-4 w-full">
              <ProjectionArtifact projection={message.projection_data} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function generateScenarioData(projection: TrajectoryProjection) {
  const months = ['Now', '1M', '3M', '6M', '1Y', '2Y']
  const sharpe = projection.projected_sharpe
  const drawdown = projection.projected_max_drawdown
  
  const bullReturn = 0.08 + (sharpe * 0.04)
  const baseReturn = 0.03 + (sharpe * 0.02)
  const bearReturn = -drawdown * 0.8
  
  return months.map((month, i) => {
    const t = i / (months.length - 1)
    return {
      month,
      bull: Math.round((1 + bullReturn * t * 2) * 10000) / 100,
      base: Math.round((1 + baseReturn * t * 2) * 10000) / 100,
      bear: Math.round((1 + bearReturn * t + bearReturn * t * t * 0.5) * 10000) / 100,
    }
  })
}

function ProjectionArtifact({ projection }: { projection: TrajectoryProjection }) {
  const [isOpen, setIsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'allocation' | 'scenarios' | 'scenario_engine'>('overview')

  const pieData = projection.proposed_allocation
    .filter(pos => pos.weight > 0.01)
    .map(pos => ({
      name: pos.ticker,
      value: Number((pos.weight * 100).toFixed(1))
    }))

  // Basic scenario data (normalized to 100) if no scenario_chart is provided
  const basicScenarioData = Array.from({ length: 12 }).map((_, i) => {
    const month = i + 1
    const baseReturn = projection.projected_sharpe * 0.05
    const baseVal = 100 * Math.pow(1 + (baseReturn / 12), month)
    const vol = projection.projected_max_drawdown / 3
    
    // Add some random walk for realism
    const randomWalk = (Math.sin(i * 1.5) + Math.cos(i * 2.7)) * vol * 50

    return {
      month: `M${month}`,
      bull: Math.round(baseVal * (1 + vol) + randomWalk * 1.2),
      base: Math.round(baseVal + randomWalk),
      bear: Math.round(baseVal * (1 - vol) + randomWalk * 0.8)
    }
  })

  // Advanced scenario data using LLM parameters
  const advancedScenarioData = useMemo(() => {
    if (!projection.scenario_chart?.enabled) return []
    const p = projection.scenario_chart
    const numPoints = Math.min(Math.max(p.time_horizon_days, 10), 100) // Render up to 100 points
    const daysPerPoint = Math.max(1, Math.floor(p.time_horizon_days / numPoints))
    
    const data = []
    let currentBull = p.initial_capital
    let currentBase = p.initial_capital
    let currentBear = p.initial_capital

    const dcaDaily = (p.dca_monthly_amount * 12) / 365
    
    // Simple deterministic PRNG so chart doesn't jitter on re-renders
    let seed = 1
    const prng = () => {
      const x = Math.sin(seed++) * 10000
      return x - Math.floor(x)
    }
    
    for (let i = 0; i <= numPoints; i++) {
      const day = i * daysPerPoint
      
      // Calculate continuous returns
      const bullDailyRet = Math.pow(1 + p.bull_annual_return, 1/365) - 1
      const baseDailyRet = Math.pow(1 + p.base_annual_return, 1/365) - 1
      const bearDailyRet = Math.pow(1 + p.bear_annual_return, 1/365) - 1
      
      // Generate geometric brownian motion for choppiness
      const dailyVol = p.volatility / Math.sqrt(365)
      
      // We apply the accumulated changes over 'daysPerPoint' days
      for(let d=0; d<daysPerPoint; d++) {
        // Simple random normal approximation using deterministic PRNG
        const zBull = (prng() + prng() + prng() + prng() - 2) * 1.5
        const zBase = (prng() + prng() + prng() + prng() - 2) * 1.5
        const zBear = (prng() + prng() + prng() + prng() - 2) * 1.5

        currentBull = currentBull * (1 + bullDailyRet + dailyVol * zBull) + dcaDaily
        currentBase = currentBase * (1 + baseDailyRet + dailyVol * zBase) + dcaDaily
        currentBear = currentBear * (1 + bearDailyRet + dailyVol * zBear) + dcaDaily
      }

      data.push({
        day: day,
        label: day < 30 ? `Day ${day}` : day < 365 ? `Mo ${Math.round(day/30)}` : `Yr ${(day/365).toFixed(1)}`,
        bull: Math.round(currentBull),
        base: Math.round(currentBase),
        bear: Math.round(currentBear),
        // Flag sell points
        isSellPoint: p.suggested_sell_points.includes(day) || p.suggested_sell_points.some(sp => sp > day - daysPerPoint && sp <= day)
      })
    }
    return data
  }, [projection.scenario_chart])

  // Custom dot for sell points
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (payload.isSellPoint) {
      return (
        <svg x={cx - 10} y={cy - 10} width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 bg-zinc-950 rounded-full">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 8v4"></path>
          <path d="M12 16h.01"></path>
        </svg>
      );
    }
    return null;
  };

  const tabs = ['overview', 'allocation']
  if (projection.scenario_chart?.enabled) {
    tabs.push('scenario_engine')
  } else {
    tabs.push('scenarios')
  }

  const hasProjection = projection.proposed_allocation && projection.proposed_allocation.length > 0;
  const isActionOnly = projection.pending_actions && projection.pending_actions.length > 0 && !hasProjection;
  
  const headerText = isActionOnly ? "Actions Proposed" : "Trajectory Verified";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden w-full max-w-3xl">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between bg-zinc-900 hover:bg-zinc-800/80 transition-colors border-b border-zinc-800"
      >
        <div className="flex items-center gap-2 font-medium text-emerald-400 text-sm">
          {isActionOnly ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
          {headerText}
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
      </button>

      {isOpen && !isActionOnly && (
        <div className="p-4 space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 bg-zinc-950 rounded-lg p-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as typeof activeTab)}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors capitalize ${
                  activeTab === tab 
                    ? 'bg-zinc-800 text-emerald-400' 
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg">
                  <div className="text-xs text-zinc-500 mb-1">Sharpe Ratio</div>
                  <div className="text-lg font-semibold text-emerald-400">{projection.projected_sharpe.toFixed(2)}</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg">
                  <div className="text-xs text-zinc-500 mb-1">Max Drawdown</div>
                  <div className="text-lg font-semibold text-red-400">{(projection.projected_max_drawdown * 100).toFixed(1)}%</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg">
                  <div className="text-xs text-zinc-500 mb-1">Confidence</div>
                  <div className="text-lg font-semibold text-blue-400">{(projection.confidence_score * 100).toFixed(0)}%</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Target Allocation</div>
                <div className="space-y-1.5">
                  {projection.proposed_allocation.map((pos, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-zinc-950 border border-zinc-800/50 p-2 rounded-md">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="font-mono font-medium">{pos.ticker}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pos.weight * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                        <span className="font-mono text-zinc-400 w-12 text-right">{(pos.weight * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Allocation donut chart */}
          {activeTab === 'allocation' && (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#d4d4d8' }}
                    formatter={(value) => [`${value}%`, 'Weight']}
                  />
                  <Legend 
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => <span style={{ color: '#a1a1aa', fontSize: '12px', fontFamily: 'monospace' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Scenario projections chart (Fallback) */}
          {activeTab === 'scenarios' && (
            <div>
              <div className="text-xs text-zinc-500 mb-3">Projected portfolio value (normalized to $100) across scenarios</div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={basicScenarioData}>
                  <defs>
                    <linearGradient id="gradBull" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradBase" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradBear" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="month" stroke="#52525b" tick={{ fill: '#71717a', fontSize: 11 }} />
                  <YAxis stroke="#52525b" tick={{ fill: '#71717a', fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value, name) => [`$${value}`, String(name).charAt(0).toUpperCase() + String(name).slice(1) + ' Case']}
                  />
                  <Area type="monotone" dataKey="bull" stroke="#10b981" fill="url(#gradBull)" strokeWidth={2} name="bull" />
                  <Area type="monotone" dataKey="base" stroke="#3b82f6" fill="url(#gradBase)" strokeWidth={2} name="base" />
                  <Area type="monotone" dataKey="bear" stroke="#ef4444" fill="url(#gradBear)" strokeWidth={2} name="bear" />
                  <Legend 
                    verticalAlign="top"
                    iconType="line"
                    formatter={(value: string) => <span style={{ color: '#a1a1aa', fontSize: '12px', textTransform: 'capitalize' }}>{value}</span>}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Scenario projections chart (Advanced) */}
          {activeTab === 'scenario_engine' && projection.scenario_chart && (
            <div>
              <div className="text-xs text-zinc-500 mb-3 flex items-center justify-between">
                <span>Scenario Engine: ${projection.scenario_chart.initial_capital.toLocaleString()} + ${projection.scenario_chart.dca_monthly_amount.toLocaleString()}/mo DCA</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span> Sell Points</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={advancedScenarioData}>
                  <defs>
                    <linearGradient id="gradBullAdv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradBaseAdv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradBearAdv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="label" stroke="#52525b" tick={{ fill: '#71717a', fontSize: 11 }} />
                  <YAxis stroke="#52525b" tick={{ fill: '#71717a', fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={(v: number) => `$${v.toLocaleString()}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value, name) => [`$${Number(value).toLocaleString()}`, String(name).charAt(0).toUpperCase() + String(name).slice(1) + ' Case']}
                  />
                  <Area type="monotone" dataKey="bull" stroke="#10b981" fill="url(#gradBullAdv)" strokeWidth={2} name="bull" dot={<CustomDot />} activeDot={{ r: 6, fill: '#10b981', stroke: '#18181b', strokeWidth: 2 }} />
                  <Area type="monotone" dataKey="base" stroke="#3b82f6" fill="url(#gradBaseAdv)" strokeWidth={2} name="base" dot={<CustomDot />} activeDot={{ r: 6, fill: '#3b82f6', stroke: '#18181b', strokeWidth: 2 }} />
                  <Area type="monotone" dataKey="bear" stroke="#ef4444" fill="url(#gradBearAdv)" strokeWidth={2} name="bear" dot={<CustomDot />} activeDot={{ r: 6, fill: '#ef4444', stroke: '#18181b', strokeWidth: 2 }} />
                  <Legend 
                    verticalAlign="top"
                    iconType="line"
                    formatter={(value: string) => <span style={{ color: '#a1a1aa', fontSize: '12px', textTransform: 'capitalize' }}>{value}</span>}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Typical per-attempt duration in ms — derived from observed p50 latency with Gemini grounding.
// Used for ETA estimation before any attempts have completed.
const DEFAULT_ATTEMPT_MS = 14_000
const MAX_LOOP_ATTEMPTS = 5

function ThinkingProcess({ events, startedAt }: { events: LoopEvent[]; startedAt: number | null }) {
  const [isOpen, setIsOpen] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  // Derive loop state from events ─────────────────────────────────────────────
  type AttemptState = {
    provider: string
    status: 'running' | 'verified' | 'rejected'
    score?: number
    is_new_best?: boolean
    sharpe?: number
    drawdown?: number
    confidence?: number
  }

  const attemptMap = new Map<number, AttemptState>()
  let bestScore = -Infinity
  let isSettled = false
  let settledTotal = 0
  let isTerminated = false
  let topicRejected = false
  let topicReason = ''

  for (const ev of events) {
    if (ev.event === 'TopicCheck') {
      if (!ev.data.is_financial) { topicRejected = true; topicReason = ev.data.reason }
    } else if (ev.event === 'Attempt') {
      const existing = attemptMap.get(ev.data.number)
      if (!existing) attemptMap.set(ev.data.number, { provider: ev.data.provider, status: 'running' })
      else if (ev.data.provider !== 'pending') existing.provider = ev.data.provider
    } else if (ev.event === 'Verified') {
      const d = ev.data
      attemptMap.set(d.attempt, {
        provider: attemptMap.get(d.attempt)?.provider ?? '—',
        status: 'verified', score: d.score, is_new_best: d.is_new_best,
        sharpe: d.sharpe, drawdown: d.drawdown, confidence: d.confidence,
      })
      if (d.score > bestScore) bestScore = d.score
    } else if (ev.event === 'Rejected') {
      const existing = attemptMap.get(ev.data.attempt)
      if (existing) existing.status = 'rejected'
      else attemptMap.set(ev.data.attempt, { provider: '—', status: 'rejected' })
    } else if (ev.event === 'Settled') {
      isSettled = true; settledTotal = ev.data.total_attempts
    } else if (ev.event === 'Terminated') {
      isTerminated = true
    }
  }

  const isDone = isSettled || isTerminated || topicRejected
  const rows = Array.from(attemptMap.entries()).sort((a, b) => a[0] - b[0])

  // Timing & ETA math ──────────────────────────────────────────────────────────
  // Tick every 500 ms while active; stop when done to save CPU.
  useEffect(() => {
    if (isDone) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [isDone])

  const elapsedMs = startedAt ? now - startedAt : 0
  const elapsedSec = Math.floor(elapsedMs / 1000)

  const completedCount = rows.filter(([, a]) => a.status !== 'running').length
  // Rolling average: use actual elapsed / completed, fall back to default
  const avgMs = completedCount > 0 ? elapsedMs / completedCount : DEFAULT_ATTEMPT_MS
  const estimatedTotalMs = avgMs * MAX_LOOP_ATTEMPTS
  // Raw progress — cap at 92% so bar never reaches 100% before Settled fires
  const rawProgress = isDone ? 1 : Math.min(elapsedMs / estimatedTotalMs, 0.92)
  // Smooth the progress so it never looks like it's going backwards
  const progressPct = Math.round(rawProgress * 100)
  const etaSec = isDone ? 0 : Math.max(0, Math.ceil((estimatedTotalMs - elapsedMs) / 1000))

  const isLong = !isDone && elapsedSec > 35

  // Empty state ─────────────────────────────────────────────────────────────────
  if (events.length === 0) {
    return (
      <div className="ml-12 max-w-xl space-y-2">
        <div className="flex items-center gap-2 text-emerald-500 text-xs font-medium font-mono">
          <Activity className="h-3.5 w-3.5 animate-pulse" />
          <span>Initializing analysis loop…</span>
          <span className="text-zinc-600 ml-auto">~{Math.round(DEFAULT_ATTEMPT_MS * MAX_LOOP_ATTEMPTS / 1000)}s est.</span>
        </div>
        <div className="h-0.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500/40 rounded-full animate-pulse w-[8%]" />
        </div>
      </div>
    )
  }

  return (
    <div className="ml-12 max-w-xl">
      <div className={`bg-zinc-900/50 border rounded-lg overflow-hidden transition-colors ${isDone ? 'border-zinc-800/50' : 'border-zinc-700/60'}`}>

        {/* Progress bar — full width, sits above everything */}
        {!topicRejected && (
          <div className="h-0.5 bg-zinc-800 w-full">
            <div
              className={`h-full rounded-r-full transition-all duration-700 ease-out ${
                isDone ? 'bg-emerald-500' : isLong ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {/* Header */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
            <Zap className={`h-3.5 w-3.5 ${isDone ? 'text-emerald-500' : 'text-emerald-400'}`} />
            <span>Verification Loop</span>
            {!isDone && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            {isSettled && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
            {isTerminated && <XCircle className="h-3 w-3 text-red-400" />}
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            {!isDone && (
              <span className={`tabular-nums ${isLong ? 'text-amber-400' : 'text-zinc-500'}`}>
                {elapsedSec < 1 ? 'starting…' : etaSec > 0 ? `~${etaSec}s left` : `${elapsedSec}s`}
              </span>
            )}
            {bestScore > -Infinity && (
              <span className="text-emerald-400">best {bestScore.toFixed(4)}</span>
            )}
            {isOpen
              ? <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />
              : <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
            }
          </div>
        </button>

        {isOpen && (
          <div className="border-t border-zinc-800/50 px-3 pt-2 pb-2.5 space-y-1.5 font-mono text-xs">

            {/* Upfront time hint — shown before first attempt completes */}
            {!isDone && completedCount === 0 && elapsedSec < 5 && (
              <div className="text-zinc-600 text-[10px] pb-1">
                Deep portfolio analysis typically takes 15–40s. Running {MAX_LOOP_ATTEMPTS} optimisation passes.
              </div>
            )}

            {/* Long wait warning */}
            {isLong && (
              <div className="flex items-center gap-1.5 text-amber-500/70 text-[10px] pb-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                Taking longer than usual — Gemini grounding active, fetching live market data…
              </div>
            )}

            {topicRejected && (
              <div className="flex items-center gap-2 text-red-400/80">
                <XCircle className="h-3 w-3 shrink-0" />
                <span>Off-topic: {topicReason}</span>
              </div>
            )}

            {rows.map(([num, att]) => (
              <div
                key={num}
                className={`flex items-center gap-2 rounded px-2 py-1.5 transition-colors ${
                  att.is_new_best
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : att.status === 'rejected'
                    ? 'bg-zinc-800/30'
                    : att.status === 'running'
                    ? 'bg-blue-500/5 border border-blue-500/10 animate-pulse'
                    : 'bg-zinc-800/20'
                }`}
              >
                {att.status === 'running' && <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />}
                {att.status === 'verified' && <CheckCircle2 className={`h-3 w-3 shrink-0 ${att.is_new_best ? 'text-emerald-400' : 'text-zinc-500'}`} />}
                {att.status === 'rejected' && <XCircle className="h-3 w-3 shrink-0 text-yellow-500/70" />}

                <span className="text-zinc-600 w-8 shrink-0">#{num}</span>
                <span className="text-zinc-500 shrink-0">{att.provider !== 'pending' ? att.provider : '…'}</span>

                {att.status === 'running' && <span className="text-blue-400/70 ml-1">analysing…</span>}
                {att.status === 'rejected' && <span className="text-yellow-500/60 ml-1">constraint fail — retrying</span>}
                {att.status === 'verified' && att.score !== undefined && (
                  <>
                    <span className={`ml-1 font-bold ${att.is_new_best ? 'text-emerald-300' : 'text-zinc-400'}`}>
                      {att.score.toFixed(4)}
                    </span>
                    <span className="text-zinc-700">·</span>
                    <span className="text-zinc-500">S {att.sharpe?.toFixed(2)}</span>
                    <span className="text-zinc-500">D {((att.drawdown ?? 0) * 100).toFixed(1)}%</span>
                    <span className="text-zinc-500">C {((att.confidence ?? 0) * 100).toFixed(0)}%</span>
                    {att.is_new_best && <span className="ml-auto text-emerald-400 font-bold">↑ BEST</span>}
                  </>
                )}
              </div>
            ))}

            {isSettled && bestScore > -Infinity && (
              <div className="flex items-center gap-2 mt-1 pt-1.5 border-t border-zinc-800/40 text-emerald-400/80">
                <CheckCircle2 className="h-3 w-3" />
                <span>Best of {settledTotal} passes — score {bestScore.toFixed(4)} · {elapsedSec}s total</span>
              </div>
            )}
            {isTerminated && (
              <div className="flex items-center gap-2 text-red-400/70">
                <AlertCircle className="h-3 w-3" />
                <span>No valid projection after {settledTotal} attempts</span>
              </div>
            )}
            {!isDone && rows.length === 0 && (
              <div className="flex items-center gap-1.5 text-zinc-700 pt-0.5">
                {[0, 150, 300].map(d => (
                  <div key={d} className="h-1 w-1 rounded-full bg-zinc-600 animate-pulse" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function useMarketSession() {
  const utcHour = new Date().getUTCHours()
  const etHour = (utcHour + 19) % 24
  if (etHour >= 6 && etHour < 10) return { label: 'Pre-Market', color: 'text-amber-400' }
  if (etHour >= 10 && etHour < 16) return { label: 'Market Hours', color: 'text-emerald-400' }
  if (etHour >= 16 && etHour < 20) return { label: 'After-Hours', color: 'text-blue-400' }
  return { label: 'Overnight Research', color: 'text-violet-400' }
}

function ResearchLogPanel({ accessToken, onClose }: { accessToken: string; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const session = useMarketSession()

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setStreamError(null)
      try {
        const res = await fetch('/api/autoresearch/stream', {
          headers: { authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok || !res.body) {
          setStreamError(`Stream unavailable (${res.status})`)
          return
        }
        setIsConnected(true)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n')
          buf = parts.pop() ?? ''
          for (const part of parts) {
            const trimmed = part.replace(/^data:\s*/, '').trim()
            if (trimmed && !trimmed.startsWith('{')) setLines(prev => [...prev.slice(-500), trimmed])
          }
        }
      } catch {
        if (!cancelled) setStreamError('Connection lost — reconnecting…')
      } finally {
        if (!cancelled) {
          setIsConnected(false)
          // Auto-reconnect after 5s
          setTimeout(run, 5000)
        }
      }
    }
    run()
    return () => { cancelled = true }
  }, [accessToken])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end pointer-events-none sm:p-4">
      {/* Mobile: full-screen. Desktop: bottom-right panel */}
      <div className="pointer-events-auto flex flex-col overflow-hidden bg-zinc-950 border-t sm:border border-zinc-800 sm:rounded-xl shadow-2xl w-full sm:max-w-lg h-[85vh] sm:h-[70vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FlaskConical className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="font-semibold text-sm text-zinc-200">Research</span>
            <span className={`text-xs font-medium ${session.color} hidden sm:block`}>{session.label}</span>
            {isConnected
              ? <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Live" />
              : <div className="h-1.5 w-1.5 rounded-full bg-zinc-600 shrink-0" title="Connecting…" />
            }
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs ${session.color} sm:hidden`}>{session.label}</span>
            <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Status bar */}
        {streamError && (
          <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs font-mono shrink-0">
            {streamError}
          </div>
        )}
        {!isConnected && !streamError && (
          <div className="px-4 py-1.5 bg-zinc-900 border-b border-zinc-800 text-zinc-500 text-xs shrink-0 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-600 animate-pulse" />
            Connecting to research stream…
          </div>
        )}

        {/* Log body */}
        <div className="flex-1 overflow-y-auto p-3 font-mono text-xs bg-zinc-950">
          {lines.length === 0 ? (
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-start gap-2 text-zinc-500">
                <Activity className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0 animate-pulse" />
                <span>Daemon active — running overnight research on your portfolio using <span className="text-emerald-600">gemini-2.0-flash</span>. First results appear here as experiments settle (~60–90s each).</span>
              </div>
              <div className="text-zinc-700 text-xs pl-5">
                Schedule: overnight every 3 min · pre/post-market every 4 min · market hours every 5 min
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              {lines.map((line, i) => {
                const scoreMatch = line.match(/score=([\d.]+)/)
                const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0
                const isGood = score > 0.5
                return (
                  <div key={i} className={`leading-relaxed break-all ${isGood ? 'text-emerald-400/90' : 'text-zinc-500'}`}>
                    {isGood && <span className="text-emerald-500/70 mr-1 select-none">▸</span>}
                    {line}
                  </div>
                )
              })}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-600 shrink-0">
          <span>{lines.length} results</span>
          <span className="hidden sm:block">gemini-2.0-flash · auto-scheduled</span>
          <span className="sm:hidden">auto-scheduled</span>
        </div>
      </div>
    </div>
  )
}

function UsageWarningBanner({ warning, accessToken, currentTier }: { warning: UsageWarningData; accessToken: string; currentTier: string }) {
  const [isUpgrading, setIsUpgrading] = useState(false)
  const pct = warning.limit_cents > 0 ? Math.round((warning.current_cost_cents / warning.limit_cents) * 100) : 0
  const isBlocked = warning.warning_level === 'blocked'
  const nextTier = currentTier === 'observer' ? 'operator' : currentTier === 'operator' ? 'sovereign' : currentTier === 'sovereign' ? 'institutional' : null

  const handleUpgrade = async () => {
    if (!nextTier) return
    setIsUpgrading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ tier: nextTier }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch (e) {
      console.error('Upgrade failed:', e)
    } finally {
      setIsUpgrading(false)
    }
  }

  return (
    <div className={`mx-auto max-w-3xl mb-4 rounded-xl border px-4 py-3 ${
      isBlocked 
        ? 'bg-red-950/40 border-red-500/40' 
        : warning.warning_level === 'urgent' 
          ? 'bg-amber-950/40 border-amber-500/40' 
          : 'bg-amber-950/20 border-amber-500/20'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className={`h-4 w-4 shrink-0 ${isBlocked ? 'text-red-400' : 'text-amber-400'}`} />
          <div className="min-w-0">
            <p className={`text-sm font-medium ${isBlocked ? 'text-red-300' : 'text-amber-300'}`}>
              {isBlocked ? 'Usage Limit Reached' : 'Usage Warning'}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {warning.message} ({pct}% of allocation used — ${(warning.current_cost_cents / 100).toFixed(2)} / ${(warning.limit_cents / 100).toFixed(2)})
            </p>
          </div>
        </div>
        {nextTier && (
          <button
            onClick={handleUpgrade}
            disabled={isUpgrading}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isBlocked 
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black' 
                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'
            } disabled:opacity-50`}
          >
            {isUpgrading ? 'Redirecting...' : `Upgrade to ${nextTier.charAt(0).toUpperCase() + nextTier.slice(1)}`}
          </button>
        )}
      </div>
      {/* Mini progress bar */}
      <div className="mt-2 h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all ${
            isBlocked ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

function NewsTicker({ items, onHeadlineClick }: { items: NewsItem[]; onHeadlineClick: (item: NewsItem) => void }) {
  const tickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = tickerRef.current
    if (!el) return
    let animId: number
    let pos = 0
    const speed = 0.5
    const tick = () => {
      pos -= speed
      if (Math.abs(pos) >= el.scrollWidth / 2) pos = 0
      el.style.transform = `translateX(${pos}px)`
      animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)
    const handleEnter = () => cancelAnimationFrame(animId)
    const handleLeave = () => { animId = requestAnimationFrame(tick) }
    el.addEventListener('mouseenter', handleEnter)
    el.addEventListener('mouseleave', handleLeave)
    return () => {
      cancelAnimationFrame(animId)
      el.removeEventListener('mouseenter', handleEnter)
      el.removeEventListener('mouseleave', handleLeave)
    }
  }, [items])

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return `${diff}m ago`
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
    return d.toLocaleDateString()
  }

  // Duplicate items for seamless infinite scroll
  const doubled = [...items, ...items]

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/60 overflow-hidden shrink-0">
      <div className="flex items-center">
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border-r border-zinc-800">
          <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div ref={tickerRef} className="flex items-center whitespace-nowrap py-1.5">
            {doubled.map((item, i) => (
              <button
                key={`${item.id}-${i}`}
                onClick={() => onHeadlineClick(item)}
                className="inline-flex items-center gap-2 px-4 text-xs hover:text-emerald-400 transition-colors group"
              >
                <span className="text-zinc-600 font-medium shrink-0">{item.source}</span>
                <span className="text-zinc-300 group-hover:text-emerald-400">{item.headline}</span>
                <span className="text-zinc-600 shrink-0">{formatTime(item.datetime)}</span>
                <span className="text-zinc-800 px-2">|</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SyntaxHomepage({ newsItems, onNewsClick, onQueryClick, onStartChat }: {
  newsItems: NewsItem[]
  onNewsClick: (item: NewsItem) => void
  onQueryClick: (query: string) => void
  onStartChat: () => void
}) {
  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return `${diff}m ago`
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Hero */}
      <div className="text-center pt-8 pb-4">
        <div className="h-16 w-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
          <Shield className="h-8 w-8 text-emerald-500" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Welcome to SYNTAX</h1>
        <p className="text-zinc-400 max-w-lg mx-auto">
          AI-powered portfolio intelligence. Explore trending questions, catch breaking market news, or start a conversation.
        </p>
        <button
          onClick={onStartChat}
          className="mt-4 px-5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
        >
          Start a new chat
        </button>
      </div>

      {/* Trending Queries */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Top Questions Traders Are Asking</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {TRENDING_QUERIES.map((item, i) => (
            <button
              key={i}
              onClick={() => onQueryClick(item.query)}
              className="group text-left p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800 hover:border-emerald-500/20 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  <Search className="h-3.5 w-3.5 text-zinc-600 group-hover:text-emerald-500 transition-colors" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-zinc-300 group-hover:text-emerald-400 transition-colors">{item.query}</div>
                  <div className="text-[11px] text-zinc-600 mt-1">{item.category}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Live News Feed */}
      {newsItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Newspaper className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Breaking Market News</h2>
            <div className="flex items-center gap-1 ml-2">
              <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] text-red-400 font-medium">LIVE</span>
            </div>
          </div>
          <div className="space-y-2">
            {newsItems.slice(0, 12).map((item) => (
              <button
                key={item.id}
                onClick={() => onNewsClick(item)}
                className="group w-full text-left p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800 hover:border-amber-500/20 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-zinc-200 group-hover:text-amber-400 transition-colors leading-snug">{item.headline}</div>
                    {item.summary && (
                      <div className="text-xs text-zinc-500 mt-1 line-clamp-1">{item.summary}</div>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[11px] font-medium text-zinc-500">{item.source}</span>
                      <span className="text-[11px] text-zinc-600">{formatTime(item.datetime)}</span>
                      {item.related && (
                        <div className="flex items-center gap-1">
                          {item.related.split(',').slice(0, 3).map(t => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">{t.trim()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-zinc-700 group-hover:text-amber-500 shrink-0 mt-1 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionConfirmation({ action, onConfirm, onDismiss }: { action: PendingAction; onConfirm: () => void; onDismiss: () => void }) {
  const typeLabels: Record<string, { label: string; color: string }> = {
    update_risk_profile: { label: 'Update Risk Profile', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
    update_cash: { label: 'Update Cash', color: 'text-green-400 bg-green-500/10 border-green-500/20' },
    update_position: { label: 'Update Position', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    add_position: { label: 'Add Position', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    remove_position: { label: 'Remove Position', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  }

  const meta = typeLabels[action.type] || { label: action.type, color: 'text-zinc-400 bg-zinc-800 border-zinc-700' }

  return (
    <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
      <div className={`text-xs font-medium px-2 py-0.5 rounded border ${meta.color}`}>
        {meta.label}
      </div>
      <span className="text-sm text-zinc-300 flex-1">{action.description}</span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onConfirm}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
        >
          <Check className="h-3 w-3" />
          Confirm
        </button>
        <button
          onClick={onDismiss}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-medium hover:bg-zinc-700 transition-colors"
        >
          <X className="h-3 w-3" />
          Dismiss
        </button>
      </div>
    </div>
  )
}
