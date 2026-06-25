# CLAUDE.md

Wskazówki dla Claude Code pracującego w tym repo. Czytnik RSS: frontend (Vanilla JS +
Vite + PWA) + dwa backendy (Cloudflare Workers oraz lokalny Node/Docker dla paywalla).

## Branch i deploy
- **Pracuj na branchu `v2`** — to aktywny branch produkcyjny (zastąpił `main`). `main` to stara wersja (single-file HTML).
- Push na `v2` → GitHub Actions `deploy-v2.yml` buduje i publikuje na GitHub Pages `https://gacek78.github.io/Rss/`.
- Po zmianach we froncie commituj i pushuj na `v2`; deploy jest automatyczny (~1–3 min).

## ⚠️ Dwa buildy frontu (NAJCZĘSTSZA PUŁAPKA)
`vite.config.js` ustawia `base` zależnie od `CI`:
- **GitHub Pages** (podkatalog `/Rss/`): buduj z `CI=true npx vite build` → base `/Rss/`. Bez tego CSS/JS dają 404 na Pages.
- **Lokalny backend** (serwuje apkę z roota): zwykłe `npx vite build` → base `/`.
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

# Backend lokalny (paywall)
cd backend-local && docker compose up -d --build   # :3001
```
Środowisko: Windows, PowerShell + Bash (Git Bash). Uwaga na ścieżki — w Bashu `/c/projekty/rss`.

## Architektura — jak płynie żądanie
- **Feedy i discovery** → zawsze Cloudflare Workers (`backend/`). Endpointy: `/api/feed?url=`, `/api/discover?url=`, `/api/proxy?url=`.
- **Pełny artykuł (reader)** → `src/api.js` `proxyFetch()` routuje wg `proxyBase(url)`:
  - „hard" domeny (`HARD_DOMAINS = ['nytimes.com']`) → lokalny backend (jeśli ustawiony adres `rss_local_backend` w localStorage, albo gdy apka serwowana lokalnie `isLocalOrigin()`),
  - reszta → Workers.
- **Reader** (`src/reader.js`): `proxyFetch` → Readability (CDN) → `sanitizeContent()` → render.

## Parser RSS — krytyczne detale (`backend*/src/rss-parser.js`)
- Używa **`fast-xml-parser`** (pure-JS, działa na Workers). NIE `rss-parser` (Node-only — nie działa na Workers).
- `processEntities: false` + własny `decodeEntities()` — bo feedy Focus/CHIP przekraczają wbudowany limit 1000 encji (dawały 502).
- Obsługuje RSS, Atom, RDF. Kształt wyjścia: `{ title, feedUrl, items:[{title,link,desc,image,pubDate,feedUrl}], cachedAt }`. **Nie zmieniaj kształtu** — front (`src/main.js fetchFeed`) na nim polega.
- `backend/` (Workers) i `backend-local/` mają **kopie** parsera i discovery — zmieniasz logikę → zaktualizuj OBIE.

## sanitizeContent (`src/reader.js`) — czemu istnieje
Strony jak NYT zostawiają zagnieżdżone `div/span` z layoutem, które nakładały się na
tekst w czytniku. `sanitizeContent` spłaszcza `div/span` do dzieci, zdejmuje wszystkie
atrybuty poza `img[src,alt]`/`a[href]`, zamienia `<picture>`→`<img>`, usuwa placeholdery
„Advertisement". Efekt: czysty blokowy HTML. Nie upraszczaj tego z powrotem.

## NYT / DataDome — wiedza z bólu (NIE powtarzaj prób)
- NYT chroni **DataDome**. Workers (datacenter IP) = **403**. Lokalny backend zwykłym `fetch` z **rezydencjalnego IP + ważny cookie** = **200**, pełny artykuł.
- **Headless Chromium (Playwright) = 403** — DataDome wykrywa automatyzację (`navigator.webdriver`/CDP) MIMO cookie+IP. Próbowane i porzucone. Nie wracaj do headless.
- Cookie w `backend-local/.env` (`COOKIE_NYTIMES_COM=...`, gitignored). Token `datadome`/`_dd_s_v2` rotuje co kilkanaście minut → wymaga odświeżania (DevTools → Network → request do nytimes.com → Copy value linii Cookie).
- Telefon w domu: `backend-local` serwuje też zbudowaną apkę (`dist/` mount → `./public`), więc telefon otwiera `http://<IP-LAN>:3001` (jeden HTTP origin, bez mixed-content). `isLocalOrigin()` auto-routuje wtedy NYT do same-origin.

## Deep-linki do czytnika
`#read=<encURL>&src=<encŹródło>` → `openFromHash()` w `src/main.js` otwiera reader z linku
(bez wchodzenia na źródło). Używane przez brief na Telegramie. `closeReader` czyści hash.

## News brief (agent AI)
- Skill: `~/.claude/skills/news-brief/SKILL.md` — przesiewa feedy przez Workers, ocenia wg tematów (polityka/technologia/nauka/finanse/medycyna/świat), odrzuca szum, brief PL z deep-linkami.
- Codzienny brief o **13:30** leci z **OMV** (kontener `claude-brief`), nie z chmury. Mechanizm: wbudowany scheduler w `ops/claude-brief/poller.mjs` (`ENABLE_DAILY = true` + `scheduleDaily()`). Strefa czasu z `TZ=Europe/Warsaw` w `docker-compose.yml` → DST automatyczny (koniec ręcznego przesuwania crona). Stara chmurowa rutyna `trig_018crUPik9HKaic1AyqKDwvZ` jest **wyłączona** (`enabled:false`; API rutyn nie ma hard-delete) — zarządzasz nią narzędziem `RemoteTrigger` (`get`/`update`).
- Telegram: bot `@mynews_claude_bot`. Brief idzie na **dwa cele**: prywatny czat `chat_id 1931525385` (`TELEGRAM_CHAT_ID`) **i** publiczny kanał `@na_tacy` (`TELEGRAM_CHANNEL_ID`, `chat_id="@na_tacy"`) — bot musi być **adminem kanału** z prawem „Post Messages". Notyfikacje statusu („⏳ Robię brief…", błędy) lecą tylko na prywatny czat. Sekrety w `C:\projekty\rss\.telegram` (gitignored) → na OMV w `/data/.env`. Wysyłka: HTML, `disable_web_page_preview`, dziel <4096 zn.
- Setup OMV (kontener, scheduler, `/brief` z telefonu): `docs/omv-news-brief-setup.md`.

## OMV — deploy i dostęp (brief)
Tu mieszka cała „produkcja" briefu — zaczynaj stąd, zamiast czytać wszystkie pliki.
- **Co gdzie:** kontener `claude-brief` w `/compose/claude-brief/` na OMV (NIE git — pliki kopiowane przez pscp). Bind-mounty (`docker-compose.yml`): `poller.mjs` + `brief-prompt.txt` jako `:ro`, oraz `data/` (zawiera `.env` z sekretami i `.claude` = auth Claude Code). `poller.mjs` long-polluje Telegram (`getUpdates`) i na `/brief` od autoryzowanego `chat_id` spawnuje `claude -p "$(brief-prompt.txt)" --allowedTools "Bash Edit Write Read Glob Grep"`; całą robotę (feedy→triage→wysyłka) robi Claude wg `brief-prompt.txt`.
- **Dostęp do OMV** (host, hasła, plink/pscp): repo `C:\projekty\homelab-proxy` (jego `CLAUDE.md`). Skrót: `gacek@192.168.88.8`, narzędzia `C:\Program Files\PuTTY\{plink,pscp}.exe`, akceptacja klucza: `echo y | plink -ssh -pw <hasło> …`.
- **Deploy zmiany w briefie:** skopiuj zmienione pliki na OMV i **zrekreuj** kontener:
  ```bash
  pscp ops/claude-brief/{poller.mjs,brief-prompt.txt,docker-compose.yml} → /compose/claude-brief/
  ssh OMV: cd /compose/claude-brief && docker compose up -d   # recreate — sam `restart` NIE zaciągnie zmian w compose/.env
  ```
  Pliki `:ro` (poller/prompt) działają od razu po recreate; zmiana `docker-compose.yml`/`.env` **wymaga** `up -d`.
- **`.env` na OMV** (`/compose/claude-brief/data/.env`, chmod 600): klucze `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_CHANNEL_ID`, `CLAUDE_CODE_OAUTH_TOKEN`. NIGDY nie wypisuj wartości tokenów do logów/czatu (czytaj server-side). `CLAUDE_CODE_OAUTH_TOKEN` z `claude setup-token` (~105–110 zn, ważny rok); `auth status` pokaże `loggedIn:false` — to normalne (auth z env).
- **Diagnostyka/test:** `docker logs --tail=20 claude-brief`, `docker exec claude-brief date` (ma być czas warszawski). Brief jednorazowo (poza `/brief`): `docker exec -d claude-brief bash -lc 'claude -p "$(cat /app/brief-prompt.txt)" --allowedTools "Bash Edit Write Read Glob Grep" > /data/x.log 2>&1'` — w `-p` log zapełnia się dopiero na końcu (sukces = `EXIT_CODE=0`).

## Sekrety — NIGDY do repo
Gitignored i NIE commitować: `.env`, `backend-local/.env` (cookie NYT-S), `.telegram` (token bota),
`backend/.wrangler/`. Przed commitem sprawdź, czy nie wkleiłeś sekretu (`git ls-files | grep -E '\.env$|\.telegram'` powinno być puste). Główny `.env` był kiedyś śledzony — pilnuj.

## Konwencje
- Komentarze i UI po polsku (z pełnymi znakami diakrytycznymi).
- Vanilla JS, zero frameworków front. Trzymaj styl istniejącego kodu.
- Po zmianie parsera/backendu testuj realnym feedem (np. RMF24, Focus, NYT World) + sprawdź status 200 i liczbę itemów.
- Commit messages po angielsku, kończ `Co-Authored-By: Claude ...`.
