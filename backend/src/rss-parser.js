import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Nie rozwijaj encji w parserze — niektóre feedy (Focus, CHIP) przekraczają
  // wbudowany limit anty-DoS (1000 encji). Dekodujemy sami w decodeEntities().
  processEntities: false,
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

// Wybierz najbogatszy opis spośród dostępnych pól. Wiele feedów trzyma w
// <description>/<summary> tylko krótką zajawkę (czasem = sam tytuł), a pełną
// treść w <content:encoded>/<content>. Bierzemy najdłuższy po oczyszczeniu z
// HTML — dzięki temu streszczenia (news brief) mają realny materiał, a nie
// powtórzenie tytułu. Front i tak przycina zajawkę CSS-em (line-clamp), więc
// dłuższy desc nie zmienia wyglądu listy.
function richestDesc(...candidates) {
  let best = ''
  for (const c of candidates) {
    const s = stripHtml(text(c))
    if (s.length > best.length) best = s
  }
  return best.slice(0, 1500)
}

// Atom: link może być pojedynczy lub tablica; wybierz rel="alternate" lub bez rel
function pickAtomLink(link) {
  const links = toArray(link)
  if (links.length === 0) return ''
  const alt = links.find(l => l?.['@_rel'] === 'alternate')
    || links.find(l => l?.['@_rel'] == null)
    || links[0]
  if (typeof alt === 'string') return decodeEntities(alt)
  return decodeEntities(alt?.['@_href'] || '')
}

function extractImage(item) {
  const thumb = item['media:thumbnail']
  if (thumb) {
    const t = toArray(thumb)[0]
    const url = t?.['@_url'] || (typeof t === 'string' ? t : '')
    if (url.startsWith('http')) return decodeEntities(url)
  }
  const mediaContent = item['media:content']
  if (mediaContent) {
    const m = toArray(mediaContent).find(x => /image/i.test(x?.['@_type'] || '') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(x?.['@_url'] || ''))
    if (m?.['@_url']) return decodeEntities(m['@_url'])
  }
  const enc = item.enclosure
  if (enc) {
    const e = toArray(enc).find(x => /image/i.test(x?.['@_type'] || '') || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(x?.['@_url'] || ''))
    if (e?.['@_url']) return decodeEntities(e['@_url'])
  }
  const raw = text(item['content:encoded']) || text(item.content) || text(item.description) || text(item.summary)
  const match = raw.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (match?.[1]?.startsWith('http')) return match[1]
  return null
}

function normalizeRss(channel, feedUrl) {
  const items = toArray(channel.item).slice(0, 40).map(item => {
    return {
      title: text(item.title) || '(bez tytułu)',
      link: text(item.link) || text(item.guid) || '',
      desc: richestDesc(item.description, item['content:encoded']),
      image: extractImage(item),
      pubDate: text(item.pubDate) || null,
      feedUrl,
    }
  })
  return { title: text(channel.title) || feedUrl, feedUrl, items, cachedAt: new Date().toISOString() }
}

function normalizeAtom(feed, feedUrl) {
  const items = toArray(feed.entry).slice(0, 40).map(entry => {
    return {
      title: text(entry.title) || '(bez tytułu)',
      link: pickAtomLink(entry.link),
      desc: richestDesc(entry.content, entry.summary),
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
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    body = await res.text()
  } finally {
    clearTimeout(timer)
  }
  return parseFeedFromText(body, feedUrl)
}
