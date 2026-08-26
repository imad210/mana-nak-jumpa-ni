import {
  calculateMidpoint,
  type Location,
  type MidpointComputation,
  type MidpointMode,
  type NearbyPlace
} from './utils'

export function getLocationsKey(locations: Location[]) {
  return locations
    .map((location) => `${location.name}:${location.lat.toFixed(6)},${location.lng.toFixed(6)}`)
    .join('|')
}

export function summarizeRoutingResult(locations: Location[], result: MidpointComputation) {
  const metrics = result.metrics

  return {
    point: result.point,
    fallbackToGeographic: result.fallbackToGeographic ?? false,
    ...(result.reason ? { reason: result.reason } : {}),
    ...(metrics
      ? {
          metrics: {
            perParticipant: locations.map((location, index) => ({
              participantIndex: index,
              participantName: location.name,
              durationSec: metrics.perLocationDurationSec[index],
              distanceKm: metrics.perLocationDistanceKm[index]
            })),
            maximumDurationSec: metrics.maximumDurationSec,
            minimumDurationSec: metrics.minimumDurationSec,
            durationSpreadSec: metrics.durationSpreadSec,
            totalDurationSec: metrics.totalDurationSec,
            totalDistanceKm: metrics.totalDistanceKm
          }
        }
      : {}),
    ...(result.routingSearch ? { routingSearch: result.routingSearch } : {})
  }
}

export function buildMidpointComparison(locations: Location[], routingResult: MidpointComputation) {
  const geographic = calculateMidpoint(locations)
  const routing = summarizeRoutingResult(locations, routingResult)

  return {
    participantCount: locations.length,
    participants: locations,
    geographic: {
      point: { ...geographic, name: 'Geographic Midpoint' }
    },
    routing,
    comparison: {
      recommendedMode: routingResult.fallbackToGeographic ? 'geographic' : 'routing',
      basis: routingResult.fallbackToGeographic
        ? 'routing_unavailable'
        : 'minimize_longest_road_travel_time_then_total_time'
    }
  }
}

export function buildPlanSnapshot(args: {
  revision: number
  locations: Location[]
  selectedMode: MidpointMode
  routingResult: MidpointComputation | null
  nearbyPlaces: NearbyPlace[]
}) {
  const { revision, locations, selectedMode, routingResult, nearbyPlaces } = args
  const geographic = locations.length >= 2 ? calculateMidpoint(locations) : null
  const activeResult = selectedMode === 'routing' ? routingResult : null
  const midpoint = selectedMode === 'routing' ? activeResult?.point ?? geographic : geographic
  const routingSummary = activeResult ? summarizeRoutingResult(locations, activeResult) : null

  return {
    status: locations.length < 2 ? 'empty' : midpoint ? 'applied' : 'ready',
    revision,
    participants: locations,
    selectedMode,
    midpoint,
    ...(routingSummary?.metrics ? { metrics: routingSummary.metrics } : {}),
    ...(routingSummary?.routingSearch ? { routingSearch: routingSummary.routingSearch } : {}),
    ...(routingSummary ? { fallbackToGeographic: routingSummary.fallbackToGeographic } : {}),
    ...(routingSummary?.reason ? { reason: routingSummary.reason } : {}),
    nearbyLocalities: nearbyPlaces.map((place) => place.name)
  }
}
