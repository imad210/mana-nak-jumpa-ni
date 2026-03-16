import { NextRequest, NextResponse } from 'next/server'
import { getOsrmNearest, getOsrmRoute, getOsrmRouteDetails, getOsrmTable } from '@/lib/osrm'
import { computeRoutingMidpoint, validateRoutingMidpointRequestBody } from '@/lib/routing-midpoint'
import type { RoutePath } from '@/lib/utils'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const locations = validateRoutingMidpointRequestBody(body)

  if (!locations) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (locations.length > 10) {
    return NextResponse.json({ error: 'Routing midpoint supports up to 10 locations.' }, { status: 400 })
  }

  const result = await computeRoutingMidpoint(locations, {
    getTable: getOsrmTable,
    getNearest: getOsrmNearest,
    getRouteDetails: getOsrmRouteDetails
  })

  let routePaths: RoutePath[] = result.routePaths ?? []

  if (!result.fallbackToGeographic && locations.length >= 2 && routePaths.length === 0) {
    try {
      routePaths = await Promise.all(
        locations.map(async (location, originIndex): Promise<RoutePath> => ({
          originIndex,
          coordinates: await getOsrmRoute(location, result.point)
        }))
      )
    } catch (error) {
      console.error('[/api/midpoint/routing] route path error:', error)
      routePaths = []
    }
  }

  return NextResponse.json({
    midpoint: result,
    routePaths
  })
}
