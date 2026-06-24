import './style.css'
import { fetchFeedFromAPI, discoverFeedFromAPI, getLocalBackend, setLocalBackend } from './api.js'
import { translateText, getCachedTranslation, saveTxCache } from './translate.js'
import { openReader, closeReader } from './reader.js'

const COLORS = [
  '#3b82f6','#8b5cf6','#ec4899','#f97316','#10b981',
  '#06b6d4','#f59e0b','#6366f1','#14b8a6','#ef4444',
]

const DEFAULT_FEEDS = [
  { url: 'https://www.rmf24.pl/nauka/feed',           title: 'RMF24 Nauka'            },
  { url: 'https://www.rmf24.pl/fakty/feed',           title: 'RMF24 Fakty'            },
  { url: 'https://spidersweb.pl/feed',                title: "Spider's Web"            },
  { url: 'https://niebezpiecznik.pl/feed/',           title: 'Niebezpiecznik'          },
  { url: 'https://wiadomosci.wp.pl/rss.xml',          title: 'WP Wiadomości'           },
  { url: 'https://www.chip.pl/feed',                  title: 'CHIP'                    },
  { url: 'https://www.money.pl/rss/wiadomosci.xml',   title: 'Money.pl'                },
  { url: 'https://www.bankier.pl/rss/wiadomosci.xml', title: 'Bankier.pl'              },
  { url: 'https://www.focus.pl/feed',                 title: 'Focus'                   },
  { url: 'https://www.national-geographic.pl/feed',   title: 'National Geographic PL'  },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',   title: 'NYT HomePage'   },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',      title: 'NYT World'      },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', title: 'NYT Technology' },
]

const REMOVED_FEEDS = [
  'https://hnrss.org/frontpage',
  'https://feeds.feedburner.com/TechCrunch',
  'https://feeds.bbci.co.uk/polish/rss.xml',
  'https://rss.dw.com/xml/rss-pl-all',
]

let feeds = []
let activeFilter = null
let loading = false
let translateEnabled = false
let translating = false
let _articleItems = []

// ---------- Storage ----------
function loadState() {
  try {
    let saved = JSON.parse(localStorage.getItem('rss_feeds') || 'null')
    if (saved?.length) {
      saved = saved.filter(f => !REMOVED_FEEDS.includes(f.url))
      const existing = new Set(saved.map(f => f.url))
      DEFAULT_FEEDS.forEach(f => { if (!existing.has(f.url)) saved.push(f) })
      feeds = saved.map((f, i) => ({
        url: f.url, title: f.title, color: f.color || COLORS[i % COLORS.length],
        items: [], error: false,
      }))
    } else {
      feeds = DEFAULT_FEEDS.map((f, i) => ({
        url: f.url, title: f.title, color: COLORS[i % COLORS.length], items: [], error: false,
      }))
    }
  } catch { feeds = [] }
}

function saveState() {
  localStorage.setItem('rss_feeds', JSON.stringify(
    feeds.map(f => ({ url: f.url, title: f.title, color: f.color }))
  ))
}

// ---------- Feed fetching ----------
async function fetchFeed(feed) {
  try {
    const data = await fetchFeedFromAPI(feed.url)
    feed.title = data.title
    feed.items = data.items.map(item => ({
      ...item,
      imgUrl: item.image,
      date: new Date(item.pubDate || 0),
    }))
    feed.error = false
  } catch (e) {
    feed.error = e?.message || 'Błąd połączenia'
    feed.items = []
  }
}

async function fetchAll() {
  if (loading) return
  loading = true; setRefreshSpin(true); renderArticles()
  await Promise.all(feeds.map(fetchFeed))
  loading = false; setRefreshSpin(false)
  saveState(); renderSidebar()
  if (translateEnabled) await translateVisible(); else renderArticles()
}

function setRefreshSpin(on) {
  document.getElementById('refreshIcon').style.animation = on ? 'spin 0.7s linear infinite' : ''
}

// ---------- Translation ----------
async function translateVisible() {
  translating = true; renderArticles()
  const items = getVisible()
  const uncached = items.filter(item => getCachedTranslation(item.title) === undefined)
  for (let i = 0; i < uncached.length; i += 5)
    await Promise.all(uncached.slice(i, i + 5).map(item => translateText(item.title)))
  saveTxCache(); translating = false; renderArticles()
}

function getDisplayTitle(item) {
  if (!translateEnabled) return esc(item.title)
  const tx = getCachedTranslation(item.title)
  return (tx && tx !== item.title)
    ? esc(tx) + ' <span class="translate-badge">PL</span>'
    : esc(item.title)
}

// ---------- Sidebar ----------
function renderSidebar() {
  const list = document.getElementById('feedList')
  list.innerHTML = ''
  const allLi = document.createElement('li')
  allLi.className = 'feed-item' + (activeFilter === null ? ' active' : '')
  allLi.innerHTML = `<span class="feed-dot" style="background:#94a3b8"></span><span class="feed-name">Wszystkie</span><span class="feed-count">${getAllItems().length}</span>`
  allLi.addEventListener('click', () => { activeFilter = null; renderSidebar(); renderArticles(); closeSidebar() })
  list.appendChild(allLi)
  feeds.forEach(feed => {
    const li = document.createElement('li')
    li.className = 'feed-item' + (activeFilter === feed.url ? ' active' : '')
    li.innerHTML = `<span class="feed-dot" style="background:${feed.color}"></span><span class="feed-name" title="${esc(feed.title)}">${esc(feed.title)}</span><span class="feed-count">${feed.items.length}</span><button class="feed-delete" title="Usuń" aria-label="Usuń">✕</button>`
    li.querySelector('.feed-delete').addEventListener('click', e => { e.stopPropagation(); removeFeed(feed.url) })
    li.addEventListener('click', e => {
      if (e.target.closest('.feed-delete')) return
      activeFilter = feed.url; renderSidebar(); renderArticles(); closeSidebar()
    })
    list.appendChild(li)
  })
}

// ---------- Articles ----------
function getAllItems() {
  return feeds.flatMap(f => f.items.map(item => ({ ...item, feedColor: f.color, feedTitle: f.title })))
}

function getVisible() {
  const feed = feeds.find(f => f.url === activeFilter)
  const src = activeFilter === null
    ? getAllItems()
    : (feed?.items || []).map(item => ({ ...item, feedColor: feed.color, feedTitle: feed.title }))
  return src.sort((a, b) => b.date - a.date)
}

function fmtDate(date) {
  if (!date || isNaN(date) || date.getTime() === 0) return ''
  const diff = Date.now() - date
  if (diff < 60e3)      return 'przed chwilą'
  if (diff < 3600e3)    return Math.floor(diff / 60e3) + ' min temu'
  if (diff < 86400e3)   return Math.floor(diff / 3600e3) + ' godz. temu'
  if (diff < 7*86400e3) return Math.floor(diff / 86400e3) + ' dni temu'
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderArticles() {
  const container = document.getElementById('articlesContainer')
  const filterLabel = document.getElementById('filterLabel')
  const articleCount = document.getElementById('articleCount')

  filterLabel.textContent = activeFilter
    ? (feeds.find(f => f.url === activeFilter)?.title || 'Kanał')
    : 'Wszystkie artykuły'

  if (loading) {
    container.innerHTML = '<div class="loading"><span class="spinner"></span>Pobieranie artykułów…</div>'
    articleCount.textContent = ''; return
  }
  if (feeds.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">📡</div><h3>Brak kanałów RSS</h3><p>Dodaj kanał RSS w menu po lewej.</p></div>'
    articleCount.textContent = ''; return
  }

  let html = ''
  feeds.filter(f => f.error && (activeFilter === null || activeFilter === f.url))
    .forEach(f => { html += `<div class="error-banner">⚠ Błąd: ${esc(f.title)} — ${esc(f.error)}</div>` })

  if (translating) {
    html += '<div class="loading"><span class="spinner"></span>Tłumaczenie…</div>'
    container.innerHTML = html; articleCount.textContent = ''; return
  }

  const items = getVisible()
  _articleItems = items

  if (items.length === 0) {
    html += '<div class="empty-state"><div class="icon">📭</div><h3>Brak artykułów</h3><p>Kliknij ↺ aby odświeżyć.</p></div>'
    articleCount.textContent = ''
  } else {
    articleCount.textContent = items.length + ' artykułów'
    html += '<div class="articles">' + items.map((item, idx) => {
      const thumbHtml = item.imgUrl
        ? `<img class="article-thumb" src="${esc(item.imgUrl)}" alt="" loading="lazy" onerror="this.remove()">`
        : ''
      return `
      <div class="article-card" data-idx="${idx}" tabindex="0" role="button" aria-label="${esc(item.title)}">
        ${thumbHtml}
        <div class="article-body">
          <div class="article-meta">
            <span class="source-badge" style="background:${item.feedColor}">${esc(item.feedTitle)}</span>
            <span class="article-date">${fmtDate(item.date)}</span>
          </div>
          <div class="article-title">${getDisplayTitle(item)}</div>
          ${item.desc ? `<div class="article-desc">${esc(item.desc)}</div>` : ''}
        </div>
      </div>`
    }).join('') + '</div>'
  }
  container.innerHTML = html
}

// ---------- Feed discovery ----------
function setDiscovery(html) {
  const box = document.getElementById('discoveryBox')
  box.innerHTML = html
  box.style.display = html ? 'block' : 'none'
}

let _discovered = []

function showDiscoveryResults(found) {
  _discovered = found
  const items = found.map((f, i) =>
    `<div class="discovery-item">
       <span class="discovery-item-title" title="${esc(f.url)}">${esc(f.title)}</span>
       <button class="btn-add-sm" data-di="${i}">Dodaj</button>
     </div>`
  ).join('')
  setDiscovery(items)
}

async function discoverFeed(rawUrl) {
  let url = rawUrl.trim()
  if (!url) return
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url

  setDiscovery('<div class="discovery-status"><span class="spinner" style="width:14px;height:14px;margin:0"></span> Szukam kanału RSS…</div>')

  try {
    const results = await discoverFeedFromAPI(url)
    if (!results.length) {
      setDiscovery('<div class="discovery-status err">Nie znaleziono kanału RSS dla tej strony.</div>')
      return
    }
    if (results.length === 1) {
      setDiscovery('')
      addFeedDirect(results[0].url, results[0].title)
      return
    }
    showDiscoveryResults(results)
  } catch {
    setDiscovery('<div class="discovery-status err">Błąd podczas wyszukiwania kanału RSS.</div>')
  }
}

// ---------- Feed management ----------
function addFeedDirect(url, title) {
  if (feeds.find(f => f.url === url)) { showToast('Ten kanał już istnieje'); return }
  const color = COLORS[feeds.length % COLORS.length]
  const feed = { url, title: title || url, color, items: [], error: false }
  feeds.push(feed)
  saveState(); renderSidebar(); renderArticles()
  fetchFeed(feed).then(async () => {
    saveState(); renderSidebar()
    if (translateEnabled) await translateVisible(); else renderArticles()
  })
  showToast('Dodano: ' + (title || url))
}

function addFeed(rawUrl) {
  const url = rawUrl.trim()
  if (!url) return
  document.getElementById('feedInput').value = ''
  discoverFeed(url)
}

function removeFeed(url) {
  feeds = feeds.filter(f => f.url !== url)
  if (activeFilter === url) activeFilter = null
  saveState(); renderSidebar(); renderArticles()
  showToast('Kanał usunięty')
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open')
  document.getElementById('overlay').style.display = 'block'
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open')
  document.getElementById('overlay').style.display = 'none'
}

let toastTimer
function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg; t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500)
}

// ---------- Event listeners ----------
document.getElementById('menuBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.contains('open') ? closeSidebar() : openSidebar()
})
document.getElementById('overlay').addEventListener('click', closeSidebar)
document.getElementById('refreshBtn').addEventListener('click', fetchAll)
document.getElementById('addFeedForm').addEventListener('submit', e => {
  e.preventDefault(); addFeed(document.getElementById('feedInput').value)
})

// Konfiguracja adresu lokalnego backendu (paywall/NYT)
const localBackendInput = document.getElementById('localBackendInput')
const localBackendStatus = document.getElementById('localBackendStatus')
localBackendInput.value = getLocalBackend()

function setLocalStatus(msg, cls) {
  localBackendStatus.textContent = msg
  localBackendStatus.className = 'local-status' + (cls ? ' ' + cls : '')
}

async function saveAndTestLocalBackend() {
  const addr = localBackendInput.value.trim().replace(/\/+$/, '')
  setLocalBackend(addr)
  if (!addr) { setLocalStatus('Lokalny backend wyłączony'); showToast('Lokalny backend wyłączony'); return }
  setLocalStatus('Sprawdzam połączenie…')
  try {
    const res = await fetch(`${addr}/health`, { signal: AbortSignal.timeout(6000) })
    const data = await res.json()
    if (data?.ok) { setLocalStatus('✓ Połączono — pełne artykuły aktywne', 'ok'); showToast('Lokalny backend zapisany') }
    else throw new Error('zła odpowiedź')
  } catch {
    setLocalStatus('✗ Brak połączenia — sprawdź adres i czy kontener działa', 'err')
  }
}

document.getElementById('localBackendSave').addEventListener('click', saveAndTestLocalBackend)
localBackendInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveAndTestLocalBackend() } })

document.getElementById('discoveryBox').addEventListener('click', e => {
  const btn = e.target.closest('[data-di]')
  if (!btn) return
  const f = _discovered[parseInt(btn.dataset.di, 10)]
  if (f) { addFeedDirect(f.url, f.title); setDiscovery('') }
})

document.getElementById('translateBtn').addEventListener('click', async () => {
  translateEnabled = !translateEnabled
  const btn = document.getElementById('translateBtn')
  btn.classList.toggle('active', translateEnabled)
  btn.setAttribute('aria-pressed', String(translateEnabled))
  if (translateEnabled) { showToast('Tłumaczenie włączone'); await translateVisible() }
  else { showToast('Tłumaczenie wyłączone'); renderArticles() }
})

document.getElementById('articlesContainer').addEventListener('click', e => {
  const card = e.target.closest('[data-idx]')
  if (!card) return
  openReader(_articleItems[parseInt(card.dataset.idx, 10)])
})
document.getElementById('articlesContainer').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    const card = e.target.closest('[data-idx]')
    if (!card) return
    e.preventDefault()
    openReader(_articleItems[parseInt(card.dataset.idx, 10)])
  }
})

document.getElementById('readerClose').addEventListener('click', closeReader)
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeReader() })

;(function () {
  let sx = 0, sy = 0
  const el = document.getElementById('readerOverlay')
  el.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY }, { passive: true })
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx
    const dy = Math.abs(e.changedTouches[0].clientY - sy)
    if (dx > 80 && dy < 60) closeReader()
  }, { passive: true })
})()

// ---------- Init ----------
loadState()
renderSidebar()
fetchAll()
