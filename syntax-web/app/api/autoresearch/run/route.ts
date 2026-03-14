import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const body = await req.text()
  const apiUrl = process.env.NEXT_PUBLIC_SYNTAX_API_URL || 'http://localhost:8080'

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
