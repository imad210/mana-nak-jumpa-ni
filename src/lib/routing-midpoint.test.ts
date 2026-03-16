import { describe, expect, it } from 'vitest'
import { calculateMidpoint, type Location } from './utils'
import {
  computeExactTwoPointRoutingMidpoint,
  computeRoutingMidpoint,
  generateRoutingCandidates,
  getRoutingCandidateRadiusKm,
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
  getNearest: async (point) => point,
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
  })

  it('falls back to geographic midpoint when provider fails', async () => {
    const failingProvider: RoutingProvider = {
      getTable: async () => {
        throw new Error('OSRM unavailable')
      },
      getNearest: async () => ({ lat: 0, lng: 0 }),
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

  it('rejects invalid request payloads safely', () => {
    expect(validateRoutingMidpointRequestBody({})).toBeNull()
    expect(validateRoutingMidpointRequestBody({ locations: 'bad' })).toBeNull()
    expect(validateRoutingMidpointRequestBody({ locations: [{ name: 'KL', lat: '3.1', lng: 101.6 }] })).toBeNull()
    expect(validateRoutingMidpointRequestBody({ locations })).toEqual(locations)
  })
})