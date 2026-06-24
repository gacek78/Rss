import { spawn } from 'child_process'
import fs from 'fs'

const env = fs.readFileSync('/data/.env', 'utf8')
const TOKEN = env.match(/TELEGRAM_BOT_TOKEN=(.+)/)[1].trim()
const CHAT  = env.match(/TELEGRAM_CHAT_ID=(.+)/)[1].trim()
const PROMPT = fs.readFileSync('/app/brief-prompt.txt', 'utf8')
const API = `https://api.telegram.org/bot${TOKEN}`

let running = false

async function tg(text) {
  try {
    await fetch(`${API}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text, disable_web_page_preview: true }),
    })
  } catch {}
}

function runBrief(reason, filter) {
  if (running) { tg('⏳ Brief już się robi, chwila…'); return }
  running = true
  const label = filter ? `${reason}: „${filter}"` : reason
  tg(`⏳ Robię brief (${label})…`)

  let prompt = PROMPT
  if (filter) {
    prompt += '\n\n=== FILTR UŻYTKOWNIKA ===\n'
      + `Użytkownik prosi konkretnie o: "${filter}".\n`
      + 'Jeśli to nazwa źródła (rmf24, spider/spidersweb, niebezpiecznik, nyt, money, bankier, focus, chip, wp, natgeo) — pobierz i raportuj TYLKO z tego źródła.\n'
      + 'Jeśli to temat (technologia, nauka, finanse, polityka, medycyna, świat) — raportuj TYLKO ten temat ze wszystkich źródeł.\n'
      + 'Jeśli to okres (48h, 12h) — dostosuj zakres czasu.\n'
      + 'Można łączyć (np. "rmf24 nauka"). Pomiń sekcje niepasujące do filtra, nie wysyłaj pustych. Skróć do 1-2 wiadomości, jeśli materiału mniej.'
  }

  // --allowedTools zamiast --dangerously-skip-permissions (ta druga jest blokowana dla roota).
  // Auth: CLAUDE_CODE_OAUTH_TOKEN z env (env_file ./data/.env).
  const p = spawn('claude', ['-p', prompt, '--allowedTools', 'Bash Edit Write Read Glob Grep'],
                  { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env } })
  p.on('exit', code => {
    running = false
    if (code !== 0) tg(`⚠️ Brief zakończył się błędem (kod ${code}). Sprawdź logi: docker logs claude-brief`)
  })
  p.on('error', err => {
    running = false
    tg(`⚠️ Nie udało się uruchomić Claude: ${err.message}`)
  })
}

// Long-poll Telegrama: reaguj tylko na /brief od autoryzowanego chat_id
let offset = 0
async function poll() {
  for (;;) {
    try {
      const r = await fetch(`${API}/getUpdates?offset=${offset}&timeout=30`).then(r => r.json())
      if (r && r.ok) for (const u of r.result) {
        offset = u.update_id + 1
        const m = u.message
        const text = (m?.text || '').trim()
        if (m && String(m.chat.id) === CHAT && /^\/brief\b/i.test(text)) {
          const filter = text.replace(/^\/brief\b/i, '').trim()
          runBrief('na żądanie', filter)
        }
      }
    } catch {
      await new Promise(r => setTimeout(r, 3000))
    }
  }
}

// Lokalny 13:30 wyłączony — robi to rutyna w chmurze. Włączyć tylko jeśli wyłączysz chmurę.
const ENABLE_DAILY = false
function scheduleDaily() {
  if (!ENABLE_DAILY) return
  const now = new Date()
  const next = new Date(now); next.setHours(13, 30, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  setTimeout(() => { runBrief('harmonogram 13:30'); scheduleDaily() }, next - now)
}

tg('🤖 Bot briefów gotowy.\n\n/brief — pełny przegląd\n/brief rmf24 — tylko jedno źródło\n/brief technologia — tylko temat\n/brief nyt finanse — łączenie\n/brief 48h — szerszy zakres czasu')
scheduleDaily()
poll()
