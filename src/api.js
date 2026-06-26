const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

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
    const res = await fetch(`${API_BASE}/api/proxy?url=${encodeURIComponent(url)}`, {
      signal: ac.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.text()
  } finally {
    clearTimeout(timer)
  }
}
