import type { CoordinateLike, RoutingRouteDetails, RoutingTableResult } from './routing-midpoint'
import type { Location } from './utils'

const OSRM_BASE_URL = (process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org').replace(/\/$/, '')
const OSRM_CACHE_TTL_MS = Number(process.env.OSRM_CACHE_TTL_MS ?? '300000')
const OSRM_TIMEOUT_MS = Number(process.env.OSRM_TIMEOUT_MS ?? '8000')

const responseCache = new Map<string, { expiresAt: number; data: unknown }>()

function normalizePoint(point: CoordinateLike) {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`
}

function buildCoordinateString(points: CoordinateLike[]) {
  return points.map((point) => `${point.lng},${point.lat}`).join(';')
}

function buildSourceIndexParam(length: number) {
  return Array.from({ length }, (_, index) => index).join(';')
}

function buildDestinationIndexParam(originLength: number, destinationLength: number) {
  return Array.from({ length: destinationLength }, (_, index) => originLength + index).join(';')
}

function buildTableCacheKey(origins: Location[], destinations: CoordinateLike[]) {
  return `table|origins=${origins.map(normalizePoint).join('|')}|destinations=${destinations.map(normalizePoint).join('|')}`
}

function buildNearestCacheKey(point: CoordinateLike) {
  return `nearest|point=${normalizePoint(point)}`
}

function buildRouteCacheKey(origin: CoordinateLike, destination: CoordinateLike, withAnnotations: boolean) {
  return `route|origin=${normalizePoint(origin)}|destination=${normalizePoint(destination)}|annotations=${withAnnotations ? '1' : '0'}`
}

function getCachedValue<T>(key: string) {
  const cached = responseCache.get(key)
  if (!cached) {
    return null
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(key)
    return null
  }

  return cached.data as T
}

function setCachedValue(key: string, data: unknown) {
  responseCache.set(key, {
    expiresAt: Date.now() + OSRM_CACHE_TTL_MS,
    data
  })
}

async function fetchOsrmJson<T>(path: string, cacheKey: string): Promise<T> {
  const cached = getCachedValue<T>(cacheKey)
  if (cached) {
    return cached
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS)

  try {
    const res = await fetch(`${OSRM_BASE_URL}${path}`, {
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal,
      cache: 'no-store'
    })

    if (!res.ok) {
      throw new Error(`OSRM ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as T
    setCachedValue(cacheKey, data)
    return data
  } finally {
    clearTimeout(timeoutId)
  }
}

interface OsrmTableResponse {
  code: string;
  distances?: Array<Array<number | null>>;
  durations?: Array<Array<number | null>>;
}

interface OsrmNearestResponse {
  code: string;
  waypoints?: Array<{
    location?: [number, number];
  }>;
}

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{
    geometry?: {
      coordinates?: Array<[number, number]>;
    };
    legs?: Array<{
      annotation?: {
        distance?: number[];
        duration?: number[];
      };
    }>;
  }>;
}

async function getOsrmRouteResponse(origin: CoordinateLike, destination: CoordinateLike, withAnnotations: boolean) {
  const query = withAnnotations
    ? 'overview=full&geometries=geojson&annotations=distance,duration&steps=false'
    : 'overview=full&geometries=geojson'

  return fetchOsrmJson<OsrmRouteResponse>(
    `/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?${query}`,
    buildRouteCacheKey(origin, destination, withAnnotations)
  )
}

export async function getOsrmTable(origins: Location[], destinations: CoordinateLike[]): Promise<RoutingTableResult> {
  const coordinates = buildCoordinateString([...origins, ...destinations])
  const params = new URLSearchParams({
    annotations: 'duration,distance',
    sources: buildSourceIndexParam(origins.length),
    destinations: buildDestinationIndexParam(origins.length, destinations.length)
  })

  const data = await fetchOsrmJson<OsrmTableResponse>(
    `/table/v1/driving/${coordinates}?${params.toString()}`,
    buildTableCacheKey(origins, destinations)
  )

  if (data.code !== 'Ok' || !data.durations || !data.distances) {
    throw new Error('OSRM table response was incomplete')
  }

  return {
    durations: data.durations,
    distances: data.distances
  }
}

export async function getOsrmNearest(point: CoordinateLike): Promise<CoordinateLike> {
  const data = await fetchOsrmJson<OsrmNearestResponse>(
    `/nearest/v1/driving/${point.lng},${point.lat}?number=1`,
    buildNearestCacheKey(point)
  )

  const location = data.waypoints?.[0]?.location
  if (data.code !== 'Ok' || !location) {
    throw new Error('OSRM nearest response was incomplete')
  }

  return {
    lng: location[0],
    lat: location[1]
  }
}

export async function getOsrmRoute(origin: CoordinateLike, destination: CoordinateLike): Promise<Array<[number, number]>> {
  const data = await getOsrmRouteResponse(origin, destination, false)
  const coordinates = data.routes?.[0]?.geometry?.coordinates

  if (data.code !== 'Ok' || !coordinates || coordinates.length === 0) {
    throw new Error('OSRM route response was incomplete')
  }

  return coordinates.map(([lng, lat]) => [lat, lng])
}

export async function getOsrmRouteDetails(origin: Location, destination: Location): Promise<RoutingRouteDetails> {
  const data = await getOsrmRouteResponse(origin, destination, true)
  const route = data.routes?.[0]
  const coordinates = route?.geometry?.coordinates
  const annotation = route?.legs?.[0]?.annotation
  const segmentDurationsSec = annotation?.duration
  const segmentDistancesM = annotation?.distance

  if (
    data.code !== 'Ok' ||
    !coordinates ||
    coordinates.length < 2 ||
    !segmentDurationsSec ||
    !segmentDistancesM ||
    segmentDurationsSec.length !== coordinates.length - 1 ||
    segmentDistancesM.length !== coordinates.length - 1
  ) {
    throw new Error('OSRM route details response was incomplete')
  }

  return {
    coordinates: coordinates.map(([lng, lat]) => [lat, lng]),
    segmentDurationsSec,
    segmentDistancesM
  }
}