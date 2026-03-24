import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function extractUserIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.replace('Bearer ', '')
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.sub || null
  } catch {
    return null
  }
}

async function checkObserverLimit(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    return { allowed: true }
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('tier, verification_count')
    .eq('user_id', userId)
    .single()

  if (sub && sub.tier === 'observer') {
    const maxUses = Number(process.env.NEXT_PUBLIC_OBSERVER_FREE_VERIFICATIONS || '3')
    if ((sub.verification_count || 0) >= maxUses) {
      return { allowed: false, message: "Usage Limit Reached: You've reached your free query limit. Upgrade to OPERATOR to keep using Olea Syntax." }
    }
  }
  return { allowed: true }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const body = await req.text()
  const apiUrl = process.env.NEXT_PUBLIC_SYNTAX_API_URL || 'http://localhost:8080'

  const userId = extractUserIdFromJwt(authHeader)
  if (userId) {
    const observerCheck = await checkObserverLimit(userId)
    if (!observerCheck.allowed) {
      return NextResponse.json({ error: observerCheck.message }, { status: 403 })
    }
  }

  const res = await fetch(`${apiUrl}/v1/autoresearch/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader,
    },
    body,
  })

  return new NextResponse(null, { status: res.status })
}
