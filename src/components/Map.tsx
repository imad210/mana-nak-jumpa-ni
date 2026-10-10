'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-defaulticon-compatibility'
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css'
import { DEFAULT_CENTER_LOCATION, type Location, type MidpointMode, type RoutePath } from '@/lib/utils'
import { getParticipantColor, getParticipantLetter, MIDPOINT_COLOR } from '@/lib/participant-style'

const starSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>'

const createParticipantIcon = (index: number) =>
  L.divIcon({
    className: 'mp-marker',
    html: `<div class="mp-pin" style="--pin:${getParticipantColor(index)}"><span>${getParticipantLetter(index)}</span></div>`,
    iconSize: [32, 40],
    iconAnchor: [16, 39],
    popupAnchor: [0, -36]
  })

const midpointIcon = L.divIcon({
  className: 'mp-marker',
  html: `<div class="mp-pulse"></div><div class="mp-pin mp-pin--midpoint" style="--pin:${MIDPOINT_COLOR}"><span>${starSvg}</span></div>`,
  iconSize: [40, 50],
  iconAnchor: [20, 48],
  popupAnchor: [0, -44]
})

const malaysiaCenter: L.LatLngExpression = [DEFAULT_CENTER_LOCATION.lat, DEFAULT_CENTER_LOCATION.lng]
const malaysiaBounds = L.latLngBounds(
  L.latLng(0.8, 98.0),
  L.latLng(7.6, 119.8)
)
const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character] ?? character)
}

interface MapProps {
  locations: Location[]
  midpoint: Location | null
  midpointMode: MidpointMode
  routePaths: RoutePath[]
  isDark: boolean
  isPanelOpen?: boolean
}

/** Keep fitted content clear of the floating panel (left on desktop, bottom sheet on phones). */
function getFitPadding(isPanelOpen: boolean): Pick<L.FitBoundsOptions, 'paddingTopLeft' | 'paddingBottomRight'> {
  if (typeof window === 'undefined' || !isPanelOpen) {
    return { paddingTopLeft: [48, 48], paddingBottomRight: [48, 48] }
  }

  if (window.innerWidth >= 768) {
    return { paddingTopLeft: [432, 48], paddingBottomRight: [64, 48] }
  }

  return { paddingTopLeft: [32, 48], paddingBottomRight: [32, Math.round(window.innerHeight * 0.62)] }
}

export default function Map({ locations, midpoint, midpointMode, routePaths, isDark, isPanelOpen = true }: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayLayerRef = useRef<L.LayerGroup | null>(null)
  const isPanelOpenRef = useRef(isPanelOpen)

  useEffect(() => {
    isPanelOpenRef.current = isPanelOpen
  }, [isPanelOpen])

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

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    L.tileLayer(tileUrl, {
      attribution,
      className: 'map-base-tile',
      referrerPolicy: 'strict-origin-when-cross-origin'
    }).addTo(map)

    const overlayLayer = L.layerGroup().addTo(map)
    mapRef.current = map
    overlayLayerRef.current = overlayLayer

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({
        pan: false,
        animate: false
      })
    })

    resizeObserver.observe(containerRef.current)
    map.fitBounds(malaysiaBounds, {
      ...getFitPadding(isPanelOpenRef.current),
      maxZoom: 6
    })

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

      L.marker(position, { icon: createParticipantIcon(idx), zIndexOffset: 100 })
        .bindPopup(`<div class="mp-popup-title">${escapeHtml(loc.name.split(',')[0])}</div><div class="mp-popup-sub">Place ${getParticipantLetter(idx)}</div>`)
        .addTo(overlayLayer)
    })

    if (midpoint) {
      const midpointTitle = midpointMode === 'routing' ? 'Road-based Midpoint' : 'Geographic Midpoint'
      const midpointSubtitle = midpointMode === 'routing' ? 'Calculated using road travel data.' : 'Calculated from average coordinates.'
      const midpointPosition: L.LatLngTuple = [midpoint.lat, midpoint.lng]

      boundsPoints.push(midpointPosition)

      L.marker(midpointPosition, { icon: midpointIcon, zIndexOffset: 1000 })
        .bindPopup(`<div class="mp-popup-title" style="color:${MIDPOINT_COLOR}">${midpointTitle}</div><div class="mp-popup-sub">${midpointSubtitle}</div>`)
        .addTo(overlayLayer)

      if (midpointMode === 'geographic') {
        locations.forEach((loc, idx) => {
          L.polyline(
            [
              [loc.lat, loc.lng],
              [midpoint.lat, midpoint.lng]
            ],
            {
              color: getParticipantColor(idx),
              weight: 2.5,
              dashArray: '6, 8',
              opacity: 0.8
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
              color: isDark ? '#0b0d12' : '#ffffff',
              weight: 8,
              opacity: 0.6,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(overlayLayer)

            L.polyline(routePath.coordinates, {
              color: getParticipantColor(routePath.originIndex),
              weight: 4.5,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(overlayLayer)
          }
        })
      }
    }

    if (boundsPoints.length > 1) {
      map.fitBounds(boundsPoints, {
        ...getFitPadding(isPanelOpenRef.current),
        maxZoom: 13
      })
    } else if (midpoint) {
      map.setView([midpoint.lat, midpoint.lng], 11)
    } else {
      map.fitBounds(malaysiaBounds, {
        ...getFitPadding(isPanelOpenRef.current),
        maxZoom: 6
      })
    }

    requestAnimationFrame(() => {
      map.invalidateSize({
        pan: false,
        animate: false
      })
    })
  }, [locations, midpoint, midpointMode, routePaths, isDark])

  return <div ref={containerRef} className={`relative h-full w-full ${isDark ? 'leaflet-dark-tiles' : 'leaflet-light'}`} />
}
