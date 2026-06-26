# CLAUDE.md

Wskazówki dla Claude Code pracującego w tym repo. Czytnik RSS: frontend (Vanilla JS +
Vite + PWA) + backend na Cloudflare Workers (feedy, discovery, proxy artykułów).

## Branch i deploy
- **Pracuj na branchu `v2`** — to aktywny branch produkcyjny (zastąpił `main`). `main` to stara wersja (single-file HTML).
- Push na `v2` → GitHub Actions `deploy-v2.yml` buduje i publikuje na GitHub Pages `https://gacek78.github.io/Rss/`.
- Po zmianach we froncie commituj i pushuj na `v2`; deploy jest automatyczny (~1–3 min).

## ⚠️ Dwa buildy frontu (NAJCZĘSTSZA PUŁAPKA)
`vite.config.js` ustawia `base` zależnie od `CI`:
- **GitHub Pages** (podkatalog `/Rss/`): buduj z `CI=true npx vite build` → base `/Rss/`. Bez tego CSS/JS dają 404 na Pages.
- **Dev/zwykły build** (base `/`): `npm run dev` i `npx vite build`.
GitHub Actions ustawia `CI=true` samo. Lokalnie pamiętaj o rozróżnieniu.

## Komendy
```bash
# Frontend
npm run dev                      # Vite dev :5173
CI=true npx vite build           # build dla GitHub Pages (/Rss/)
npx vite build                   # build dla lokalnego backendu (/)

# Backend Workers
cd backend && npx wrangler dev   # :8787
cd backend && npx wrangler deploy
```
Środowisko: Windows, PowerShell + Bash (Git Bash). Uwaga na ścieżki — w Bashu `/c/projekty/rss`.

## Architektura — jak płynie żądanie
- **Feedy, discovery i pełne artykuły** → zawsze Cloudflare Workers (`backend/`). Endpointy: `/api/feed?url=`, `/api/discover?url=`, `/api/proxy?url=`.
- **Reader** (`src/reader.js`): `proxyFetch()` (`src/api.js`) → Workers `/api/proxy` → Readability (CDN) → `sanitizeContent()` → render.

## Parser RSS — krytyczne detale (`backend/src/rss-parser.js`)
- Używa **`fast-xml-parser`** (pure-JS, działa na Workers). NIE `rss-parser` (Node-only — nie działa na Workers).
- `processEntities: false` + własny `decodeEntities()` — bo feedy Focus/CHIP przekraczają wbudowany limit 1000 encji (dawały 502).
- Obsługuje RSS, Atom, RDF. Kształt wyjścia: `{ title, feedUrl, items:[{title,link,desc,image,pubDate,feedUrl}], cachedAt }`. **Nie zmieniaj kształtu** — front (`src/main.js fetchFeed`) na nim polega.
- Kopia parsera żyje też w osobnym repo `news-brief` (`lib/rss-parser.mjs`) — zmieniasz logikę, zaktualizuj tam też.

## sanitizeContent (`src/reader.js`) — czemu istnieje
Niektóre strony zostawiają zagnieżdżone `div/span` z layoutem i bloki `<style>`, które
nakładały się na tekst w czytniku (np. tytuł łamany w pionie). `sanitizeContent` usuwa
elementy nie-treściowe (`style`/`script`/`svg`/`iframe`…), spłaszcza `div/span` do dzieci,
zdejmuje wszystkie atrybuty poza `img[src,alt]`/`a[href]`, zamienia `<picture>`→`<img>`,
usuwa placeholdery „Advertisement". Efekt: czysty blokowy HTML. Nie upraszczaj tego z powrotem.

## Deep-linki do czytnika
`#read=<encURL>&src=<encŹródło>` → `openFromHash()` w `src/main.js` otwiera reader z linku
(bez wchodzenia na źródło). `closeReader` czyści hash.

> **News brief** (bot Telegram) został wydzielony do osobnego repo `news-brief`
> (`C:\projekty\news-brief`, GitHub `gacek78/news-brief`). To repo to już **tylko czytnik RSS**.

## Sekrety — NIGDY do repo
Gitignored i NIE commitować: `.env`, `backend/.wrangler/`.
Przed commitem sprawdź, czy nie wkleiłeś sekretu (`git ls-files | grep -E '\.env$'` powinno być puste).
Główny `.env` był kiedyś śledzony — pilnuj.

## Konwencje
- Komentarze i UI po polsku (z pełnymi znakami diakrytycznymi).
- Vanilla JS, zero frameworków front. Trzymaj styl istniejącego kodu.
- Po zmianie parsera/backendu testuj realnym feedem (np. RMF24, Focus, Spider's Web) + sprawdź status 200 i liczbę itemów.
- Commit messages po angielsku, kończ `Co-Authored-By: Claude ...`.
