'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-defaulticon-compatibility'
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css'
import { DEFAULT_CENTER_LOCATION, type Location, type MidpointMode, type RoutePath } from '@/lib/utils'

const createIcon = (color: string) =>
  new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  })

const blueIcon = createIcon('blue')
const goldIcon = createIcon('gold')
const malaysiaCenter: L.LatLngExpression = [DEFAULT_CENTER_LOCATION.lat, DEFAULT_CENTER_LOCATION.lng]
const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'

interface MapProps {
  locations: Location[]
  midpoint: Location | null
  midpointMode: MidpointMode
  routePaths: RoutePath[]
  isDark: boolean
}

function getTileUrl(isDark: boolean) {
  return isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
}

export default function Map({ locations, midpoint, midpointMode, routePaths, isDark }: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayLayerRef = useRef<L.LayerGroup | null>(null)
  const initialThemeRef = useRef(isDark)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return
    }

    const map = L.map(containerRef.current, {
      center: malaysiaCenter,
      zoom: 6,
      zoomControl: false,
      scrollWheelZoom: true
    })

    L.tileLayer(getTileUrl(initialThemeRef.current), { attribution }).addTo(map)

    const overlayLayer = L.layerGroup().addTo(map)
    mapRef.current = map
    overlayLayerRef.current = overlayLayer

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize()
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      overlayLayer.clearLayers()
      map.remove()
      overlayLayerRef.current = null
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const overlayLayer = overlayLayerRef.current
    if (!map || !overlayLayer) {
      return
    }

    overlayLayer.clearLayers()
    const boundsPoints: L.LatLngTuple[] = []

    locations.forEach((loc, idx) => {
      const position: L.LatLngTuple = [loc.lat, loc.lng]
      boundsPoints.push(position)

      L.marker(position, { icon: blueIcon })
        .bindPopup(`<div class="font-semibold">${loc.name.split(',')[0]}</div><div class="text-xs opacity-60">Location ${idx + 1}</div>`)
        .addTo(overlayLayer)
    })

    if (midpoint) {
      const midpointTitle = midpointMode === 'routing' ? 'Road-based Midpoint' : 'Geographic Midpoint'
      const midpointSubtitle = midpointMode === 'routing' ? 'Optimized using road travel time.' : 'Calculated from average coordinates.'
      const midpointPosition: L.LatLngTuple = [midpoint.lat, midpoint.lng]

      boundsPoints.push(midpointPosition)

      L.marker(midpointPosition, { icon: goldIcon })
        .bindPopup(`<div style="font-weight:700;color:#f59e0b;">${midpointTitle}</div><div style="font-size:12px;">${midpointSubtitle}</div>`)
        .addTo(overlayLayer)

      if (midpointMode === 'geographic') {
        locations.forEach((loc) => {
          L.polyline(
            [
              [loc.lat, loc.lng],
              [midpoint.lat, midpoint.lng]
            ],
            {
              color: '#f59e0b',
              weight: 2,
              dashArray: '5, 10',
              opacity: 0.7
            }
          ).addTo(overlayLayer)
        })
      }

      if (midpointMode === 'routing') {
        routePaths.forEach((routePath) => {
          routePath.coordinates.forEach((coordinate) => {
            boundsPoints.push(coordinate)
          })

          if (routePath.coordinates.length > 1) {
            L.polyline(routePath.coordinates, {
              color: '#f59e0b',
              weight: 4,
              opacity: 0.85,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(overlayLayer)
          }
        })
      }
    }

    if (boundsPoints.length > 1) {
      map.fitBounds(boundsPoints, {
        padding: [48, 48],
        maxZoom: 11
      })
    } else if (midpoint) {
      map.setView([midpoint.lat, midpoint.lng], 11)
    } else {
      map.setView(malaysiaCenter, 6)
    }

    requestAnimationFrame(() => {
      map.invalidateSize()
    })
  }, [locations, midpoint, midpointMode, routePaths])

  return <div ref={containerRef} className={`relative h-full w-full ${!isDark ? 'leaflet-light' : ''}`} />
}