const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org'
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT ?? 'Midpoint-Malaysia/1.0 (+https://github.com/imad210/mana-nak-jumpa-ni)'
const NOMINATIM_EMAIL = process.env.NOMINATIM_EMAIL
const NOMINATIM_MIN_INTERVAL_MS = Number(process.env.NOMINATIM_MIN_INTERVAL_MS ?? '1100')
const NOMINATIM_CACHE_TTL_MS = Number(process.env.NOMINATIM_CACHE_TTL_MS ?? '300000')

let nextAvailableRequestAt = 0
let requestQueue = Promise.resolve()
const responseCache = new Map<string, { expiresAt: number; data: unknown }>()

function getNominatimHeaders() {
  return {
    'User-Agent': NOMINATIM_USER_AGENT,
    'Accept-Language': 'en',
    'Accept': 'application/json'
  }
}

function appendCommonParams(params: URLSearchParams) {
  params.set('format', 'jsonv2')
  params.set('addressdetails', '1')

  if (NOMINATIM_EMAIL) {
    params.set('email', NOMINATIM_EMAIL)
  }

  return params
}

function summarizeBody(body: string) {
  return body.replace(/\s+/g, ' ').slice(0, 200)
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getRetryDelayMs(retryAfter: string | null) {
  if (!retryAfter) return 2000

  const seconds = Number(retryAfter)
  if (!Number.isNaN(seconds)) {
    return seconds * 1000
  }

  const retryAt = Date.parse(retryAfter)
  if (Number.isNaN(retryAt)) {
    return 2000
  }

  return Math.max(0, retryAt - Date.now())
}

async function scheduleNominatimRequest<T>(task: () => Promise<T>): Promise<T> {
  const scheduledTask = requestQueue.then(async () => {
    const waitMs = Math.max(0, nextAvailableRequestAt - Date.now())
    if (waitMs > 0) {
      await delay(waitMs)
    }

    nextAvailableRequestAt = Date.now() + NOMINATIM_MIN_INTERVAL_MS
    return task()
  })

  requestQueue = scheduledTask.then(() => undefined, () => undefined)
  return scheduledTask
}

async function requestNominatim<T>(url: string, attempt = 0): Promise<T> {
  const res = await scheduleNominatimRequest(() =>
    fetch(url, {
      headers: getNominatimHeaders(),
      next: { revalidate: 300 }
    })
  )

  const contentType = res.headers.get('content-type') ?? ''
  const body = await res.text()

  if (res.status === 429 && attempt < 1) {
    await delay(getRetryDelayMs(res.headers.get('retry-after')))
    return requestNominatim<T>(url, attempt + 1)
  }

  if (!res.ok) {
    throw new Error(`Nominatim ${res.status} ${res.statusText}: ${summarizeBody(body)}`)
  }

  if (!contentType.toLowerCase().includes('json')) {
    throw new Error(`Nominatim returned non-JSON content-type \"${contentType}\": ${summarizeBody(body)}`)
  }

  return JSON.parse(body) as T
}

export async function fetchNominatimJson<T>(path: string, params: URLSearchParams): Promise<T> {
  const url = `${NOMINATIM_BASE_URL}${path}?${appendCommonParams(params).toString()}`
  const cached = responseCache.get(url)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T
  }

  const data = await requestNominatim<T>(url)
  responseCache.set(url, {
    expiresAt: Date.now() + NOMINATIM_CACHE_TTL_MS,
    data
  })

  return data
}
