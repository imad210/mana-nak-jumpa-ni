# Mana Nak Lepak Ni

Fair meetup finder for Malaysians. Add a few places, compare a simple geographic midpoint against a fairness-based road midpoint, and see nearby locality suggestions on the map.

## What It Does

- Search Malaysian places with the proxied Nominatim search API.
- Add 2-10 places and visualize them on a Leaflet map.
- Switch between two midpoint modes:
  - `Geographic`: average latitude and longitude of all selected places.
  - `Road-based`: use OSRM road data to compute a fairer midpoint based on travel time.
- Show nearby locality suggestions around the active midpoint.
- Draw road routes for road-based mode and straight connectors for geographic mode.

## Midpoint Modes

### Geographic midpoint
- Fast and simple.
- Calculated by averaging all selected point coordinates.
- Best used as a baseline or fallback.

### Road-based midpoint
- Uses OSRM road-network data.
- For exactly 2 places, finds the exact 50/50 midpoint by travel time along the route.
- For 3 or more places, samples candidate points around the geographic seed and selects the fairest one by minimizing the longest travel time first, then total travel time as a tiebreaker.

Full calculation notes live in [ALGORITHM.md](./ALGORITHM.md).

## Tech Stack

- `Next.js 16` with the App Router
- `React 19`
- `TypeScript`
- `Leaflet`
- `Framer Motion`
- `Lucide React`
- `Nominatim` for search and reverse geocoding
- `OSRM` for road midpoint matrix, route details, and route highlighting
- `Vitest` for midpoint logic tests

## Key Routes and Modules

- `src/app/page.tsx`: main UI, mode switching, metric display, and sidebar layout
- `src/components/Map.tsx`: Leaflet map, markers, straight connectors, and road route overlays
- `src/app/api/search/route.ts`: proxied Nominatim search
- `src/app/api/reverse/route.ts`: proxied Nominatim reverse geocoding
- `src/app/api/midpoint/routing/route.ts`: road-based midpoint API
- `src/app/api/routes/road/route.ts`: highlighted road route API
- `src/lib/utils.ts`: shared types, geographic midpoint, client-side fetch helpers
- `src/lib/routing-midpoint.ts`: road midpoint scoring and fairness logic
- `src/lib/osrm.ts`: OSRM helpers, route details, matrix fetches, and caching

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
```

## Environment Variables

Optional environment variables used by the routing and geocoding layers:

```bash
OSRM_BASE_URL=https://router.project-osrm.org
OSRM_CACHE_TTL_MS=300000
OSRM_TIMEOUT_MS=8000
NOMINATIM_USER_AGENT=Midpoint-Malaysia/1.0 (+https://github.com/imad210/mana-nak-jumpa-ni)
NOMINATIM_EMAIL=you@example.com
NOMINATIM_MIN_INTERVAL_MS=1100
NOMINATIM_CACHE_TTL_MS=300000
```

## Notes and Limits

- Search and reverse suggestions are Malaysia-focused.
- Public OSRM and public Nominatim are fine for development and low traffic, but not ideal for heavy production usage.
- The road-based midpoint is a heuristic for 3+ places, not a mathematically exact global optimum.
- Nearby suggestions are locality-style labels from reverse geocoding, not venue search.

## Documentation

- [CONTEXT.md](./CONTEXT.md): project context for collaborators and future agents
- [ALGORITHM.md](./ALGORITHM.md): detailed explanation of geographic and road-based midpoint calculations