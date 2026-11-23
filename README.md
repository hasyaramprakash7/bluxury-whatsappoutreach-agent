# Bluxury Outreach Agent

WhatsApp outreach to the businesses found by the **map-ai lead finder** (businesses with weak or broken websites).
For each business the AI reads *its own* website problems and suggests 3 messages. **You pick one; only then is it sent.**
When they reply, the AI suggests 3 replies (answer / proof / close) to confirm the lead and close the sale.

Live: https://whatsapp-agent-outreach.hasya7893828468.workers.dev

## How it works

1. **Leads in.** The lead finder writes `data/whatsapp_leads.csv` at the end of every run. You can also build it yourself:
   `python scripts/export_whatsapp_leads.py <high_paying_leads.csv> <whatsapp_leads.csv>`
   Columns: phone (with country code), name, category, city, country, rating, reviews, website, website_broken, pay_score, pain_points (`|`-separated), client_impact, pitch_angle, maps_link.
2. **Import** with *Import leads CSV*. New leads go to **To send**, best pay score first.
3. **First message.** Open a lead → 3 suggestions about that business's problems, best pick marked, with a preview of exactly what they'll see. Edit if you like → **Send this**.
   It goes out as your approved Meta template: `{{1}}` their business name, `{{2}}` the sentence you picked, `{{3}}` your business name.
4. **They reply.** The lead moves to **Replied** and 3 reply suggestions are drafted at once. Pick one → sent as a normal message (WhatsApp's 24-hour window). Set the status to Qualified / Won as it moves on.

Tabs: **Replied** (waiting for you) · **To send** · **Waiting for reply** · **Skipped**. Anyone who writes “STOP” is marked opted out and never messaged again. Nothing is ever sent automatically.

## Setup (in the dashboard)

- **WhatsApp number**: Phone number ID, WhatsApp Business Account ID and access token from Meta for Developers → your app → WhatsApp → API Setup. Paste the webhook URL shown there into Meta → WhatsApp → Configuration (verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to `messages`).
- **First-message template**: name, language and text exactly as approved in WhatsApp Manager. For testing, Meta's free `hello_world` (language `en_US`, no variables) works.
- **Your business**: name, about, services and prices. The AI only mentions prices written here.
- **Limits**: first messages per day (default 30) and AI suggestions per day (default 300).

## Project layout

| Path | What |
|---|---|
| `src/index.js` | Worker: API, Meta webhook (signature-checked), sign-in with `ADMIN_API_KEY` |
| `src/lib/outreach.js` | CSV → leads, AI prompts and suggestions (Workers AI), template filling |
| `src/lib/db.js` | D1: settings, leads, messages, delivery status, AI usage cap |
| `src/lib/whatsapp.js` | WhatsApp Cloud API: text and template messages |
| `src/lib/crypto.js`, `src/lib/text.js` | Signature check, token encryption, CSV parser, phone numbers |
| `public/` | Dashboard (plain HTML/CSS/JS) |
| `migrations/0001_init.sql` | Database schema |
| `scripts/export_whatsapp_leads.py` | Lead-finder CSV → import CSV |

## Run locally

```powershell
npm install
npm run db:migrate:local
npm run dev
```

`.dev.vars` (never committed):

```
ADMIN_API_KEY=<at least 32 random characters>
TOKEN_ENCRYPTION_KEY=<at least 16 random characters>
WHATSAPP_VERIFY_TOKEN=<any string, also entered in Meta>
META_APP_SECRET=<Meta app secret>            # or ALLOW_UNSIGNED_WEBHOOKS=true for local tests only
# GRAPH_BASE_URL=http://127.0.0.1:4999       # optional: send to a fake WhatsApp API while testing
```

Open http://localhost:8787 and sign in with `ADMIN_API_KEY`. Workers AI always runs on Cloudflare (uses your AI allowance), even locally.
Meta can't reach localhost, so real replies only arrive on the deployed URL.

## Deploy

```powershell
npm run db:migrate:remote   # only when there is a new migration
npm run deploy
```

From scratch: `npx wrangler d1 create bluxury-outreach` → put the id in `wrangler.jsonc`, `npm run db:migrate:remote`,
`npx wrangler secret put` for `ADMIN_API_KEY`, `TOKEN_ENCRYPTION_KEY`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, then `npm run deploy`.

## API

All `/api` calls need `Authorization: Bearer <ADMIN_API_KEY>`.

`GET/PATCH /api/settings` · `GET /api/leads?tab=REPLIED|TO_SEND|SENT|SKIPPED&search=` · `POST /api/leads/import` (CSV) ·
`GET /api/leads/:phone` (lead + chat) · `POST /api/leads/:phone/suggest { force? }` · `POST /api/leads/:phone/send { text, status? }` ·
`PATCH /api/leads/:phone { skip | status }`

## Good practice

Message a few leads a day, only the best ones, always about their real problem, with an opt-out line. Many blocks or reports lower your number's quality rating.
