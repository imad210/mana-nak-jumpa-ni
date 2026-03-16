import { NextRequest, NextResponse } from 'next/server'
import { fetchNominatimJson } from '@/lib/nominatim'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q) {
    return NextResponse.json([])
  }

  const params = new URLSearchParams({
    q: `${q}, Malaysia`,
    limit: '5',
    countrycodes: 'MY'
  })

  try {
    const data = await fetchNominatimJson<unknown[]>('/search', params)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[/api/search] error:', err)
    return NextResponse.json([], { status: 502 })
  }
}
