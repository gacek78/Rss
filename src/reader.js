import { proxyFetch } from './api.js'

let _readabilityPromise = null

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Sprowadza treść z Readability do prostego, blokowego HTML. Strony jak NYT
// zostawiają zagnieżdżone <div>/<span> z layoutem, responsywne <picture> i
// placeholdery reklam, które nakładają się na tekst/obrazki w czytniku.
// Po spłaszczeniu zostają tylko semantyczne bloki — nakładanie jest niemożliwe.
const KEEP_ATTRS = { IMG: ['src', 'alt'], A: ['href'] }
const AD_TEXT = ['advertisement', 'skip advertisement', 'reklama']

function sanitizeContent(html) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html

  // Usuń elementy nie-treściowe RAZEM z zawartością. Kluczowe: <style> przeżywał
  // (zdejmujemy atrybuty i płaszczymy div/span, ale nie kasowaliśmy samego taga),
  // a jego reguły CSS wstrzykiwały się do czytnika i celując w ocalałe tagi
  // (p/h1/figure) wymuszały writing-mode/width → pionowy, nakładający się tekst.
  tmp.querySelectorAll('style, script, link, noscript, meta, base, template, svg, iframe, head').forEach(el => el.remove())

  // <picture> (responsive) → zwykły <img> (fallback lub pierwszy srcset)
  tmp.querySelectorAll('picture').forEach(pic => {
    let img = pic.querySelector('img')
    if (!img) {
      const src = pic.querySelector('source')?.getAttribute('srcset')?.split(/[ ,]/)[0]
      if (src) { img = document.createElement('img'); img.src = src }
    }
    if (img) pic.replaceWith(img); else pic.remove()
  })

  // Usuń placeholdery reklam (puste "Advertisement"/"SKIP ADVERTISEMENT")
  tmp.querySelectorAll('p, a, div, span').forEach(el => {
    if (AD_TEXT.includes(el.textContent.trim().toLowerCase())) el.remove()
  })

  // Zdejmij wszystkie atrybuty poza img[src,alt] i a[href]
  tmp.querySelectorAll('*').forEach(el => {
    const keep = KEEP_ATTRS[el.tagName] || []
    ;[...el.attributes].forEach(attr => {
      if (!keep.includes(attr.name)) el.removeAttribute(attr.name)
    })
  })

  // Rozpłaszcz <div>/<span> do ich dzieci — zostają tylko bloki semantyczne
  tmp.querySelectorAll('div, span').forEach(el => el.replaceWith(...el.childNodes))

  return tmp.innerHTML
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
    const dateStr = item.date && !isNaN(item.date) && item.date.getTime() !== 0
      ? item.date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : ''

    await loadReadability()
    const html = await proxyFetch(item.link, 18000)
    const doc = new DOMParser().parseFromString(html, 'text/html')
    let base = doc.querySelector('base')
    if (!base) { base = doc.createElement('base'); doc.head.appendChild(base) }
    base.href = item.link
    const article = new Readability(doc, { charThreshold: 20 }).parse()
    if (!article?.content || article.content.trim().length < 50) {
      throw new Error('Nie udało się wyodrębnić treści')
    }
    const title = article.title || item.title
    const byline = article.byline
    const content = sanitizeContent(article.content)

    body.innerHTML =
      '<h2 class="reader-article-title">' + esc(title) + '</h2>' +
      '<div class="reader-meta">' +
        esc(item.feedTitle) +
        (dateStr ? ' &middot; ' + dateStr : '') +
        (byline ? ' &middot; ' + esc(byline) : '') +
      '</div>' +
      content
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
  // Wyczyść hash deep-linku, żeby zamknięcie nie otwierało artykułu ponownie
  if (location.hash.startsWith('#read=')) {
    history.replaceState(null, '', location.pathname + location.search)
  }
}
