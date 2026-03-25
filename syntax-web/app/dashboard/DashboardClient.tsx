'use client'

import { MarketStatus } from "@/components/MarketStatus";
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchStockPrices } from '@/lib/stockPrices'
import { useSyntaxVerification, PendingAction, TrajectoryProjection, LoopEvent, UsageWarningData } from '@/hooks/useSyntaxVerification'
import { TierGate, DevToolsBar, type Tier } from '@/components/TierGate'
import { PortfolioSidebar } from '@/components/portfolio/PortfolioSidebar'
import { ResearchTab } from '@/components/ResearchTab'
import { FinancialBridge } from '@/components/FinancialBridge';
import Image from 'next/image'
import { 
  Send, 
  Settings, 
  Plus, 
  ChevronRight, 
  X, 
  Shield, 
  TrendingUp, 
  MessageSquare, 
  Zap, 
  LogOut,
  ChevronDown,
  FlaskConical,
  Search,
  ExternalLink,
  CreditCard,
  CheckCircle2,
  Activity,
  XCircle,
  AlertCircle,
  Newspaper,
  Check
} from 'lucide-react'
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

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

const ACTIVE_PORTFOLIO_PROMPTS = [
  // High-scoring patterns (score >= 1.1): Time-bound + portfolio context + action request
  "What is the current optimal cash allocation given live conditions?",
  "Identify any intraday rebalancing opportunities in my portfolio",
  "Which positions are showing elevated volatility risk right now?",
  "Recommend position sizing adjustments based on today's close",
  "What positions should I hold overnight vs close before tomorrow?",
  "Summarise key risk exposures heading into after-hours",
  "Suggest a pre-market watchlist based on my current portfolio",
  "Prepare a morning briefing: key risks and opportunities for today",
  "What positions should I size up or down at market open?",
  "Identify any overnight news catalysts affecting my holdings",
  "Perform a deep risk assessment and suggest overnight rebalancing moves",
  "Model a max-drawdown minimization scenario for my current holdings",
  "Optimize allocation for maximum Sharpe ratio before market open",
  "What macro headwinds should I hedge against entering tomorrow?",
  "Evaluate sector concentration and propose diversification targets",
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
  const [devTierOverride, setDevTierOverride] = useState<Tier | null>(
    process.env.NODE_ENV === 'development' ? 'operator' : null
  )
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
  // Track which session owns the currently-running verification so it survives navigation
  const [streamingSessionId, setStreamingSessionId] = useState<string | null>(null)
  // Admin mode: set via admin1/SyntaxEpoch login — bypasses all billing/limits
  const [isAdminMode, setIsAdminMode] = useState(false)
  // Financial Bridge modal — shown when backend returns NeedsTopup
  const [showFinancialBridge, setShowFinancialBridge] = useState(false)
  const [activeMainView, setActiveMainView] = useState<'chat' | 'research'>('chat')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const maxFreeUses = Number(process.env.NEXT_PUBLIC_OBSERVER_FREE_VERIFICATIONS || '3')
  const remainingFreeUses = isAdminMode ? 999 : Math.max(verificationLimit - verificationCount, 0)
  // Check cost ceiling status on mount and when tier changes
  useEffect(() => {
    if (!user) return
    
    const checkCostStatus = async () => {
      try {
  const { data, error } = await supabase
    .rpc('check_cost_ceiling', { p_user_id: user.id }) as { data: Array<{
      allowed: boolean;
      current_cost_cents: number | null;
      limit_cents: number | null;
      warning_level: string;
    }> | null, error: { message: string } | null }
        
        if (error) {
          console.error('Failed to check cost ceiling:', error)
          return
        }
        
        if (data && data[0]) {
          const status = data[0]
          // Update verification count based on cost for observer tier
          if (currentTier === 'observer' && status.limit_cents) {
            // Approximate: 1 verification ≈ 15 cents
            const usedVerifications = Math.floor((status.current_cost_cents || 0) / 15)
            const maxVerifications = Math.floor(status.limit_cents / 15)
            setVerificationCount(usedVerifications)
            setVerificationLimit(maxVerifications)
          }
        }
      } catch (err) {
        console.error('Error checking cost status:', err)
      }
    }
    
    checkCostStatus()
    // Poll every 30 seconds to keep usage in sync
    const interval = setInterval(checkCostStatus, 30000)
    return () => clearInterval(interval)
  }, [user, currentTier])
  const effectiveTier: Tier = isAdminMode
    ? 'institutional'
    : (process.env.NODE_ENV === 'development' && devTierOverride) ? devTierOverride : currentTier

  const [suggested_prompts, setSuggestedPrompts] = useState<string[]>([])

  const [showProfileModal, setShowProfileModal] = useState(false)
  const [isManagingSubscription, setIsManagingSubscription] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null)

  // Input validation: reject garbage before it hits the LLM
  const validateInput = (text: string): { valid: boolean; reason?: string } => {
    const trimmed = text.trim()
    if (!trimmed) return { valid: false, reason: 'Empty input' }
    
    // Check minimum length (too short to be meaningful)
    if (trimmed.length < 3) return { valid: false, reason: 'Input too short' }
    
    // Check for excessive special characters (likely garbage)
    const specialCharRatio = (trimmed.match(/[^a-zA-Z0-9\s.,!?@#$%^&*()\-_=+\[\]{}|\\:;"'<>/~`]/) || []).length / trimmed.length
    if (specialCharRatio > 0.5) return { valid: false, reason: 'Too many special characters' }
    
    // Check for repeated characters (e.g., "aaaaaaa", "!!!!!!")
    if (/(.)\1{5,}/.test(trimmed)) return { valid: false, reason: 'Repeated characters detected' }
    
    // Check for only numbers
    if (/^\d+$/.test(trimmed)) return { valid: false, reason: 'Numbers only' }
    
    // Check for URL-only input (no meaningful text)
    if (/^https?:\/\/\S+$/i.test(trimmed)) return { valid: false, reason: 'URL-only input not allowed' }
    
    // Check for base64 or encoded-looking strings
    if (/^[A-Za-z0-9+/=]{20,}$/.test(trimmed)) return { valid: false, reason: 'Encoded text not allowed' }
    
    return { valid: true }
  }

  const loadSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId)
    setShowHomepage(false)
    // Don't kill an in-flight verification — just switch the view
    if (!verification.isStreaming) verification.reset()
    
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
    // Don't kill an in-flight verification — user may return to that session
    if (!verification.isStreaming) verification.reset()
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
      console.log('Starting checkAuth...')
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        console.error('Session error:', sessionError)
      }
      if (!session) {
        console.log('No session, redirecting to /auth')
        router.push('/auth')
        return
      }
      console.log('Session found for user:', session.user.id)
      setUser(session.user)
      setAccessToken(session.access_token)

      // Check admin mode flag (set by admin1/SyntaxEpoch login)
      const adminFlag = typeof window !== 'undefined' && localStorage.getItem('syntax_admin_mode') === 'true'
      setIsAdminMode(adminFlag)

      try {
        console.log('Fetching subscription...')
        const { data: subscription, error: subError } = await (supabase as any)
          .from('user_subscriptions')
          .select('tier, monthly_verifications_used, monthly_verifications_limit, verification_count')
          .eq('user_id', session.user.id)
          .single()
        
        if (subError) console.warn('Subscription fetch error:', subError)
        
        if (subscription) {
          console.log('Subscription found:', subscription.tier)
          setCurrentTier(subscription.tier)
          if (subscription.tier === 'observer') {
            setVerificationCount(subscription.verification_count ?? 0)
            setVerificationLimit(maxFreeUses)
          } else {
            setVerificationCount(subscription.monthly_verifications_used ?? 0)
            setVerificationLimit(subscription.monthly_verifications_limit ?? 100)
          }
        }

        console.log('Fetching portfolios...')
        const { data: portfolios, error: portError } = await supabase
          .from('portfolios')
          .select('id')
          .eq('user_id', session.user.id)
          .limit(1)
        
        if (portError) console.error('Portfolio fetch error:', portError)
        
        let activePortfolioId = ''
        
        if (portfolios && portfolios.length > 0) {
          activePortfolioId = portfolios[0].id
          console.log('Found active portfolio:', activePortfolioId)
          setPortfolioId(activePortfolioId)
        } else {
          console.log('No portfolio found, creating default...')
          const { data: newPortfolio, error: createError } = await supabase
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
            console.log('Created default portfolio:', activePortfolioId)
            setPortfolioId(activePortfolioId)
          } else if (createError) {
            console.error("Failed to create default portfolio:", createError)
          }
        }

        console.log('Fetching chat sessions...')
        const { data: chatSessions, error: chatError } = await supabase
          .from('chat_sessions')
          .select('id, title, created_at')
          .eq('user_id', session.user.id)
          .order('updated_at', { ascending: false })

        if (chatError) console.warn('Chat sessions fetch error:', chatError)
        if (chatSessions) {
          console.log(`Found ${chatSessions.length} chat sessions`)
          setSessions(chatSessions.map(s => ({
            id: s.id,
            title: s.title || 'Untitled',
            created_at: s.created_at,
          })))
        }

        if (activePortfolioId) {
          console.log('Fetching positions...')
          const { data: posData, error: posError } = await supabase
            .from('positions')
            .select('ticker')
            .eq('portfolio_id', activePortfolioId)
          
          if (posError) console.warn('Positions fetch error:', posError)
          const tickers = posData?.map(p => p.ticker) ?? []
          console.log(`Found ${tickers.length} positions`)
          setPositionTickers(tickers)
          const promptsToUse = (tickers.length > 0) ? ACTIVE_PORTFOLIO_PROMPTS : NEW_PORTFOLIO_PROMPTS
          setSuggestedPrompts([...promptsToUse].sort(() => 0.5 - Math.random()).slice(0, 4))
        }

        console.log('Fetching stock memories...')
        const { data: memories, error: memError } = await (supabase as any)
          .from('stock_memories')
          .select('id, ticker, fact, source')
          .eq('user_id', session.user.id)
          .order('updated_at', { ascending: false })
        
        if (memError) console.warn('Memories fetch error:', memError)
        if (memories) {
          console.log(`Found ${memories.length} stock memories`)
          setStockMemories(memories as StockMemory[])
        }
      } catch (err) {
        console.error('Unexpected error in checkAuth:', err)
      }
      console.log('checkAuth sequence complete')
    }
    checkAuth()
  }, [router, supabase])

  // Fetch live news on mount and every 5 minutes
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch('/api/news')
        if (res.ok) {
          const data = await res.json() as { news?: NewsItem[] }
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

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true)

  // Smart scroll logic
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100
    setShouldScrollToBottom(isAtBottom)
  }

  // Handle auto-scroll on content updates
  useEffect(() => {
    if (shouldScrollToBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatHistory, verification.isStreaming, shouldScrollToBottom])

  // Snap to bottom when switching chats or initial mount
  useEffect(() => {
    if (currentSessionId && messagesEndRef.current) {
      setShouldScrollToBottom(true)
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' })
    }
  }, [currentSessionId])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const clearPortfolioPositions = async () => {
    if (!portfolioId || !currentSessionId) return
    try {
      await supabase.from('positions').delete().eq('portfolio_id', portfolioId)
      setPositionTickers([])
      setSuggestedPrompts([...NEW_PORTFOLIO_PROMPTS].sort(() => 0.5 - Math.random()).slice(0, 4))
      const confirmMsg = '✅ Portfolio cleared. All positions have been removed. You can add new positions via the Portfolio panel.'
      setChatHistory(prev => [...prev, { role: 'assistant', content: confirmMsg }])
      await supabase.from('chat_messages').insert({ session_id: currentSessionId, role: 'assistant', content: confirmMsg })
    } catch (err) {
      console.error('Failed to clear portfolio:', err)
      setChatHistory(prev => [...prev, { role: 'assistant', content: '❌ Failed to clear portfolio. Please try again.' }])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inquiry.trim() || verification.isStreaming || !user || !portfolioId) return

    // NLP portfolio clearing
    const clearIntent = /\b(clear|reset|empty|wipe|remove all|delete all)\b.*\b(portfolio|positions?|holdings?|stocks?)\b/i.test(inquiry.trim()) ||
      /\b(portfolio|positions?|holdings?)\b.*\b(clear|reset|empty|wipe)\b/i.test(inquiry.trim())
    if (clearIntent) {
      const userMsg = inquiry.trim()
      setInquiry('')
      // Create session if needed before saving messages
      let activeSessionId = currentSessionId
      if (!activeSessionId) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const { data: sd } = await supabase.from('chat_sessions').insert({ user_id: user.id, title: userMsg.substring(0, 60) }).select().single()
          if (sd) { activeSessionId = sd.id; setCurrentSessionId(sd.id); setSessions(prev => [{ id: sd.id, title: sd.title || 'Untitled', created_at: sd.created_at }, ...prev]) }
        }
      }
      setChatHistory(prev => [...prev, { role: 'user', content: userMsg }])
      if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'user', content: userMsg })
      if (positionTickers.length === 0) {
        const msg = 'Your portfolio is already empty — nothing to clear.'
        setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
        if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'assistant', content: msg })
      } else if (confirm(`Clear all ${positionTickers.length} position(s) from your portfolio? This cannot be undone.`)) {
        await clearPortfolioPositions()
      } else {
        const msg = 'Portfolio clear cancelled.'
        setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
      }
      return
    }

    // NLP cash deposit intercept — bypass verification loop for simple "add/deposit $X" messages
    // Relaxed patterns to catch conversational forms: "can you add $50", "i want to deposit $100", etc.
    const cashAmountMatch = /(?:\b|^|\s)(?:add|deposit|put\s+in|contribute)\b.*?(?:\$\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?))/i.exec(inquiry.trim()) ??
      /(?:can\s+you|could\s+you|would\s+you|please|i\s+(?:want|would\s+like)\s+to)\s+(?:add|deposit|put\s+in|contribute)\b.*?(?:\$\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?))/i.exec(inquiry.trim())
    const hasInvestmentTarget = /\b(?:worth\s+of|into\s+[A-Z]|buy\b|invest\s+in|purchase\b)\b/i.test(inquiry.trim())
    // Relaxed question detection — "can you add..." is a request, not a question needing analysis
    const isRealQuestion = /^(?:what|how|why|when|where|which|who|should|is|are|do|does|did)\b/i.test(inquiry.trim()) &&
      !/\b(?:add|deposit|remove|withdraw|sell|buy)\b/i.test(inquiry.trim())
    const lastAssistantMsg = [...chatHistory].reverse().find(m => m.role === 'assistant')
    const isCashFollowup = /^(?:yes|yeah|yep|sure|ok|okay|confirm|do\s+it|add\s+(?:it|cash)|yes[\s,]+add)/i.test(inquiry.trim()) &&
      lastAssistantMsg?.content?.includes('add cash')

    if ((cashAmountMatch && !hasInvestmentTarget && !isRealQuestion) || isCashFollowup) {
      let amount = 0
      if (cashAmountMatch) {
        amount = parseFloat(cashAmountMatch[1].replace(/,/g, ''))
      } else if (isCashFollowup && lastAssistantMsg) {
        const m = /\*\*\$([\d,.]+)\*\*/.exec(lastAssistantMsg.content)
        if (m) amount = parseFloat(m[1].replace(/,/g, ''))
      }

      if (amount > 0 && amount <= 1_000_000) {
        const hasCashKeyword = /\bcash\b/i.test(inquiry) || /\bto\s+(?:my\s+)?portfolio\b/i.test(inquiry) || isCashFollowup
        const userMsg = inquiry.trim()
        setInquiry('')

        let activeSessionId = currentSessionId
        if (!activeSessionId) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            const { data: sd } = await supabase.from('chat_sessions').insert({ user_id: user.id, title: userMsg.substring(0, 60) }).select().single()
            if (sd) { activeSessionId = sd.id; setCurrentSessionId(sd.id); setSessions(prev => [{ id: sd.id, title: sd.title || 'Untitled', created_at: sd.created_at }, ...prev]) }
          }
        }
        setChatHistory(prev => [...prev, { role: 'user', content: userMsg }])
        if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'user', content: userMsg })

        if (hasCashKeyword) {
          const { data: portfolio } = await supabase.from('portfolios').select('available_cash').eq('id', portfolioId).single()
          const currentCash = Number((portfolio as { available_cash?: number } | null)?.available_cash) || 0
          const newCash = Math.round((currentCash + amount) * 100) / 100
          await supabase.from('portfolios').update({ available_cash: newCash }).eq('id', portfolioId)
          const msg = `✅ Added **$${amount.toFixed(2)}** cash to your portfolio. Available cash is now **$${newCash.toFixed(2)}**.`
          setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
          if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'assistant', content: msg })
        } else {
          const msg = `Did you mean add **$${amount.toFixed(2)} cash** to your portfolio balance?\n\nReply **"yes, add cash"** to confirm, or tell me what you'd like to invest the $${amount.toFixed(2)} in.`
          setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
          if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'assistant', content: msg })
        }
        return
      }
    }

    // NLP cash withdrawal intercept — bypass verification loop for simple "remove/withdraw $X" messages
    // Relaxed patterns for conversational forms: "can you remove $50", "i want to take out $100"
    const removeAmountMatch = /(?:\b|^|\s)(?:remove|withdraw|take\s+out|pull\s+out|reduce\s+cash)\b.*?(?:\$\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?))/i.exec(inquiry.trim()) ??
      /(?:can\s+you|could\s+you|would\s+you|please|i\s+(?:want|would\s+like)\s+to)\s+(?:remove|withdraw|take\s+out|pull\s+out)\b.*?(?:\$\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?))/i.exec(inquiry.trim())
    const isRemoveFollowup = /^(?:yes|yeah|yep|sure|ok|okay|confirm|do\s+it|remove\s+(?:it|cash)|withdraw\s+(?:it|cash)|yes[\s,]+(?:remove|withdraw))/i.test(inquiry.trim()) &&
      lastAssistantMsg?.content?.includes('remove cash')

    if ((removeAmountMatch && !hasInvestmentTarget && !isRealQuestion) || isRemoveFollowup) {
      let amount = 0
      if (removeAmountMatch) {
        amount = parseFloat(removeAmountMatch[1].replace(/,/g, ''))
      } else if (isRemoveFollowup && lastAssistantMsg) {
        const m = /\*\*\$([\d,.]+)\*\*/.exec(lastAssistantMsg.content)
        if (m) amount = parseFloat(m[1].replace(/,/g, ''))
      }

      if (amount > 0 && amount <= 1_000_000) {
        const hasCashKeyword = /\bcash\b/i.test(inquiry) || /\bfrom\s+(?:my\s+)?portfolio\b/i.test(inquiry) || isRemoveFollowup
        const userMsg = inquiry.trim()
        setInquiry('')

        let activeSessionId = currentSessionId
        if (!activeSessionId) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            const { data: sd } = await supabase.from('chat_sessions').insert({ user_id: user.id, title: userMsg.substring(0, 60) }).select().single()
            if (sd) { activeSessionId = sd.id; setCurrentSessionId(sd.id); setSessions(prev => [{ id: sd.id, title: sd.title || 'Untitled', created_at: sd.created_at }, ...prev]) }
          }
        }
        setChatHistory(prev => [...prev, { role: 'user', content: userMsg }])
        if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'user', content: userMsg })

        if (hasCashKeyword) {
          const { data: portfolio } = await supabase.from('portfolios').select('available_cash').eq('id', portfolioId).single()
          const currentCash = Number((portfolio as { available_cash?: number } | null)?.available_cash) || 0
          if (currentCash >= amount) {
            const newCash = Math.round((currentCash - amount) * 100) / 100
            await supabase.from('portfolios').update({ available_cash: newCash }).eq('id', portfolioId)
            const msg = `✅ Removed **$${amount.toFixed(2)}** cash from your portfolio. Available cash is now **$${newCash.toFixed(2)}**.`
            setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
            if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'assistant', content: msg })
          } else {
            const msg = `❌ Cannot remove $${amount.toFixed(2)} — you only have $${currentCash.toFixed(2)} available cash.`
            setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
            if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'assistant', content: msg })
          }
        } else {
          const msg = `Did you mean remove **$${amount.toFixed(2)} cash** from your portfolio balance?\n\nReply **"yes, remove cash"** to confirm, or tell me what position you'd like to reduce.`
          setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
          if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'assistant', content: msg })
        }
        return
      }
    }

    // NLP position reduction intercept — direct handling for "sell/reduce/trim X shares of TICKER"
    // Relaxed patterns for conversational forms: "can you sell 10 shares of AAPL", "i want to sell all my TSLA"
    const sellMatch = /(?:\b|^|\s)(?:sell|reduce|trim|cut|decrease)\b\s*(\d+(?:\.\d+)?)?\s*(?:shares?|)\s*(?:of\s+|in\s+|)?([A-Z]{1,5})\b/i.exec(inquiry.trim()) ??
      /(?:can\s+you|could\s+you|would\s+you|please|i\s+(?:want|would\s+like)\s+to)\s+(?:sell|reduce|trim|cut)\b.*?([A-Z]{1,5})\b.*?((?:\d+(?:\.\d+)?)\s*(?:shares?|))?/i.exec(inquiry.trim())
    const sellAllMatch = /(?:\b|^|\s)(?:sell|close|exit|liquidate)\b.*?\ball\s*(?:of\s+)?(?:my\s+)?([A-Z]{1,5})\b/i.exec(inquiry.trim()) ??
      /(?:can\s+you|could\s+you|would\s+you|please|i\s+(?:want|would\s+like)\s+to)\s+(?:sell|close|exit|liquidate)\b.*?\ball\s*(?:of\s+)?(?:my\s+)?([A-Z]{1,5})\b/i.exec(inquiry.trim())
    const reduceToMatch = /(?:\b|^|\s)(?:reduce|trim|cut)\b.*?([A-Z]{1,5})\b.*?\b(?:to|down\s+to)\s*(\d+(?:\.\d+)?)\s*(?:shares?|)/i.exec(inquiry.trim()) ??
      /(?:can\s+you|could\s+you|would\s+you|please)\s+(?:reduce|trim|cut)\b.*?([A-Z]{1,5})\b.*?\b(?:to|down\s+to)\s*(\d+(?:\.\d+)?)\s*(?:shares?|)/i.exec(inquiry.trim())

    if ((sellMatch || sellAllMatch || reduceToMatch) && !isRealQuestion) {
      let ticker = ''
      let sharesToSell: number | null = null
      let targetShares: number | null = null

      if (sellAllMatch) {
        ticker = sellAllMatch[1].toUpperCase()
      } else if (reduceToMatch) {
        ticker = reduceToMatch[1].toUpperCase()
        targetShares = parseFloat(reduceToMatch[2])
      } else if (sellMatch) {
        ticker = (sellMatch[2] || '').toUpperCase()
        sharesToSell = sellMatch[1] ? parseFloat(sellMatch[1]) : null
      }

      if (ticker && positionTickers.includes(ticker)) {
        const userMsg = inquiry.trim()
        setInquiry('')

        let activeSessionId = currentSessionId
        if (!activeSessionId) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            const { data: sd } = await supabase.from('chat_sessions').insert({ user_id: user.id, title: userMsg.substring(0, 60) }).select().single()
            if (sd) { activeSessionId = sd.id; setCurrentSessionId(sd.id); setSessions(prev => [{ id: sd.id, title: sd.title || 'Untitled', created_at: sd.created_at }, ...prev]) }
          }
        }
        setChatHistory(prev => [...prev, { role: 'user', content: userMsg }])
        if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'user', content: userMsg })

        const { data: position } = await supabase.from('positions').select('shares').eq('portfolio_id', portfolioId).eq('ticker', ticker).single()
        const currentShares = Number((position as { shares?: number } | null)?.shares) || 0

        if (currentShares === 0) {
          const msg = `❌ You don't have any ${ticker} shares to sell.`
          setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
          if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'assistant', content: msg })
        } else if (sellAllMatch) {
          await supabase.from('positions').delete().eq('portfolio_id', portfolioId).eq('ticker', ticker)
          setPositionTickers(prev => prev.filter(t => t !== ticker))
          const msg = `✅ Sold all **${currentShares} shares** of **${ticker}**. Position removed from portfolio.`
          setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
          if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'assistant', content: msg })
        } else if (targetShares !== null && targetShares >= 0 && targetShares < currentShares) {
          const newShares = Math.round(targetShares * 100) / 100
          if (newShares === 0) {
            await supabase.from('positions').delete().eq('portfolio_id', portfolioId).eq('ticker', ticker)
            setPositionTickers(prev => prev.filter(t => t !== ticker))
            const msg = `✅ Sold all **${currentShares} shares** of **${ticker}**. Position removed from portfolio.`
            setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
            if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'assistant', content: msg })
          } else {
            await supabase.from('positions').update({ shares: newShares }).eq('portfolio_id', portfolioId).eq('ticker', ticker)
            const sold = Math.round((currentShares - newShares) * 100) / 100
            const msg = `✅ Reduced **${ticker}** from ${currentShares} to ${newShares} shares (sold ${sold} shares).`
            setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
            if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'assistant', content: msg })
          }
        } else if (sharesToSell !== null && sharesToSell > 0) {
          if (sharesToSell >= currentShares) {
            await supabase.from('positions').delete().eq('portfolio_id', portfolioId).eq('ticker', ticker)
            setPositionTickers(prev => prev.filter(t => t !== ticker))
            const msg = `✅ Sold all **${currentShares} shares** of **${ticker}** (you requested ${sharesToSell}). Position removed from portfolio.`
            setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
            if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'assistant', content: msg })
          } else {
            const newShares = Math.round((currentShares - sharesToSell) * 100) / 100
            await supabase.from('positions').update({ shares: newShares }).eq('portfolio_id', portfolioId).eq('ticker', ticker)
            const msg = `✅ Sold **${sharesToSell} shares** of **${ticker}**. You now hold ${newShares} shares.`
            setChatHistory(prev => [...prev, { role: 'assistant', content: msg }])
            if (activeSessionId) await supabase.from('chat_messages').insert({ session_id: activeSessionId, role: 'assistant', content: msg })
          }
        }
        return
      }
    }

    // Validate input before processing - reject garbage
    const validation = validateInput(inquiry)
    if (!validation.valid) {
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: `**Input Rejected:** ${validation.reason}. Please provide a meaningful question about your portfolio, stocks, or investment strategy.` 
      }])
      setInquiry('')
      return
    }

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
      setStreamingSessionId(activeSessionId)
      const result = await verification.verify(
        newsPrefix + currentInquiry,
        portfolioId,
        session.access_token,
        historyForBackend,
        stockMemories,
        livePricesForBackend
      )

      // 4b. Handle credits exhausted — show Financial Bridge modal
      if (result.needsTopup) {
        setShowFinancialBridge(true)
        const topupMsg = `**Service Temporarily Unavailable**\n\nOur AI providers are experiencing capacity limits. Please upgrade your plan or try again shortly.`
        setChatHistory(prev => [...prev, { role: 'assistant', content: topupMsg }])
        await supabase.from('chat_messages').insert({
          session_id: activeSessionId,
          role: 'assistant',
          content: topupMsg
        })
        return
      }

      // 4c. Handle blocked usage warning — no verification ran
      if (result.usageWarning?.warning_level === 'blocked') {
        const blockedMsg = `**Usage Limit Reached**\n\nYou've reached your free query limit. Upgrade to **OPERATOR** to keep using Olea Syntax — your portfolio and chat history will be preserved.`
        setChatHistory(prev => [...prev, { role: 'assistant', content: blockedMsg }])
        setShowFinancialBridge(true)
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
      } else if (result.terminatedReason?.startsWith('Topic rejected:')) {
        assistantContent = `I'm Olea Syntax — your portfolio research analyst. I can help with stocks, ETFs, options, risk management, and portfolio strategy.\n\nAsk me something like: *"Should I rebalance my portfolio?"* or *"What are the risks in my current holdings?"* or *"Analyze NVDA vs AMD for long-term growth."*`
      } else if (result.terminatedReason) {
        assistantContent = `**Verification Terminated:** ${result.terminatedReason}\n\nThe AI attempted multiple times but couldn't generate a valid portfolio projection that meets your risk constraints. Try adjusting your constraints or asking a different question.`
      } else {
        assistantContent = `**Processing Issue:** The verification completed but didn't return a final result. This may be a temporary issue. Please try again.\n\nDebug info: ${JSON.stringify({ hasProjection: !!result.finalProjection, hasError: !!result.error, hasTermination: !!result.terminatedReason })}`
      }

      // 5b-pre. Prepend soft usage warning if this was the last free query
      if (result.usageWarning?.warning_level === 'soft') {
        assistantContent = `> ⚠️ **Last free query used.** Upgrade to [OPERATOR](/pricing) to keep your research going.\n\n` + assistantContent
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

      // 5c. Parse and persist RESEARCH_SAVE tags (general research notes, not stock-specific)
      const researchRegex = /<!--RESEARCH_SAVE\s+topic="([^"]+)"\s+note="([^"]+)"\s*-->/g
      let resMatch
      while ((resMatch = researchRegex.exec(assistantContent)) !== null) {
        const [, topic, note] = resMatch
        try {
          await (supabase as any)
            .from('stock_memories')
            .upsert({
              user_id: user?.id,
              ticker: `_RES_${topic.toUpperCase().replace(/\s+/g, '_').slice(0, 20)}`,
              fact: note,
              source: 'research',
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,ticker,fact' })
          setStockMemories(prev => {
            const key = `_RES_${topic.toUpperCase().replace(/\s+/g, '_').slice(0, 20)}`
            if (prev.find(m => m.ticker === key && m.fact === note)) return prev
            return [{ id: crypto.randomUUID(), ticker: key, fact: note, source: 'research' }, ...prev]
          })
          console.log(`Research saved: [${topic}] ${note}`)
        } catch (err) {
          console.error('Failed to save research note:', err)
        }
      }
      assistantContent = assistantContent.replace(/<!--RESEARCH_SAVE[^>]*-->/g, '').trim()

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

      setStreamingSessionId(null)
      // 8. Increment local usage count (DB is incremented server-side or via RPC)
      setVerificationCount(prev => prev + 1)

    } catch (err) {
      console.error('Submission error:', err)
      setStreamingSessionId(null)
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
        const avgPrice = (action.data.average_purchase_price ?? action.data.avg_price) as number | null
        await supabase.from('positions').upsert({
          portfolio_id: portfolioId,
          ticker,
          shares: (action.data.shares as number) || null,
          average_purchase_price: avgPrice || null,
          target_weight: (action.data.weight as number) || null,
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
      
      // Append a system confirmation to chat — no LLM call needed
      if (successMessage) {
        const confirmMsg = `✅ ${successMessage}`
        setChatHistory(prev => [...prev, { role: 'assistant', content: confirmMsg }])
        if (currentSessionId) {
          await supabase.from('chat_messages').insert({
            session_id: currentSessionId,
            role: 'assistant',
            content: confirmMsg,
          })
        }
      }
    } catch (err) {
      console.error('Failed to execute action:', err)
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      const errMsg = `❌ Failed to execute action: ${errorMsg}`
      setChatHistory(prev => [...prev, { role: 'assistant', content: errMsg }])
    }
  }

  // Usage tracking is loaded from DB in checkAuth effect above

  return (
    <div className="h-screen ambient-bg text-zinc-900 flex overflow-hidden">
      {/* Financial Bridge Modal */}
      {showFinancialBridge && (
        <FinancialBridge 
          onClose={() => setShowFinancialBridge(false)}
          accessToken={accessToken}
          currentTier={currentTier}
        />
      )}
      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar — overlay on mobile, inline on md+ */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-30
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${isSidebarOpen ? 'md:w-64 lg:w-72' : 'md:w-0 md:overflow-hidden'}
        w-72 shrink-0 border-r border-zinc-200 bg-white/90 backdrop-blur-xl md:glass flex flex-col transition-all duration-300
      `}>
        <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-white">
          <button 
            onClick={() => { setShowHomepage(true); setCurrentSessionId(null); setChatHistory([]); if (!verification.isStreaming) verification.reset() }}
            className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-80 transition-opacity"
          >
            <Image 
              src="/images/OleaSyntaxLogo2.svg" 
              alt="Olea Syntax" 
              width={120} 
              height={32} 
              className="h-8 w-auto"
              priority
            />
          </button>
        </div>

        <div className="p-4 border-b border-zinc-100 bg-zinc-50/50">
          <button 
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 bg-olea-evergreen text-white hover:bg-olea-obsidian rounded-xl py-3 transition-all font-bold text-sm shadow-lg shadow-olea-evergreen/10 active:scale-[0.98] group"
          >
            <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform duration-300" />
            <span>New Chat</span>
          </button>
        </div>

        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth scrollbar-thin scrollbar-thumb-zinc-200 scrollbar-track-transparent selection:bg-olea-evergreen/10"
          onScroll={handleScroll}
        >
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 px-2 mt-2">
            Recent Chats
          </div>
          {sessions.length === 0 ? (
            <div className="text-sm text-zinc-400 px-2 italic">No recent chats</div>
          ) : (
            sessions.map(session => (
              <div
                key={session.id}
                className={`group relative flex items-center rounded-xl transition-all duration-200 mb-1 ${
                  currentSessionId === session.id 
                    ? 'bg-white text-olea-evergreen font-bold shadow-sm border border-olea-evergreen/20' 
                    : 'text-olea-obsidian/60 hover:bg-white hover:text-olea-obsidian hover:shadow-sm border border-transparent'
                }`}
              >
                <button
                  onClick={() => loadSession(session.id)}
                  className="flex-1 text-left px-3 py-2.5 text-sm flex items-center gap-3 min-w-0"
                  title={streamingSessionId === session.id ? 'Verification running…' : undefined}
                >
                  <MessageSquare className={`h-4 w-4 shrink-0 ${currentSessionId === session.id ? 'text-olea-evergreen' : 'opacity-40 group-hover:opacity-100'}`} />
                  <span className="truncate flex-1">{session.title}</span>
                  {streamingSessionId === session.id && (
                    <span className="h-1.5 w-1.5 rounded-full bg-olea-evergreen animate-pulse shrink-0" />
                  )}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id) }}
                  className="hidden group-hover:flex shrink-0 items-center justify-center h-7 w-7 mr-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-all"
                  title="Delete chat"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-zinc-100 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500 truncate max-w-[120px]">{user?.email}</span>
            <div className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
              effectiveTier === 'operator' ? 'bg-emerald-100 text-emerald-700' : 
              effectiveTier === 'sovereign' ? 'bg-purple-100 text-purple-700' : 
              effectiveTier === 'institutional' ? 'bg-amber-100 text-amber-700' : 
              'bg-zinc-100 text-zinc-600'
            }`}>
              {effectiveTier.toUpperCase()}{isAdminMode ? ' ◆' : devTierOverride ? ' ★' : ''}
            </div>
          </div>
          {effectiveTier !== 'observer' ? (
            <div className="space-y-1">
              <button
                disabled={isManagingSubscription}
                onClick={async () => {
                  setIsManagingSubscription(true)
                  setSubscriptionError(null)
                  try {
                    const res = await fetch('/api/stripe/portal', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`,
                      },
                    })
                    const data = await res.json() as { url?: string; error?: string }
                    if (data.url) {
                      window.location.href = data.url
                    } else if (res.status === 404) {
                      setSubscriptionError('No billing account found. Contact support.')
                    } else {
                      setSubscriptionError(data.error || 'Unable to open billing portal.')
                    }
                  } catch (err) {
                    console.error('Portal error:', err)
                    setSubscriptionError('Connection failed. Please try again.')
                  } finally {
                    setIsManagingSubscription(false)
                  }
                }}
                className="flex items-center gap-2 text-sm text-zinc-600 hover:text-olea-evergreen transition-colors w-full disabled:opacity-50 disabled:cursor-wait"
              >
                <CreditCard className={`h-4 w-4 ${isManagingSubscription ? 'animate-pulse' : ''}`} />
                {isManagingSubscription ? 'Opening portal…' : 'Manage Subscription'}
              </button>
              {subscriptionError && (
                <p className="text-xs text-red-500 px-1">{subscriptionError}</p>
              )}
            </div>
          ) : !isAdminMode && (
            <button
              onClick={() => router.push('/pricing')}
              className="flex items-center gap-2 text-sm text-zinc-600 hover:text-olea-evergreen transition-colors w-full"
            >
              <CreditCard className="h-4 w-4" />
              Upgrade Plan
            </button>
          )}
          <button
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-2 text-sm text-zinc-600 hover:text-olea-evergreen transition-colors w-full group"
          >
            <Settings className="h-4 w-4 group-hover:rotate-90 transition-transform duration-500" />
            Manage Profile
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm text-zinc-600 hover:text-red-600 transition-colors w-full"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Profile Modal */}
      {showProfileModal && (
        <ProfileModal 
          user={user}
          currentTier={currentTier}
          verificationCount={verificationCount}
          verificationLimit={verificationLimit}
          onClose={() => setShowProfileModal(false)}
          onCancelSubscription={() => {
            alert('Your subscription will be canceled at the end of the current billing period. You retain full access until then.')
            setShowProfileModal(false)
          }}
        />
      )}

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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-olea-studio-grey">
        {/* Header */}
        <header className="h-14 border-b border-zinc-100 flex items-center justify-between px-4 bg-white/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-zinc-50 active:bg-zinc-100 text-zinc-500 transition-colors"
            >
              <MessageSquare className="h-5 w-5" />
            </button>
            <h1 className="font-semibold text-zinc-900">
              {currentSessionId ? sessions.find(s => s.id === currentSessionId)?.title : 'New Chat'}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setActiveMainView(v => v === 'research' ? 'chat' : 'research')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-all ${
                activeMainView === 'research'
                  ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                  : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300'
              }`}
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Research
            </button>
            <button 
              onClick={() => setIsPortfolioSidebarOpen(true)}
              className="font-mono text-zinc-700 bg-zinc-50 px-3 py-1.5 rounded hover:bg-zinc-100 transition-colors border border-zinc-200 flex items-center gap-2 text-xs"
            >
              {portfolioId ? portfolioId.substring(0, 8) + '...' : 'Loading...'}
              <Settings className="h-3 w-3 text-zinc-400" />
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
          <div className="border-b border-zinc-100 bg-emerald-50/50 px-4 py-2">
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

        {/* Research Tab View */}
        {activeMainView === 'research' && (
          <ResearchTab userId={user?.id} />
        )}

        {/* Chat Area */}
        <div className={`flex-1 overflow-y-auto pb-36 md:pb-32 ${activeMainView === 'research' ? 'hidden' : ''}`}>
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
              <h2 className="text-2xl font-bold mb-2 text-center text-zinc-900">How can I assist your portfolio today?</h2>
              <p className="text-zinc-500 text-center mb-10 max-w-lg">
                Olea Syntax uses an autonomous agent loop to verify trades against strict risk constraints before proposing an allocation.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {suggested_prompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handlePromptClick(prompt)}
                    disabled={!portfolioId}
                    className="group text-left p-4 min-h-[56px] rounded-2xl bg-white border border-zinc-200 active:scale-[0.98] hover:border-olea-evergreen/40 hover:shadow-lg hover:bg-white transition-all text-sm text-olea-obsidian font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-between"
                  >
                    <span className="line-clamp-2">{prompt}</span>
                    <Plus className="h-4 w-4 text-zinc-300 group-hover:text-olea-evergreen transition-colors shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 bg-olea-studio-grey">
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
                    onApplyAllocation={(allocation) => {
                      const newActions = allocation.map(pos => ({
                        id: crypto.randomUUID(),
                        type: 'add_position' as const,
                        description: `Add ${pos.ticker} — ${(pos.weight * 100).toFixed(1)}% target weight`,
                        data: { ticker: pos.ticker, weight: pos.weight, shares: null, average_purchase_price: null },
                        status: 'pending' as const,
                      }))
                      setPendingActions(prev => {
                        const merged = [...prev]
                        for (const a of newActions) {
                          if (!merged.some(e => e.data.ticker === a.data.ticker)) merged.push(a)
                        }
                        return merged
                      })
                    }}
                  />
                </div>
              ))}

              {verification.isStreaming && streamingSessionId === currentSessionId && (
                <div className="space-y-3 animate-[fadeSlideIn_0.15s_ease-out]">
                  {/* Placeholder SYNTAX bubble — appears instantly, replaced by real response */}
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-zinc-500 mb-1 font-medium">Olea Syntax</div>
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
        <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-white via-white/95 to-transparent pt-10 pb-[env(safe-area-inset-bottom,0px)] px-3 sm:px-4" style={{paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1.5rem)'}}>
          <div className="max-w-4xl mx-auto relative">
            <TierGate
              requiredTier="operator"
              currentTier={effectiveTier}
              remainingFreeUses={remainingFreeUses}
              devBypass={devBypass}
            >
              <form onSubmit={handleSubmit} className="relative w-full max-w-4xl group">
                <div className="absolute -inset-1 bg-linear-to-r from-emerald-500/10 to-cyan-500/10 rounded-2xl blur-md opacity-0 group-focus-within:opacity-100 transition-opacity" />
                <div className="relative flex items-end gap-2 bg-white border border-zinc-200 focus-within:border-emerald-500/50 p-2 rounded-2xl shadow-xl backdrop-blur-sm transition-all">
                  <textarea
                    value={inquiry}
                    onChange={(e) => setInquiry(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const form = e.currentTarget.closest('form')
                        if (form) form.requestSubmit()
                      }
                    }}
                    placeholder={portfolioId ? "Ask anything about your portfolio..." : "Select or create a portfolio to start..."}
                    rows={1}
                    disabled={verification.isStreaming || !portfolioId}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-zinc-900 placeholder:text-zinc-400 resize-none py-3 px-4 text-sm min-h-[48px] max-h-48 scrollbar-none"
                  />
                  <button
                    type="submit"
                    disabled={!inquiry.trim() || verification.isStreaming || !portfolioId}
                    className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-20 disabled:hover:bg-emerald-500 transition-all active:scale-90 shadow-sm"
                  >
                    {verification.isStreaming ? (
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </form>
              <div className="text-center mt-3 text-xs text-zinc-400 flex items-center justify-center gap-4 font-medium">
                <span className="flex items-center gap-1.5">
                  <Shield className="h-3 w-3 text-emerald-500/30" />
                  Olea Syntax verifies all trades against risk bounds.
                </span>
                {!devBypass && effectiveTier === 'observer' && (
                  <span className="text-zinc-500 bg-zinc-50 px-2 py-0.5 rounded border border-zinc-200">
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((children as any).props?.children) return extractTextFromChildren((children as any).props.children)
  return ''
}

function InlineReply({ onSubmit, isStreaming }: { onSubmit: (text: string) => void; isStreaming: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [replyText, setReplyText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  if (isStreaming) return null

  if (!isExpanded) {
    return (
      <button 
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-olea-studio-grey border border-zinc-200 text-olea-obsidian hover:bg-white hover:border-olea-evergreen/40 transition-all text-[11px] font-bold shadow-sm active:scale-95 mt-2"
      >
        <Plus className="h-3 w-3 text-olea-evergreen" />
        Quick Reply
      </button>
    )
  }

  return (
    <div className="mt-3 bg-white border border-olea-evergreen/20 rounded-xl p-3 shadow-md animate-[fadeSlideIn_0.2s_ease-out]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-olea-evergreen uppercase tracking-widest">In-line Follow-up</span>
        <button onClick={() => setIsExpanded(false)} className="p-1 text-zinc-400 hover:text-red-500 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex gap-2">
        <input 
          ref={inputRef}
          autoFocus
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && replyText.trim()) {
              onSubmit(replyText)
              setIsExpanded(false)
              setReplyText('')
            }
          }}
          placeholder="Type your follow-up..."
          className="flex-1 bg-olea-studio-grey/50 border border-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-olea-evergreen/40 transition-all font-medium"
        />
        <button 
          onClick={() => {
            if (replyText.trim()) {
              onSubmit(replyText)
              setIsExpanded(false)
              setReplyText('')
            }
          }}
          disabled={!replyText.trim()}
          className="bg-olea-evergreen text-white p-2 rounded-lg hover:bg-olea-evergreen/90 transition-all disabled:opacity-50 disabled:grayscale active:scale-95"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function ChatBubble({ message, isStreaming, onFollowUp, onApplyAllocation }: { message: ChatMsg; isStreaming: boolean; onFollowUp: (text: string) => void; onApplyAllocation?: (allocation: Array<{ticker: string; weight: number}>) => void }) {
  const isUser = message.role === 'user'

  // Custom markdown components that inject inline reply buttons after question-containing paragraphs/list items
  const mdComponents: Record<string, React.ComponentType<Record<string, unknown>>> = {
    img: ({ src, alt, ...props }: Record<string, unknown>) => {
      // Custom image renderer to handle thumbnails better
      return (
        <img 
          src={src as string} 
          alt={alt as string || 'Image'} 
          className="rounded-lg border border-zinc-200 max-h-48 object-cover my-2 hover:opacity-80 transition-opacity shadow-sm" 
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
            className="inline-flex items-center gap-2 px-2.5 py-1 my-1 bg-white hover:bg-olea-evergreen/5 border border-zinc-200 hover:border-olea-evergreen/30 rounded-lg text-olea-evergreen text-sm transition-all group max-w-full shadow-sm align-middle" 
            title={href as string} 
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-olea-evergreen group-hover:text-olea-obsidian" />
            <span className="truncate max-w-[250px] sm:max-w-[400px] font-bold">
              {isUrlText ? domain : children as React.ReactNode}
            </span>
            <span className="text-[10px] text-zinc-400 bg-olea-studio-grey px-1.5 py-0.5 rounded-md ml-1 shrink-0 truncate max-w-[100px] border border-zinc-100">
              {domain}
            </span>
          </a>
        )
      } catch {
        // Fallback with extreme break-all for invalid URLs
        return (
          <a href={href as string} target="_blank" rel="noopener noreferrer" className="text-olea-evergreen hover:text-olea-obsidian underline underline-offset-4 break-all font-bold" {...props}>
            {children as React.ReactNode}
          </a>
        )
      }
    },
    p: ({ children, ...props }: Record<string, unknown>) => {
      const text = extractTextFromChildren(children as React.ReactNode)
      const hasQuestion = text.includes('?')
      const isHighlight = text.includes('!!') 
      const isDecorative = text.includes('==') || text.includes('--') || text.includes('>>') || text.includes('[!]') || text.includes('[?]')
      
      let content = children as React.ReactNode;
      if (isHighlight) {
         const str = text.replace(/!!(.*?)!!/g, '<mark class="bg-olea-evergreen/10 text-olea-evergreen px-1.5 py-0.5 rounded-md font-bold border border-olea-evergreen/20">$1</mark>');
         content = <span dangerouslySetInnerHTML={{ __html: str }} />
      }

      if (isDecorative) {
        const isAlert = text.includes('[!]')
        const isInfo = text.includes('[?]')
        return (
          <div className={`my-4 font-mono text-[13px] p-3 rounded-lg border leading-relaxed shadow-inner transition-all hover:shadow-md ${
            isAlert ? 'text-red-600 bg-red-50 border-red-100' : 
            isInfo ? 'text-blue-600 bg-blue-50 border-blue-100' :
            'text-olea-evergreen/70 bg-olea-studio-grey/50 border-olea-evergreen/10'
          }`}>
            <div className="flex items-start gap-2">
              <span className="shrink-0 select-none opacity-50">
                {isAlert ? '(!)' : isInfo ? '(?)' : '>>'}
              </span>
              <div className="flex-1">
                {children as React.ReactNode}
              </div>
            </div>
          </div>
        )
      }

      if (hasQuestion && onFollowUp && !isUser) {
        return (
          <div className="my-5 bg-white border border-zinc-200 p-4 rounded-xl shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1.5 w-1.5 rounded-full bg-olea-evergreen animate-pulse" />
              <span className="text-[10px] font-bold text-olea-evergreen uppercase tracking-widest">Action Required</span>
            </div>
            <p className="text-[15px] text-olea-obsidian font-medium leading-relaxed tracking-wide" {...props}>{content}</p>
            <div className="mt-3">
              <InlineReply onSubmit={(reply) => onFollowUp(`> ${text}\n\n**User Reply:** ${reply}`)} isStreaming={isStreaming} />
            </div>
          </div>
        )
      }
      return <p className="text-[15px] text-olea-obsidian/90 leading-loose my-4" {...props}>{content}</p>
    },
    blockquote: ({ children, ...props }: Record<string, unknown>) => (
      <blockquote className="border-l-4 border-olea-evergreen bg-olea-evergreen/5 px-4 py-2 my-4 rounded-r-lg italic text-olea-obsidian/80" {...props}>
        {children as React.ReactNode}
      </blockquote>
    ),
    code: ({ children, ...props }: Record<string, unknown>) => (
      <code className="bg-olea-studio-grey px-1.5 py-0.5 rounded font-mono text-[13px] font-bold text-olea-evergreen border border-zinc-200" {...props}>
        {children as React.ReactNode}
      </code>
    ),
    pre: ({ children, ...props }: Record<string, unknown>) => (
      <pre className="bg-olea-obsidian text-olea-paper p-4 rounded-xl border border-zinc-800 overflow-x-auto my-6 font-mono text-xs shadow-xl leading-relaxed" {...props}>
        {children as React.ReactNode}
      </pre>
    ),
    h1: ({ children, ...props }: Record<string, unknown>) => <h1 className="text-xl font-bold text-olea-obsidian mt-8 mb-4 pb-2 border-b border-zinc-200 uppercase tracking-tight" {...props}>{children as React.ReactNode}</h1>,
    h2: ({ children, ...props }: Record<string, unknown>) => <h2 className="text-lg font-bold text-olea-obsidian mt-7 mb-3 tracking-tight" {...props}>{children as React.ReactNode}</h2>,
    h3: ({ children, ...props }: Record<string, unknown>) => <h3 className="text-base font-bold text-olea-obsidian mt-6 mb-2 tracking-tight" {...props}>{children as React.ReactNode}</h3>,
    ul: ({ children, ...props }: Record<string, unknown>) => <ul className="list-disc pl-6 my-4 space-y-2.5 marker:text-zinc-300" {...props}>{children as React.ReactNode}</ul>,
    ol: ({ children, ...props }: Record<string, unknown>) => <ol className="list-decimal pl-6 my-4 space-y-2.5 marker:text-zinc-300" {...props}>{children as React.ReactNode}</ol>,
    li: ({ children, ...props }: Record<string, unknown>) => {
      const text = extractTextFromChildren(children as React.ReactNode)
      const hasQuestion = text.includes('?')
      if (hasQuestion && onFollowUp && !isUser) {
        return (
          <li className="text-[15px] text-olea-obsidian/80 font-medium leading-relaxed" {...props}>
            <span className="block mb-2">{children as React.ReactNode}</span>
            <InlineReply onSubmit={(reply) => onFollowUp(`> ${text}\n\n**User Reply:** ${reply}`)} isStreaming={isStreaming} />
          </li>
        )
      }
      return <li className="text-[15px] text-olea-obsidian/80 leading-relaxed pl-1 font-medium" {...props}>{children as React.ReactNode}</li>
    },
  }

  // Detect if this message implies deep research (heuristics based on text)
  const isDeepResearch = !isUser && isStreaming && message.content.toLowerCase().includes('research');

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex gap-4 max-w-[90%] sm:max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center mt-1 shadow-sm transition-transform hover:scale-110 ${
          isUser ? 'bg-olea-evergreen text-white shadow-olea-evergreen/20' : 'bg-white border border-zinc-200 text-olea-evergreen'
        }`}>
          {isUser ? <div className="text-[10px] font-black tracking-tighter">YOU</div> : <Zap className="h-4 w-4" />}
        </div>
        
        {/* Message Bubble */}
        <div className={`flex flex-col gap-2 min-w-0 flex-1 ${isUser ? 'items-end' : 'items-start'}`}>
          <div className={`px-5 py-3.5 rounded-2xl shadow-sm break-words w-full transition-all ${
            isUser 
              ? 'bg-olea-obsidian text-white rounded-tr-sm ring-1 ring-white/10' 
              : 'bg-white border border-zinc-200 text-olea-obsidian rounded-tl-sm'
          }`}>
            {isDeepResearch && (
              <div className="flex items-center gap-2 text-[11px] font-bold text-olea-evergreen mb-3 bg-olea-evergreen/5 border border-olea-evergreen/10 px-3 py-1.5 rounded-lg w-fit uppercase tracking-wider">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-olea-evergreen/40 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-olea-evergreen"></span>
                </span>
                Research Active
              </div>
            )}
            <div className={`prose max-w-none w-full marker:text-zinc-300 prose-p:break-words prose-a:break-all overflow-hidden ${
              isUser ? 'prose-invert text-white prose-p:text-white prose-strong:text-white' : 'prose-zinc text-olea-obsidian prose-p:text-olea-obsidian prose-strong:text-olea-obsidian prose-li:text-olea-obsidian'
            }`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {message.content}
              </ReactMarkdown>
            </div>
          </div>

          {/* Projection artifact with charts */}
          {message.projection_data && (
            <div className="mt-4 w-full">
              <ProjectionArtifact projection={message.projection_data} onApplyAllocation={onApplyAllocation} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProjectionArtifact({ projection, onApplyAllocation }: { projection: TrajectoryProjection; onApplyAllocation?: (allocation: Array<{ticker: string; weight: number}>) => void }) {
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
    const horizon = p.time_horizon_days ?? 365
    const initialCap = p.initial_capital ?? 1000
    const numPoints = Math.min(Math.max(horizon, 10), 100) // Render up to 100 points
    const daysPerPoint = Math.max(1, Math.floor(horizon / numPoints))
    
    const data = []
    let currentBull = initialCap
    let currentBase = initialCap
    let currentBear = initialCap

    const dcaDaily = ((p.dca_monthly_amount ?? 0) * 12) / 365
    
    // Simple deterministic PRNG so chart doesn't jitter on re-renders
    let seed = 1
    const prng = () => {
      const x = Math.sin(seed++) * 10000
      return x - Math.floor(x)
    }
    
    for (let i = 0; i <= numPoints; i++) {
      const day = i * daysPerPoint
      
      // Calculate continuous returns
      const bullDailyRet = Math.pow(1 + (p.bull_annual_return ?? 0.12), 1/365) - 1
      const baseDailyRet = Math.pow(1 + (p.base_annual_return ?? 0.06), 1/365) - 1
      const bearDailyRet = Math.pow(1 + (p.bear_annual_return ?? -0.10), 1/365) - 1
      
      // Generate geometric brownian motion for choppiness
      const dailyVol = (p.volatility ?? 0.2) / Math.sqrt(365)
      
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

      const sellPts = p.suggested_sell_points ?? []
      data.push({
        day: day,
        label: day < 30 ? `Day ${day}` : day < 365 ? `Mo ${Math.round(day/30)}` : `Yr ${(day/365).toFixed(1)}`,
        bull: Math.round(currentBull),
        base: Math.round(currentBase),
        bear: Math.round(currentBear),
        // Flag sell points
        isSellPoint: sellPts.includes(day) || sellPts.some((sp: number) => sp > day - daysPerPoint && sp <= day)
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
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden w-full max-w-3xl shadow-sm">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-zinc-50 transition-colors border-b border-zinc-100"
      >
        <div className="flex items-center gap-2 font-medium text-emerald-600 text-sm">
          {isActionOnly ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
          {headerText}
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
      </button>

      {isOpen && !isActionOnly && (
        <div className="p-4 space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 bg-zinc-100 rounded-lg p-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as typeof activeTab)}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors capitalize ${
                  activeTab === tab 
                    ? 'bg-white text-emerald-600 shadow-sm' 
                    : 'text-zinc-500 hover:text-zinc-700'
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
                <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-lg">
                  <div className="text-xs text-zinc-500 mb-1">Sharpe Ratio</div>
                  <div className="text-lg font-semibold text-emerald-600">{projection.projected_sharpe.toFixed(2)}</div>
                </div>
                <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-lg">
                  <div className="text-xs text-zinc-500 mb-1">Max Drawdown</div>
                  <div className="text-lg font-semibold text-red-600">{(projection.projected_max_drawdown * 100).toFixed(1)}%</div>
                </div>
                <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-lg">
                  <div className="text-xs text-zinc-500 mb-1">Confidence</div>
                  <div className="text-lg font-semibold text-blue-600">{(projection.confidence_score * 100).toFixed(0)}%</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Target Allocation</div>
                <div className="space-y-1.5">
                  {projection.proposed_allocation.map((pos, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-zinc-50 border border-zinc-200 p-2 rounded-md">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="font-mono font-medium text-zinc-900">{pos.ticker}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pos.weight * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                        <span className="font-mono text-zinc-500 w-12 text-right">{(pos.weight * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                {onApplyAllocation && projection.proposed_allocation.length > 0 && (
                  <button
                    onClick={() => onApplyAllocation(projection.proposed_allocation)}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-olea-evergreen hover:bg-olea-obsidian text-olea-paper text-sm font-bold transition-all shadow-sm active:scale-[0.98]"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Apply This Allocation ({projection.proposed_allocation.length} positions)
                  </button>
                )}
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
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#3f3f46' }}
                    formatter={(value) => [`${value}%`, 'Weight']}
                  />
                  <Legend 
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => <span style={{ color: '#71717a', fontSize: '12px', fontFamily: 'monospace' }}>{value}</span>}
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="month" stroke="#d4d4d8" tick={{ fill: '#71717a', fontSize: 11 }} />
                  <YAxis stroke="#d4d4d8" tick={{ fill: '#71717a', fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value, name) => [`$${value}`, String(name).charAt(0).toUpperCase() + String(name).slice(1) + ' Case']}
                  />
                  <Area type="monotone" dataKey="bull" stroke="#10b981" fill="url(#gradBull)" strokeWidth={2} name="bull" />
                  <Area type="monotone" dataKey="base" stroke="#3b82f6" fill="url(#gradBase)" strokeWidth={2} name="base" />
                  <Area type="monotone" dataKey="bear" stroke="#ef4444" fill="url(#gradBear)" strokeWidth={2} name="bear" />
                  <Legend 
                    verticalAlign="top"
                    iconType="line"
                    formatter={(value: string) => <span style={{ color: '#52525b', fontSize: '12px', textTransform: 'capitalize' }}>{value}</span>}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Scenario projections chart (Advanced) */}
          {activeTab === 'scenario_engine' && projection.scenario_chart && (
            <div>
              <div className="text-xs text-zinc-500 mb-3 flex items-center justify-between">
                <span>Scenario Engine: ${(projection.scenario_chart.initial_capital ?? 0).toLocaleString()} + ${(projection.scenario_chart.dca_monthly_amount ?? 0).toLocaleString()}/mo DCA</span>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="label" stroke="#d4d4d8" tick={{ fill: '#71717a', fontSize: 11 }} />
                  <YAxis stroke="#d4d4d8" tick={{ fill: '#71717a', fontSize: 11 }} domain={['auto', 'auto']} tickFormatter={(v: number) => `$${v.toLocaleString()}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value, name) => [`$${Number(value).toLocaleString()}`, String(name).charAt(0).toUpperCase() + String(name).slice(1) + ' Case']}
                  />
                  <Area type="monotone" dataKey="bull" stroke="#10b981" fill="url(#gradBullAdv)" strokeWidth={2} name="bull" dot={<CustomDot />} activeDot={{ r: 6, fill: '#10b981', stroke: '#ffffff', strokeWidth: 2 }} />
                  <Area type="monotone" dataKey="base" stroke="#3b82f6" fill="url(#gradBaseAdv)" strokeWidth={2} name="base" dot={<CustomDot />} activeDot={{ r: 6, fill: '#3b82f6', stroke: '#ffffff', strokeWidth: 2 }} />
                  <Area type="monotone" dataKey="bear" stroke="#ef4444" fill="url(#gradBearAdv)" strokeWidth={2} name="bear" dot={<CustomDot />} activeDot={{ r: 6, fill: '#ef4444', stroke: '#ffffff', strokeWidth: 2 }} />
                  <Legend 
                    verticalAlign="top"
                    iconType="line"
                    formatter={(value: string) => <span style={{ color: '#52525b', fontSize: '12px', textTransform: 'capitalize' }}>{value}</span>}
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
const DEFAULT_ATTEMPT_MS = 10_000
const MAX_LOOP_ATTEMPTS = 3

function ThinkingProcess({ events, startedAt }: { events: LoopEvent[]; startedAt: number | null }) {
  const [isOpen, setIsOpen] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  // Derive loop state from events ─────────────────────────────────────────────
  type AttemptState = {
    provider: string
    status: 'running' | 'verified' | 'rejected' | 'timeout'
    score?: number
    is_new_best?: boolean
    sharpe?: number
    drawdown?: number
    confidence?: number
    timeout_secs?: number
  }

  const attemptMap = new Map<number, AttemptState>()
  let bestScore = -Infinity
  let isSettled = false
  let settledTotal = 0
  let isTerminated = false
  let topicRejected = false
  let topicReason = ''
  let timeoutCount = 0
  let fastModeTriggered = false

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
    } else if (ev.event === 'Slow') {
      timeoutCount++
      const existing = attemptMap.get(ev.data.attempt)
      if (existing) { existing.status = 'timeout'; existing.timeout_secs = ev.data.timeout_secs }
      else attemptMap.set(ev.data.attempt, { provider: '—', status: 'timeout', timeout_secs: ev.data.timeout_secs })
      if (timeoutCount >= 2) fastModeTriggered = true
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
      <div className="max-w-xl space-y-2 py-4">
        <div className="flex items-center gap-2 text-olea-evergreen text-[10px] font-black uppercase tracking-[0.2em]">
          <Activity className="h-3.5 w-3.5 animate-pulse" />
          <span>Initializing analysis loop…</span>
          <span className="text-zinc-400 ml-auto">~{Math.round(DEFAULT_ATTEMPT_MS * MAX_LOOP_ATTEMPTS / 1000)}s EST.</span>
        </div>
        <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
          <div className="h-full bg-olea-evergreen/40 rounded-full animate-pulse w-[8%]" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl py-4 selection:bg-olea-evergreen/10">
      <div className={`bg-white border rounded-2xl overflow-hidden transition-all duration-500 shadow-sm ${isDone ? 'border-zinc-200' : 'border-olea-evergreen/30 shadow-lg shadow-olea-evergreen/5'}`}>

        {/* Progress bar */}
        {!topicRejected && (
          <div className="h-1 bg-zinc-50 w-full overflow-hidden">
            <div
              className={`h-full transition-all duration-700 ease-out ${
                isDone ? 'bg-olea-evergreen' : isLong ? 'bg-amber-500' : 'bg-olea-evergreen'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {/* Header */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-50 transition-colors"
        >
          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-olea-obsidian">
            <Zap className={`h-3.5 w-3.5 ${isDone ? 'text-olea-evergreen' : 'text-amber-500 animate-pulse'}`} />
            <span>Verification Loop</span>
            {!isDone && <div className="h-1.5 w-1.5 rounded-full bg-olea-evergreen animate-ping" />}
            {isSettled && <CheckCircle2 className="h-3.5 w-3.5 text-olea-evergreen" />}
            {isTerminated && <XCircle className="h-3.5 w-3.5 text-red-500" />}
          </div>

          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
            {!isDone && (
              <span className={`tabular-nums ${isLong ? 'text-amber-600' : 'text-zinc-400'}`}>
                {elapsedSec < 1 ? 'STARTING…' : etaSec > 0 ? `~${etaSec}S LEFT` : `${elapsedSec}S`}
              </span>
            )}
            {bestScore > -Infinity && (
              <span className="text-olea-evergreen bg-olea-evergreen/5 px-2 py-0.5 rounded border border-olea-evergreen/10">BEST {bestScore.toFixed(4)}</span>
            )}
            {isOpen
              ? <ChevronDown className="h-3.5 w-3.5 text-zinc-300" />
              : <ChevronRight className="h-3.5 w-3.5 text-zinc-300" />
            }
          </div>
        </button>

        {isOpen && (
          <div className="border-t border-zinc-100 px-4 pt-3 pb-4 space-y-2 font-mono text-[11px]">

            {!isDone && completedCount === 0 && elapsedSec < 5 && (
              <div className="text-zinc-400 font-bold pb-1 uppercase tracking-tighter opacity-60">
                Portfolio analysis typically takes 10–30s. Running {MAX_LOOP_ATTEMPTS} optimization passes.
              </div>
            )}

            {isLong && (
              <div className="flex items-center gap-2 text-amber-600 font-bold pb-1 uppercase tracking-tighter">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Live market data grounding active — Extended processing...
              </div>
            )}

            {topicRejected && (
              <div className="flex items-center gap-2 text-red-600 font-bold uppercase tracking-tighter">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Off-topic: {topicReason}</span>
              </div>
            )}

            {rows.map(([num, att]) => (
              <div
                key={num}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-all ${
                  att.is_new_best
                    ? 'bg-olea-evergreen/5 border border-olea-evergreen/20 shadow-sm'
                    : att.status === 'rejected'
                    ? 'bg-zinc-50 border border-zinc-100 opacity-60'
                    : att.status === 'timeout'
                    ? 'bg-amber-50 border border-amber-100'
                    : att.status === 'running'
                    ? 'bg-olea-studio-grey border border-zinc-200 animate-pulse'
                    : 'bg-zinc-50/50 border border-zinc-100'
                }`}
              >
                {att.status === 'running' && <div className="h-1.5 w-1.5 rounded-full bg-olea-evergreen animate-ping shrink-0" />}
                {att.status === 'verified' && <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${att.is_new_best ? 'text-olea-evergreen' : 'text-zinc-300'}`} />}
                {att.status === 'rejected' && <XCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                {att.status === 'timeout' && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}

                <span className="text-zinc-400 w-8 shrink-0 font-bold">#{num}</span>
                <span className="text-olea-obsidian/60 shrink-0 font-black uppercase tracking-widest text-[9px]">{att.provider !== 'pending' ? att.provider : '...'}</span>

                {att.status === 'running' && <span className="text-olea-evergreen font-bold ml-1 uppercase tracking-tighter italic">Analysing...</span>}
                {att.status === 'rejected' && <span className="text-amber-600 font-bold ml-1 uppercase tracking-tighter">Constraint Fail</span>}
                {att.status === 'timeout' && <span className="text-amber-600 font-bold ml-1 uppercase tracking-tighter">Timed Out ({att.timeout_secs}s)</span>}
                {att.status === 'verified' && att.score !== undefined && (
                  <>
                    <span className={`ml-1 font-black ${att.is_new_best ? 'text-olea-evergreen' : 'text-olea-obsidian/40'}`}>
                      {att.score.toFixed(4)}
                    </span>
                    <span className="text-zinc-200">|</span>
                    <div className="flex gap-3 text-[10px] font-bold text-olea-obsidian/50 uppercase tracking-tighter">
                      <span>S {att.sharpe?.toFixed(2)}</span>
                      <span>D {((att.drawdown ?? 0) * 100).toFixed(1)}%</span>
                      <span>C {((att.confidence ?? 0) * 100).toFixed(0)}%</span>
                    </div>
                    {att.is_new_best && <span className="ml-auto text-olea-evergreen font-black text-[9px] uppercase tracking-widest bg-olea-evergreen/10 px-1.5 py-0.5 rounded">↑ BEST</span>}
                  </>
                )}
              </div>
            ))}

            {fastModeTriggered && isSettled && (
              <div className="flex items-center gap-2 mt-2 pt-3 border-t border-zinc-100 text-amber-600 text-[10px] font-bold uppercase tracking-tighter">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Fast mode active — Returned best verified pass after timeouts.</span>
              </div>
            )}
            {isSettled && bestScore > -Infinity && (
              <div className="flex items-center gap-2 mt-2 pt-3 border-t border-zinc-100 text-olea-evergreen font-black uppercase tracking-widest text-[10px]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Settled: {settledTotal} Passes · {elapsedSec}S Total{fastModeTriggered ? ' · FAST_MODE' : ''}</span>
              </div>
            )}
            {isTerminated && (
              <div className="flex items-center gap-2 mt-2 pt-3 border-t border-zinc-100 text-red-600 font-black uppercase tracking-widest text-[10px]">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>TERMINATED: No valid projection after {settledTotal} attempts</span>
              </div>
            )}
            {!isDone && rows.length === 0 && (
              <div className="flex items-center gap-2 text-zinc-200 pt-1">
                {[0, 150, 300].map(d => (
                  <div key={d} className="h-1 w-1 rounded-full bg-olea-evergreen/30 animate-pulse" style={{ animationDelay: `${d}ms` }} />
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
                <span>Daemon active — running overnight research on your portfolio using <span className="text-emerald-600">gemini-2.5-flash</span>. First results appear here as experiments settle (~60–90s each).</span>
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
          <span className="hidden sm:block">gemini-2.5-flash · auto-scheduled</span>
          <span className="sm:hidden">auto-scheduled</span>
        </div>
      </div>
    </div>
  )
}

function ProfileModal({ 
  user, 
  currentTier, 
  verificationCount, 
  verificationLimit, 
  onClose,
  onCancelSubscription
}: { 
  user: User | null; 
  currentTier: string; 
  verificationCount: number; 
  verificationLimit: number; 
  onClose: () => void;
  onCancelSubscription: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'stats' | 'constraints' | 'billing'>('stats')
  const [constraints, setConstraints] = useState('Default risk-averse allocation. No penny stocks. Max 15% per sector.')

  const stats = [
    { label: 'Total Verifications', value: verificationCount },
    { label: 'Monthly Limit', value: verificationLimit },
    { label: 'Remaining', value: Math.max(0, verificationLimit - verificationCount) },
    { label: 'Account Tier', value: currentTier.charAt(0).toUpperCase() + currentTier.slice(1) },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-olea-obsidian/40 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-olea-evergreen/10 rounded-xl">
              <Settings className="h-4 w-4 text-olea-evergreen" />
            </div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-olea-obsidian">Profile Management</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-400 hover:text-olea-obsidian">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-zinc-100">
          {[
            { id: 'stats', label: 'Overview', icon: <Activity className="h-3.5 w-3.5" /> },
            { id: 'constraints', label: 'Constraints', icon: <Shield className="h-3.5 w-3.5" /> },
            { id: 'billing', label: 'Billing', icon: <CreditCard className="h-3.5 w-3.5" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                activeTab === tab.id ? 'text-olea-evergreen border-olea-evergreen bg-emerald-50/30' : 'text-zinc-400 border-transparent hover:text-olea-obsidian'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-8 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-200 scrollbar-track-transparent">
          {activeTab === 'stats' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-linear-to-br from-olea-evergreen/20 to-cyan-500/10 flex items-center justify-center border border-olea-evergreen/20 shadow-inner">
                  <span className="text-xl font-black text-olea-evergreen">{user?.email?.[0].toUpperCase()}</span>
                </div>
                <div>
                  <div className="text-sm font-black text-olea-obsidian truncate max-w-xs">{user?.email}</div>
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Verified Account</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {stats.map(s => (
                  <div key={s.label} className="bg-olea-studio-grey/50 border border-zinc-100 rounded-2xl p-4 transition-all hover:border-olea-evergreen/20 group">
                    <div className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 group-hover:text-olea-obsidian transition-colors">{s.label}</div>
                    <div className="text-xl font-black text-olea-obsidian tracking-tighter">{s.value}</div>
                  </div>
                ))}
              </div>

              <div className="bg-emerald-50/50 border border-olea-evergreen/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black text-olea-evergreen uppercase tracking-widest">Usage Allocation</span>
                  <span className="text-[10px] font-mono font-black text-olea-evergreen">{Math.round((verificationCount / verificationLimit) * 100)}%</span>
                </div>
                <div className="h-2 bg-white rounded-full overflow-hidden border border-olea-evergreen/5 shadow-inner">
                  <div 
                    className="h-full bg-olea-evergreen rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                    style={{ width: `${Math.min(100, (verificationCount / verificationLimit) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-3 font-medium leading-relaxed italic">
                  Reset occurs on the 1st of every month. Institutional accounts have unlimited reasoning bursts.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'constraints' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-4 w-4 text-amber-500" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-olea-obsidian">Global Verification Constraints</h3>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                Define the logic boundaries for the autonomous engine. Unauthorized or explicit mentions will trigger a hard-stop safety violation.
              </p>
              <textarea
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                className="w-full h-40 bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-xs font-mono focus:ring-2 focus:ring-olea-evergreen/20 focus:border-olea-evergreen outline-none transition-all resize-none shadow-inner"
                placeholder="Enter custom reasoning constraints..."
              />
              <div className="flex items-start gap-3 p-4 bg-amber-50/50 border border-amber-100 rounded-2xl">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 font-bold leading-relaxed uppercase tracking-tighter">
                  MANDATORY: SYSTEM WILL REJECT ANY CONSTRAINTS THAT VIOLATE FINANCIAL SAFETY PROTOCOLS OR ETHICAL TRADING STANDARDS.
                </p>
              </div>
              <button className="w-full py-4 bg-olea-obsidian text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-olea-evergreen transition-all shadow-lg active:scale-[0.98]">
                Update Logic Bounds
              </button>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <div className="text-xs font-black text-olea-obsidian uppercase tracking-widest">{currentTier} Plan</div>
                    <div className="text-sm text-zinc-400 font-bold mt-1">Active since Mar 2026</div>
                  </div>
                  <div className="text-2xl font-black text-olea-obsidian tracking-tighter">
                    {currentTier === 'operator' ? '$5' : currentTier === 'sovereign' ? '$29' : '$0'}
                    <span className="text-xs text-zinc-400 font-bold ml-1">/{currentTier === 'operator' ? 'wk' : 'mo'}</span>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-zinc-50">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                    <span className="text-zinc-400">Next Billing Date</span>
                    <span className="text-olea-obsidian">March 31, 2026</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                    <span className="text-zinc-400">Payment Method</span>
                    <span className="text-olea-obsidian flex items-center gap-1.5"><CreditCard className="h-3 w-3" /> VISA •••• 4242</span>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-red-50/30 border border-red-100 rounded-3xl">
                <h4 className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-2">Cancel Subscription</h4>
                <p className="text-xs text-red-700/60 leading-relaxed font-medium mb-6">
                  If you cancel now, you will still be charged for the current period but will retain access until the end of your billing cycle. No further charges will be applied.
                </p>
                <button 
                  onClick={() => {
                    if (confirm('Are you sure you want to cancel? You will keep access until the end of your current period.')) {
                      onCancelSubscription()
                    }
                  }}
                  className="w-full py-4 border-2 border-red-200 text-red-600 rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-red-600 hover:text-white hover:border-red-600 transition-all active:scale-[0.98]"
                >
                  Confirm Cancelation
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function UsageWarningBanner({ warning, accessToken, currentTier }: { warning: UsageWarningData; accessToken: string; currentTier: string }) {
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const pct = warning.limit_cents > 0 ? Math.round((warning.current_cost_cents / warning.limit_cents) * 100) : 0
  const isBlocked = warning.warning_level === 'blocked'
  const nextTier = currentTier === 'observer' ? 'operator' : currentTier === 'operator' ? 'sovereign' : currentTier === 'sovereign' ? 'institutional' : null

  const handleUpgrade = async () => {
    if (!nextTier) return
    setIsUpgrading(true)
    setUpgradeError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ tier: nextTier }),
      })
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Server error: ${res.status} ${errorText}`)
      }
      const data = await res.json() as { url?: string; error?: string }
      if (data.error) {
        throw new Error(data.error)
      }
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL received from server')
      }
    } catch (e) {
      console.error('Upgrade failed:', e)
      setUpgradeError(e instanceof Error ? e.message : 'Failed to start checkout. Please try again.')
    } finally {
      setIsUpgrading(false)
    }
  }

  return (
    <div className={`mx-auto max-w-3xl mb-4 rounded-xl border px-4 py-3 ${
      isBlocked 
        ? 'bg-red-50 border-red-200' 
        : warning.warning_level === 'urgent' 
          ? 'bg-amber-50 border-amber-200' 
          : 'bg-amber-50/50 border-amber-100'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className={`h-4 w-4 shrink-0 ${isBlocked ? 'text-red-600' : 'text-amber-600'}`} />
          <div className="min-w-0">
            <p className={`text-sm font-medium ${isBlocked ? 'text-red-700' : 'text-amber-700'}`}>
              {isBlocked ? 'Usage Limit Reached' : 'Usage Warning'}
            </p>
            <p className="text-xs text-zinc-400 mt-4">&copy; 2026 <a href="https://oleacomputer.com" target="_blank" rel="noopener noreferrer" className="text-olea-evergreen hover:text-olea-obsidian font-bold transition-colors">Olea Computer</a>. All rights reserved.</p>
            <p className="text-xs text-zinc-400 mt-0.5">{warning.message} ({pct}% of allocation used — ${(warning.current_cost_cents / 100).toFixed(2)} / ${(warning.limit_cents / 100).toFixed(2)})</p>
          </div>
        </div>
        {nextTier && (
          <button
            onClick={handleUpgrade}
            disabled={isUpgrading}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isBlocked 
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm' 
                : 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200'
            } disabled:opacity-50`}
          >
            {isUpgrading ? 'Redirecting...' : `Upgrade to ${nextTier.charAt(0).toUpperCase() + nextTier.slice(1)}`}
          </button>
        )}
      </div>
      <div className="mt-2 h-1 w-full rounded-full bg-zinc-200 overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all ${
            isBlocked ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {upgradeError && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <span className="font-semibold">Error:</span> {upgradeError}
        </div>
      )}
    </div>
  )
}

function LiveClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="text-[10px] font-mono font-black text-olea-obsidian tracking-widest tabular-nums pl-2 border-l border-zinc-200 ml-2">{time}</span>
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
    <div className="border-b border-zinc-200 bg-white overflow-hidden shrink-0">
      <div className="flex items-center">
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border-r border-zinc-200">
          <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Live</span>
          <LiveClock />
        </div>
        <div className="flex-1 overflow-hidden">
          <div ref={tickerRef} className="flex items-center whitespace-nowrap py-1.5">
            {doubled.map((item, i) => (
              <button
                key={`${item.id}-${i}`}
                onClick={() => onHeadlineClick(item)}
                className="inline-flex items-center gap-2 px-4 text-xs hover:text-olea-evergreen transition-colors group"
              >
                <span className="text-zinc-500 font-bold shrink-0">{item.source}</span>
                <span className="text-olea-obsidian font-medium group-hover:text-olea-evergreen transition-colors">{item.headline}</span>
                <span className="text-zinc-400 shrink-0 font-bold">{formatTime(item.datetime)}</span>
                <span className="text-zinc-200 px-2">|</span>
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
    <div className="max-w-5xl mx-auto p-6 space-y-10">
      {/* Hero */}
      <div className="flex flex-col items-center mb-10 selection:bg-olea-evergreen/10">
        <div className="mb-8">
          <MarketStatus />
        </div>
        <Image 
          src="/images/OleaSyntaxLogo2.svg" 
          alt="Olea Syntax" 
          width={400} 
          height={100} 
          className="h-24 w-auto mb-8 drop-shadow-sm transition-transform hover:scale-[1.02]"
          priority
        />
        <p className="text-olea-obsidian/70 max-w-lg mx-auto leading-loose text-center text-lg font-medium">
          The world&apos;s first autonomous portfolio verification engine. Powered by high-reasoning loops and deterministic risk guardrails.
        </p>
      </div>
      <div className="flex justify-center">
        <button
          onClick={onStartChat}
          className="px-10 py-4 rounded-2xl bg-olea-evergreen hover:bg-olea-obsidian text-olea-paper text-lg font-black transition-all shadow-xl shadow-olea-evergreen/20 active:scale-[0.98] uppercase tracking-tighter"
        >
          Start a new chat
        </button>
      </div>

      {/* Trending Queries */}
      <div className="selection:bg-olea-evergreen/10">
        <div className="flex items-center gap-2 mb-6">
          <div className="p-1.5 bg-olea-evergreen/10 rounded-lg">
            <TrendingUp className="h-4 w-4 text-olea-evergreen" />
          </div>
          <h2 className="text-sm font-black text-olea-obsidian uppercase tracking-[0.2em]">Top Inquiries</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TRENDING_QUERIES.map((item, i) => (
            <button
              key={i}
              onClick={() => onQueryClick(item.query)}
              className="group text-left p-5 rounded-2xl bg-white border border-zinc-200 hover:border-olea-evergreen/40 hover:bg-white hover:shadow-xl transition-all shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 mt-1 bg-zinc-50 p-2 rounded-xl group-hover:bg-olea-evergreen/10 transition-colors">
                  <Search className="h-4 w-4 text-zinc-400 group-hover:text-olea-evergreen transition-colors" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-bold text-olea-obsidian group-hover:text-olea-evergreen transition-colors leading-tight">{item.query}</div>
                  <div className="text-[10px] text-zinc-400 mt-2 uppercase tracking-[0.15em] font-black">{item.category}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Live News Feed */}
      {newsItems.length > 0 && (
        <div className="pt-4 selection:bg-amber-500/10">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-1.5 bg-amber-500/10 rounded-lg">
              <Newspaper className="h-4 w-4 text-amber-600" />
            </div>
            <h2 className="text-sm font-black text-olea-obsidian uppercase tracking-[0.2em]">Market Intelligence</h2>
            <div className="flex items-center gap-1.5 ml-2 bg-red-50 px-2 py-0.5 rounded border border-red-100">
              <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] text-red-600 font-black tracking-widest uppercase">Live</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {newsItems.slice(0, 12).map((item) => (
              <button
                key={item.id}
                onClick={() => onNewsClick(item)}
                className="group w-full text-left p-5 rounded-2xl bg-white border border-zinc-200 hover:border-amber-500/40 hover:bg-white hover:shadow-xl transition-all shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-bold text-olea-obsidian group-hover:text-amber-600 transition-colors leading-tight line-clamp-2">{item.headline}</div>
                    {item.summary && (
                      <div className="text-[13px] text-olea-obsidian/60 mt-2.5 line-clamp-2 font-medium leading-relaxed">{item.summary}</div>
                    )}
                    <div className="flex items-center gap-3 mt-4">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 px-2 py-0.5 rounded border border-zinc-100">{item.source}</span>
                      <span className="text-[10px] text-zinc-400 font-bold">{formatTime(item.datetime)}</span>
                      {item.related && (
                        <div className="flex items-center gap-1.5 ml-1">
                          {item.related.split(',').slice(0, 2).map(t => (
                            <span key={t} className="text-[9px] px-2 py-0.5 rounded-full bg-olea-studio-grey text-olea-evergreen font-black border border-olea-evergreen/10 uppercase tracking-tighter">{t.trim()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 bg-zinc-50 p-2 rounded-xl group-hover:bg-amber-500/10 transition-colors">
                    <ExternalLink className="h-4 w-4 text-zinc-300 group-hover:text-amber-600 transition-colors" />
                  </div>
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
    update_risk_profile: { label: 'Update Risk Profile', color: 'text-purple-700 bg-purple-50 border-purple-200' },
    update_cash: { label: 'Update Cash', color: 'text-olea-evergreen bg-emerald-50 border-olea-evergreen/20' },
    update_position: { label: 'Update Position', color: 'text-blue-700 bg-blue-50 border-blue-200' },
    add_position: { label: 'Add Position', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    remove_position: { label: 'Remove Position', color: 'text-red-700 bg-red-50 border-red-200' },
  }

  const meta = typeLabels[action.type] || { label: action.type, color: 'text-zinc-600 bg-zinc-100 border-zinc-200' }

  return (
    <div className="flex items-center gap-4 bg-white border border-zinc-200 rounded-2xl px-4 py-3 shadow-md animate-in fade-in slide-in-from-left-4 duration-300">
      <div className={`text-[10px] font-black px-2 py-1 rounded-md border uppercase tracking-widest ${meta.color}`}>
        {meta.label}
      </div>
      <span className="text-sm text-olea-obsidian font-bold flex-1 leading-tight">{action.description}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onConfirm}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-olea-evergreen text-white text-[11px] font-black uppercase tracking-widest hover:bg-olea-obsidian transition-all shadow-sm active:scale-95 group"
        >
          <Check className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
          Confirm
        </button>
        <button
          onClick={onDismiss}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-500 text-[11px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all active:scale-95"
        >
          <X className="h-3.5 w-3.5" />
          Ignore
        </button>
      </div>
    </div>
  )
}
