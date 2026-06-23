import { parseFeedFromText } from './rss-parser.js'

const RSS_TYPES = ['application/rss+xml', 'application/atom+xml', 'text/xml', 'application/xml']
const COMMON_PATHS = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/feed/rss2', '/rss/feed', '/news/rss']

async function fetchText(url, timeoutMs = 10000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    })
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function tryParseFeed(text, url) {
  try {
    return parseFeedFromText(text, url)
  } catch {
    return null
  }
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))
  return m ? m[1] : ''
}

// Szukaj <link rel="alternate" type="application/rss+xml" href="..."> w HTML
function findFeedLinks(html, baseUrl) {
  const linkTags = html.match(/<link\b[^>]*>/gi) || []
  const found = []
  for (const tag of linkTags) {
    if (attr(tag, 'rel') !== 'alternate') continue
    if (!RSS_TYPES.includes(attr(tag, 'type'))) continue
    let href = attr(tag, 'href')
    if (!href) continue
    try { href = new URL(href, baseUrl).href } catch {}
    found.push({ url: href, title: attr(tag, 'title') || href })
  }
  return found
}

export async function discoverFeed(rawUrl) {
  let url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url

  // Step 1: try URL directly as feed
  let text
  try { text = await fetchText(url, 10000) } catch { text = null }

  if (text) {
    const parsed = tryParseFeed(text, url)
    if (parsed) return [{ url, title: parsed.title }]

    // Step 2: HTML — look for <link rel="alternate">
    const links = findFeedLinks(text, url)
    if (links.length > 0) return links
  }

  // Step 3: common paths
  let base = url
  try { base = new URL(url).origin } catch {}
  for (const path of COMMON_PATHS) {
    const candidate = base + path
    try {
      const t = await fetchText(candidate, 6000)
      const parsed = tryParseFeed(t, candidate)
      if (parsed) return [{ url: candidate, title: parsed.title }]
    } catch {}
  }

  return []
}
