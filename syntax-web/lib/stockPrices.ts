// Stock price fetching via server-side API proxy (avoids CORS issues)

export interface StockPrice {
  ticker: string
  currentPrice: number
  change: number
  changePercent: number
  lastUpdated: Date
  source: string
}

const CACHE_DURATION_MS = 60000 // 1 minute cache
const priceCache = new Map<string, { data: StockPrice; timestamp: number }>()

/**
 * Fetch stock price via our Next.js API route (server-side proxy)
 * This avoids all CORS issues since the request goes through our own server
 */
export async function fetchStockPrice(ticker: string): Promise<StockPrice | null> {
  const upperTicker = ticker.toUpperCase()

  // Check cache first
  const cached = priceCache.get(upperTicker)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    return cached.data
  }

  try {
    const response = await fetch(`/api/stock-price?symbol=${upperTicker}`)

    if (!response.ok) {
      console.warn(`Stock price API failed for ${upperTicker}: ${response.status}`)
      return null
    }

    const data = await response.json() as { error?: string; ticker?: string; currentPrice?: number; change?: number; changePercent?: number; source?: string }

    if (data.error) {
      console.warn(`Stock price error for ${upperTicker}: ${data.error}`)
      return null
    }

    const stockPrice: StockPrice = {
      ticker: data.ticker ?? upperTicker,
      currentPrice: data.currentPrice ?? 0,
      change: data.change || 0,
      changePercent: data.changePercent || 0,
      lastUpdated: new Date(),
      source: data.source || 'unknown',
    }

    // Cache the result
    priceCache.set(upperTicker, { data: stockPrice, timestamp: Date.now() })

    return stockPrice
  } catch (error) {
    console.error(`Error fetching price for ${upperTicker}:`, error)
    return null
  }
}

/**
 * Fetch prices for multiple tickers in parallel
 */
export async function fetchStockPrices(tickers: string[]): Promise<Map<string, StockPrice>> {
  const uniqueTickers = [...new Set(tickers.map(t => t.toUpperCase()))]

  const results = await Promise.allSettled(
    uniqueTickers.map(ticker => fetchStockPrice(ticker))
  )

  const priceMap = new Map<string, StockPrice>()

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      priceMap.set(uniqueTickers[index], result.value)
    }
  })

  return priceMap
}

/**
 * Clear the price cache (useful for forcing refresh)
 */
export function clearPriceCache() {
  priceCache.clear()
}
