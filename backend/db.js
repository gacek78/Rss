const cache = new Map()
const CACHE_TTL_MS = 15 * 60 * 1000

export function getCached(url) {
  const entry = cache.get(url)
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(url)
    return null
  }
  return entry.data
}

export function setCache(url, data) {
  cache.set(url, { data, fetchedAt: Date.now() })
}
