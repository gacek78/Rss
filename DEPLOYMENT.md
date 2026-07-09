# Deployment

Dwie osobne rzeczy do wdrożenia — **frontend** (automatycznie) i **backend**
(ręcznie). Nie mylić: push na `v2` wdraża tylko frontend, backend trzeba
wdrożyć osobną komendą.

## Frontend → GitHub Pages (automatyczny)

**Trigger:** push na branch `v2` (albo ręcznie: zakładka *Actions* →
"Deploy v2 to GitHub Pages" → *Run workflow*).

**Workflow:** `.github/workflows/deploy-v2.yml`

Co się dzieje:
1. `npm ci`
2. `npm run build` (czyli `vite build`) — z env `VITE_API_URL` wziętym ze
   zmiennej repo (Settings → Secrets and variables → Actions → **Variables**
   → `VITE_API_URL`). GitHub Actions ustawia `CI=true` samo na każdym runnerze,
   więc `vite.config.js` automatycznie buduje z `base: '/Rss/'` — nie trzeba
   nic dodatkowo ustawiać w workflow.
3. Upload `dist/` jako Pages artifact, deploy na `https://gacek78.github.io/Rss/`.

Całość trwa **~1–3 min**. Sprawdź status:
```bash
gh run list --workflow=deploy-v2.yml --limit 5
```

**Zanim pushniesz** — zbuduj lokalnie dokładnie tak jak CI, żeby złapać błędy
przed deployem:
```bash
CI=true npx vite build
npx vite preview     # podgląd builda produkcyjnego lokalnie
```

**Rollback:** `git revert <sha>` i push na `v2` (nowy commit, nowy deploy) —
albo w zakładce *Actions* znajdź poprzedni udany run i *Re-run all jobs*.

> ⚠️ Istnieje też stary `.github/workflows/deploy.yml`, spięty z push na
> `main` — wdraża starą, jednoplikową wersję appki. `main` nie jest aktywnie
> rozwijany; nie pushuj tam niczego związanego z obecną wersją (`v2`).

## Backend → Cloudflare Workers (ręczny)

Backend **nie** ma automatycznego deployu — zmiana w `backend/src/` nie robi
nic, dopóki nie odpalisz ręcznie:

```bash
cd backend
npx wrangler deploy
```

Wymaga zalogowania do Cloudflare (`npx wrangler login` przy pierwszym razie,
albo zmienna `CLOUDFLARE_API_TOKEN` w środowisku dla CI/headless). Worker
nazywa się `rss-backend` (`backend/wrangler.toml`), bez sekretów/env vars —
to bezstanowy proxy, nic dodatkowego nie trzeba konfigurować w Cloudflare.

**Test lokalny przed deployem:**
```bash
cd backend && npx wrangler dev     # :8787
curl "http://localhost:8787/health"
curl "http://localhost:8787/api/feed?url=https://spidersweb.pl/feed"
```

**Weryfikacja po deployu:**
```bash
curl "https://rss-backend.gacek78.workers.dev/health"
curl "https://rss-backend.gacek78.workers.dev/api/feed?url=<jakiś realny feed>"
```
Oczekiwane: `200` i JSON z `items`. Błąd 500/502 na konkretnym feedzie zwykle
znaczy, że parser (`backend/src/rss-parser.js`) nie radzi sobie z jego
formatem (np. przekroczony limit encji XML — patrz historia commitów
"Fix Focus/CHIP feeds hitting fast-xml-parser entity limit").

## Zmienne środowiskowe / sekrety

| Nazwa | Gdzie żyje | Do czego | Sekret? |
|---|---|---|---|
| `VITE_API_URL` | `.env` lokalnie (gitignored) / zmienna repo GitHub Actions (`vars.VITE_API_URL`) | URL backendu wpiekany w bundle JS przy buildzie frontendu | Nie — to publiczny URL Workera, i tak widoczny w każdym zbudowanym JS-ie |
| `CLOUDFLARE_API_TOKEN` | Twoje lokalne środowisko / `wrangler login` | Autoryzacja `wrangler deploy` do backendu | Tak — nigdy do repo |

Backend sam w sobie nie czyta żadnych sekretów w runtime (brak `env.*` w
`backend/src`) — cała jego logika to proxy + parsing, bez kluczy API.

## Po deployu — jak sprawdzić, że działa

- **Frontend:** otwórz `https://gacek78.github.io/Rss/`, spróbuj dodać kanał
  (patrz `README.md` → *Jak dodać nowy kanał RSS*), sprawdź konsolę
  przeglądarki pod kątem błędów 404 na CSS/JS (objaw pomylonego `base`).
- **Backend:** `curl .../health` → `200`, plus jeden realny `/api/feed`.
- **Ruch:** Cloudflare dashboard → Web Analytics (`gacek78.github.io`, filtr
  `Path = /Rss/`) oraz Workers & Pages → `rss-backend` → Metrics (liczba
  żądań `/api/proxy` ≈ liczba otwarć czytnika). Szczegóły w `CLAUDE.md`.

## Typowe problemy

- **CSS/JS 404 na GitHub Pages** → zbudowano bez `CI=true` (base `/` zamiast
  `/Rss/`). Zobacz sekcję "dwa buildy" w `README.md`/`CLAUDE.md`.
- **Stara wersja appki mimo udanego deployu** → Service Worker PWA wciąż
  serwuje poprzedni bundle z cache. `registerType: 'autoUpdate'`
  (`vite.config.js`) powinien to załatwić sam po odświeżeniu strony, ale
  czasem trzeba: zamknąć/otworzyć appkę ponownie albo wymusić twarde
  odświeżenie (Ctrl+Shift+R / wyczyszczenie danych strony w ustawieniach PWA).
- **Feed daje 500/502 przez backend** → parser nie radzi sobie z konkretnym
  XML-em (limit encji, nietypowy format) — patrz `backend/src/rss-parser.js`,
  nie jest to problem deploya.
