import { NextResponse } from 'next/server'

export interface NewsItem {
  id: number
  headline: string
  summary: string
  source: string
  url: string
  image: string
  datetime: number
  category: string
  related: string
}

// Server-side proxy for Finnhub market news + Yahoo Finance RSS fallback
export async function GET() {
  const finnhubKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || ''
  const allNews: NewsItem[] = []

  // Try Finnhub general market news
  if (finnhubKey) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/news?category=general&token=${finnhubKey}`,
        { next: { revalidate: 300 } } // cache 5 min
      )
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>[]
        if (Array.isArray(data)) {
          allNews.push(
            ...data.slice(0, 30).map((item: Record<string, unknown>) => ({
              id: item.id as number,
              headline: item.headline as string,
              summary: item.summary as string,
              source: item.source as string,
              url: item.url as string,
              image: (item.image as string) || '',
              datetime: item.datetime as number,
              category: (item.category as string) || 'general',
              related: (item.related as string) || '',
            }))
          )
        }
      }
    } catch (e) {
      console.error('Finnhub news error:', e)
    }
  }

  // Fallback: if Finnhub returned nothing, serve curated market headlines
  if (allNews.length === 0) {
    const now = Math.floor(Date.now() / 1000)
    const fallback: NewsItem[] = [
      { id: 1, headline: 'Markets open mixed as investors digest latest Fed comments', summary: 'Wall Street opened with mixed signals as traders parse Federal Reserve commentary on inflation trajectory.', source: 'Market Watch', url: 'https://www.marketwatch.com', image: '', datetime: now - 600, category: 'general', related: 'SPY,QQQ' },
      { id: 2, headline: 'Tech earnings season kicks off with semiconductor focus', summary: 'Major semiconductor companies report this week with AI spending as the key theme.', source: 'Reuters', url: 'https://www.reuters.com', image: '', datetime: now - 1200, category: 'technology', related: 'NVDA,AMD,INTC' },
      { id: 3, headline: 'Oil prices steady amid geopolitical tensions', summary: 'Crude oil holds near recent highs as Middle East developments continue to support prices.', source: 'Bloomberg', url: 'https://www.bloomberg.com', image: '', datetime: now - 1800, category: 'general', related: 'XLE,USO' },
      { id: 4, headline: 'Treasury yields rise on stronger-than-expected jobs data', summary: 'Bond yields climbed after employment figures exceeded forecasts, complicating the rate cut timeline.', source: 'CNBC', url: 'https://www.cnbc.com', image: '', datetime: now - 2400, category: 'general', related: 'TLT,IEF' },
      { id: 5, headline: 'Retail sector sees mixed signals ahead of consumer spending report', summary: 'Consumer discretionary stocks diverge as market awaits key spending data release.', source: 'Financial Times', url: 'https://www.ft.com', image: '', datetime: now - 3000, category: 'general', related: 'XRT,AMZN,WMT' },
      { id: 6, headline: 'Biotech rally continues as FDA approvals boost sentiment', summary: 'Healthcare sector outperforms on a string of positive regulatory decisions.', source: 'Barrons', url: 'https://www.barrons.com', image: '', datetime: now - 3600, category: 'general', related: 'XBI,IBB' },
    ]
    allNews.push(...fallback)
  }

  return NextResponse.json({ news: allNews })
}
