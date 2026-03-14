'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Edit2, Save, Trash2, PieChart, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { fetchStockPrices, StockPrice } from '@/lib/stockPrices'

type Position = {
  id: string
  ticker: string
  shares: number | null
  dollar_amount: number | null
  average_purchase_price: number | null
}

type PortfolioConfig = {
  max_drawdown_limit: number
  min_sharpe_ratio: number
  max_position_size: number
  available_cash: number
}

interface PortfolioSidebarProps {
  portfolioId: string
  isOpen: boolean
  onCloseAction: () => void
}

export function PortfolioSidebar({ portfolioId, isOpen, onCloseAction }: PortfolioSidebarProps) {
  const supabase = createClient()
  const [positions, setPositions] = useState<Position[]>([])
  const [config, setConfig] = useState<PortfolioConfig | null>(null)
  const [livePrices, setLivePrices] = useState<Map<string, StockPrice>>(new Map())
  const [isLoadingPrices, setIsLoadingPrices] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  
  const [isEditingConfig, setIsEditingConfig] = useState(false)
  const [editConfig, setEditConfig] = useState<PortfolioConfig | null>(null)
  
  const [isAddingPosition, setIsAddingPosition] = useState(false)
  const [newPosition, setNewPosition] = useState({ ticker: '', shares: '', price: '' })

  const [editingCostBasis, setEditingCostBasis] = useState<string | null>(null)
  const [costBasisInput, setCostBasisInput] = useState('')

  useEffect(() => {
    const loadData = async () => {
      if (!portfolioId) return
      
      const { data: posData } = await supabase
        .from('positions')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .order('ticker')
      
      if (posData) {
        setPositions(posData)
        // Fetch live prices for all tickers
        if (posData.length > 0) {
          setIsLoadingPrices(true)
          const tickers = posData.map(p => p.ticker)
          const prices = await fetchStockPrices(tickers)
          setLivePrices(prices)
          setIsLoadingPrices(false)
        }
      }

      const { data: portfolios } = await supabase
        .from('portfolios')
        .select('max_drawdown_limit, min_sharpe_ratio, max_position_size, available_cash')
        .eq('id', portfolioId)
        .single()
        
      if (portfolios) {
        setConfig({
          max_drawdown_limit: portfolios.max_drawdown_limit,
          min_sharpe_ratio: portfolios.min_sharpe_ratio,
          max_position_size: portfolios.max_position_size,
          available_cash: portfolios.available_cash || 0
        })
        setEditConfig({
          max_drawdown_limit: portfolios.max_drawdown_limit,
          min_sharpe_ratio: portfolios.min_sharpe_ratio,
          max_position_size: portfolios.max_position_size,
          available_cash: portfolios.available_cash || 0
        })
      }
    }

    if (isOpen) loadData()
    
    // Listen for portfolio updates from chat actions
    const handlePortfolioUpdate = () => {
      loadData()
    }
    window.addEventListener('portfolio-updated', handlePortfolioUpdate)
    
    // Auto-refresh prices every 60 seconds
    const interval = setInterval(async () => {
      if (isOpen && positions.length > 0) {
        const tickers = positions.map(p => p.ticker)
        const prices = await fetchStockPrices(tickers)
        setLivePrices(prices)
      }
    }, 60000)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener('portfolio-updated', handlePortfolioUpdate)
    }
  }, [portfolioId, isOpen, supabase])

  const saveConfig = async () => {
    if (!editConfig || !portfolioId) return
    try {
      const { error } = await supabase
        .from('portfolios')
        .update({
          max_drawdown_limit: editConfig.max_drawdown_limit,
          min_sharpe_ratio: editConfig.min_sharpe_ratio,
          max_position_size: editConfig.max_position_size,
          available_cash: editConfig.available_cash
        })
        .eq('id', portfolioId)
        
      if (!error) {
        setConfig(editConfig)
        setIsEditingConfig(false)
      }
    } catch (err) {
      console.error('Failed to save config', err)
    }
  }

  const addPosition = async () => {
    if (!newPosition.ticker || !portfolioId) return
    
    const { data, error } = await supabase
      .from('positions')
      .insert({
        portfolio_id: portfolioId,
        ticker: newPosition.ticker.toUpperCase(),
        shares: newPosition.shares ? parseFloat(newPosition.shares) : null,
        average_purchase_price: newPosition.price ? parseFloat(newPosition.price) : null
      })
      .select()
      .single()

    if (error) {
      console.error("Failed to add position:", error)
      return
    }

    if (data) {
      setPositions(prev => [...prev, data].sort((a, b) => a.ticker.localeCompare(b.ticker)))
      setNewPosition({ ticker: '', shares: '', price: '' })
      setIsAddingPosition(false)
    }
  }

  async function deletePosition(id: string) {
    await supabase.from('positions').delete().eq('id', id)
    setPositions(prev => prev.filter(p => p.id !== id))
  }

  async function saveCostBasis(posId: string) {
    const price = parseFloat(costBasisInput)
    if (isNaN(price) || price <= 0) return
    await supabase.from('positions').update({ average_purchase_price: price }).eq('id', posId)
    setPositions(prev => prev.map(p => p.id === posId ? { ...p, average_purchase_price: price } : p))
    setEditingCostBasis(null)
    setCostBasisInput('')
    window.dispatchEvent(new CustomEvent('portfolio-updated'))
  }

  // Calculate portfolio metrics consistently
  const portfolioMetrics = useMemo(() => {
    let costBasis = 0
    let currentValue = 0
    let hasAllPrices = positions.length > 0 && livePrices.size > 0

    positions.forEach(p => {
      if (!p.shares) return
      const livePrice = livePrices.get(p.ticker)?.currentPrice

      if (p.average_purchase_price) {
        const positionCost = p.shares * p.average_purchase_price
        costBasis += positionCost
        if (livePrice) {
          currentValue += p.shares * livePrice
        } else {
          currentValue += positionCost
          hasAllPrices = false
        }
      } else if (livePrice) {
        // No avg cost recorded — use live price as both cost basis and current value
        const positionValue = p.shares * livePrice
        costBasis += positionValue
        currentValue += positionValue
      } else {
        hasAllPrices = false
      }
    })

    const pnl = currentValue - costBasis
    const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0

    return {
      costBasis,
      currentValue,
      pnl,
      pnlPercent,
      hasAllPrices
    }
  }, [positions, livePrices])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onCloseAction}
      />
      {/* Panel: bottom-sheet on mobile, right-side on sm+ */}
      <div className="fixed z-50 bg-zinc-900 border-zinc-800 shadow-2xl flex flex-col
        bottom-0 left-0 right-0 rounded-t-2xl border-t max-h-[92vh]
        sm:inset-y-0 sm:right-0 sm:left-auto sm:top-0 sm:bottom-0 sm:w-96 sm:rounded-none sm:border-t-0 sm:border-l sm:max-h-none">
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2 font-semibold">
            <PieChart className="h-5 w-5 text-emerald-500" />
            Portfolio Context
          </div>
          <button onClick={onCloseAction} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-zinc-800 rounded-md text-zinc-400">
            <X className="h-5 w-5" />
          </button>
        </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Risk Parameters</h3>
            <button 
              onClick={() => isEditingConfig ? saveConfig() : setIsEditingConfig(true)}
              className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
            >
              {isEditingConfig ? <><Save className="h-3 w-3" /> Save</> : <><Edit2 className="h-3 w-3" /> Edit</>}
            </button>
          </div>
          
          {config && editConfig && (
            <div className="space-y-3 bg-zinc-950 p-3 rounded-lg border border-zinc-800/50">
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-500">Cost Basis</span>
                <span className="font-mono text-zinc-400">
                  ${portfolioMetrics.costBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-500">Current Value</span>
                <span className="font-mono text-emerald-500 font-semibold">
                  {isLoadingPrices && livePrices.size === 0 ? (
                    <span className="text-zinc-500">Loading...</span>
                  ) : (
                    `$${portfolioMetrics.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-500">Total P&L</span>
                <span className={`font-mono font-semibold ${
                  portfolioMetrics.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'
                }`}>
                  {isLoadingPrices && livePrices.size === 0 ? (
                    <span className="text-zinc-500">--</span>
                  ) : (
                    `${portfolioMetrics.pnl >= 0 ? '+' : ''}$${Math.abs(portfolioMetrics.pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${portfolioMetrics.pnl >= 0 ? '+' : ''}${portfolioMetrics.pnlPercent.toFixed(2)}%)`
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-500">Available Cash</span>
                {isEditingConfig ? (
                  <input type="number" step="1" value={editConfig.available_cash} onChange={e => setEditConfig({...editConfig, available_cash: parseFloat(e.target.value)})} className="w-24 bg-zinc-800 rounded px-2 py-1 text-right outline-none" />
                ) : (
                  <span className="font-mono text-emerald-400">${config.available_cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                )}
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-500">Max Drawdown</span>
                {isEditingConfig ? (
                  <input type="number" step="0.01" value={editConfig.max_drawdown_limit} onChange={e => setEditConfig({...editConfig, max_drawdown_limit: parseFloat(e.target.value)})} className="w-24 bg-zinc-800 rounded px-2 py-1 text-right outline-none" />
                ) : (
                  <span className="font-mono">{(config.max_drawdown_limit * 100).toFixed(1)}%</span>
                )}
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-500">Max Position</span>
                {isEditingConfig ? (
                  <input type="number" step="0.01" value={editConfig.max_position_size} onChange={e => setEditConfig({...editConfig, max_position_size: parseFloat(e.target.value)})} className="w-24 bg-zinc-800 rounded px-2 py-1 text-right outline-none" />
                ) : (
                  <span className="font-mono">{(config.max_position_size * 100).toFixed(1)}%</span>
                )}
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Holdings</h3>
            <button 
              onClick={() => setIsAddingPosition(!isAddingPosition)}
              className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
            >
              {isAddingPosition ? 'Cancel' : <><Plus className="h-3 w-3" /> Add</>}
            </button>
          </div>

          <div className="space-y-2">
            {isAddingPosition && (
              <div className="bg-zinc-950 p-3 rounded-lg border border-emerald-500/30 space-y-2 mb-4">
                <input 
                  placeholder="Ticker (e.g. AAPL)" 
                  value={newPosition.ticker}
                  onChange={e => setNewPosition({...newPosition, ticker: e.target.value})}
                  className="w-full bg-zinc-900 rounded px-3 py-1.5 text-sm outline-none uppercase" 
                />
                <div className="flex gap-2">
                  <input 
                    placeholder="Shares" 
                    type="number"
                    value={newPosition.shares}
                    onChange={e => setNewPosition({...newPosition, shares: e.target.value})}
                    className="w-1/2 bg-zinc-900 rounded px-3 py-1.5 text-sm outline-none" 
                  />
                  <input 
                    placeholder="Avg Price" 
                    type="number"
                    value={newPosition.price}
                    onChange={e => setNewPosition({...newPosition, price: e.target.value})}
                    className="w-1/2 bg-zinc-900 rounded px-3 py-1.5 text-sm outline-none" 
                  />
                </div>
                <button 
                  onClick={addPosition}
                  className="w-full bg-emerald-500 text-zinc-950 py-1.5 rounded-md text-sm font-medium hover:bg-emerald-400 transition-colors"
                >
                  Save Holding
                </button>
              </div>
            )}

            {positions.length === 0 && !isAddingPosition ? (
              <div className="text-sm text-zinc-500 italic text-center py-4 bg-zinc-950 rounded-lg">
                No holdings yet. Add some to give the AI context.
              </div>
            ) : (
              positions.map(pos => {
                const livePrice = livePrices.get(pos.ticker)
                const hasCostBasis = pos.average_purchase_price != null && pos.average_purchase_price > 0
                const costBasis = hasCostBasis ? (pos.shares || 0) * pos.average_purchase_price! : null
                const currentValue = pos.shares && livePrice ? pos.shares * livePrice.currentPrice : null
                const pnl = costBasis != null && currentValue != null ? currentValue - costBasis : null
                const pnlPercent = costBasis != null && costBasis > 0 && pnl != null ? (pnl / costBasis) * 100 : null
                const isEditingThis = editingCostBasis === pos.id

                return (
                  <div key={pos.id} className={`bg-zinc-950 p-3 rounded-lg border group ${
                    hasCostBasis ? 'border-zinc-800/50' : 'border-amber-500/30'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-mono font-semibold text-base">{pos.ticker}</div>
                        <div className="text-xs text-zinc-500">
                          {pos.shares} shares
                          {hasCostBasis && (
                            <span className="text-zinc-400"> @ ${pos.average_purchase_price!.toFixed(2)} avg</span>
                          )}
                        </div>
                      </div>
                      <button 
                        onClick={() => deletePosition(pos.id)}
                        className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {!hasCostBasis && !isEditingThis && (
                      <button
                        onClick={() => { setEditingCostBasis(pos.id); setCostBasisInput('') }}
                        className="w-full flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5 hover:bg-amber-500/20 transition-colors mt-1"
                      >
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        Cost basis missing — Add acquisition price
                      </button>
                    )}

                    {!hasCostBasis && isEditingThis && (
                      <div className="flex gap-1.5 mt-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Avg price paid (e.g. 248.50)"
                          value={costBasisInput}
                          onChange={e => setCostBasisInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveCostBasis(pos.id); if (e.key === 'Escape') setEditingCostBasis(null) }}
                          autoFocus
                          className="flex-1 bg-zinc-800 border border-amber-500/40 rounded px-2 py-1 text-xs outline-none focus:border-amber-400 font-mono"
                        />
                        <button
                          onClick={() => saveCostBasis(pos.id)}
                          className="bg-amber-500 text-zinc-950 rounded px-2 py-1 text-xs font-semibold hover:bg-amber-400"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingCostBasis(null)}
                          className="text-zinc-500 hover:text-zinc-300 px-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    {livePrice && (
                      <div className="space-y-1 text-xs border-t border-zinc-800/50 pt-2 mt-2">
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Live Price:</span>
                          <span className="font-mono text-zinc-300">${livePrice.currentPrice.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Current Value:</span>
                          <span className="font-mono text-emerald-400">${currentValue!.toFixed(2)}</span>
                        </div>
                        {hasCostBasis && pnl != null && pnlPercent != null && (
                          <div className="flex justify-between">
                            <span className="text-zinc-500">P&L:</span>
                            <span className={`font-mono font-semibold ${pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {!livePrice && !isLoadingPrices && (
                      <div className="text-xs text-zinc-600 italic mt-2 pt-2 border-t border-zinc-800/50">
                        Price data unavailable
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </section>
        
        <div className="text-xs text-zinc-500 bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10">
          The AI will automatically consider these parameters and holdings when giving advice.
        </div>
      </div>
      </div>
    </>
  )
}
