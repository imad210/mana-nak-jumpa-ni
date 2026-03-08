'use client'

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-defaulticon-compatibility'
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css'
import { Location } from '@/lib/utils'
import { useEffect } from 'react'

const createIcon = (color: string) => new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
})

const blueIcon = createIcon('blue')
const goldIcon = createIcon('gold')

function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
    const map = useMap()
    useEffect(() => {
        map.setView(center, zoom)
    }, [center, zoom, map])
    return null
}

interface MapProps {
    locations: Location[]
    midpoint: Location | null
    isDark: boolean
}

export default function Map({ locations, midpoint, isDark }: MapProps) {
    const center: [number, number] = midpoint
        ? [midpoint.lat, midpoint.lng]
        : [4.2105, 101.9758]
    const zoom = midpoint ? 11 : 6

    const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

    const tileAttribution = isDark
        ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'

    return (
        <div className={`relative w-full h-full${!isDark ? ' leaflet-light' : ''}`}>
            <MapContainer
                center={center}
                zoom={zoom}
                scrollWheelZoom={true}
                className="h-full w-full"
                zoomControl={false}
            >
                <TileLayer
                    key={tileUrl}
                    attribution={tileAttribution}
                    url={tileUrl}
                />

                <ChangeView center={center} zoom={zoom} />

                {locations.map((loc, idx) => (
                    <Marker key={idx} position={[loc.lat, loc.lng]} icon={blueIcon}>
                        <Popup>
                            <div className="font-semibold">{loc.name.split(',')[0]}</div>
                            <div className="text-xs opacity-60">Location {idx + 1}</div>
                        </Popup>
                    </Marker>
                ))}

                {midpoint && (
                    <Marker position={[midpoint.lat, midpoint.lng]} icon={goldIcon}>
                        <Popup>
                            <div className="font-bold" style={{ color: '#f59e0b' }}>Suggested Midpoint</div>
                            <div className="text-xs">Perfect place to meet!</div>
                        </Popup>
                    </Marker>
                )}

                {midpoint &&
                    locations.map((loc, idx) => (
                        <Polyline
                            key={`line-${idx}`}
                            positions={[
                                [loc.lat, loc.lng],
                                [midpoint.lat, midpoint.lng],
                            ]}
                            pathOptions={{
                                color: '#f59e0b',
                                weight: 2,
                                dashArray: '5, 10',
                                opacity: 0.7,
                            }}
                        />
                    ))}
            </MapContainer>
        </div>
    )
}
