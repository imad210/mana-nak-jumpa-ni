import { NextRequest, NextResponse } from 'next/server'
import { fetchNominatimJson } from '@/lib/nominatim'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const zoom = searchParams.get('zoom') ?? '14'

  if (!lat || !lng) {
    return NextResponse.json(null)
  }

  const params = new URLSearchParams({
    lat,
    lon: lng,
    zoom
  })

  try {
    const data = await fetchNominatimJson<Record<string, unknown> | null>('/reverse', params)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[/api/reverse] error:', err)
    return NextResponse.json(null, { status: 502 })
  }
}
