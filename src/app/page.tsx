'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  Search,
  MapPin,
  X,
  Loader2,
  Navigation,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Bot,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Check,
  Globe2,
  Plus,
  Route as RouteIcon,
  Sparkles,
  Trash2,
  AlertTriangle
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
import { getParticipantColor, getParticipantLetter } from '@/lib/participant-style'

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-zinc-950">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  )
})

const MAX_LOCATIONS = 10
const THEME_STORAGE_KEY = 'midpoint-theme'

const EXAMPLE_LOCATIONS: Location[] = [
  { name: 'Bandar Baru Bangi, Selangor, Malaysia', lat: 2.9635, lng: 101.7690 },
  { name: 'Cyberjaya, Selangor, Malaysia', lat: 2.9213, lng: 101.6559 },
  { name: 'Shah Alam, Selangor, Malaysia', lat: 3.0733, lng: 101.5185 }
]

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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [searchStatus, setSearchStatus] = useState<'idle' | 'empty'>('idle')
  const [hasCopied, setHasCopied] = useState(false)
  const searchBoxRef = useRef<HTMLDivElement | null>(null)
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
    setSearchStatus(results.length === 0 ? 'empty' : 'idle')
    setIsSearching(false)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setSearchStatus('idle')
  }

  const loadExample = () => {
    updateLocations(EXAMPLE_LOCATIONS)
    clearSearch()
  }

  const copyCoordinates = (point: Location) => {
    void navigator.clipboard?.writeText(`${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`).then(() => {
      setHasCopied(true)
      window.setTimeout(() => setHasCopied(false), 1600)
    })
  }

  const toggleTheme = () => {
    setIsDark((dark) => {
      const next = !dark
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light')
      } catch { }
      return next
    })
  }

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY)
    } catch { }
    const prefersDark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    setIsDark(prefersDark)
  }, [])

  useEffect(() => {
    if (searchResults.length === 0 && searchStatus === 'idle') return

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setSearchResults([])
        setSearchStatus('idle')
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [searchResults.length, searchStatus])

  const addLocation = (loc: Location) => {
    if (locationsRef.current.length >= MAX_LOCATIONS) return
    if (locationsRef.current.some((location) => location.lat === loc.lat && location.lng === loc.lng)) return
    updateLocations([...locationsRef.current, loc])
    clearSearch()
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

  const isPanelOpen = !isSidebarCollapsed
  const canSearch = locations.length < MAX_LOCATIONS
  const longestIndex = showRoutingMetrics && routingMetrics
    ? routingMetrics.perLocationDurationSec.indexOf(Math.max(...routingMetrics.perLocationDurationSec))
    : -1

  const midpointModeLabel = midpointMode === 'routing' ? 'Road-Based Midpoint' : 'Geographic Midpoint'
  const midpointDescription = midpointMode === 'routing'
    ? routingSearch?.strategy === 'directed-route-half-duration'
      ? 'Half-duration point along the directed route between the two participants.'
      : 'Optimized to reduce the longest road journey, then total group travel time.'
    : `Coordinate-average center for all ${locations.length} participants.`

  const panelSummary = locations.length === 0
    ? 'Find fair meeting spots for everyone'
    : midpoint
      ? primaryNearbyPlace ? `${locations.length} places · near ${primaryNearbyPlace}` : `${locations.length} places · midpoint ready`
      : `${locations.length} place · add one more`

  const iconButton = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
  const sectionLabel = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-zinc-500'
  const statBox = 'rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-black/25'

  const themeToggle = (
    <button
      type="button"
      onClick={toggleTheme}
      className={iconButton}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )

  const agentButton = (
    <button
      type="button"
      onClick={() => setIsMcpGuideOpen(true)}
      className={`${iconButton} relative`}
      title="Connect with WebMCP"
      aria-label="Open WebMCP integration guide"
    >
      <Bot className="h-4 w-4" />
      {isWebMcpReady && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400 dark:border-zinc-900" />
      )}
    </button>
  )

  const brandMark = (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
      <Navigation className="h-5 w-5" />
    </div>
  )

  const panelBody = (
    <div className="flex flex-col gap-6">
      {/* Step 1 — add places */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className={sectionLabel}>Where is everyone coming from?</h2>
          <span className="text-[11px] font-medium tabular-nums text-slate-400 dark:text-zinc-500">
            {locations.length}/{MAX_LOCATIONS}
          </span>
        </div>

        <div className="relative" ref={searchBoxRef}>
          <form onSubmit={handleSearch} className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
            <input
              type="text"
              enterKeyHint="search"
              placeholder={canSearch ? 'Search a town, e.g. Putrajaya' : 'Maximum of 10 places reached'}
              aria-label="Search for a place in Malaysia"
              disabled={!canSearch}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-24 text-sm text-slate-800 transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-blue-400/60 dark:focus:bg-white/[0.07]"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSearchStatus('idle')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') clearSearch()
              }}
            />
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-600 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={!canSearch || !searchQuery.trim() || isSearching}
                className="inline-flex h-9 items-center justify-center rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 disabled:bg-blue-600/40 disabled:text-white/70"
                aria-label="Search"
              >
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find'}
              </button>
            </div>
          </form>

          <AnimatePresence>
            {(searchResults.length > 0 || searchStatus === 'empty') && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900"
              >
                {searchResults.length > 0 ? (
                  <ul className="max-h-72 overflow-y-auto custom-scrollbar py-1">
                    {searchResults.map((loc, i) => {
                      const alreadyAdded = locations.some((location) => location.lat === loc.lat && location.lng === loc.lng)
                      const [primary, ...rest] = loc.name.split(',')
                      return (
                        <li key={`${loc.lat}-${loc.lng}-${i}`}>
                          <button
                            type="button"
                            onClick={() => addLocation(loc)}
                            disabled={alreadyAdded}
                            className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:hover:bg-white/5 dark:focus-visible:bg-white/5"
                          >
                            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                              <MapPin className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-800 dark:text-zinc-100">{primary.trim()}</span>
                              <span className="block truncate text-xs text-slate-400 dark:text-zinc-500">{rest.join(',').trim() || 'Malaysia'}</span>
                            </span>
                            <span className="mt-1 shrink-0 text-[11px] font-semibold text-blue-600 dark:text-blue-300">
                              {alreadyAdded ? 'Added' : <Plus className="h-4 w-4" />}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-sm text-slate-500 dark:text-zinc-400">
                    No places found. Try a nearby town or landmark.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {locations.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {locations.map((loc, i) => {
                  const duration = showRoutingMetrics && routingMetrics ? routingMetrics.perLocationDurationSec[i] : null
                  const distance = showRoutingMetrics && routingMetrics ? routingMetrics.perLocationDistanceKm[i] : null
                  const [primary, ...rest] = loc.name.split(',')

                  return (
                    <motion.li
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.18 }}
                      key={`${loc.lat}-${loc.lng}-${locations.slice(0, i).filter((other) => other.lat === loc.lat && other.lng === loc.lng).length}`}
                      className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-2.5 pr-2 transition-colors hover:border-slate-300 dark:border-white/[0.07] dark:bg-white/[0.04] dark:hover:border-white/15"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm"
                        style={{ backgroundColor: getParticipantColor(i) }}
                        aria-hidden="true"
                      >
                        {getParticipantLetter(i)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-zinc-100" title={loc.name}>
                          {getLocationLabel(loc.name) || primary}
                        </p>
                        {showRoutingMetrics ? (
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
                            <Clock className="h-3 w-3" />
                            <span className="font-medium text-slate-700 dark:text-zinc-200">{formatDuration(duration)}</span>
                            <span className="text-slate-300 dark:text-zinc-600">·</span>
                            {formatDistance(distance)}
                            {i === longestIndex && locations.length > 1 && (
                              <span className="ml-1 rounded-md bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                                Longest
                              </span>
                            )}
                          </p>
                        ) : (
                          <p className="truncate text-xs text-slate-400 dark:text-zinc-500">{rest.join(',').trim() || 'Malaysia'}</p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeLocation(i)}
                        className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 dark:text-zinc-600 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                        aria-label={`Remove ${getLocationLabel(loc.name)}`}
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>

            <div className="flex items-center justify-between">
              {locations.length < 2 ? (
                <p className="text-xs text-slate-500 dark:text-zinc-400">Add one more place to find the midpoint.</p>
              ) : <span />}
              <button
                type="button"
                onClick={() => updateLocations([])}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-zinc-500 dark:hover:bg-white/5 dark:hover:text-zinc-200"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear all
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 p-4 dark:border-white/10">
            <ol className="space-y-3">
              {[
                ['Add where everyone is coming from', 'Search 2 to 10 towns, cities or landmarks.'],
                ['Pick a midpoint style', 'Straight-line centre or fair road travel time.'],
                ['Lepak!', 'We suggest nearby areas to meet up.']
              ].map(([title, description], index) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-zinc-200">{title}</p>
                    <p className="text-xs text-slate-400 dark:text-zinc-500">{description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={loadExample}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:border-blue-400/40 dark:hover:text-blue-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Try an example (Bangi, Cyberjaya, Shah Alam)
            </button>
          </div>
        )}
      </section>

      {/* Step 2 — midpoint mode */}
      <section className="flex flex-col gap-3">
        <h2 className={sectionLabel}>How should we find the middle?</h2>
        <div role="radiogroup" aria-label="Midpoint mode" className="grid grid-cols-2 gap-2">
          {([
            ['geographic', Globe2, 'Geographic', 'Straight-line centre'],
            ['routing', RouteIcon, 'Road-based', 'Fair travel time']
          ] as const).map(([mode, Icon, label, hint]) => {
            const isActive = midpointMode === mode
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => selectMidpointMode(mode)}
                className={`flex flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${isActive
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:border-blue-400/70 dark:bg-blue-500/10 dark:ring-blue-400/70'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20'
                  }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-blue-600 dark:text-blue-300' : 'text-slate-400 dark:text-zinc-500'}`} />
                <span className={`text-sm font-semibold ${isActive ? 'text-blue-700 dark:text-blue-200' : 'text-slate-700 dark:text-zinc-200'}`}>{label}</span>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">{hint}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Step 3 — result */}
      <AnimatePresence>
        {midpoint && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="relative overflow-hidden rounded-3xl border border-amber-300/60 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-4 dark:border-amber-400/25 dark:from-amber-500/15 dark:via-zinc-900/40 dark:to-blue-600/15"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/30">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">{midpointModeLabel}</p>
                <h3 className="mt-0.5 text-lg font-bold leading-tight text-slate-900 dark:text-white">Lepak sini jom</h3>
                {isFetchingNearby ? (
                  <div className="mt-1.5 h-4 w-32 animate-pulse rounded bg-slate-200/80 dark:bg-white/10" />
                ) : primaryNearbyPlace ? (
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-600 dark:text-zinc-300">Near {primaryNearbyPlace}</p>
                ) : null}
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-zinc-300">{midpointDescription}</p>

            {midpointMode === 'routing' && (isRoutingMidpointLoading || routingMidpointError) && (
              <div className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${isRoutingMidpointLoading
                ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200'
                : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200'
                }`}>
                {isRoutingMidpointLoading ? (
                  <>
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                    Calculating road-based midpoint...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {routingMidpointError}
                  </>
                )}
              </div>
            )}

            {showRoutingMetrics && routingMetrics && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([
                  ['Longest journey', formatDuration(routingMetrics.maximumDurationSec)],
                  ['Time spread', formatDuration(routingMetrics.durationSpreadSec)],
                  ['Total travel time', formatDuration(routingMetrics.totalDurationSec)],
                  ['Total road distance', formatDistance(routingMetrics.totalDistanceKm)]
                ] as const).map(([label, value]) => (
                  <div key={label} className={statBox}>
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-zinc-500">{label}</p>
                    <p className="mt-1 text-base font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${midpoint.lat},${midpoint.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Google Maps
              </a>
              <a
                href={`https://waze.com/ul?ll=${midpoint.lat},${midpoint.lng}&navigate=yes`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10"
              >
                <Navigation className="h-3.5 w-3.5" />
                Waze
              </a>
            </div>

            <button
              type="button"
              onClick={() => copyCoordinates(midpoint)}
              className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/60 px-3 py-2 font-mono text-[11px] text-slate-600 transition-colors hover:bg-white dark:border-white/10 dark:bg-black/25 dark:text-zinc-300 dark:hover:bg-black/40"
              title="Copy coordinates"
            >
              <span className="tabular-nums">{midpoint.lat.toFixed(4)}, {midpoint.lng.toFixed(4)}</span>
              <span className="inline-flex items-center gap-1 font-sans font-semibold text-slate-500 dark:text-zinc-400">
                {hasCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {hasCopied ? 'Copied' : 'Copy'}
              </span>
            </button>

            <div className="mt-4">
              <p className={`${sectionLabel} mb-2`}>Suggested areas nearby</p>
              {isFetchingNearby ? (
                <div className="flex flex-wrap gap-2">
                  {[80, 104, 64].map((width) => (
                    <div key={width} className="h-7 animate-pulse rounded-full bg-slate-200/80 dark:bg-white/10" style={{ width }} />
                  ))}
                </div>
              ) : nearbyPlaces.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {nearbyPlaces.map((place, i) => (
                    <motion.span
                      key={`${place.name}-${i}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.06 }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200"
                      title={`~${place.distanceKm.toFixed(1)} km from midpoint`}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      {place.name}
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">{place.distanceKm.toFixed(1)} km</span>
                    </motion.span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-zinc-500">No suggestions found.</p>
              )}
            </div>

            {routingSearch?.strategy === 'multi-ring-refinement' && (
              <p className="mt-4 border-t border-slate-200/70 pt-3 text-[11px] text-slate-400 dark:border-white/10 dark:text-zinc-500">
                Multi-ring search: {routingSearch.stage1CandidateCount} broad + {routingSearch.stage2CandidateCount} refined candidates
                {!routingSearch.stage2Completed ? ' (broad winner retained)' : ''}
              </p>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <p className="pb-1 text-center text-[11px] text-slate-400 dark:text-zinc-600">Built for fair Malaysian meetups</p>
    </div>
  )

  return (
    <main className={`relative h-dvh w-screen overflow-hidden ${isDark ? 'dark bg-zinc-950' : 'bg-slate-100'}`}>
      <div className="absolute inset-0 z-0 h-full w-full">
        <Map
          key={isDark ? 'map-dark' : 'map-light'}
          locations={locations}
          midpoint={midpoint}
          midpointMode={midpointMode}
          routePaths={routePaths}
          isDark={isDark}
          isPanelOpen={isPanelOpen}
        />
      </div>

      {/* Collapsed launcher (desktop) */}
      <AnimatePresence>
        {!isPanelOpen && (
          <motion.button
            type="button"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsSidebarCollapsed(false)}
            className="absolute left-4 top-4 z-20 hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 p-2 pr-4 text-left shadow-xl backdrop-blur-xl transition-colors hover:bg-white md:flex dark:border-white/10 dark:bg-zinc-900/85 dark:hover:bg-zinc-900"
            aria-label="Open planner panel"
          >
            {brandMark}
            <span>
              <span className="block text-sm font-bold text-slate-900 dark:text-white">Mana nak lepak ni?</span>
              <span className="block text-xs text-slate-500 dark:text-zinc-400">{panelSummary}</span>
            </span>
            <PanelLeftOpen className="ml-2 h-4 w-4 text-slate-400 dark:text-zinc-500" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Planner panel: bottom sheet on phones, floating card on desktop */}
      <aside
        aria-label="Meetup planner"
        className={`absolute z-20 flex flex-col overflow-hidden border-slate-200/80 bg-white/95 shadow-[0_-8px_40px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-white/10 dark:bg-zinc-900/90 dark:shadow-[0_-8px_40px_rgba(0,0,0,0.5)]
          inset-x-0 bottom-0 max-h-[62dvh] rounded-t-3xl border-t
          md:inset-x-auto md:bottom-4 md:left-4 md:top-4 md:max-h-none md:w-[392px] md:rounded-3xl md:border md:shadow-2xl
          ${isPanelOpen
            ? 'translate-y-0 md:translate-x-0 md:opacity-100'
            : 'translate-y-[calc(100%-4.75rem)] md:translate-y-0 md:-translate-x-[calc(100%+2rem)] md:opacity-0 md:pointer-events-none'}`}
      >
        <header className="shrink-0 border-b border-slate-200/70 px-4 pb-3 pt-2 md:px-5 md:pt-5 dark:border-white/[0.07]">
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
            className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-slate-300 md:hidden dark:bg-zinc-700"
            aria-label={isPanelOpen ? 'Collapse planner' : 'Expand planner'}
          />
          <div className="flex items-center gap-3">
            {brandMark}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
              className="min-w-0 flex-1 text-left md:pointer-events-none"
              tabIndex={-1}
            >
              <h1 className="truncate text-base font-bold tracking-tight text-slate-900 dark:text-white">Mana nak lepak ni?</h1>
              <p className="truncate text-xs text-slate-500 dark:text-zinc-400">
                <span className="md:hidden">{panelSummary}</span>
                <span className="hidden md:inline">Fair meetup spots for everyone</span>
              </p>
            </button>
            <div className="flex shrink-0 items-center gap-1.5">
            {agentButton}
            {themeToggle}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
              className={iconButton}
              title={isPanelOpen ? 'Collapse panel' : 'Expand panel'}
              aria-label={isPanelOpen ? 'Collapse planner' : 'Expand planner'}
            >
              <span className="md:hidden">{isPanelOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</span>
              <PanelLeftClose className="hidden h-4 w-4 md:block" />
            </button>
            </div>
          </div>
        </header>

        <div className={`min-h-0 flex-1 overflow-y-auto custom-scrollbar px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-5 ${isPanelOpen ? '' : 'max-md:invisible'}`}>
          {panelBody}
        </div>
      </aside>

      <AnimatePresence>
        {isMcpGuideOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsMcpGuideOpen(false)
            }}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="webmcp-guide-title"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="max-h-[90dvh] w-full max-w-lg overflow-y-auto custom-scrollbar rounded-t-3xl border border-slate-200 bg-white text-slate-900 shadow-2xl sm:rounded-3xl dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/90 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/90">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300">
                    <Bot className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-300">Site tools</p>
                    <h2 id="webmcp-guide-title" className="mt-1 text-xl font-bold">Use Mana Nak Lepak Ni with ChatGPT</h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMcpGuideOpen(false)}
                  className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                  aria-label="Close WebMCP integration guide"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-5 p-5">
                <div className={`flex items-start gap-3 rounded-2xl border p-4 ${isWebMcpReady
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-400/25 dark:bg-emerald-400/10'
                  : 'border-amber-200 bg-amber-50 dark:border-amber-400/25 dark:bg-amber-400/10'
                  }`}>
                  <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${isWebMcpReady ? 'text-emerald-500' : 'text-amber-500'}`} />
                  <div>
                    <p className="text-sm font-semibold">
                      {isWebMcpReady ? 'Connected — 5 tools available' : 'Site tools not detected in this browser'}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
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
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700 dark:bg-white/10 dark:text-zinc-200">
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{title}</p>
                          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-zinc-400">{description}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/30">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-zinc-400">Try this prompt</p>
                  <p className="mt-2 text-sm leading-6">
                    “Plan a fair meetup for friends coming from Bangi, Cyberjaya, and Shah Alam. Compare both midpoint modes, explain the longest journey, then ask me before applying the plan.”
                  </p>
                </div>

                <p className="text-xs leading-5 text-slate-500 dark:text-zinc-400">
                  No separate MCP server or API-key setup is required. These tools belong to the live page and share the same visible map state with you.
                </p>

                <a
                  href="https://learn.chatgpt.com/docs/webmcp"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
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
