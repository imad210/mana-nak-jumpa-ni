import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')
    if (!q) return NextResponse.json([])

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ', Malaysia')}&limit=5&addressdetails=1&countrycodes=MY`

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Midpoint-Malaysia-App/1.0 (contact@midpoint.my)',
                'Accept-Language': 'en'
            }
        })
        const data = await res.json()
        return NextResponse.json(data)
    } catch (err) {
        console.error('[/api/search] error:', err)
        return NextResponse.json([], { status: 500 })
    }
}
