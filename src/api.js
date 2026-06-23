const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// Lokalny backend (Docker) dla treści za paywallem/anti-botem (NYT) — fetch z
// rezydencjalnego IP użytkownika + cookie sesji w .env backendu. Adres
// konfigurowalny (localhost:3001 na PC, IP LAN na telefonie), trzymany w localStorage.
const LOCAL_BACKEND_KEY = 'rss_local_backend'

// Domeny, których pełną treść pobieramy przez lokalny backend (nie Workers).
const HARD_DOMAINS = ['nytimes.com']

export function getLocalBackend() {
  return localStorage.getItem(LOCAL_BACKEND_KEY) || ''
}

export function setLocalBackend(url) {
  const clean = (url || '').trim().replace(/\/+$/, '')
  if (clean) localStorage.setItem(LOCAL_BACKEND_KEY, clean)
  else localStorage.removeItem(LOCAL_BACKEND_KEY)
}

function isHardUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return HARD_DOMAINS.some(d => host === d || host.endsWith('.' + d))
  } catch { return false }
}

// Wybór backendu dla pobrania pełnej treści artykułu: lokalny dla "trudnych"
// domen (jeśli skonfigurowany), w przeciwnym razie Workers.
function proxyBase(url) {
  const local = getLocalBackend()
  if (local && isHardUrl(url)) return local
  return API_BASE
}

export async function fetchFeedFromAPI(url) {
  const res = await fetch(`${API_BASE}/api/feed?url=${encodeURIComponent(url)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function discoverFeedFromAPI(url) {
  const res = await fetch(`${API_BASE}/api/discover?url=${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.results ?? []
}

export async function proxyFetch(url, timeoutMs = 25000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(`${proxyBase(url)}/api/proxy?url=${encodeURIComponent(url)}`, {
      signal: ac.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.text()
  } finally {
    clearTimeout(timer)
  }
}
