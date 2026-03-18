import { NextRequest, NextResponse } from 'next/server'

// Server-side proxy for stock price APIs to avoid CORS issues
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')
  
  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 })
  }

  const ticker = symbol.toUpperCase()
  const finnhubKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || ''
  const twelveDataKey = process.env.NEXT_PUBLIC_TWELVE_DATA_API_KEY || ''

  // Try Finnhub first
  if (finnhubKey) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${finnhubKey}`,
        { next: { revalidate: 60 } }
      )
      if (res.ok) {
        const data = await res.json() as { c?: number; d?: number; dp?: number }
        if (data.c && data.c !== 0) {
          return NextResponse.json({
            ticker,
            currentPrice: data.c,
            change: data.d ?? 0,
            changePercent: data.dp ?? 0,
            source: 'Finnhub',
          })
        }
      }
    } catch (e) {
      console.error('Finnhub proxy error:', e)
    }
  }

  // Try Twelve Data second
  if (twelveDataKey) {
    try {
      const res = await fetch(
        `https://api.twelvedata.com/price?symbol=${ticker}&apikey=${twelveDataKey}`,
        { next: { revalidate: 60 } }
      )
      if (res.ok) {
        const data = await res.json() as { price?: string; status?: string }
        if (data.price && data.status !== 'error') {
          return NextResponse.json({
            ticker,
            currentPrice: parseFloat(data.price),
            change: 0,
            changePercent: 0,
            source: 'Twelve Data',
          })
        }
      }
    } catch (e) {
      console.error('Twelve Data proxy error:', e)
    }
  }

  // Fallback: Yahoo Finance (server-side, no CORS issue)
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
      { next: { revalidate: 60 } }
    )
    if (res.ok) {
      const data = await res.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number } }> } }
      const meta = data?.chart?.result?.[0]?.meta
      if (meta?.regularMarketPrice) {
        const prev = meta.chartPreviousClose || meta.regularMarketPrice
        return NextResponse.json({
          ticker,
          currentPrice: meta.regularMarketPrice,
          change: meta.regularMarketPrice - prev,
          changePercent: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
          source: 'Yahoo Finance',
        })
      }
    }
  } catch (e) {
    console.error('Yahoo Finance proxy error:', e)
  }

  return NextResponse.json({ error: 'Unable to fetch price for ' + ticker }, { status: 502 })
}
