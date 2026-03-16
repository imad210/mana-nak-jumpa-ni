import { NextRequest, NextResponse } from 'next/server'
import { getOsrmNearest, getOsrmRouteDetails, getOsrmTable } from '@/lib/osrm'
import { computeRoutingMidpoint, validateRoutingMidpointRequestBody } from '@/lib/routing-midpoint'

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

  return NextResponse.json(result)
}