export interface Location {
  name: string;
  lat: number;
  lng: number;
}

export interface NearbyPlace {
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

/** Search a Malaysian locality by name — proxied through /api/search to avoid CORS */
export async function searchLocation(query: string): Promise<Location[]> {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    const data = await res.json()
    return data.map((item: any) => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon)
    }))
  } catch (error) {
    console.error('searchLocation error:', error)
    return []
  }
}

export function calculateMidpoint(locations: Location[]): Location {
  if (locations.length === 0) return { name: 'Center', lat: 4.2105, lng: 101.9758 }
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

/**
 * Reverse-geocodes several points around (lat, lng) — proxied through /api/reverse.
 * Returns up to 5 deduplicated nearby locality names sorted by distance.
 */
export async function getNearbyLocalities(lat: number, lng: number): Promise<NearbyPlace[]> {
  const offsets = [
    { dlat: 0, dlng: 0 },
    { dlat: 0.04, dlng: 0 },
    { dlat: -0.04, dlng: 0 },
    { dlat: 0, dlng: 0.05 },
    { dlat: 0, dlng: -0.05 },
    { dlat: 0.028, dlng: 0.035 },
    { dlat: -0.028, dlng: -0.035 },
  ]

  const fetches = offsets.map(({ dlat, dlng }) =>
    fetch(`/api/reverse?lat=${lat + dlat}&lng=${lng + dlng}`)
      .then(r => r.json())
      .then((data: any): NearbyPlace | null => {
        const addr = data?.address ?? {}
        const name =
          addr.suburb ??
          addr.neighbourhood ??
          addr.quarter ??
          addr.village ??
          addr.town ??
          addr.city ??
          data?.name ??
          null
        if (!name) return null
        const pLat = parseFloat(data.lat)
        const pLng = parseFloat(data.lon)
        return {
          name,
          lat: pLat,
          lng: pLng,
          distanceKm: haversineKm(lat, lng, pLat, pLng)
        }
      })
      .catch(() => null)
  )

  const raw = await Promise.all(fetches)
  const seen = new Set<string>()
  return (raw.filter(Boolean) as NearbyPlace[])
    .filter(p => {
      if (seen.has(p.name)) return false
      seen.add(p.name)
      return true
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 5)
}
