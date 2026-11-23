# Bluxury Outreach Agent

WhatsApp outreach to the businesses found by the **map-ai lead finder** (businesses with weak or broken websites), with a full dashboard around it.

**The flow:** import the lead CSV → the first message goes out to every business with *its own* problem sentence →
when one replies, it shows under **Replied** with 3 AI-suggested answers based on that business's website problems and the chat → you pick one and it's sent. Nothing replies automatically.

Live: https://whatsapp-agent-outreach.hasya7893828468.workers.dev

## Sidebar

| Page | What it does |
|---|---|
| **Overview** | Customers, replies, qualified, won, opted out; funnel; broadcast delivery; outreach counts |
| **Inbox** | Every WhatsApp chat live; reply yourself (24-hour window) |
| **Leads** | All contacts with status, search and filters |
| **Confirmed** | Leads you marked **Won** — your confirmed sales, exportable |
| **Outreach** | Import leads CSV (optionally *send the first message to everyone*), AI-suggested first messages and replies, pick and send, tabs Replied / To send / Waiting for reply / Skipped |
| **Broadcast** | Send an approved template to any contact list, paced and quota-checked |
| **Business Profile** | Your services, prices, hours, contact and FAQ — the AI writes from this |
| **Settings** | Account, alert number, broadcast / alert / **outreach** templates, WhatsApp credentials (admin) |
| **Businesses** | (admin) connect more WhatsApp numbers, each with its own dashboard key |
| **Activity log** | What you did in this browser |

## How outreach works

1. **Leads in.** Import the map scraper's own `data/high_paying_leads.csv` as it is — phone, name, website, website problems ("1) … 2) …"), what it costs them, pitch angle and Maps link are read directly. (`whatsapp_leads.csv` from `scripts/export_whatsapp_leads.py` works too.) Numbers without "+" get the code of their country column.
2. **First message from the CSV.** On **Outreach**, tick *Send first message to everyone* and import. Each business gets your outreach template:
   `{{1}}` their business name · `{{2}}` their own problem sentence from the CSV ("what it costs them") · `{{3}}` your business name.
   Untick it to import only and pick an AI-written first message lead by lead instead.
3. **They reply.** The lead moves to **Replied** and 3 suggestions are drafted at once (answer / proof / close) from their problems and the whole chat. Pick one → sent. Mark Qualified / Won as it moves on; Won leads appear in **Confirmed**.
4. Anyone who writes “STOP” is opted out and never messaged again. Re-importing never sends twice.

For testing, Meta's free `hello_world` template (language `en_US`, no variables) works as the outreach template — then the problem sentence is not included.

## Project layout

| Path | What |
|---|---|
| `src/index.js` | Worker: API, signed Meta webhook, WebSocket, dashboard auth |
| `src/lib/outreach.js` | CSV → leads, AI suggestions (Workers AI), template variables, problem sentence |
| `src/lib/db.js`, `src/lib/chatlog.js` | D1 data (businesses, leads, messages) and chat logging |
| `src/lib/profile.js` | Business Profile validation and facts for the AI |
| `src/lib/whatsapp.js`, `src/lib/crypto.js`, `src/lib/text.js` | WhatsApp API, signatures/encryption, CSV/phone helpers |
| `src/do/conversation.js` | One per chat: never-lost inbox, opt-out, reply drafts |
| `src/do/hub.js` | One per business: live dashboard, paced broadcasts and bulk first messages |
| `public/` | Dashboard (plain HTML/CSS/JS) |
| `migrations/` | D1 schema |
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

Open http://localhost:8787 and sign in with `ADMIN_API_KEY` (admin) or a business key. Workers AI always runs on Cloudflare (uses your AI allowance), even locally. Meta can't reach localhost, so real replies only arrive on the deployed URL.

## Deploy

```powershell
npm run db:migrate:remote   # only when there is a new migration
npm run deploy
```

Meta → WhatsApp → Configuration → Webhook: `https://whatsapp-agent-outreach.hasya7893828468.workers.dev/webhook`, your verify token, subscribe to `messages`.

## Good practice

Message a few leads a day, only the best ones, always about their real problem, with an opt-out line. Many blocks or reports lower your number's quality rating.
