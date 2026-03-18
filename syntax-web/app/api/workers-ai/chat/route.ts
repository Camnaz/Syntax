import { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Best model available on Workers AI for complex reasoning tasks.
// Swap to '@cf/meta/llama-3.1-8b-instruct' for faster / cheaper responses.
const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

export async function POST(req: NextRequest) {
  // Auth guard
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  const body = await req.json().catch(() => null) as { messages?: unknown[]; model?: string; max_tokens?: number } | null
  if (!body?.messages || !Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: 'messages array required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const model: string = body.model ?? DEFAULT_MODEL
  const { env } = getCloudflareContext()

  const aiStream = await env.AI.run(model as Parameters<typeof env.AI.run>[0], {
    messages: body.messages,
    stream: true,
    max_tokens: body.max_tokens ?? 2048,
  }) as ReadableStream

  return new Response(aiStream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}
