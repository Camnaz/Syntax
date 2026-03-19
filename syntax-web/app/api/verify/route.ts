import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

// ── Simple in-memory rate limiter: 10 requests/min per user ──────────────────
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60_000

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT - 1 }
  }
  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 }
  }
  entry.count++
  return { allowed: true, remaining: RATE_LIMIT - entry.count }
}

function extractUserIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.replace('Bearer ', '')
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.sub || null
  } catch {
    return null
  }
}

/**
 * Server-side proxy for the syntax-core /v1/verify SSE stream.
 * Rate limited: 10 req/min per user.
 */
export async function POST(req: NextRequest) {
  const apiUrl = process.env.SYNTAX_API_URL || process.env.NEXT_PUBLIC_SYNTAX_API_URL || 'http://localhost:8080'
  const authHeader = req.headers.get('authorization') || ''

  // Rate limit check
  const userId = extractUserIdFromJwt(authHeader)
  if (userId) {
    const { allowed } = checkRateLimit(userId)
    if (!allowed) {
      const sseError = `data: ${JSON.stringify({ event: 'Error', data: { message: 'Rate limit exceeded. Max 10 requests per minute.' } })}\n\n`
      return new Response(sseError, {
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      })
    }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${apiUrl}/v1/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: authHeader,
      },
      body: JSON.stringify(body),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Return a well-formed SSE error so the client can display it gracefully
    const sseError = `data: ${JSON.stringify({ event: 'Error', data: { message: `Backend unreachable: ${msg}` } })}\n\n`
    return new Response(sseError, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
      },
    })
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => upstream.statusText)
    const sseError = `data: ${JSON.stringify({ event: 'Error', data: { message: `Backend error ${upstream.status}: ${text}` } })}\n\n`
    return new Response(sseError, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
      },
    })
  }

  return new Response(upstream.body, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}
