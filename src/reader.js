import { proxyFetch } from './api.js'

let _readabilityPromise = null

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function loadReadability() {
  if (_readabilityPromise) return _readabilityPromise
  _readabilityPromise = new Promise((resolve, reject) => {
    if (typeof Readability !== 'undefined') { resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.min.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('Nie można załadować Readability'))
    document.head.appendChild(s)
  })
  return _readabilityPromise
}

export async function openReader(item) {
  const overlay = document.getElementById('readerOverlay')
  const body = document.getElementById('readerBody')
  const source = document.getElementById('readerSource')
  const extLink = document.getElementById('readerExternal')

  source.textContent = item.feedTitle
  extLink.href = item.link
  overlay.classList.add('open')
  document.body.style.overflow = 'hidden'
  body.innerHTML = '<div class="reader-loading"><span class="spinner"></span>Wczytywanie artykułu…</div>'
  body.scrollTop = 0

  try {
    await loadReadability()
    const html = await proxyFetch(item.link, 18000)
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    let base = doc.querySelector('base')
    if (!base) { base = doc.createElement('base'); doc.head.appendChild(base) }
    base.href = item.link

    const reader = new Readability(doc, { charThreshold: 20 })
    const article = reader.parse()

    if (!article?.content || article.content.trim().length < 50) {
      throw new Error('Nie udało się wyodrębnić treści')
    }

    const dateStr = item.date && !isNaN(item.date) && item.date.getTime() !== 0
      ? item.date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : ''

    body.innerHTML =
      '<h2 class="reader-article-title">' + esc(article.title || item.title) + '</h2>' +
      '<div class="reader-meta">' +
        esc(item.feedTitle) +
        (dateStr ? ' &middot; ' + dateStr : '') +
        (article.byline ? ' &middot; ' + esc(article.byline) : '') +
      '</div>' +
      article.content
  } catch {
    body.innerHTML =
      '<div class="reader-error">' +
        '<div class="reader-err-icon">&#128536;</div>' +
        '<h3>Nie można wczytać artykułu</h3>' +
        '<p>Strona może blokować zewnętrzny dostęp lub wymagać logowania.<br>Możesz otworzyć artykuł w przeglądarce.</p>' +
        '<a class="btn-open-browser" href="' + esc(item.link) + '" target="_blank" rel="noopener noreferrer">Otwórz w przeglądarce</a>' +
      '</div>'
  }
}

export function closeReader() {
  document.getElementById('readerOverlay').classList.remove('open')
  document.body.style.overflow = ''
}
