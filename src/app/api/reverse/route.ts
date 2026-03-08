import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    const zoom = searchParams.get('zoom') ?? '14'

    if (!lat || !lng) return NextResponse.json(null)

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1`

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
        console.error('[/api/reverse] error:', err)
        return NextResponse.json(null, { status: 500 })
    }
}
