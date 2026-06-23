import Parser from 'rss-parser'

const parser = new Parser({
  timeout: 12000,
  customFields: {
    item: [
      ['media:thumbnail', 'mediaThumbnail'],
      ['media:content', 'mediaContent'],
      ['enclosure', 'enclosure'],
    ],
  },
})

function extractImage(item) {
  if (item.mediaThumbnail) {
    const mc = Array.isArray(item.mediaThumbnail) ? item.mediaThumbnail[0] : item.mediaThumbnail
    const url = mc?.$?.url ?? mc
    if (typeof url === 'string' && url.startsWith('http')) return url
  }
  if (item.mediaContent) {
    const mc = Array.isArray(item.mediaContent) ? item.mediaContent[0] : item.mediaContent
    if (mc?.$?.url && /image/i.test(mc.$?.type || '')) return mc.$.url
  }
  if (item.enclosure?.url && /image/i.test(item.enclosure.type || '')) return item.enclosure.url
  const raw = item['content:encoded'] || item.content || ''
  const match = raw.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (match?.[1]?.startsWith('http')) return match[1]
  return null
}

function normalize(feed, feedUrl) {
  return {
    title: feed.title?.trim() || feedUrl,
    feedUrl,
    items: feed.items.slice(0, 40).map(item => ({
      title: item.title?.trim() || '(bez tytułu)',
      link: item.link || item.guid || '',
      desc: (item.contentSnippet || '').slice(0, 600),
      image: extractImage(item),
      pubDate: item.isoDate || item.pubDate || null,
      feedUrl,
    })),
    cachedAt: new Date().toISOString(),
  }
}

export async function parseFeed(feedUrl) {
  const feed = await parser.parseURL(feedUrl)
  return normalize(feed, feedUrl)
}

export async function parseFeedFromText(text, feedUrl) {
  const feed = await parser.parseString(text)
  return normalize(feed, feedUrl)
}
