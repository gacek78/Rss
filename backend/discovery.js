import { parse as parseHTML } from 'node-html-parser'
import { parseFeedFromText } from './rss-parser.js'

const RSS_TYPES = ['application/rss+xml', 'application/atom+xml', 'text/xml', 'application/xml']
const COMMON_PATHS = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/feed/rss2', '/rss/feed', '/news/rss']

async function fetchText(url, timeoutMs = 10000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ac.signal })
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

async function tryParseFeed(text, url) {
  try {
    const result = await parseFeedFromText(text, url)
    return result
  } catch {
    return null
  }
}

export async function discoverFeed(rawUrl) {
  let url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url

  // Step 1: try URL directly as feed
  let text
  try { text = await fetchText(url, 10000) } catch { text = null }

  if (text) {
    const parsed = await tryParseFeed(text, url)
    if (parsed) return [{ url, title: parsed.title }]

    // Step 2: HTML — look for <link rel="alternate">
    try {
      const root = parseHTML(text)
      const links = root.querySelectorAll('link[rel="alternate"]')
        .filter(l => RSS_TYPES.includes(l.getAttribute('type')))
      if (links.length > 0) {
        return links.map(l => {
          let href = l.getAttribute('href') || ''
          try { href = new URL(href, url).href } catch {}
          return { url: href, title: l.getAttribute('title') || href }
        }).filter(f => f.url)
      }
    } catch {}
  }

  // Step 3: common paths
  let base = url
  try { base = new URL(url).origin } catch {}
  for (const path of COMMON_PATHS) {
    const candidate = base + path
    try {
      const t = await fetchText(candidate, 6000)
      const parsed = await tryParseFeed(t, candidate)
      if (parsed) return [{ url: candidate, title: parsed.title }]
    } catch {}
  }

  return []
}
