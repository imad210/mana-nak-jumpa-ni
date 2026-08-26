import { describe, expect, it } from 'vitest'
import { calculateMidpoint, type Location } from './utils'
import {
  computeExactTwoPointRoutingMidpoint,
  computeRoutingMidpoint,
  generateBroadRoutingCandidates,
  generateRoutingCandidates,
  getRoutingCandidateRadiusKm,
  getRoutingRefinementRadiusKm,
  selectBestRoutingCandidate,
  validateRoutingMidpointRequestBody,
  type RoutingProvider,
  type RoutingTableResult
} from './routing-midpoint'

const locations: Location[] = [
  { name: 'Kuala Lumpur', lat: 3.139, lng: 101.6869 },
  { name: 'Seremban', lat: 2.7297, lng: 101.9381 },
  { name: 'Melaka', lat: 2.1896, lng: 102.2501 }
]

const baseProvider: RoutingProvider = {
  getTable: async () => ({ durations: [], distances: [] }),
  getRouteDetails: async () => ({
    coordinates: [
      [3.0, 101.0],
      [3.1, 101.1]
    ],
    segmentDurationsSec: [120],
    segmentDistancesM: [10000]
  })
}

describe('routing midpoint helpers', () => {
  it('keeps geographic midpoint calculation unchanged', () => {
    const midpoint = calculateMidpoint(locations)

    expect(midpoint.lat).toBeCloseTo((3.139 + 2.7297 + 2.1896) / 3, 6)
    expect(midpoint.lng).toBeCloseTo((101.6869 + 101.9381 + 102.2501) / 3, 6)
  })

  it('generates 13 routing candidates with clamped radius', () => {
    const seed = calculateMidpoint(locations)
    const radiusKm = getRoutingCandidateRadiusKm(seed, locations)
    const candidates = generateRoutingCandidates(seed, radiusKm)

    expect(radiusKm).toBeGreaterThanOrEqual(3)
    expect(radiusKm).toBeLessThanOrEqual(20)
    expect(candidates).toHaveLength(13)
    expect(candidates[0]).toEqual(seed)
  })

  it('generates 37 deterministic broad candidates across three rings', () => {
    const seed = calculateMidpoint(locations)
    const candidates = generateBroadRoutingCandidates(seed, 12)

    expect(candidates).toHaveLength(37)
    expect(candidates[0]).toEqual(seed)
    expect(candidates[1]).not.toEqual(candidates[13])
    expect(candidates[13]).not.toEqual(candidates[25])
  })

  it('clamps the refinement radius', () => {
    expect(getRoutingRefinementRadiusKm(1)).toBe(0.75)
    expect(getRoutingRefinementRadiusKm(12)).toBe(3)
    expect(getRoutingRefinementRadiusKm(100)).toBe(5)
  })

  it('selects the candidate that minimizes the longest traveler first', () => {
    const candidates = [
      { lat: 3, lng: 101 },
      { lat: 3.1, lng: 101.1 },
      { lat: 3.2, lng: 101.2 }
    ]

    const table: RoutingTableResult = {
      durations: [
        [400, 300, 500],
        [400, 300, 500],
        [900, 620, 450]
      ],
      distances: [
        [10000, 9000, 12000],
        [10000, 9000, 12000],
        [21000, 17000, 13000]
      ]
    }

    const selection = selectBestRoutingCandidate(candidates, table)

    expect(selection?.index).toBe(2)
    expect(selection?.maxDurationSec).toBe(500)
    expect(selection?.metrics.totalDurationSec).toBe(1450)
  })

  it('uses total duration when maximum durations are within tolerance', () => {
    const candidates = [
      { lat: 3, lng: 101 },
      { lat: 3.1, lng: 101.1 }
    ]
    const table: RoutingTableResult = {
      durations: [
        [500, 480],
        [450, 300],
        [450, 300]
      ],
      distances: [
        [10000, 9000],
        [10000, 8000],
        [10000, 8000]
      ]
    }

    expect(selectBestRoutingCandidate(candidates, table)?.index).toBe(1)
  })

  it('rejects candidates with incomplete or negative provider metrics', () => {
    const candidates = [
      { lat: 3, lng: 101 },
      { lat: 3.1, lng: 101.1 }
    ]
    const table: RoutingTableResult = {
      durations: [
        [100, -1],
        [null, 100]
      ],
      distances: [
        [1000, 1000],
        [1000, 1000]
      ]
    }

    expect(selectBestRoutingCandidate(candidates, table, 2)).toBeNull()
  })

  it('computes an exact 50/50 midpoint across a two-place route', async () => {
    const twoLocations: [Location, Location] = [
      { name: 'Start', lat: 3.0, lng: 101.0 },
      { name: 'End', lat: 3.3, lng: 101.3 }
    ]

    const result = await computeExactTwoPointRoutingMidpoint(twoLocations, {
      ...baseProvider,
      getRouteDetails: async () => ({
        coordinates: [
          [3.0, 101.0],
          [3.1, 101.1],
          [3.2, 101.2],
          [3.3, 101.3]
        ],
        segmentDurationsSec: [300, 300, 300],
        segmentDistancesM: [9000, 12000, 15000]
      })
    })

    expect(result.point.lat).toBeCloseTo(3.15, 6)
    expect(result.point.lng).toBeCloseTo(101.15, 6)
    expect(result.metrics?.perLocationDurationSec[0]).toBeCloseTo(450, 6)
    expect(result.metrics?.perLocationDurationSec[1]).toBeCloseTo(450, 6)
    expect(result.metrics?.perLocationDistanceKm[0]).toBeCloseTo(15, 6)
    expect(result.metrics?.perLocationDistanceKm[1]).toBeCloseTo(21, 6)
    expect(result.routePaths).toHaveLength(2)
    expect(result.routePaths?.[0]?.originIndex).toBe(0)
    expect(result.routePaths?.[1]?.originIndex).toBe(1)
    expect(result.routePaths?.[0]?.coordinates.slice(0, 2)).toEqual([
      [3.0, 101.0],
      [3.1, 101.1]
    ])
    expect(result.routePaths?.[1]?.coordinates.slice(0, 2)).toEqual([
      [3.3, 101.3],
      [3.2, 101.2]
    ])
    expect(result.routePaths?.[0]?.coordinates[2]?.[0]).toBeCloseTo(3.15, 6)
    expect(result.routePaths?.[0]?.coordinates[2]?.[1]).toBeCloseTo(101.15, 6)
    expect(result.routePaths?.[1]?.coordinates[2]?.[0]).toBeCloseTo(3.15, 6)
    expect(result.routePaths?.[1]?.coordinates[2]?.[1]).toBeCloseTo(101.15, 6)
  })

  it('falls back to geographic midpoint when provider fails', async () => {
    const failingProvider: RoutingProvider = {
      getTable: async () => {
        throw new Error('OSRM unavailable')
      },
      getRouteDetails: async () => {
        throw new Error('OSRM unavailable')
      }
    }

    const result = await computeRoutingMidpoint(locations, failingProvider)
    const geographic = calculateMidpoint(locations)

    expect(result.fallbackToGeographic).toBe(true)
    expect(result.point).toEqual(geographic)
    expect(result.metrics).toBeUndefined()
  })

  it('runs broad and refinement searches and returns the table-snapped winner', async () => {
    const candidateCounts: number[] = []
    const result = await computeRoutingMidpoint(locations, {
      ...baseProvider,
      getTable: async (origins, candidates) => {
        candidateCounts.push(candidates.length)
        return {
          durations: origins.map(() => candidates.map(() => 600)),
          distances: origins.map(() => candidates.map(() => 10000)),
          destinations: candidates.map((candidate) => ({
            lat: candidate.lat + 0.0001,
            lng: candidate.lng + 0.0001
          }))
        }
      }
    })

    expect(candidateCounts).toEqual([37, 13])
    expect(result.routingSearch).toMatchObject({
      strategy: 'multi-ring-refinement',
      stage1CandidateCount: 37,
      stage1ValidCandidateCount: 37,
      stage2CandidateCount: 13,
      stage2ValidCandidateCount: 13,
      stage2Completed: true
    })
    expect(result.point.lat).toBeCloseTo(calculateMidpoint(locations).lat + 0.0002, 6)
    expect(result.metrics?.maximumDurationSec).toBe(600)
    expect(result.metrics?.durationSpreadSec).toBe(0)
  })

  it('keeps the broad winner when refinement fails', async () => {
    let tableCall = 0
    const result = await computeRoutingMidpoint(locations, {
      ...baseProvider,
      getTable: async (origins, candidates) => {
        tableCall += 1
        if (tableCall === 2) throw new Error('refinement unavailable')
        return {
          durations: origins.map(() => candidates.map(() => 600)),
          distances: origins.map(() => candidates.map(() => 10000)),
          destinations: candidates
        }
      }
    })

    expect(result.fallbackToGeographic).not.toBe(true)
    expect(result.routingSearch?.stage2Completed).toBe(false)
    expect(result.routingSearch?.stage2ValidCandidateCount).toBe(0)
    const geographic = calculateMidpoint(locations)
    expect(result.point.lat).toBeCloseTo(geographic.lat, 6)
    expect(result.point.lng).toBeCloseTo(geographic.lng, 6)
  })

  it('rejects invalid request payloads safely', () => {
    expect(validateRoutingMidpointRequestBody({})).toBeNull()
    expect(validateRoutingMidpointRequestBody({ locations: 'bad' })).toBeNull()
    expect(validateRoutingMidpointRequestBody({ locations: [{ name: 'KL', lat: '3.1', lng: 101.6 }] })).toBeNull()
    expect(validateRoutingMidpointRequestBody({ locations: [] })).toBeNull()
    expect(validateRoutingMidpointRequestBody({ locations: [locations[0]] })).toBeNull()
    expect(validateRoutingMidpointRequestBody({ locations: [locations[0], { ...locations[0], name: 'Duplicate' }] })).toBeNull()
    expect(validateRoutingMidpointRequestBody({ locations: [locations[0], { name: 'Invalid', lat: 100, lng: 101 }] })).toBeNull()
    expect(validateRoutingMidpointRequestBody({ locations })).toEqual(locations)
  })
})
