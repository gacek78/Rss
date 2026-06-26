import { proxyFetch } from './api.js'

let _readabilityPromise = null

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Sprowadza treść z Readability do prostego, blokowego HTML. Niektóre strony
// zostawiają zagnieżdżone <div>/<span> z layoutem, responsywne <picture> i
// placeholdery reklam, które nakładają się na tekst/obrazki w czytniku.
// Po spłaszczeniu zostają tylko semantyczne bloki — nakładanie jest niemożliwe.
const KEEP_ATTRS = { IMG: ['src', 'alt'], A: ['href', 'target', 'rel'] }
const AD_TEXT = ['advertisement', 'skip advertisement', 'reklama']

// Mapuje src osadzonego <iframe> (YouTube/Spotify/Vimeo) na kanoniczny link „do obejrzenia".
// Embeddy i tak nie odpalą się w czytniku — zamiast znikać, zostają klikalnym linkiem.
function embedToLink(rawSrc) {
  let src = (rawSrc || '').trim()
  if (!src) return null
  if (src.startsWith('//')) src = 'https:' + src
  let m
  if ((m = src.match(/(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/|youtube\.com\/watch\?v=)([\w-]{6,})/i)))
    return { href: 'https://www.youtube.com/watch?v=' + m[1], label: '▶ Obejrzyj na YouTube' }
  if ((m = src.match(/open\.spotify\.com\/(?:embed\/)?(\w+\/[\w]+)/i)))
    return { href: 'https://open.spotify.com/' + m[1], label: '▶ Posłuchaj na Spotify' }
  if ((m = src.match(/player\.vimeo\.com\/video\/(\d+)/i)))
    return { href: 'https://vimeo.com/' + m[1], label: '▶ Obejrzyj na Vimeo' }
  return null
}

function sanitizeContent(html) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html

  // Rozpoznane embeddy (YouTube/Spotify/Vimeo) → klikalny link, ZANIM iframe zniknie niżej.
  tmp.querySelectorAll('iframe[src]').forEach(fr => {
    const link = embedToLink(fr.getAttribute('src'))
    if (!link) return
    const a = document.createElement('a')
    a.href = link.href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.textContent = link.label
    const p = document.createElement('p')
    p.appendChild(a)
    fr.replaceWith(p)
  })

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

  // Usuń obrazki-placeholdery z data: src (spacery, piksele trackujące, szary
  // „Video placeholder" NatGeo) — nigdy nie są realną treścią. Pusty wrapper po nich
  // zniknie przy rozpłaszczaniu div/span niżej.
  tmp.querySelectorAll('img').forEach(img => {
    if ((img.getAttribute('src') || '').trim().toLowerCase().startsWith('data:')) img.remove()
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

  // Wyrzuć puste <figure> osierocone po usuniętym medium (sam margines, bez treści)
  tmp.querySelectorAll('figure').forEach(fig => {
    if (!fig.querySelector('img, video, picture, table, a') && !fig.textContent.trim()) fig.remove()
  })

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
  const wasOpen = overlay.classList.contains('open')

  source.textContent = item.feedTitle
  extLink.href = item.link
  overlay.classList.add('open')
  // Dorzuć wpis do historii, by sprzętowy/przeglądarkowy Wstecz zamykał czytnik
  // (a nie wychodził ze strony). Tylko gdy czytnik nie był już otwarty.
  if (!wasOpen) history.pushState({ reader: true }, '')
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

// Zamknięcie z UI (przycisk „Wróć”/Esc/swipe): jeśli otwarcie dorzuciło wpis do
// historii, cofnij się — `popstate` (w main.js) domknie czytnik. Dzięki temu URL
// zostaje czysty i zachowanie jest spójne ze sprzętowym Wstecz.
export function closeReader() {
  if (history.state?.reader) { history.back(); return }
  closeReaderNow()
}

// Faktyczne domknięcie czytnika. Wołane bezpośrednio z `popstate` (Wstecz) oraz
// przez closeReader() gdy nie było wpisu w historii (np. otwarcie bez pushState).
export function closeReaderNow() {
  document.getElementById('readerOverlay').classList.remove('open')
  document.body.style.overflow = ''
  // Wyczyść hash deep-linku, żeby zamknięcie nie otwierało artykułu ponownie
  if (location.hash.startsWith('#read=')) {
    history.replaceState(null, '', location.pathname + location.search)
  }
}
