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

## Deploy
- **Frontend:** push na branch `v2` → GitHub Actions (`.github/workflows/deploy-v2.yml`) buduje Vite i publikuje `dist/` na GitHub Pages. Wymaga zmiennej repo `VITE_API_URL`.
- **Backend Workers:** `cd backend && npx wrangler deploy`.

## Powiązane
Bot „news brief" na Telegramie (selekcja RSS przez AI) został wydzielony do osobnego,
samodzielnego repozytorium **`news-brief`** — to repo jest już wyłącznie czytnikiem.

## Licencja / status
Projekt osobisty. Aktywny development na branchu `v2` (zastąpił `main`).
