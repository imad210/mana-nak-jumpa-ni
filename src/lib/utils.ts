export interface Location {
  name: string;
  lat: number;
  lng: number;
}

export type MidpointMode = 'geographic' | 'routing'

export interface NearbyPlace {
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

export interface MidpointMetrics {
  totalDurationSec: number;
  totalDistanceKm: number;
  perLocationDurationSec: number[];
  perLocationDistanceKm: number[];
}

export interface MidpointComputation {
  mode: MidpointMode;
  point: Location;
  metrics?: MidpointMetrics;
  fallbackToGeographic?: boolean;
  reason?: string;
}

export interface RoutePath {
  originIndex: number;
  coordinates: Array<[number, number]>;
}

interface SearchApiResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface ReverseApiResponse {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: {
    suburb?: string;
    neighbourhood?: string;
    quarter?: string;
    village?: string;
    town?: string;
    city?: string;
    municipality?: string;
    county?: string;
    state_district?: string;
    state?: string;
    hamlet?: string;
    residential?: string;
  };
}

export const DEFAULT_CENTER_LOCATION: Location = {
  name: 'Center',
  lat: 4.2105,
  lng: 101.9758
}

/** Search a Malaysian locality by name - proxied through /api/search to avoid CORS */
export async function searchLocation(query: string): Promise<Location[]> {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    const data: SearchApiResult[] = await res.json()
    return data.map((item) => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon)
    }))
  } catch (error) {
    console.error('searchLocation error:', error)
    return []
  }
}

export async function getRoutingMidpoint(locations: Location[]): Promise<MidpointComputation> {
  const res = await fetch('/api/midpoint/routing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ locations })
  })

  if (!res.ok) {
    throw new Error(`Routing midpoint request failed with ${res.status}`)
  }

  return res.json() as Promise<MidpointComputation>
}

export async function getRoadRoutes(locations: Location[], midpoint: Location): Promise<RoutePath[]> {
  const res = await fetch('/api/routes/road', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ locations, midpoint })
  })

  if (!res.ok) {
    throw new Error(`Road routes request failed with ${res.status}`)
  }

  return res.json() as Promise<RoutePath[]>
}

export function calculateMidpoint(locations: Location[]): Location {
  if (locations.length === 0) return DEFAULT_CENTER_LOCATION
  const totalLat = locations.reduce((sum, loc) => sum + loc.lat, 0)
  const totalLng = locations.reduce((sum, loc) => sum + loc.lng, 0)
  return {
    name: 'Midpoint',
    lat: totalLat / locations.length,
    lng: totalLng / locations.length
  }
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function splitDisplayName(displayName?: string) {
  if (!displayName) return []

  return displayName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function isUsefulNearbyName(name: string) {
  const normalized = name.trim().toLowerCase()

  if (!normalized) return false
  if (normalized === 'malaysia') return false
  if (/^\d/.test(normalized)) return false
  if (normalized.includes('federal territory of')) return false

  return true
}

function getNearbyNameCandidates(data: ReverseApiResponse) {
  const addr = data.address ?? {}

  return [
    data.name,
    addr.suburb,
    addr.neighbourhood,
    addr.quarter,
    addr.residential,
    addr.hamlet,
    addr.village,
    addr.town,
    addr.city,
    addr.municipality,
    addr.county,
    addr.state_district,
    ...splitDisplayName(data.display_name),
    addr.state
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0 && isUsefulNearbyName(value))
}

/**
 * Reverse-geocodes the midpoint once through /api/reverse.
 * This keeps public Nominatim usage within a much safer request profile.
 */
export async function getNearbyLocalities(lat: number, lng: number): Promise<NearbyPlace[]> {
  try {
    const data = await fetch(`/api/reverse?lat=${lat}&lng=${lng}`).then(
      (r) => r.json() as Promise<ReverseApiResponse>
    )

    const pLat = data.lat ? parseFloat(data.lat) : lat
    const pLng = data.lon ? parseFloat(data.lon) : lng
    const seen = new Set<string>()

    return getNearbyNameCandidates(data)
      .filter((name) => {
        const key = name.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 5)
      .map((name) => ({
        name,
        lat: pLat,
        lng: pLng,
        distanceKm: haversineKm(lat, lng, pLat, pLng)
      }))
  } catch {
    return []
  }
}