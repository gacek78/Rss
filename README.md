# RSS Reader

Czytnik RSS po polsku — PWA instalowalna na telefonie, z trybem czytnika (czysty
tekst bez reklam), tłumaczeniem EN→PL i agentem AI, który przesiewa newsy i wysyła
zwięzły brief na Telegram.

🔗 **Live:** https://gacek78.github.io/Rss/

## Funkcje
- 📡 Agregacja kanałów RSS/Atom (polskie portale + New York Times)
- 📖 **Tryb czytnika** — pełny artykuł jako czysty tekst (Readability), bez reklam i ciasteczek
- 🌍 Tłumaczenie tytułów EN→PL na żądanie
- 🔎 Autodiscovery — wpisujesz domenę, aplikacja znajduje kanał RSS
- 📱 **PWA** — „Dodaj do ekranu głównego", działa offline (app shell + cache feedów)
- 🤖 **News brief** — agent AI przesiewa ~200 artykułów, wybiera warte uwagi i wysyła brief na Telegram (codziennie 13:30 + na żądanie)
- 🔒 **NYT za paywallem** — czytany przez domowy backend z sesją użytkownika (legalny dostęp z własnej subskrypcji)

## Architektura

```
Przeglądarka (PWA, Vite)
  ├── feedy + zwykłe artykuły ──► Cloudflare Workers  (rss-backend.gacek78.workers.dev)
  │                                 /api/feed  /api/discover  /api/proxy
  └── artykuły NYT (paywall)  ──► lokalny backend (Docker, dom)  /api/proxy + cookie sesji
```

| Warstwa | Co | Gdzie |
|---------|-----|-------|
| **Frontend** | Vanilla JS + Vite + PWA (Workbox) | GitHub Pages |
| **Backend (chmura)** | Hono na Cloudflare Workers — proxy RSS, parser (`fast-xml-parser`), cache 15 min (Cache API) | `backend/` |
| **Backend (lokalny)** | Hono na Node w Dockerze — to samo + treść za paywallem z rezydencjalnego IP + cookie | `backend-local/` |
| **Brief AI** | Skill `news-brief` + rutyna w chmurze → Telegram | `~/.claude/skills/news-brief/` |

Dlaczego dwa backendy: Workers jest darmowy i zawsze online, ale jego datacenter-IP
dostaje 403 od ochron anti-bot (NYT/DataDome). Lokalny backend fetchuje z domowego IP
+ cookie Twojej sesji NYT, więc pełne artykuły działają (w domu).

## Struktura
```
index.html            # szkielet (montuje /src/main.js)
src/
  main.js             # stan, rendering, eventy, deep-linki #read=
  api.js              # routing do backendów (Workers vs lokalny dla "hard" domen)
  reader.js           # tryb czytnika (Readability + sanitizeContent)
  translate.js        # tłumaczenie EN→PL (MyMemory API)
  style.css
vite.config.js        # Vite + vite-plugin-pwa; base '/Rss/' gdy CI=true
backend/              # Cloudflare Workers (wrangler)
backend-local/        # Node + Docker (paywall, dom)
docs/                 # plany wykonawcze (np. Claude Code na OMV)
```

## Rozwój

```bash
# Frontend
npm install
npm run dev          # http://localhost:5173 (łączy się z Workers prod via VITE_API_URL)

# Backend Workers (lokalnie)
cd backend && npm install && npx wrangler dev

# Backend lokalny (paywall) w Dockerze
cd backend-local && docker compose up -d   # http://localhost:3001
```

`.env` (gitignored): `VITE_API_URL=https://rss-backend.gacek78.workers.dev`

> **Ważne — dwa buildy:** dla GitHub Pages buduj z `CI=true` (base `/Rss/`),
> dla lokalnego backendu zwykłe `npm run build` (base `/`). Szczegóły w `CLAUDE.md`.

## Deploy
- **Frontend:** push na branch `v2` → GitHub Actions (`.github/workflows/deploy-v2.yml`) buduje Vite i publikuje `dist/` na GitHub Pages. Wymaga zmiennej repo `VITE_API_URL`.
- **Backend Workers:** `cd backend && npx wrangler deploy`.
- **Backend lokalny:** `cd backend-local && docker compose up -d --build`.

## NYT / treść za paywallem
Czytanie własnej, opłaconej subskrypcji w wygodnym formacie. Wymaga uruchomionego
`backend-local` z cookie sesji w `backend-local/.env` (`COOKIE_NYTIMES_COM=...`, gitignored).
Cookie DataDome rotuje co kilkanaście minut → trzeba je okresowo odświeżać.
Headless (Playwright) **nie** działa — DataDome wykrywa automatyzację. Szczegóły: `CLAUDE.md`.

## Licencja / status
Projekt osobisty. Aktywny development na branchu `v2` (zastąpił `main`).
