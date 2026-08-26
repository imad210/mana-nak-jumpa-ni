# Mana Nak Lepak Ni

Fair meetup finder for Malaysians. Add a few places, compare a simple geographic midpoint against a fairness-based road midpoint, and see nearby locality suggestions on the map.

## What It Does

- Search Malaysian places with the proxied Nominatim search API.
- Add 2-10 places and visualize them on a Leaflet map.
- Switch between two midpoint modes:
  - `Geographic`: average latitude and longitude of all selected places.
  - `Road-based`: use OSRM road data to compute a fairer midpoint based on estimated travel time.
- Show nearby locality suggestions around the active midpoint.
- Draw highlighted road routes for road-based mode and straight connectors for geographic mode.
- Show per-place travel time and road distance in road-based mode.
- Expose the planning workflow to compatible browser agents through five in-page WebMCP tools.

## Midpoint Modes

### Geographic midpoint
- Fast and simple.
- Calculated by averaging all selected point coordinates.
- Best used as a baseline or fallback.

### Road-based midpoint
- Uses OSRM road-network data.
- For exactly 2 places, finds the half-duration point along the directed route from the first place to the second. This is not an equality guarantee for both directions on an asymmetric road network.
- For 3 or more places, evaluates 37 deterministic broad candidates over three rings, then 13 candidates around the broad winner. It minimizes the longest journey first and total journey time second, with deterministic tolerances.
- Uses the snapped destination returned by the winning OSRM table evaluation consistently for metrics, display, and final route geometry.
- Returns highlighted route paths together with the midpoint response so the UI can draw road lines with fewer round trips.
- Reuses the same route geometry for the `2 places` case, which helps road-based lines appear faster.

## WebMCP Agent Tools

In browsers that expose `document.modelContext`, the client registers these tools:

- `search_locations`: resolve Malaysia-focused place names without changing the map.
- `set_participants`: replace the visible participant set with 2-10 validated locations.
- `get_current_plan`: inspect the current participants, selected mode, midpoint, and revision.
- `compare_midpoint_modes`: compare geographic and road-based results without applying a mode.
- `apply_meetup_plan`: apply a selected mode to the visible map, guarded by state revision.

WebMCP is progressive enhancement. The normal search, map, and midpoint controls continue to work when the browser does not support agent tools. See [the WebMCP tool specification](./docs/WEBMCP_TOOL_SPEC.md) and [technical architecture](./docs/ARCHITECTURE.md).

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
- `src/app/api/midpoint/routing/route.ts`: road-based midpoint API that returns midpoint data and highlighted road routes in one response
- `src/lib/utils.ts`: shared types, geographic midpoint, client-side fetch helpers
- `src/lib/routing-midpoint.ts`: road midpoint scoring, fairness logic, and special-case `2 places` route splitting
- `src/lib/osrm.ts`: OSRM helpers, route details, matrix fetches, simplified route geometry, and caching
- `src/lib/meetup-planner.ts`: concise state snapshots and geographic/routing comparison results
- `src/lib/webmcp.ts`: WebMCP schemas, validation, registration, and structured results
- `src/types/webmcp.d.ts`: minimal browser API declarations for progressive enhancement

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
OSRM_CACHE_MAX_ENTRIES=500
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
- Road-based travel time is road-network aware but not real-time traffic aware.
- Nearby suggestions are locality-style labels from reverse geocoding, not venue search.
- Public deployment, an OSI-compatible repository license, and testing in a WebMCP-compatible browser are separate submission-readiness steps.

## Documentation

The submission documentation starts at [docs/README.md](./docs/README.md). The implemented algorithm and its trade-offs are specified in [docs/ALGORITHM.md](./docs/ALGORITHM.md).
