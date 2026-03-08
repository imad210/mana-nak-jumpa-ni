'use client'

import { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Search, MapPin, Users, X, Loader2, Navigation, Sun, Moon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Location, NearbyPlace, searchLocation, calculateMidpoint, getNearbyLocalities } from '@/lib/utils'

const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-950">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  )
})

export default function Home() {
  const [locations, setLocations] = useState<Location[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Location[]>([])
  const [isDark, setIsDark] = useState(true)
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([])
  const [isFetchingNearby, setIsFetchingNearby] = useState(false)

  const midpoint = useMemo(() => {
    if (locations.length < 2) return null
    return calculateMidpoint(locations)
  }, [locations])

  // Fetch nearby localities whenever midpoint changes
  useEffect(() => {
    if (!midpoint) {
      setNearbyPlaces([])
      return
    }
    let cancelled = false
    setIsFetchingNearby(true)
    setNearbyPlaces([])
    getNearbyLocalities(midpoint.lat, midpoint.lng).then(places => {
      if (!cancelled) {
        setNearbyPlaces(places)
        setIsFetchingNearby(false)
      }
    })
    return () => { cancelled = true }
  }, [midpoint?.lat, midpoint?.lng])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setIsSearching(true)
    const results = await searchLocation(searchQuery)
    setSearchResults(results)
    setIsSearching(false)
  }

  const addLocation = (loc: Location) => {
    if (locations.length >= 10) return
    setLocations([...locations, loc])
    setSearchQuery('')
    setSearchResults([])
  }

  const removeLocation = (index: number) => {
    setLocations(locations.filter((_, i) => i !== index))
  }

  // ----- Theme-aware class sets -----
  const main = isDark
    ? 'relative h-screen w-screen overflow-hidden flex flex-col md:flex-row bg-zinc-950'
    : 'relative h-screen w-screen overflow-hidden flex flex-col md:flex-row bg-slate-100'

  const sidebar = isDark
    ? 'relative z-20 w-full md:w-96 bg-zinc-900/80 backdrop-blur-md border-r border-white/10 md:h-full p-6 flex flex-col gap-5 shadow-2xl'
    : 'relative z-20 w-full md:w-96 bg-white/95 backdrop-blur-md border-r border-slate-200 md:h-full p-6 flex flex-col gap-5 shadow-xl'

  const titleText = isDark ? 'text-white' : 'text-slate-800'
  const subtitleText = isDark ? 'text-zinc-500' : 'text-slate-400'

  const inputClass = isDark
    ? 'w-full bg-zinc-800/60 border border-white/10 rounded-xl py-3 px-4 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm text-white placeholder:text-zinc-500'
    : 'w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-all text-sm text-slate-800 placeholder:text-slate-400'

  const searchDropdown = isDark
    ? 'absolute top-44 left-6 right-6 z-30 bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl'
    : 'absolute top-44 left-6 right-6 z-30 bg-white backdrop-blur-md border border-slate-200 rounded-xl overflow-hidden shadow-xl'

  const searchDropdownItem = isDark
    ? 'w-full text-left p-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 truncate text-sm flex items-center gap-2 text-zinc-200'
    : 'w-full text-left p-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 truncate text-sm flex items-center gap-2 text-slate-700'

  const locationItemClass = isDark
    ? 'group flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all'
    : 'group flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all'

  const locationNameClass = isDark ? 'flex-1 text-sm truncate font-medium text-white' : 'flex-1 text-sm truncate font-medium text-slate-700'

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

  return (
    <main className={main}>
      {/* Sidebar */}
      <div className={sidebar}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
            <Navigation className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className={`text-xl font-bold tracking-tight ${titleText}`}>Mana nak lepak ni?</h1>
            <p className={`text-xs ${subtitleText}`}>Find fair meeting spots for everyone</p>
          </div>
          {/* Theme Toggle */}
          <button
            onClick={() => setIsDark(d => !d)}
            className={toggleBtnClass}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <motion.div
              key={isDark ? 'moon' : 'sun'}
              initial={{ rotate: -30, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </motion.div>
          </button>
        </div>

        {/* Search */}
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

        {/* Search Results Dropdown */}
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
                  key={i}
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

        {/* Location List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-1">
          {locations.map((loc, i) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={locationItemClass}
              key={i}
            >
              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] shrink-0" />
              <span className={locationNameClass}>
                {loc.name.split(',')[0]}
              </span>
              <button
                onClick={() => removeLocation(i)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-500/20 text-red-400 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}

          {locations.length === 0 && (
            <div className={`flex-1 flex flex-col items-center justify-center gap-4 py-20 ${emptyStateClass}`}>
              <Users className="w-12 h-12 opacity-20" />
              <p className={emptyTextClass}>Add up to 10 places to find<br />the perfect meet-up midpoint</p>
            </div>
          )}
        </div>

        {/* Midpoint Result Card */}
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
                <span className={midpointTagText}>Optimal Midpoint</span>
                <h3 className={midpointHeading}>Lepak sini jom</h3>
              </div>
            </div>
            <p className={midpointDesc}>
              Sharing the travel distance equally among all {locations.length} participants.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className={midpointCoordBox}>LAT: {midpoint.lat.toFixed(4)}</div>
              <div className={midpointCoordBox}>LNG: {midpoint.lng.toFixed(4)}</div>
            </div>

            {/* Nearby locality suggestions */}
            <div>
              <p className={`text-[10px] uppercase font-bold tracking-widest mb-2 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                📍 Suggested Spots
              </p>
              {isFetchingNearby ? (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Finding nearby spots…
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {nearbyPlaces.map((place, i) => (
                    <motion.span
                      key={i}
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
      </div>

      {/* Map Area */}
      <div className="flex-1 h-full relative">
        <Map locations={locations} midpoint={midpoint} isDark={isDark} />
        <div className={floatingCreditClass}>Built for fair Malaysian meetups</div>
      </div>
    </main>
  )
}
