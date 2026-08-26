'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  Search,
  MapPin,
  Users,
  X,
  Loader2,
  Navigation,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Bot,
  ExternalLink,
  CheckCircle2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  type Location,
  type MidpointComputation,
  type MidpointMode,
  type NearbyPlace,
  type RoutePath,
  searchLocation,
  calculateMidpoint,
  getNearbyLocalities,
  getRoutingMidpoint
} from '@/lib/utils'
import { buildMidpointComparison, buildPlanSnapshot, getLocationsKey } from '@/lib/meetup-planner'
import { registerMeetupTools, WebMcpActionError, type WebMcpActions } from '@/lib/webmcp'

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-950">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  )
})

function formatDuration(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) {
    return '--'
  }

  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }

  const roundedMinutes = Math.round(seconds / 60)
  const hours = Math.floor(roundedMinutes / 60)
  const minutes = roundedMinutes % 60

  if (hours === 0) {
    return `${roundedMinutes} min`
  }

  if (minutes === 0) {
    return `${hours}h`
  }

  return `${hours}h ${minutes}m`
}

function formatDistance(distanceKm?: number | null) {
  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return '--'
  }

  return `${distanceKm.toFixed(1)} km`
}

function getLocationLabel(name: string) {
  return name.split(',')[0]?.trim() || name
}

export default function Home() {
  const [locations, setLocations] = useState<Location[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Location[]>([])
  const [isDark, setIsDark] = useState(true)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)
  const [isMcpGuideOpen, setIsMcpGuideOpen] = useState(false)
  const [midpointMode, setMidpointMode] = useState<MidpointMode>('geographic')
  const [routingMidpoint, setRoutingMidpoint] = useState<MidpointComputation | null>(null)
  const [isRoutingMidpointLoading, setIsRoutingMidpointLoading] = useState(false)
  const [routingMidpointError, setRoutingMidpointError] = useState<string | null>(null)
  const [routePaths, setRoutePaths] = useState<RoutePath[]>([])
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([])
  const [isFetchingNearby, setIsFetchingNearby] = useState(false)
  const [isWebMcpReady, setIsWebMcpReady] = useState(false)
  const locationsRef = useRef<Location[]>([])
  const midpointModeRef = useRef<MidpointMode>('geographic')
  const routingMidpointRef = useRef<MidpointComputation | null>(null)
  const nearbyPlacesRef = useRef<NearbyPlace[]>([])
  const revisionRef = useRef(0)
  const routingCacheRef = useRef<{
    locationsKey: string
    midpoint: MidpointComputation
    routePaths: RoutePath[]
    routePathWarning?: string
  } | null>(null)

  const geographicMidpoint = useMemo(() => {
    if (locations.length < 2) return null
    return calculateMidpoint(locations)
  }, [locations])

  const locationsKey = useMemo(() => getLocationsKey(locations), [locations])

  const clearRoutingState = useCallback(() => {
    routingMidpointRef.current = null
    routingCacheRef.current = null
    setRoutingMidpoint(null)
    setRoutingMidpointError(null)
    setIsRoutingMidpointLoading(false)
    setRoutePaths([])
    nearbyPlacesRef.current = []
    setNearbyPlaces([])
  }, [])

  const updateLocations = useCallback((nextLocations: Location[], resetToGeographic = false) => {
    const normalizedLocations = nextLocations.map((location) => ({ ...location }))
    locationsRef.current = normalizedLocations
    setLocations(normalizedLocations)
    revisionRef.current += 1
    clearRoutingState()

    if (resetToGeographic) {
      midpointModeRef.current = 'geographic'
      setMidpointMode('geographic')
    }

    return {
      participantCount: normalizedLocations.length,
      participants: normalizedLocations,
      status: normalizedLocations.length >= 2 ? 'ready' : 'empty'
    }
  }, [clearRoutingState])

  const selectMidpointMode = useCallback((mode: MidpointMode) => {
    if (midpointModeRef.current !== mode) {
      midpointModeRef.current = mode
      setMidpointMode(mode)
      revisionRef.current += 1
      nearbyPlacesRef.current = []
      setNearbyPlaces([])
    }

    if (mode === 'geographic') {
      setRoutePaths([])
    }
  }, [])

  const loadRoutingResult = useCallback(async (requestedLocations: Location[]) => {
    const requestedKey = getLocationsKey(requestedLocations)
    const cached = routingCacheRef.current
    if (cached?.locationsKey === requestedKey) {
      return cached
    }

    const result = await getRoutingMidpoint(requestedLocations)
    if (getLocationsKey(locationsRef.current) !== requestedKey) {
      throw new WebMcpActionError('comparison_superseded', 'Participants changed while the midpoint was being calculated.', true)
    }

    const nextCache = {
      locationsKey: requestedKey,
      midpoint: result.midpoint,
      routePaths: result.routePaths,
      ...(result.routePathWarning ? { routePathWarning: result.routePathWarning } : {})
    }
    routingCacheRef.current = nextCache
    return nextCache
  }, [])

  useEffect(() => {
    routingMidpointRef.current = null
    routingCacheRef.current = null
    setRoutingMidpoint(null)
    setRoutingMidpointError(null)
    setIsRoutingMidpointLoading(false)
    setRoutePaths([])
  }, [locationsKey])

  useEffect(() => {
    if (midpointMode !== 'routing') {
      setIsRoutingMidpointLoading(false)
      setRoutingMidpointError(null)
      return
    }

    if (locations.length < 2 || !geographicMidpoint) {
      setRoutingMidpoint(null)
      setIsRoutingMidpointLoading(false)
      return
    }

    let cancelled = false

    async function loadRoutingMidpoint() {
      setIsRoutingMidpointLoading(true)
      setRoutingMidpointError(null)

      try {
        const result = await loadRoutingResult(locations)
        if (!cancelled) {
          routingMidpointRef.current = result.midpoint
          setRoutingMidpoint(result.midpoint)
          setRoutePaths(result.routePaths)
          setRoutingMidpointError(
            result.midpoint.fallbackToGeographic
              ? (result.midpoint.reason ?? 'Road-based midpoint unavailable.')
              : (result.routePathWarning ?? null)
          )
        }
      } catch (error) {
        if (!cancelled) {
          console.error('routing midpoint error:', error)
          setRoutePaths([])
          const fallback: MidpointComputation = {
            mode: 'routing',
            point: geographicMidpoint ?? calculateMidpoint(locations),
            fallbackToGeographic: true,
            reason: 'Road-based midpoint unavailable. Showing geographic midpoint instead.'
          }
          routingMidpointRef.current = fallback
          setRoutingMidpoint(fallback)
          setRoutingMidpointError('Road-based midpoint unavailable. Showing geographic midpoint instead.')
        }
      } finally {
        if (!cancelled) {
          setIsRoutingMidpointLoading(false)
        }
      }
    }

    void loadRoutingMidpoint()

    return () => {
      cancelled = true
    }
  }, [midpointMode, locations, geographicMidpoint, loadRoutingResult])

  const activeMidpointComputation = useMemo<MidpointComputation | null>(() => {
    if (!geographicMidpoint) {
      return null
    }

    if (midpointMode === 'routing') {
      return routingMidpoint ?? { mode: 'routing', point: geographicMidpoint }
    }

    return {
      mode: 'geographic',
      point: geographicMidpoint
    }
  }, [geographicMidpoint, midpointMode, routingMidpoint])

  const midpoint = activeMidpointComputation?.point ?? null
  const midpointLat = midpoint?.lat
  const midpointLng = midpoint?.lng
  const routingMetrics = midpointMode === 'routing' ? routingMidpoint?.metrics : undefined
  const routingSearch = midpointMode === 'routing' ? routingMidpoint?.routingSearch : undefined
  const hasCompleteRoutingMetrics = !!routingMetrics &&
    routingMetrics.perLocationDurationSec.length === locations.length &&
    routingMetrics.perLocationDistanceKm.length === locations.length
  const showRoutingMetrics = midpointMode === 'routing' && !routingMidpoint?.fallbackToGeographic && hasCompleteRoutingMetrics
  const primaryNearbyPlace = nearbyPlaces[0]?.name

  useEffect(() => {
    if (midpointLat == null || midpointLng == null) {
      nearbyPlacesRef.current = []
      setNearbyPlaces([])
      setIsFetchingNearby(false)
      return
    }

    const lat = midpointLat
    const lng = midpointLng
    let cancelled = false

    async function loadNearbyPlaces() {
      setIsFetchingNearby(true)
      setNearbyPlaces([])

      try {
        const places = await getNearbyLocalities(lat, lng)
        if (!cancelled) {
          nearbyPlacesRef.current = places
          setNearbyPlaces(places)
        }
      } finally {
        if (!cancelled) {
          setIsFetchingNearby(false)
        }
      }
    }

    void loadNearbyPlaces()

    return () => {
      cancelled = true
    }
  }, [midpointLat, midpointLng])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setIsSearching(true)
    const results = await searchLocation(searchQuery)
    setSearchResults(results)
    setIsSearching(false)
  }

  const addLocation = (loc: Location) => {
    if (locationsRef.current.length >= 10) return
    if (locationsRef.current.some((location) => location.lat === loc.lat && location.lng === loc.lng)) return
    updateLocations([...locationsRef.current, loc])
    setSearchQuery('')
    setSearchResults([])
  }

  const removeLocation = (index: number) => {
    updateLocations(locationsRef.current.filter((_, i) => i !== index))
  }

  const getCurrentPlan = useCallback(() => buildPlanSnapshot({
    revision: revisionRef.current,
    locations: locationsRef.current,
    selectedMode: midpointModeRef.current,
    routingResult: routingMidpointRef.current,
    nearbyPlaces: nearbyPlacesRef.current
  }), [])

  const compareMidpointModes = useCallback(async () => {
    const currentLocations = locationsRef.current.map((location) => ({ ...location }))
    if (currentLocations.length < 2) {
      throw new WebMcpActionError('participants_required', 'Add at least two participants before comparing midpoint modes.')
    }

    const result = await loadRoutingResult(currentLocations)
    return buildMidpointComparison(currentLocations, result.midpoint)
  }, [loadRoutingResult])

  const applyMeetupPlan = useCallback(async (mode: MidpointMode, expectedRevision?: number) => {
    if (expectedRevision != null && expectedRevision !== revisionRef.current) {
      throw new WebMcpActionError('stale_revision', 'The meetup plan changed after it was compared. Read the current plan and try again.')
    }

    const currentLocations = locationsRef.current.map((location) => ({ ...location }))
    if (currentLocations.length < 2) {
      throw new WebMcpActionError('participants_required', 'Add at least two participants before applying a meetup plan.')
    }

    if (mode === 'geographic') {
      const previousMode = midpointModeRef.current
      selectMidpointMode('geographic')
      if (previousMode === 'geographic') revisionRef.current += 1
      return getCurrentPlan()
    }

    const result = await loadRoutingResult(currentLocations)
    routingMidpointRef.current = result.midpoint
    setRoutingMidpoint(result.midpoint)
    setRoutePaths(result.routePaths)
    setRoutingMidpointError(
      result.midpoint.fallbackToGeographic
        ? (result.midpoint.reason ?? 'Road-based midpoint unavailable.')
        : (result.routePathWarning ?? null)
    )
    const previousMode = midpointModeRef.current
    selectMidpointMode('routing')
    if (previousMode === 'routing') revisionRef.current += 1
    return getCurrentPlan()
  }, [getCurrentPlan, loadRoutingResult, selectMidpointMode])

  const webMcpActions = useMemo<WebMcpActions>(() => ({
    getRevision: () => revisionRef.current,
    searchLocations: searchLocation,
    setParticipants: (participants) => updateLocations(participants, true),
    getCurrentPlan,
    compareMidpointModes,
    applyMeetupPlan
  }), [applyMeetupPlan, compareMidpointModes, getCurrentPlan, updateLocations])

  useEffect(() => {
    if (typeof document.modelContext?.registerTool !== 'function') {
      setIsWebMcpReady(false)
      return
    }

    const controller = new AbortController()
    let active = true

    void registerMeetupTools(document.modelContext, webMcpActions, controller.signal)
      .then(() => {
        if (active) setIsWebMcpReady(true)
      })
      .catch((error) => {
        if (active && !controller.signal.aborted) {
          console.error('[webmcp] registration failed:', error)
          setIsWebMcpReady(false)
        }
      })

    return () => {
      active = false
      controller.abort()
      setIsWebMcpReady(false)
    }
  }, [webMcpActions])

  useEffect(() => {
    if (!isMcpGuideOpen) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMcpGuideOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isMcpGuideOpen])

  const main = isDark
    ? 'relative h-screen w-screen overflow-hidden flex flex-col md:flex-row bg-zinc-950'
    : 'relative h-screen w-screen overflow-hidden flex flex-col md:flex-row bg-slate-100'

  const sidebarShell = isDark
    ? 'bg-zinc-900/88 border-white/10 shadow-2xl'
    : 'bg-white/95 border-slate-200 shadow-xl'

  const titleText = isDark ? 'text-white' : 'text-slate-800'
  const subtitleText = isDark ? 'text-zinc-500' : 'text-slate-400'

  const inputClass = isDark
    ? 'w-full bg-zinc-800/60 border border-white/10 rounded-xl py-3 px-4 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm text-white placeholder:text-zinc-500'
    : 'w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-all text-sm text-slate-800 placeholder:text-slate-400'

  const searchDropdown = isDark
    ? 'absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl'
    : 'absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 bg-white backdrop-blur-md border border-slate-200 rounded-xl overflow-hidden shadow-xl'

  const searchDropdownItem = isDark
    ? 'w-full text-left p-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 truncate text-sm flex items-center gap-2 text-zinc-200'
    : 'w-full text-left p-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 truncate text-sm flex items-center gap-2 text-slate-700'

  const locationItemClass = isDark
    ? 'group rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all'
    : 'group rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all'

  const locationNameClass = isDark ? 'text-sm font-medium text-white' : 'text-sm font-medium text-slate-700'
  const emptyStateClass = isDark ? 'text-zinc-600' : 'text-slate-300'
  const emptyTextClass = isDark ? 'text-sm font-medium text-center text-zinc-500' : 'text-sm font-medium text-center text-slate-400'

  const toggleBtnClass = isDark
    ? 'p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/10 transition-all'
    : 'p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 border border-slate-200 transition-all'

  const floatingCreditClass = isDark
    ? 'absolute bottom-6 right-6 z-10 p-2 px-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-lg text-[10px] font-medium text-zinc-500'
    : 'absolute bottom-6 right-6 z-10 p-2 px-3 bg-white/80 backdrop-blur-md border border-slate-200 rounded-lg text-[10px] font-medium text-slate-400'

  const midpointCard = isDark
    ? 'p-4 rounded-2xl bg-gradient-to-br from-amber-500/30 to-blue-600/25 border border-amber-500/30 backdrop-blur-md'
    : 'p-4 rounded-2xl bg-gradient-to-br from-amber-400/25 to-blue-500/20 border border-amber-400/40 backdrop-blur-md'

  const midpointTagText = 'text-[10px] uppercase font-bold tracking-widest text-amber-400'
  const midpointHeading = isDark ? 'font-bold text-lg text-white' : 'font-bold text-lg text-slate-800'
  const midpointDesc = isDark ? 'text-xs text-zinc-200 mb-4' : 'text-xs text-slate-600 mb-4'
  const midpointCoordBox = isDark
    ? 'p-2 rounded-lg bg-black/50 border border-white/10 text-[11px] font-medium text-zinc-200'
    : 'p-2 rounded-lg bg-white/60 border border-slate-200 text-[11px] font-medium text-slate-700'

  const railBadge = isDark
    ? 'flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200 shadow-[0_10px_30px_rgba(0,0,0,0.25)]'
    : 'flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.08)]'

  const railDivider = isDark ? 'bg-white/8' : 'bg-slate-200'

  const modeSwitchShell = isDark
    ? 'grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/30 p-1'
    : 'grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-100/80 p-1'

  const getModeButtonClass = (mode: MidpointMode) => {
    const isActive = midpointMode === mode

    if (isActive) {
      return isDark
        ? 'rounded-xl bg-blue-500 px-3 py-2.5 text-xs font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)] transition-all'
        : 'rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,0.2)] transition-all'
    }

    return isDark
      ? 'rounded-xl px-3 py-2.5 text-xs font-medium text-zinc-300 transition-all hover:bg-white/5'
      : 'rounded-xl px-3 py-2.5 text-xs font-medium text-slate-500 transition-all hover:bg-white'
  }

  const statBoxClass = isDark
    ? 'rounded-xl border border-white/10 bg-black/35 p-3'
    : 'rounded-xl border border-slate-200 bg-white/70 p-3'

  const statLabelClass = isDark ? 'text-[10px] uppercase tracking-[0.18em] text-zinc-500' : 'text-[10px] uppercase tracking-[0.18em] text-slate-400'
  const statValueClass = isDark ? 'mt-1 text-sm font-semibold text-white' : 'mt-1 text-sm font-semibold text-slate-800'
  const locationMetricPillClass = isDark
    ? 'rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[11px] font-medium text-zinc-200'
    : 'rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-700'

  const midpointModeLabel = midpointMode === 'routing' ? 'Road-Based Midpoint' : 'Geographic Midpoint'
  const midpointDescription = midpointMode === 'routing'
    ? routingSearch?.strategy === 'directed-route-half-duration'
      ? 'Half-duration point along the directed route between the two participants.'
      : 'Optimized to reduce the longest road journey, then total group travel time.'
    : `Coordinate-average center for all ${locations.length} participants.`

  const sidebarContent = (
    <>
      <div>
        <h1 className={`text-xl font-bold tracking-tight ${titleText}`}>Mana nak lepak ni?</h1>
        <p className={`text-xs mt-1 ${subtitleText}`}>Find fair meeting spots for everyone</p>
        {isWebMcpReady && (
          <span className={`mt-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Agent tools ready
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setIsMcpGuideOpen(true)}
        className={`group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all ${isDark
          ? 'border-blue-400/20 bg-blue-400/10 hover:border-blue-400/40 hover:bg-blue-400/15'
          : 'border-blue-200 bg-blue-50 hover:border-blue-300 hover:bg-blue-100'
          }`}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isDark ? 'bg-blue-400/15 text-blue-300' : 'bg-white text-blue-600'}`}>
          <Bot className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-xs font-semibold ${titleText}`}>Connect with WebMCP</span>
          <span className={`mt-0.5 block text-[11px] ${subtitleText}`}>
            Setup steps and example prompt
          </span>
        </span>
        <span className={`text-xs transition-transform group-hover:translate-x-0.5 ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>→</span>
      </button>

      <div className="flex flex-col gap-2">
        <div className={modeSwitchShell}>
          <button
            type="button"
            onClick={() => selectMidpointMode('geographic')}
            className={getModeButtonClass('geographic')}
          >
            Geographic
          </button>
          <button
            type="button"
            onClick={() => selectMidpointMode('routing')}
            className={getModeButtonClass('routing')}
          >
            Road-based
          </button>
        </div>
        <p className={`text-[11px] ${subtitleText}`}>
          Switch between straight geographic averaging and a fairness-based road midpoint.
        </p>
      </div>

      <div className="relative">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            placeholder="Search location korang dari mana (e.g. Putrajaya)"
            className={inputClass}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            type="submit"
            className="absolute right-2 top-2 p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          </button>
        </form>

        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={searchDropdown}
            >
              {searchResults.map((loc, i) => (
                <button
                  type="button"
                  key={`${loc.lat}-${loc.lng}-${i}`}
                  onClick={() => addLocation(loc)}
                  className={searchDropdownItem}
                >
                  <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="truncate">{loc.name}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-3">
        {locations.length > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <p className={`text-[10px] uppercase font-bold tracking-widest ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                Selected Places
              </p>
              <span className={`text-[11px] ${subtitleText}`}>{locations.length} places</span>
            </div>

            <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-3 pr-1">
              {locations.map((loc, i) => {
                const duration = showRoutingMetrics && routingMetrics ? routingMetrics.perLocationDurationSec[i] : null
                const distance = showRoutingMetrics && routingMetrics ? routingMetrics.perLocationDistanceKm[i] : null

                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={locationItemClass}
                    key={`${loc.lat}-${loc.lng}-${i}`}
                  >
                    <div className="flex items-start gap-3 p-3">
                      <div className="mt-1 w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] shrink-0" />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <span className={`${locationNameClass} min-w-0`}>{getLocationLabel(loc.name)}</span>
                          <button
                            type="button"
                            onClick={() => removeLocation(i)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/20 text-red-400 transition-all shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {showRoutingMetrics && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className={locationMetricPillClass}>{formatDuration(duration)}</span>
                            <span className={locationMetricPillClass}>{formatDistance(distance)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </>
        ) : (
          <div className={`flex flex-col items-center justify-center gap-4 py-10 ${emptyStateClass}`}>
            <Users className="w-12 h-12 opacity-20" />
            <p className={emptyTextClass}>Add up to 10 places to find<br />the perfect meet-up midpoint</p>
          </div>
        )}
      </div>

      {midpoint && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={midpointCard}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]">
              <MapPin className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <span className={midpointTagText}>{midpointModeLabel}</span>
              <h3 className={midpointHeading}>Lepak sini jom</h3>
            </div>
          </div>

          <p className={midpointDesc}>{midpointDescription}</p>

          {routingSearch?.strategy === 'multi-ring-refinement' && (
            <div className={`mb-4 rounded-xl border px-3 py-2 text-[11px] ${isDark ? 'border-blue-400/20 bg-blue-400/10 text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
              Multi-ring search: {routingSearch.stage1CandidateCount} broad + {routingSearch.stage2CandidateCount} refined candidates
              {!routingSearch.stage2Completed ? ' (broad winner retained)' : ''}
            </div>
          )}

          {primaryNearbyPlace && (
            <div className={`mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${isDark ? 'border-white/10 bg-white/8 text-zinc-100' : 'border-slate-200 bg-white/70 text-slate-700'}`}>
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Near {primaryNearbyPlace}
            </div>
          )}

          {midpointMode === 'routing' && (isRoutingMidpointLoading || routingMidpointError) && (
            <div className={`mb-4 rounded-xl border px-3 py-2 text-xs ${isDark ? 'border-white/10 bg-black/30 text-zinc-300' : 'border-slate-200 bg-white/70 text-slate-600'}`}>
              {isRoutingMidpointLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Calculating road-based midpoint...
                </span>
              ) : (
                routingMidpointError
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className={midpointCoordBox}>LAT: {midpoint.lat.toFixed(4)}</div>
            <div className={midpointCoordBox}>LNG: {midpoint.lng.toFixed(4)}</div>
          </div>

          {showRoutingMetrics && routingMetrics && (
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div className={statBoxClass}>
                <p className={statLabelClass}>Longest Journey</p>
                <p className={statValueClass}>{formatDuration(routingMetrics.maximumDurationSec)}</p>
              </div>
              <div className={statBoxClass}>
                <p className={statLabelClass}>Time Spread</p>
                <p className={statValueClass}>{formatDuration(routingMetrics.durationSpreadSec)}</p>
              </div>
              <div className={statBoxClass}>
                <p className={statLabelClass}>Total Travel Time</p>
                <p className={statValueClass}>{formatDuration(routingMetrics.totalDurationSec)}</p>
              </div>
              <div className={statBoxClass}>
                <p className={statLabelClass}>Total Road Distance</p>
                <p className={statValueClass}>{formatDistance(routingMetrics.totalDistanceKm)}</p>
              </div>
            </div>
          )}

          <div>
            <p className={`text-[10px] uppercase font-bold tracking-widest mb-2 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
              Suggested Spots
            </p>
            {isFetchingNearby ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                Finding nearby spots...
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {nearbyPlaces.map((place, i) => (
                  <motion.span
                    key={`${place.name}-${i}`}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.07 }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-default ${isDark
                      ? 'bg-white/8 border-white/10 text-zinc-200 hover:bg-white/15'
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                      }`}
                    title={`~${place.distanceKm.toFixed(1)} km from midpoint`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    {place.name}
                    <span className={`text-[9px] ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                      {place.distanceKm.toFixed(1)}km
                    </span>
                  </motion.span>
                ))}
                {!isFetchingNearby && nearbyPlaces.length === 0 && (
                  <span className={`text-xs ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>
                    No suggestions found.
                  </span>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </>
  )

  return (
    <main className={main}>
      <div className={`absolute inset-x-0 top-0 z-30 md:hidden ${sidebarShell}`}>
        <div className={`border-b backdrop-blur-md ${sidebarShell}`}>
          <div className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 shrink-0">
              <Navigation className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className={`text-lg font-bold tracking-tight ${titleText}`}>Mana nak lepak ni?</h1>
              <p className={`text-xs ${subtitleText}`}>{isWebMcpReady ? 'Agent tools ready' : 'Find fair meeting spots for everyone'}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              className={toggleBtnClass}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
              className={toggleBtnClass}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          <AnimatePresence initial={false}>
            {!isSidebarCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: '70vh', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="flex h-full flex-col gap-5 overflow-y-auto custom-scrollbar p-4">
                  {sidebarContent}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <motion.div
        animate={{ width: isSidebarCollapsed ? 96 : 384 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className={`absolute inset-y-0 left-0 z-20 hidden border-r backdrop-blur-md overflow-hidden md:block ${sidebarShell}`}
      >
        <div className="relative flex h-full w-full">
          <div className={`flex h-full w-24 shrink-0 flex-col items-center justify-between border-r p-4 ${isDark ? 'border-white/10 bg-black/10' : 'border-slate-200 bg-white/30'}`}>
            <div className="flex flex-col items-center gap-4">
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                <Navigation className="w-6 h-6" />
              </div>

              <button
                type="button"
                onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
                className={toggleBtnClass}
                title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>

              <div className={`h-px w-10 ${railDivider}`} />

              <div className={railBadge} title="Saved locations">
                <Users className="w-4 h-4" />
              </div>

              <div className={railBadge} title={`${locations.length} locations`}>
                <span className="text-xs font-semibold">{locations.length}</span>
              </div>

              <button
                type="button"
                onClick={() => setIsMcpGuideOpen(true)}
                className={`${railBadge} transition-colors ${isDark ? 'hover:border-blue-400/40 hover:text-blue-300' : 'hover:border-blue-300 hover:text-blue-600'}`}
                title="Connect with WebMCP"
                aria-label="Open WebMCP integration guide"
              >
                <Bot className="w-4 h-4" />
              </button>

              {midpoint && (
                <div className={railBadge} title={`${midpointModeLabel} available`}>
                  <MapPin className="w-4 h-4 text-amber-400" />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              className={toggleBtnClass}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          <motion.div
            animate={{ width: isSidebarCollapsed ? 0 : 288, opacity: isSidebarCollapsed ? 0 : 1 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="h-full overflow-hidden"
          >
            <div className="flex h-full w-72 flex-col gap-5 overflow-y-auto custom-scrollbar p-6">
              {sidebarContent}
            </div>
          </motion.div>
        </div>
      </motion.div>

      <div className="absolute inset-0 z-0 h-full w-full">
        <Map
          key={isDark ? 'map-dark' : 'map-light'}
          locations={locations}
          midpoint={midpoint}
          midpointMode={midpointMode}
          routePaths={routePaths}
          isDark={isDark}
        />
        <div className={floatingCreditClass}>Built for fair Malaysian meetups</div>
      </div>

      <AnimatePresence>
        {isMcpGuideOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsMcpGuideOpen(false)
            }}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="webmcp-guide-title"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border shadow-2xl ${isDark
                ? 'border-white/10 bg-zinc-950 text-zinc-100'
                : 'border-slate-200 bg-white text-slate-900'
                }`}
            >
              <div className={`sticky top-0 z-10 flex items-start justify-between gap-4 border-b p-5 backdrop-blur-xl ${isDark ? 'border-white/10 bg-zinc-950/90' : 'border-slate-200 bg-white/90'}`}>
                <div className="flex items-start gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${isDark ? 'bg-blue-400/15 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                    <Bot className="h-5 w-5" />
                  </span>
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>Site tools</p>
                    <h2 id="webmcp-guide-title" className="mt-1 text-xl font-bold">Use Mana Nak Lepak Ni with ChatGPT</h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMcpGuideOpen(false)}
                  className={`rounded-xl p-2 transition-colors ${isDark ? 'text-zinc-400 hover:bg-white/10 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}
                  aria-label="Close WebMCP integration guide"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-5 p-5">
                <div className={`flex items-start gap-3 rounded-2xl border p-4 ${isWebMcpReady
                  ? isDark ? 'border-emerald-400/25 bg-emerald-400/10' : 'border-emerald-200 bg-emerald-50'
                  : isDark ? 'border-amber-400/25 bg-amber-400/10' : 'border-amber-200 bg-amber-50'
                  }`}>
                  <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${isWebMcpReady ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <div>
                    <p className="text-sm font-semibold">
                      {isWebMcpReady ? 'Connected — 5 tools available' : 'Site tools not detected in this browser'}
                    </p>
                    <p className={`mt-1 text-xs leading-5 ${subtitleText}`}>
                      {isWebMcpReady
                        ? 'ChatGPT can discover the planner actions exposed by this page.'
                        : 'The app still works normally. Follow the steps below in ChatGPT’s built-in browser to use the agent integration.'}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold">How to connect</h3>
                  <ol className="mt-3 space-y-3">
                    {[
                      ['Update ChatGPT', 'Use the latest ChatGPT desktop app and select GPT-5.6 Sol or GPT-5.6 Terra.'],
                      ['Open this website', 'Open the deployed Mana Nak Lepak Ni URL in ChatGPT’s built-in browser.'],
                      ['Inspect Site tools', 'Select Site tools in the browser address bar, then open Available site tools. You should see five planner tools.'],
                      ['Ask ChatGPT to plan', 'Describe everyone’s starting locations and ask it to compare the geographic and road-based midpoint before applying your choice.']
                    ].map(([title, description], index) => (
                      <li key={title} className="flex gap-3">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isDark ? 'bg-white/10 text-zinc-200' : 'bg-slate-100 text-slate-700'}`}>
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{title}</p>
                          <p className={`mt-0.5 text-xs leading-5 ${subtitleText}`}>{description}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className={`rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-black/30' : 'border-slate-200 bg-slate-50'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${subtitleText}`}>Try this prompt</p>
                  <p className="mt-2 text-sm leading-6">
                    “Plan a fair meetup for friends coming from Bangi, Cyberjaya, and Shah Alam. Compare both midpoint modes, explain the longest journey, then ask me before applying the plan.”
                  </p>
                </div>

                <p className={`text-xs leading-5 ${subtitleText}`}>
                  No separate MCP server or API-key setup is required. These tools belong to the live page and share the same visible map state with you.
                </p>

                <a
                  href="https://learn.chatgpt.com/docs/webmcp"
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-2 text-xs font-semibold ${isDark ? 'text-blue-300 hover:text-blue-200' : 'text-blue-600 hover:text-blue-700'}`}
                >
                  Read the official Site tools guide
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
