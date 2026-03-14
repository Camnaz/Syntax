import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const apiUrl = process.env.NEXT_PUBLIC_SYNTAX_API_URL || 'http://localhost:8080'

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Retry connection up to 5 times with backoff
      let upstream: Response | null = null
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          upstream = await fetch(`${apiUrl}/v1/autoresearch/stream`, {
            headers: { authorization: authHeader },
          })
          break
        } catch {
          if (attempt === 4) {
            controller.enqueue(encoder.encode('data: {"error":"backend unavailable"}\n\n'))
            controller.close()
            return
          }
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
        }
      }
      if (!upstream?.body) { controller.close(); return }
      const reader = upstream.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}
