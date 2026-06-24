# claude-brief — bot Telegram z news briefem (na OMV)

Kontener uruchamiany na OMV (NAS, 24/7). Nasłuchuje Telegrama i na `/brief`
odpala headless Claude Code (subskrypcja, bez API), który przesiewa feedy RSS
i wysyła brief na Telegram. Pełny opis i historia decyzji: `../../docs/omv-news-brief-setup.md`.

## Pliki
- `Dockerfile` — node:20 + `@anthropic-ai/claude-code`
- `docker-compose.yml` — montuje `data/` (sekrety + cache) oraz `poller.mjs`/`brief-prompt.txt` (edycja bez rebuildu)
- `poller.mjs` — long-poll Telegrama; `/brief [filtr]` → `claude -p`
- `brief-prompt.txt` — instrukcja briefu (feedy, triage, 3 zdania/news, wysyłka)
- `.env.example` — szablon; prawdziwy `data/.env` na OMV (NIE w repo): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CLAUDE_CODE_OAUTH_TOKEN`

## Deploy / aktualizacja (na OMV: `/compose/claude-brief/`)
```bash
# zmiana poller.mjs / brief-prompt.txt (zamontowane):
docker compose restart claude-brief
# zmiana .env lub Dockerfile:
docker compose up -d --force-recreate   # env_file ładuje się TYLKO przy recreate
```

## Komendy bota
`/brief` · `/brief rmf24` (źródło) · `/brief technologia` (temat) · `/brief nyt finanse` · `/brief 48h`

## Token (pułapka)
`claude setup-token`: najpierw wkleja się **kod** autoryzacji (`xxx#yyy`, z `#`),
potem narzędzie WYPISUJE **token** `sk-ant-oat01-...` (~108 zn., bez `#`) — TEN do
`data/.env`. Pomylenie kodu z tokenem → `401 Invalid bearer token`.
