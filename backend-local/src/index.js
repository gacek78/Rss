import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors'
import { parseFeed } from './rss-parser.js'
import { discoverFeed } from './discovery.js'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
}

// Cookies per-domena z env (np. COOKIE_NYTIMES_COM="nyt-a=...; NYT-S=..."),
// żeby cookie sesji nie musiało wędrować z przeglądarki. Klucz: COOKIE_<HOST z _>
function cookieForUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const key = 'COOKIE_' + host.toUpperCase().replace(/[.-]/g, '_')
    return process.env[key] || ''
  } catch { return '' }
}

const app = new Hono()
app.use('*', cors({ allowHeaders: ['Content-Type', 'X-Forward-Cookie'] }))

app.get('/health', c => c.json({ ok: true, mode: 'local' }))

app.get('/api/feed', async c => {
  const url = c.req.query('url')
  if (!url) return c.json({ error: 'Missing url parameter' }, 400)
  try {
    const result = await parseFeed(url)
    return c.json(result)
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
    const timer = setTimeout(() => ac.abort(), 25000)
    const headers = { ...BROWSER_HEADERS }
    // Cookie: najpierw z env (per-domena), w razie braku z nagłówka żądania
    const cookie = cookieForUrl(url) || c.req.header('X-Forward-Cookie')
    if (cookie) headers['Cookie'] = cookie
    let res
    try {
      res = await fetch(url, { signal: ac.signal, headers, redirect: 'follow' })
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

// Serwuj zbudowaną apkę (dist/ zamontowane jako ./public) z tego samego origin,
// żeby telefon mógł otworzyć http://<IP-LAN>:3001 bez problemu mixed content.
app.use('/*', serveStatic({ root: './public' }))
app.get('/', serveStatic({ path: './public/index.html' }))

const PORT = Number(process.env.PORT) || 3000
serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, () => {
  console.log(`RSS local backend running on http://0.0.0.0:${PORT}`)
})
