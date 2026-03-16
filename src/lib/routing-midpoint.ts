import {
  calculateMidpoint,
  haversineKm,
  type Location,
  type MidpointComputation,
  type MidpointMetrics
} from './utils'

export interface CoordinateLike {
  lat: number;
  lng: number;
}

export interface RoutingTableResult {
  durations: Array<Array<number | null>>;
  distances: Array<Array<number | null>>;
}

export interface RoutingRouteDetails {
  coordinates: Array<[number, number]>;
  segmentDurationsSec: number[];
  segmentDistancesM: number[];
}

export interface RoutingProvider {
  getTable(origins: Location[], destinations: CoordinateLike[]): Promise<RoutingTableResult>;
  getNearest(point: CoordinateLike): Promise<CoordinateLike>;
  getRouteDetails(origin: Location, destination: Location): Promise<RoutingRouteDetails>;
}

export interface RoutingCandidateSelection {
  index: number;
  candidate: CoordinateLike;
  metrics: MidpointMetrics;
  maxDurationSec: number;
}

const EARTH_RADIUS_KM = 6371
const MIN_RING_RADIUS_KM = 3
const MAX_RING_RADIUS_KM = 20
const RING_RADIUS_FACTOR = 0.35
const DEFAULT_FALLBACK_REASON = 'Road-based midpoint unavailable. Showing geographic midpoint instead.'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function interpolateCoordinate(start: [number, number], end: [number, number], ratio: number): CoordinateLike {
  return {
    lat: start[0] + (end[0] - start[0]) * ratio,
    lng: start[1] + (end[1] - start[1]) * ratio
  }
}

function buildMetrics(perLocationDurationSec: number[], perLocationDistanceKm: number[]): MidpointMetrics {
  const totalDurationSec = perLocationDurationSec.reduce((sum, value) => sum + value, 0)
  const totalDistanceKm = perLocationDistanceKm.reduce((sum, value) => sum + value, 0)

  return {
    totalDurationSec,
    totalDistanceKm,
    perLocationDurationSec,
    perLocationDistanceKm
  }
}

export function validateRoutingLocationsPayload(payload: unknown): Location[] | null {
  if (!Array.isArray(payload)) {
    return null
  }

  const locations: Location[] = []

  for (const item of payload) {
    if (!item || typeof item !== 'object') {
      return null
    }

    const { name, lat, lng } = item as Record<string, unknown>

    if (typeof name !== 'string' || !name.trim() || !isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
      return null
    }

    locations.push({
      name: name.trim(),
      lat,
      lng
    })
  }

  return locations
}

export function validateRoutingMidpointRequestBody(body: unknown): Location[] | null {
  if (!body || typeof body !== 'object') {
    return null
  }

  return validateRoutingLocationsPayload((body as { locations?: unknown }).locations)
}

export function createRoutingFallback(locations: Location[], reason = DEFAULT_FALLBACK_REASON): MidpointComputation {
  return {
    mode: 'routing',
    point: calculateMidpoint(locations),
    fallbackToGeographic: true,
    reason
  }
}

export function getRoutingCandidateRadiusKm(seed: CoordinateLike, locations: Location[]) {
  const maxOriginDistanceKm = locations.reduce(
    (maxDistance, location) => Math.max(maxDistance, haversineKm(seed.lat, seed.lng, location.lat, location.lng)),
    0
  )

  return clamp(maxOriginDistanceKm * RING_RADIUS_FACTOR, MIN_RING_RADIUS_KM, MAX_RING_RADIUS_KM)
}

export function offsetCoordinate(point: CoordinateLike, distanceKm: number, bearingDeg: number): CoordinateLike {
  const angularDistance = distanceKm / EARTH_RADIUS_KM
  const bearingRad = (bearingDeg * Math.PI) / 180
  const latRad = (point.lat * Math.PI) / 180
  const lngRad = (point.lng * Math.PI) / 180

  const nextLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
  )

  const nextLng =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(nextLat)
    )

  return {
    lat: (nextLat * 180) / Math.PI,
    lng: ((((nextLng * 180) / Math.PI) + 540) % 360) - 180
  }
}

export function generateRoutingCandidates(seed: CoordinateLike, radiusKm: number): CoordinateLike[] {
  const candidates: CoordinateLike[] = [seed]

  for (let bearing = 0; bearing < 360; bearing += 30) {
    candidates.push(offsetCoordinate(seed, radiusKm, bearing))
  }

  return candidates
}

export function selectBestRoutingCandidate(
  candidates: CoordinateLike[],
  table: RoutingTableResult
): RoutingCandidateSelection | null {
  if (table.durations.length === 0 || candidates.length === 0) {
    return null
  }

  let bestSelection: RoutingCandidateSelection | null = null

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const perLocationDurationSec: number[] = []
    const perLocationDistanceKm: number[] = []
    let isValidCandidate = true

    for (let sourceIndex = 0; sourceIndex < table.durations.length; sourceIndex += 1) {
      const durationSec = table.durations[sourceIndex]?.[candidateIndex] ?? null
      const distanceMeters = table.distances[sourceIndex]?.[candidateIndex] ?? null

      if (
        durationSec == null ||
        distanceMeters == null ||
        !Number.isFinite(durationSec) ||
        !Number.isFinite(distanceMeters)
      ) {
        isValidCandidate = false
        break
      }

      perLocationDurationSec.push(durationSec)
      perLocationDistanceKm.push(distanceMeters / 1000)
    }

    if (!isValidCandidate) {
      continue
    }

    const metrics = buildMetrics(perLocationDurationSec, perLocationDistanceKm)
    const maxDurationSec = Math.max(...perLocationDurationSec)

    if (
      !bestSelection ||
      maxDurationSec < bestSelection.maxDurationSec ||
      (maxDurationSec === bestSelection.maxDurationSec && metrics.totalDurationSec < bestSelection.metrics.totalDurationSec)
    ) {
      bestSelection = {
        index: candidateIndex,
        candidate: candidates[candidateIndex],
        metrics,
        maxDurationSec
      }
    }
  }

  return bestSelection
}

export async function computeExactTwoPointRoutingMidpoint(
  locations: [Location, Location],
  provider: RoutingProvider
): Promise<MidpointComputation> {
  const route = await provider.getRouteDetails(locations[0], locations[1])

  if (route.coordinates.length < 2 || route.segmentDurationsSec.length === 0 || route.segmentDistancesM.length === 0) {
    return createRoutingFallback(locations)
  }

  const totalDurationSec = route.segmentDurationsSec.reduce((sum, value) => sum + value, 0)
  const totalDistanceM = route.segmentDistancesM.reduce((sum, value) => sum + value, 0)
  const targetDurationSec = totalDurationSec / 2

  let cumulativeDurationSec = 0
  let cumulativeDistanceM = 0
  let midpoint: CoordinateLike | null = null
  let distanceToMidpointM = 0
  let durationToMidpointSec = 0

  for (let index = 0; index < route.segmentDurationsSec.length; index += 1) {
    const segmentDurationSec = route.segmentDurationsSec[index]
    const segmentDistanceM = route.segmentDistancesM[index]
    const nextDurationSec = cumulativeDurationSec + segmentDurationSec

    if (targetDurationSec <= nextDurationSec || index === route.segmentDurationsSec.length - 1) {
      const ratio = segmentDurationSec <= 0 ? 0 : (targetDurationSec - cumulativeDurationSec) / segmentDurationSec
      const clampedRatio = clamp(ratio, 0, 1)

      midpoint = interpolateCoordinate(route.coordinates[index], route.coordinates[index + 1], clampedRatio)
      durationToMidpointSec = cumulativeDurationSec + segmentDurationSec * clampedRatio
      distanceToMidpointM = cumulativeDistanceM + segmentDistanceM * clampedRatio
      break
    }

    cumulativeDurationSec = nextDurationSec
    cumulativeDistanceM += segmentDistanceM
  }

  if (!midpoint) {
    return createRoutingFallback(locations)
  }

  const perLocationDurationSec = [durationToMidpointSec, totalDurationSec - durationToMidpointSec]
  const perLocationDistanceKm = [distanceToMidpointM / 1000, (totalDistanceM - distanceToMidpointM) / 1000]

  return {
    mode: 'routing',
    point: {
      name: 'Road-based Midpoint',
      lat: midpoint.lat,
      lng: midpoint.lng
    },
    metrics: buildMetrics(perLocationDurationSec, perLocationDistanceKm)
  }
}

export async function computeRoutingMidpoint(
  locations: Location[],
  provider: RoutingProvider
): Promise<MidpointComputation> {
  if (locations.length < 2) {
    return createRoutingFallback(locations, 'Road-based midpoint needs at least 2 locations. Showing geographic midpoint instead.')
  }

  try {
    if (locations.length === 2) {
      return computeExactTwoPointRoutingMidpoint([locations[0], locations[1]], provider)
    }

    const seed = calculateMidpoint(locations)
    const radiusKm = getRoutingCandidateRadiusKm(seed, locations)
    const candidates = generateRoutingCandidates(seed, radiusKm)
    const table = await provider.getTable(locations, candidates)
    const selection = selectBestRoutingCandidate(candidates, table)

    if (!selection) {
      return createRoutingFallback(locations)
    }

    const snappedPoint = await provider.getNearest(selection.candidate)

    return {
      mode: 'routing',
      point: {
        name: 'Road-based Midpoint',
        lat: snappedPoint.lat,
        lng: snappedPoint.lng
      },
      metrics: selection.metrics
    }
  } catch (error) {
    console.error('[routing-midpoint] failed to compute routing midpoint:', error)
    return createRoutingFallback(locations)
  }
}