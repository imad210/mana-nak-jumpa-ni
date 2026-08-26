import { NextRequest, NextResponse } from 'next/server'
import { getOsrmRoute, getOsrmRouteDetails, getOsrmTable } from '@/lib/osrm'
import { computeRoutingMidpoint, validateRoutingMidpointRequestBody } from '@/lib/routing-midpoint'
import type { RoutePath } from '@/lib/utils'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const locations = validateRoutingMidpointRequestBody(body)

  if (!locations) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const result = await computeRoutingMidpoint(locations, {
    getTable: getOsrmTable,
    getRouteDetails: getOsrmRouteDetails
  })

  let routePaths: RoutePath[] = result.routePaths ?? []
  let routePathWarning: string | undefined

  if (!result.fallbackToGeographic && locations.length >= 2 && routePaths.length === 0) {
    const routeResults: RoutePath[] = []
    const concurrency = 3

    for (let startIndex = 0; startIndex < locations.length; startIndex += concurrency) {
      const batch = locations.slice(startIndex, startIndex + concurrency)
      const settledBatch = await Promise.allSettled(
        batch.map(async (location, batchIndex): Promise<RoutePath> => ({
          originIndex: startIndex + batchIndex,
          coordinates: await getOsrmRoute(location, result.point)
        }))
      )

      for (const routeResult of settledBatch) {
        if (routeResult.status === 'fulfilled') {
          routeResults.push(routeResult.value)
        } else {
          console.error('[/api/midpoint/routing] route path error:', routeResult.reason)
        }
      }
    }

    routePaths = routeResults
    if (routePaths.length !== locations.length) {
      routePathWarning = 'Some route lines could not be displayed. Midpoint metrics are still valid.'
    }
  }

  return NextResponse.json({
    midpoint: result,
    routePaths,
    ...(routePathWarning ? { routePathWarning } : {})
  })
}
