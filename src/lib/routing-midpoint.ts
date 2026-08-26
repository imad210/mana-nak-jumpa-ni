import {
  calculateMidpoint,
  haversineKm,
  type Location,
  type MidpointComputation,
  type MidpointMetrics,
  type RoutingSearchMetadata,
  type RoutePath
} from './utils'

export interface CoordinateLike {
  lat: number;
  lng: number;
}

export interface RoutingTableResult {
  durations: Array<Array<number | null>>;
  distances: Array<Array<number | null>>;
  destinations?: CoordinateLike[];
}

export interface RoutingRouteDetails {
  coordinates: Array<[number, number]>;
  segmentDurationsSec: number[];
  segmentDistancesM: number[];
}

export interface RoutingProvider {
  getTable(origins: Location[], destinations: CoordinateLike[]): Promise<RoutingTableResult>;
  getRouteDetails(origin: Location, destination: Location): Promise<RoutingRouteDetails>;
}

export interface RoutingCandidateSelection {
  index: number;
  candidate: CoordinateLike;
  metrics: MidpointMetrics;
  maxDurationSec: number;
  validCandidateCount: number;
}

export interface RoutingMidpointResult extends MidpointComputation {
  routePaths?: RoutePath[];
}

const EARTH_RADIUS_KM = 6371
const MIN_RING_RADIUS_KM = 3
const MAX_RING_RADIUS_KM = 20
const RING_RADIUS_FACTOR = 0.35
const BROAD_RING_FACTORS = [0.33, 0.66, 1] as const
const RING_BEARING_STEP_DEG = 30
const REFINEMENT_RADIUS_FACTOR = 0.25
const MIN_REFINEMENT_RADIUS_KM = 0.75
const MAX_REFINEMENT_RADIUS_KM = 5
const FAIRNESS_TOLERANCE_SEC = 30
const TOTAL_TIME_TOLERANCE_SEC = 30
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
  const maximumDurationSec = Math.max(...perLocationDurationSec)
  const minimumDurationSec = Math.min(...perLocationDurationSec)

  return {
    totalDurationSec,
    totalDistanceKm,
    perLocationDurationSec,
    perLocationDistanceKm,
    maximumDurationSec,
    minimumDurationSec,
    durationSpreadSec: maximumDurationSec - minimumDurationSec
  }
}

function coordinatesMatch(a: [number, number], b: CoordinateLike) {
  return a[0] === b.lat && a[1] === b.lng
}

function buildTwoPointRoutePaths(
  route: RoutingRouteDetails,
  midpoint: CoordinateLike,
  segmentIndex: number
): RoutePath[] {
  const firstPath = route.coordinates.slice(0, segmentIndex + 1)
  if (!coordinatesMatch(firstPath[firstPath.length - 1], midpoint)) {
    firstPath.push([midpoint.lat, midpoint.lng])
  }

  const secondPath = route.coordinates.slice(segmentIndex + 1).reverse()
  if (secondPath.length === 0 || !coordinatesMatch(secondPath[secondPath.length - 1], midpoint)) {
    secondPath.push([midpoint.lat, midpoint.lng])
  }

  return [
    {
      originIndex: 0,
      coordinates: firstPath
    },
    {
      originIndex: 1,
      coordinates: secondPath
    }
  ]
}

export function validateRoutingLocationsPayload(payload: unknown): Location[] | null {
  if (!Array.isArray(payload) || payload.length < 2 || payload.length > 10) {
    return null
  }

  const locations: Location[] = []
  const coordinateKeys = new Set<string>()

  for (const item of payload) {
    if (!item || typeof item !== 'object') {
      return null
    }

    const { name, lat, lng } = item as Record<string, unknown>

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 160 ||
      !isFiniteCoordinate(lat) ||
      !isFiniteCoordinate(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return null
    }

    const coordinateKey = `${lat.toFixed(6)},${lng.toFixed(6)}`
    if (coordinateKeys.has(coordinateKey)) {
      return null
    }
    coordinateKeys.add(coordinateKey)

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

  for (let bearing = 0; bearing < 360; bearing += RING_BEARING_STEP_DEG) {
    candidates.push(offsetCoordinate(seed, radiusKm, bearing))
  }

  return candidates
}

export function generateBroadRoutingCandidates(seed: CoordinateLike, baseRadiusKm: number): CoordinateLike[] {
  const candidates: CoordinateLike[] = [seed]

  for (const radiusFactor of BROAD_RING_FACTORS) {
    const radiusKm = baseRadiusKm * radiusFactor
    for (let bearing = 0; bearing < 360; bearing += RING_BEARING_STEP_DEG) {
      candidates.push(offsetCoordinate(seed, radiusKm, bearing))
    }
  }

  return candidates
}

export function getRoutingRefinementRadiusKm(baseRadiusKm: number) {
  return clamp(baseRadiusKm * REFINEMENT_RADIUS_FACTOR, MIN_REFINEMENT_RADIUS_KM, MAX_REFINEMENT_RADIUS_KM)
}

export function selectBestRoutingCandidate(
  candidates: CoordinateLike[],
  table: RoutingTableResult,
  expectedSourceCount = table.durations.length
): RoutingCandidateSelection | null {
  if (
    expectedSourceCount <= 0 ||
    candidates.length === 0 ||
    table.durations.length !== expectedSourceCount ||
    table.distances.length !== expectedSourceCount ||
    (table.destinations != null && table.destinations.length !== candidates.length)
  ) {
    return null
  }

  let bestSelection: RoutingCandidateSelection | null = null
  let validCandidateCount = 0

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const perLocationDurationSec: number[] = []
    const perLocationDistanceKm: number[] = []
    let isValidCandidate = true

    for (let sourceIndex = 0; sourceIndex < expectedSourceCount; sourceIndex += 1) {
      const durationSec = table.durations[sourceIndex]?.[candidateIndex] ?? null
      const distanceMeters = table.distances[sourceIndex]?.[candidateIndex] ?? null

      if (
        durationSec == null ||
        distanceMeters == null ||
        !Number.isFinite(durationSec) ||
        !Number.isFinite(distanceMeters) ||
        durationSec < 0 ||
        distanceMeters < 0
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

    const snappedCandidate = table.destinations?.[candidateIndex] ?? candidates[candidateIndex]
    if (!isFiniteCoordinate(snappedCandidate?.lat) || !isFiniteCoordinate(snappedCandidate?.lng)) {
      continue
    }

    validCandidateCount += 1
    const metrics = buildMetrics(perLocationDurationSec, perLocationDistanceKm)
    const maxDurationSec = metrics.maximumDurationSec
    const maxDifference = bestSelection ? maxDurationSec - bestSelection.maxDurationSec : Number.NEGATIVE_INFINITY
    const totalDifference = bestSelection
      ? metrics.totalDurationSec - bestSelection.metrics.totalDurationSec
      : Number.NEGATIVE_INFINITY
    const isClearlyFairer = maxDifference < -FAIRNESS_TOLERANCE_SEC
    const isFairnessTie = Math.abs(maxDifference) <= FAIRNESS_TOLERANCE_SEC
    const isClearlyLowerTotal = totalDifference < -TOTAL_TIME_TOLERANCE_SEC

    if (
      !bestSelection ||
      isClearlyFairer ||
      (isFairnessTie && isClearlyLowerTotal)
    ) {
      bestSelection = {
        index: candidateIndex,
        candidate: snappedCandidate,
        metrics,
        maxDurationSec,
        validCandidateCount
      }
    }
  }

  if (bestSelection) {
    bestSelection.validCandidateCount = validCandidateCount
  }

  return bestSelection
}

export async function computeExactTwoPointRoutingMidpoint(
  locations: [Location, Location],
  provider: RoutingProvider
): Promise<RoutingMidpointResult> {
  const route = await provider.getRouteDetails(locations[0], locations[1])

  if (
    route.coordinates.length < 2 ||
    route.segmentDurationsSec.length !== route.coordinates.length - 1 ||
    route.segmentDistancesM.length !== route.coordinates.length - 1 ||
    route.segmentDurationsSec.some((value) => !Number.isFinite(value) || value < 0) ||
    route.segmentDistancesM.some((value) => !Number.isFinite(value) || value < 0)
  ) {
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
  let midpointSegmentIndex = -1

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
      midpointSegmentIndex = index
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
    metrics: buildMetrics(perLocationDurationSec, perLocationDistanceKm),
    routingSearch: {
      strategy: 'directed-route-half-duration',
      stage1CandidateCount: 1,
      stage1ValidCandidateCount: 1,
      stage2CandidateCount: 0,
      stage2ValidCandidateCount: 0,
      stage2Completed: false
    },
    routePaths: buildTwoPointRoutePaths(route, midpoint, midpointSegmentIndex)
  }
}

export async function computeRoutingMidpoint(
  locations: Location[],
  provider: RoutingProvider
): Promise<RoutingMidpointResult> {
  if (locations.length < 2) {
    return createRoutingFallback(locations, 'Road-based midpoint needs at least 2 locations. Showing geographic midpoint instead.')
  }

  try {
    if (locations.length === 2) {
      return computeExactTwoPointRoutingMidpoint([locations[0], locations[1]], provider)
    }

    const seed = calculateMidpoint(locations)
    const baseRadiusKm = getRoutingCandidateRadiusKm(seed, locations)
    const broadCandidates = generateBroadRoutingCandidates(seed, baseRadiusKm)
    const broadTable = await provider.getTable(locations, broadCandidates)
    const broadSelection = selectBestRoutingCandidate(broadCandidates, broadTable, locations.length)

    if (!broadSelection) {
      return createRoutingFallback(locations)
    }

    const refinementRadiusKm = getRoutingRefinementRadiusKm(baseRadiusKm)
    const refinementCandidates = generateRoutingCandidates(broadSelection.candidate, refinementRadiusKm)
    let finalSelection = broadSelection
    let stage2ValidCandidateCount = 0
    let stage2Completed = false

    try {
      const refinementTable = await provider.getTable(locations, refinementCandidates)
      const refinementSelection = selectBestRoutingCandidate(refinementCandidates, refinementTable, locations.length)

      if (refinementSelection) {
        finalSelection = refinementSelection
        stage2ValidCandidateCount = refinementSelection.validCandidateCount
        stage2Completed = true
      }
    } catch (error) {
      console.warn('[routing-midpoint] refinement failed; keeping broad winner:', error)
    }

    const routingSearch: RoutingSearchMetadata = {
      strategy: 'multi-ring-refinement',
      stage1CandidateCount: broadCandidates.length,
      stage1ValidCandidateCount: broadSelection.validCandidateCount,
      stage2CandidateCount: refinementCandidates.length,
      stage2ValidCandidateCount,
      stage2Completed,
      baseRadiusKm,
      refinementRadiusKm
    }

    return {
      mode: 'routing',
      point: {
        name: 'Road-based Midpoint',
        lat: finalSelection.candidate.lat,
        lng: finalSelection.candidate.lng
      },
      metrics: finalSelection.metrics,
      routingSearch
    }
  } catch (error) {
    console.error('[routing-midpoint] failed to compute routing midpoint:', error)
    return createRoutingFallback(locations)
  }
}
