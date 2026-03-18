import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Server-side proxy for the syntax-core /v1/verify SSE stream.
 * The browser calls this route instead of syntax-api.oleacomputer.com directly,
 * which eliminates CORS issues and gives a cleaner error when the backend is down.
 */
export async function POST(req: NextRequest) {
  const apiUrl = process.env.SYNTAX_API_URL || process.env.NEXT_PUBLIC_SYNTAX_API_URL || 'http://localhost:8080'
  const authHeader = req.headers.get('authorization') || ''

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
