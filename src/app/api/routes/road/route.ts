import { NextRequest, NextResponse } from 'next/server'
import { getOsrmRoute } from '@/lib/osrm'
import { validateRoutingLocationsPayload } from '@/lib/routing-midpoint'
import type { Location, RoutePath } from '@/lib/utils'

function isValidLocation(value: unknown): value is Location {
  if (!value || typeof value !== 'object') {
    return false
  }

  const { name, lat, lng } = value as Record<string, unknown>
  return typeof name === 'string' && typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const locations = validateRoutingLocationsPayload((body as { locations?: unknown } | null)?.locations)
  const midpoint = (body as { midpoint?: unknown } | null)?.midpoint

  if (!locations || !midpoint || !isValidLocation(midpoint)) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (locations.length > 10) {
    return NextResponse.json({ error: 'Road route highlighting supports up to 10 locations.' }, { status: 400 })
  }

  try {
    const routePaths = await Promise.all(
      locations.map(async (location, originIndex): Promise<RoutePath> => ({
        originIndex,
        coordinates: await getOsrmRoute(location, midpoint)
      }))
    )

    return NextResponse.json(routePaths)
  } catch (error) {
    console.error('[/api/routes/road] error:', error)
    return NextResponse.json([], { status: 502 })
  }
}