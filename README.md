# RSS Reader

Czytnik RSS po polsku — PWA instalowalna na telefonie, z trybem czytnika (czysty
tekst bez reklam).

🔗 **Live:** https://gacek78.github.io/Rss/

## Funkcje
- 📡 Agregacja kanałów RSS/Atom (polskie portale i inne źródła)
- 📖 **Tryb czytnika** — pełny artykuł jako czysty tekst (Readability), bez reklam i ciasteczek
- 🔎 Autodiscovery — wpisujesz domenę, aplikacja znajduje kanał RSS
- 📱 **PWA** — „Dodaj do ekranu głównego", działa offline (app shell + cache feedów)

## Architektura

```
Przeglądarka (PWA, Vite)
  └── feedy + artykuły ──► Cloudflare Workers  (rss-backend.gacek78.workers.dev)
                             /api/feed  /api/discover  /api/proxy
```

| Warstwa | Co | Gdzie |
|---------|-----|-------|
| **Frontend** | Vanilla JS + Vite + PWA (Workbox) | GitHub Pages |
| **Backend** | Hono na Cloudflare Workers — proxy RSS, parser (`fast-xml-parser`), cache 15 min (Cache API) | `backend/` |

## Struktura
```
index.html            # szkielet (montuje /src/main.js)
src/
  main.js             # stan, rendering, eventy, deep-linki #read=
  api.js              # wywołania backendu (Workers)
  reader.js           # tryb czytnika (Readability + sanitizeContent)
  style.css
vite.config.js        # Vite + vite-plugin-pwa; base '/Rss/' gdy CI=true
backend/              # Cloudflare Workers (wrangler)
```

## Rozwój

```bash
# Frontend
npm install
npm run dev          # http://localhost:5173 (łączy się z Workers prod via VITE_API_URL)

# Backend Workers (lokalnie)
cd backend && npm install && npx wrangler dev
```

`.env` (gitignored): `VITE_API_URL=https://rss-backend.gacek78.workers.dev`

> **Ważne — dwa buildy:** dla GitHub Pages buduj z `CI=true` (base `/Rss/`),
> dla dev/zwykłego builda `npm run build` (base `/`). Szczegóły w `CLAUDE.md`.

## Jak dodać nowy kanał RSS (developer) ⭐

**Plik do edycji: `src/main.js`, tablica `DEFAULT_FEEDS` (u góry pliku).**

To lista kanałów, którą dostaje każdy nowy użytkownik przy pierwszym uruchomieniu
appki (seed — patrz `loadState()` niżej w tym samym pliku). Każdy kanał to jeden
obiekt `{ url, title }`:

```js
const DEFAULT_FEEDS = [
  { url: 'https://www.rmf24.pl/nauka/feed', title: 'RMF24 Nauka' },
  // ...
  { url: 'https://przegladsportowy.onet.pl/.feed', title: 'Przegląd Sportowy' },
]
```

**Krok po kroku:**
1. Otwórz `src/main.js`, znajdź `DEFAULT_FEEDS`.
2. **Dodaj nową linię** obok istniejących — nie dotykaj żadnej z nich, tylko dopisz
   swoją na końcu (lub gdziekolwiek w tablicy): `{ url: 'https://example.pl/rss', title: 'Nazwa kanału' },`
3. Sprawdź składnię przed commitem: `node --check src/main.js`
4. (Polecane) sprawdź, że backend faktycznie umie sparsować ten feed:
   `curl "https://rss-backend.gacek78.workers.dev/api/feed?url=<URL_FEEDU>"` — powinieneś
   dostać JSON z `items`, nie błąd 500/502.
5. `npm run dev`, otwórz appkę, sprawdź czy kanał się wyświetla i pobiera artykuły.
6. Commit + push na `v2` → deploy automatyczny.

**⚠️ Najczęstszy błąd przy tej edycji** (już się zdarzył w historii tego repo):
zaznaczenie i przypadkowe skasowanie całej istniejącej linii zamiast dodania nowej
obok niej — zwłaszcza kopiując przez zaznaczenie w edytorze. Efekt: commit
"dodaję kanał X", który w diffie ma tylko `-1` (usunięcie), zero dodanych linii —
nowy kanał nigdzie się nie pojawia. **Zabezpieczenie: zawsze `git diff src/main.js`
przed commitem** — powinno być widać dodaną linię (`+1`), a nie usuniętą (`-1`)
w miejscu, którego nie miałeś zamiaru ruszać.

**Bez edycji kodu** — jeśli chcesz dodać kanał tylko dla siebie (nie na stałe dla
wszystkich), wpisz URL/domenę w pole „np. tvn24.pl lub URL RSS" w aplikacji i kliknij
`+`. To woła `/api/discover` i dodaje feed do Twojej **osobistej** listy w
`localStorage` (klucz `rss_feeds`) — bez zmiany kodu i deployu, ale tylko na tym
urządzeniu/przeglądarce.

`REMOVED_FEEDS` (zaraz pod `DEFAULT_FEEDS` w tym samym pliku) to odwrotność —
lista URL-i do usunięcia z już zapisanych subskrypcji wszystkich użytkowników
(np. feed przestał działać / zamknięty przez paywall).

## Deploy
- **Frontend:** push na branch `v2` → GitHub Actions (`.github/workflows/deploy-v2.yml`) buduje Vite i publikuje `dist/` na GitHub Pages. Wymaga zmiennej repo `VITE_API_URL`.
- **Backend Workers:** `cd backend && npx wrangler deploy`.

## Powiązane
Bot „news brief" na Telegramie (selekcja RSS przez AI) został wydzielony do osobnego,
samodzielnego repozytorium **`news-brief`** — to repo jest już wyłącznie czytnikiem.

## Licencja / status
Projekt osobisty. Aktywny development na branchu `v2` (zastąpił `main`).
