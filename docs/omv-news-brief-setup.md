# Plan: Claude Code na OMV → news brief na żądanie (/brief z telefonu) + 13:30

> Dokument do realizacji w osobnej sesji. Spisany 2026-06-24.
> Cel: postawić na OpenMediaVault (NAS, 24/7) kontener z **Claude Code**, który
> daje brief **na żądanie z telefonu** (piszesz `/brief` do bota) **bez laptopa
> i bez kosztów API** — Claude Code loguje się Twoją **subskrypcją**, nie API.

---

## Kontekst (co już działa — NIE ruszać)
- Czytnik RSS (PWA): `https://gacek78.github.io/Rss/` (repo `gacek78/Rss`, branch `v2`).
- Backend feedów: Cloudflare Workers `https://rss-backend.gacek78.workers.dev` (parsuje RSS→JSON).
- Deep-linki do czytnika: `https://gacek78.github.io/Rss/#read=<encURL>&src=<encŹródło>`.
- Bot Telegram: `@mynews_claude_bot`. Token + chat_id są w `C:\projekty\rss\.telegram` (gitignored) — wartości do przeniesienia na OMV (NIE commitować).
- **Rutyna w chmurze** „News brief na Telegram", id `trig_018crUPik9HKaic1AyqKDwvZ`, cron `30 11 * * *` UTC = 13:30 Warsaw. Robi brief 13:30. Zarządzanie: https://claude.ai/code/routines/trig_018crUPik9HKaic1AyqKDwvZ
- Skill referencyjny (logika briefu): `~/.claude/skills/news-brief/SKILL.md`.

## Decyzja: podział obowiązków
Najprościej i bez duplikacji:
- **Chmura (już jest)** → 13:30 zaplanowany brief. Zostawiamy, zero utrzymania.
- **OMV (do zrobienia)** → **tylko `/brief` na żądanie** z telefonu (to, czego chmura nie daje bez API).
- Opcjonalnie później: jeśli OMV okaże się stabilny, można przenieść też 13:30 na OMV i wyłączyć rutynę w chmurze. Na start NIE duplikować 13:30.

---

## Architektura
„Claude na OMV" NIE liczy modelu lokalnie. Myślenie (selekcja/streszczenia) dzieje
się na serwerach Anthropic przez subskrypcję; OMV uruchamia **klienta Claude Code +
nasłuch Telegrama**. NAS potrzebuje tylko internetu.

```
Telefon ──"/brief"──► @mynews_claude_bot (Telegram)
                           │ getUpdates (long-poll)
                  ┌────────▼─────────┐
                  │  OMV: kontener   │  poller.mjs widzi /brief od Twojego chat_id
                  │  claude-brief    │  → uruchamia: claude -p "<BRIEF_PROMPT>"
                  │  (Claude Code)   │  Claude Code: curl feedy → triage → sendMessage
                  └────────┬─────────┘
                           ▼
                 Telegram ◄── brief (4 wiadomości HTML z deep-linkami)
```

---

## Wymagania wstępne (do potwierdzenia na OMV)
1. **Docker / docker compose** na OMV (jest — działa tam już `rss-local`). Potwierdzić: `docker version`.
2. **Internet wychodzący** z kontenera (Telegram API, Workers, Anthropic).
3. **Plan Claude** z dostępem do Claude Code (subskrypcja, jak na laptopie).
4. Dostęp do OMV: SSH (host, użytkownik, hasło/klucz) **albo** OMV web UI z wtyczką Docker/Portainer.

---

## Pliki do utworzenia na OMV (np. `/srv/dev-disk.../claude-brief/`)

### `Dockerfile`
```dockerfile
FROM node:20
RUN npm install -g @anthropic-ai/claude-code
WORKDIR /app
COPY poller.mjs brief-prompt.txt ./
# Trzymaj logowanie Claude Code w zamontowanym wolumenie, by przetrwało restart
ENV CLAUDE_CONFIG_DIR=/data/.claude
CMD ["node", "poller.mjs"]
```
> ⚠️ Do zweryfikowania przy wykonaniu: dokładna nazwa zmiennej katalogu configu
> (`CLAUDE_CONFIG_DIR`) oraz pakiet (`@anthropic-ai/claude-code`) — sprawdzić aktualną
> dokumentację Claude Code. Jeśli inna — dostosować ścieżkę wolumenu poniżej.

### `docker-compose.yml`
```yaml
services:
  claude-brief:
    build: .
    container_name: claude-brief
    restart: unless-stopped
    volumes:
      - ./data:/data          # .claude (auth) + .env (sekrety) — POZA repo
    environment:
      - CLAUDE_CONFIG_DIR=/data/.claude
```

### `data/.env` (sekrety — NIE commitować, chmod 600)
```
TELEGRAM_BOT_TOKEN=<z C:\projekty\rss\.telegram>
TELEGRAM_CHAT_ID=1931525385
```

### `brief-prompt.txt` (samowystarczalny prompt — ta sama logika co rutyna w chmurze)
Treść = prompt z rutyny `trig_018crUPik9HKaic1AyqKDwvZ` (KROK 1–7: pobierz 15 feedów
przez Workers, przesiej szum, wybierz ~15-20 wg tematów polityka/technologia/nauka/
finanse/medycyna/świat, streszczenia PL, deep-linki do czytnika, wyślij ~4 wiadomości
HTML na Telegram). Pobrać aktualną wersję przez `RemoteTrigger get trig_018crUPik9HKaic1AyqKDwvZ`
i wkleić do pliku. Token/chat_id wstrzyknąć z env (nie hardkodować w pliku).

### `poller.mjs` (nasłuch Telegrama + opcjonalny timer)
```js
import { spawn } from 'child_process'
import fs from 'fs'

const env = fs.readFileSync('/data/.env', 'utf8')
const TOKEN = env.match(/TELEGRAM_BOT_TOKEN=(.+)/)[1].trim()
const CHAT  = env.match(/TELEGRAM_CHAT_ID=(.+)/)[1].trim()
const PROMPT = fs.readFileSync('/app/brief-prompt.txt', 'utf8')
const API = `https://api.telegram.org/bot${TOKEN}`

let running = false

async function tg(text) {
  await fetch(`${API}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text, disable_web_page_preview: true }),
  }).catch(() => {})
}

function runBrief(reason) {
  if (running) { tg('⏳ Brief już się robi, chwila…'); return }
  running = true
  tg(`⏳ Robię brief (${reason})…`)
  // Kontener jest izolowany → pełna autonomia narzędzi jest OK
  const p = spawn('claude', ['-p', PROMPT, '--dangerously-skip-permissions'],
                  { stdio: 'inherit', env: { ...process.env } })
  p.on('exit', code => {
    running = false
    if (code !== 0) tg(`⚠️ Brief zakończył się błędem (kod ${code}).`)
  })
}

// Long-poll: reaguj tylko na /brief od autoryzowanego chat_id
let offset = 0
async function poll() {
  for (;;) {
    try {
      const r = await fetch(`${API}/getUpdates?offset=${offset}&timeout=30`).then(r => r.json())
      if (r && r.ok) for (const u of r.result) {
        offset = u.update_id + 1
        const m = u.message
        if (m && String(m.chat.id) === CHAT && /^\/brief\b/.test(m.text || '')) {
          runBrief('na żądanie')
        }
      }
    } catch { await new Promise(r => setTimeout(r, 3000)) }
  }
}

// (Opcjonalnie) lokalny 13:30 — NA START WYŁĄCZONE, bo robi to chmura.
// Włączyć tylko jeśli wyłączysz rutynę w chmurze, by nie dublować.
const ENABLE_DAILY = false
function scheduleDaily() {
  if (!ENABLE_DAILY) return
  const now = new Date()
  const next = new Date(now); next.setHours(13, 30, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  setTimeout(() => { runBrief('harmonogram 13:30'); scheduleDaily() }, next - now)
}

tg('🤖 Bot briefów wystartował. Napisz /brief, żeby dostać świeży przegląd.')
scheduleDaily()
poll()
```

---

## Logowanie Claude Code (jednorazowe — najtrudniejszy krok)
Claude Code na bezgłowym serwerze trzeba zalogować raz; token potem **sam się
odświeża**, dopóki nie wygaśnie całkiem (wtedy powtórzyć).

1. Zbuduj obraz: `docker compose build`
2. Odpal interaktywnie do logowania:
   `docker compose run --rm claude-brief claude`
   - Claude Code wypisze URL logowania. Otwórz go na DOWOLNYM urządzeniu z przeglądarką,
     zaloguj się subskrypcją, wklej kod z powrotem w terminalu.
   - Dane logowania zapiszą się w `./data/.claude` (wolumen) → przetrwają restart.
3. Sprawdź, że działa headless: `docker compose run --rm claude-brief claude -p "napisz OK"`
   → powinno odpisać bez proszenia o logowanie.
4. Start daemona: `docker compose up -d`
5. Z telefonu napisz `/brief` do `@mynews_claude_bot` → po chwili powinien przyjść brief.

> ⚠️ Do zweryfikowania przy wykonaniu: dokładna komenda logowania (`claude` vs
> `claude login` vs `claude setup-token`) i czy `--dangerously-skip-permissions`
> to aktualna nazwa flagi pełnej autonomii. Sprawdzić `claude --help`.

---

## Jeśli to robi Claude przez SSH (wariant „zrób sam")
Mogę postawić to sam w nowej sesji, jeśli dostanę dostęp. Potrzebne:
1. **SSH do OMV**: host/IP, użytkownik, hasło lub klucz (podasz w sesji — użyję ostrożnie,
   nie zapiszę do repo). Albo dostęp do Portainer/OMV-Docker UI.
2. **Potwierdzenie, że Docker działa** na OMV (`docker version`).
3. **Twoja obecność do kroku logowania** — krok OAuth Claude Code wymaga otwarcia URL
   w przeglądarce i wklejenia kodu; to musisz zrobić Ty (ja przygotuję wszystko inne i
   dam Ci gotowy URL/komendę).
Co zrobię sam: utworzę katalog, pliki (Dockerfile/compose/poller/brief-prompt), wstrzyknę
sekrety z env (nie do repo), zbuduję obraz, ustawię nasłuch, przetestuję `/brief`.

---

## Bezpieczeństwo
- Bot reaguje **tylko** na Twój `chat_id` (sprawdzane w pollerze) — ktoś, kto znajdzie
  bota, nie wywoła briefu.
- Token bota i logowanie Claude tylko w wolumenie `data/` na OMV — **nigdy w repo/obrazie**.
- Jeśli token bota wyciekł: `/revoke` w @BotFather → nowy token do `data/.env`.

## Utrzymanie / ryzyka (świadomie)
- **Token Claude Code** może wygasnąć po dłuższym czasie → powtórzyć krok logowania.
- To **nieoficjalna** ścieżka automatyzacji subskrypcji (oficjalna = rutyny w chmurze).
  Przy osobistym, małym użyciu zwykle OK, ale warto wiedzieć.
- Aktualizacje Claude Code: czasem `docker compose build --no-cache` po nowej wersji.
- Proces Node 24/7 — zasobowo lekki.

## Weryfikacja końcowa
| Test | Oczekiwane |
|------|-----------|
| `docker compose run --rm claude-brief claude -p "OK"` | odpowiedź bez proszenia o login |
| `/brief` z telefonu | „⏳ Robię brief…" a po chwili 4 wiadomości briefu |
| Link „📖 czytaj" (polskie źródło) | otwiera czysty czytnik |
| Restart OMV → kontener wstaje (`restart: unless-stopped`) | `/brief` dalej działa |
| (jeśli ENABLE_DAILY) brief o 13:30 | dochodzi automatycznie |

## Kolejne kroki po uruchomieniu
- Rozszerzyć `/brief` o argumenty: `/brief tech` (tylko technologia), `/brief 48h`.
- Rozważyć przeniesienie 13:30 na OMV i wyłączenie rutyny w chmurze (bez duplikacji).
- Docelowo: przycisk „Brief" w samej apce.
