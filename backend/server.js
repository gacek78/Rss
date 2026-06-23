import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { getCached, setCache } from './db.js'
import { parseFeed } from './rss-parser.js'
import { discoverFeed } from './discovery.js'

const app = new Hono()

app.use('*', cors())

app.get('/health', c => c.json({ ok: true }))

app.get('/api/feed', async c => {
  const url = c.req.query('url')
  if (!url) return c.json({ error: 'Missing url parameter' }, 400)

  const cached = getCached(url)
  if (cached) return c.json(cached)

  try {
    const result = await parseFeed(url)
    setCache(url, result)
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
    const timer = setTimeout(() => ac.abort(), 18000)
    let res
    try {
      res = await fetch(url, {
        signal: ac.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSSReader/2.0)' },
      })
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

const PORT = Number(process.env.PORT) || 3000
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`RSS backend running on port ${PORT}`)
})
