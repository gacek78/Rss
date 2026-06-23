import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { parseFeed } from './rss-parser.js'
import { discoverFeed } from './discovery.js'

const app = new Hono()

app.use('*', cors())

app.get('/health', c => c.json({ ok: true }))

app.get('/api/feed', async c => {
  const url = c.req.query('url')
  if (!url) return c.json({ error: 'Missing url parameter' }, 400)

  // Cloudflare edge cache — klucz po pełnym URL zapytania (z ?url=...)
  const cache = caches.default
  const cacheKey = new Request(new URL(c.req.url), { method: 'GET' })
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  try {
    const result = await parseFeed(url)
    const res = c.json(result)
    res.headers.set('Cache-Control', 'public, max-age=900') // 15 min
    // zapis do cache w tle (nie blokuje odpowiedzi)
    c.executionCtx?.waitUntil(cache.put(cacheKey, res.clone()))
    return res
  } catch (e) {
    const isTimeout = e?.name === 'AbortError' || e?.name === 'TimeoutError'
    return c.json({ error: isTimeout ? 'Timeout' : (e?.message || 'Fetch failed') }, 502)
  }
})

app.get('/api/proxy', async c => {
  const url = c.req.query('url')
  if (!url) return c.json({ error: 'Missing url parameter' }, 400)
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 18000)
    // Bogatsze nagłówki przeglądarkowe — zwiększają szansę przejścia ochron anti-bot
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    // Opcjonalne przekazanie cookie zalogowanej sesji (np. NYT-S) dla treści za paywallem,
    // do której użytkownik ma legalny dostęp. Cookie przekazywane przez nagłówek żądania.
    const fwdCookie = c.req.header('X-Forward-Cookie')
    if (fwdCookie) headers['Cookie'] = fwdCookie
    let res
    try {
      res = await fetch(url, { signal: ac.signal, headers })
    } finally {
      clearTimeout(timer)
    }
    const text = await res.text()
    return c.text(text, res.status, {
      'Content-Type': res.headers.get('content-type') || 'text/html; charset=utf-8',
    })
  } catch (e) {
    return c.json({ error: e?.message || 'Proxy failed' }, 502)
  }
})

app.get('/api/discover', async c => {
  const url = c.req.query('url')
  if (!url) return c.json({ error: 'Missing url parameter' }, 400)

  try {
    const results = await discoverFeed(url)
    return c.json({ results })
  } catch (e) {
    return c.json({ error: e?.message || 'Discovery failed' }, 502)
  }
})

export default app
