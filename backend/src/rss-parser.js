import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
})

// ---------- helpers ----------
function toArray(x) {
  if (x == null) return []
  return Array.isArray(x) ? x : [x]
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

// fast-xml-parser zwraca string dla czystego tekstu, albo obiekt z '#text'
// gdy element ma atrybuty/zagnieżdżenia
function text(node) {
  if (node == null) return ''
  if (typeof node === 'string') return decodeEntities(node.trim())
  if (typeof node === 'number') return String(node)
  if (typeof node === 'object' && node['#text'] != null) return decodeEntities(String(node['#text']).trim())
  return ''
}

function stripHtml(raw) {
  return decodeEntities(
    String(raw || '').replace(/<[^>]*>/g, ' ')
  ).replace(/\s+/g, ' ').trim()
}

// Atom: link może być pojedynczy lub tablica; wybierz rel="alternate" lub bez rel
function pickAtomLink(link) {
  const links = toArray(link)
  if (links.length === 0) return ''
  const alt = links.find(l => l?.['@_rel'] === 'alternate')
    || links.find(l => l?.['@_rel'] == null)
    || links[0]
  if (typeof alt === 'string') return alt
  return alt?.['@_href'] || ''
}

function extractImage(item) {
  const thumb = item['media:thumbnail']
  if (thumb) {
    const t = toArray(thumb)[0]
    const url = t?.['@_url'] || (typeof t === 'string' ? t : '')
    if (url.startsWith('http')) return url
  }
  const mediaContent = item['media:content']
  if (mediaContent) {
    const m = toArray(mediaContent).find(x => /image/i.test(x?.['@_type'] || '') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(x?.['@_url'] || ''))
    if (m?.['@_url']) return m['@_url']
  }
  const enc = item.enclosure
  if (enc) {
    const e = toArray(enc).find(x => /image/i.test(x?.['@_type'] || '') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(x?.['@_url'] || ''))
    if (e?.['@_url']) return e['@_url']
  }
  const raw = text(item['content:encoded']) || text(item.content) || text(item.description) || text(item.summary)
  const match = raw.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (match?.[1]?.startsWith('http')) return match[1]
  return null
}

function normalizeRss(channel, feedUrl) {
  const items = toArray(channel.item).slice(0, 40).map(item => {
    const descRaw = text(item.description) || text(item['content:encoded'])
    return {
      title: text(item.title) || '(bez tytułu)',
      link: text(item.link) || text(item.guid) || '',
      desc: stripHtml(descRaw).slice(0, 600),
      image: extractImage(item),
      pubDate: text(item.pubDate) || null,
      feedUrl,
    }
  })
  return { title: text(channel.title) || feedUrl, feedUrl, items, cachedAt: new Date().toISOString() }
}

function normalizeAtom(feed, feedUrl) {
  const items = toArray(feed.entry).slice(0, 40).map(entry => {
    const descRaw = text(entry.content) || text(entry.summary)
    return {
      title: text(entry.title) || '(bez tytułu)',
      link: pickAtomLink(entry.link),
      desc: stripHtml(descRaw).slice(0, 600),
      image: extractImage(entry),
      pubDate: text(entry.updated) || text(entry.published) || null,
      feedUrl,
    }
  })
  return { title: text(feed.title) || feedUrl, feedUrl, items, cachedAt: new Date().toISOString() }
}

export function parseFeedFromText(xmlText, feedUrl) {
  const doc = parser.parse(xmlText)
  if (doc.rss?.channel) return normalizeRss(doc.rss.channel, feedUrl)
  if (doc.feed) return normalizeAtom(doc.feed, feedUrl)
  // niektóre RSS 1.0 (RDF) mają channel/item bezpośrednio
  if (doc['rdf:RDF']) {
    const rdf = doc['rdf:RDF']
    const channel = { ...rdf.channel, item: rdf.item }
    return normalizeRss(channel, feedUrl)
  }
  throw new Error('Nierozpoznany format kanału (nie RSS/Atom)')
}

export async function parseFeed(feedUrl) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 12000)
  let body
  try {
    const res = await fetch(feedUrl, {
      signal: ac.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSSReader/2.0)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    body = await res.text()
  } finally {
    clearTimeout(timer)
  }
  return parseFeedFromText(body, feedUrl)
}
