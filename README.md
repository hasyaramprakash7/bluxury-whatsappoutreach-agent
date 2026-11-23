# Bluxury Outreach Agent — WhatsApp outreach with AI-suggested messages (Cloudflare)

Turns the leads found by the **map-ai lead finder** (businesses with weak or broken websites) into WhatsApp conversations.
For every business the AI reads *its own* website problems and suggests 3 messages; **you pick one and only then it is sent**.
When they reply, the AI suggests 3 replies (answer / proof / close) from their problems and the whole chat, to confirm the lead and close the sale.

Live: https://whatsapp-agent-outreach.hasya7893828468.workers.dev

Built on the Agent Desk WhatsApp engine (dashboard, inbox, flows, broadcasts are all still there); this project adds the **Outreach** page.

## How it works

1. **Leads in.** The lead finder writes `data/whatsapp_leads.csv` at the end of every run (or run `python scripts/export_whatsapp_leads.py <high_paying_leads.csv> <out.csv>`):
   phone with country code, business name, top pain points found on their website, what it costs them, pitch angle, Maps link.
2. **Import.** Dashboard → **Outreach** → *Import leads CSV*. Leads land under **To send**. The bot is paused for them, so nothing is ever answered automatically.
3. **First message.** Open a lead: 3 suggested first messages about that business's problems, best pick marked. Edit if you like → **Send this**.
   It goes out as your approved Meta template (Settings → **Outreach template**: `{{1}}` their business name, `{{2}}` the sentence you picked, `{{3}}` your business name).
   For testing, Meta's free `hello_world` (language `en_US`, no variables) works too — the AI sentence is then not sent.
4. **They reply.** The lead moves to **Replied** and 3 reply suggestions appear within seconds. Pick one → sent as a normal message (WhatsApp's 24h window). Move the lead to Qualified / Converted as it progresses.

Tabs: **Replied** (waiting for you) · **To send** · **Waiting for reply** · **Skipped**. Opted-out businesses (“STOP”) are never messaged again.

| Piece | Cloudflare product | Where |
|---|---|---|
| Dashboard, API, Meta webhook | **Workers** (+ static assets) | `src/index.js`, `public/` |
| Businesses, leads, messages | **D1** `whatsapp-agent-outreach` | `migrations/` (outreach: `0006_outreach.sql`) |
| One per chat | **Durable Object** `ConversationDO` | Never-lost inbox, in-order processing; drafts replies for outreach leads |
| One per business | **Durable Object** `BusinessHub` | Live dashboard updates, paced broadcasts |
| Message suggestions | **Workers AI** | `src/lib/outreach.js` |

## Run locally

```powershell
npm install
npm run db:migrate:local
npm run dev
```

Create `.dev.vars` (never committed):

```
ADMIN_API_KEY=<at least 32 random characters>
TOKEN_ENCRYPTION_KEY=<at least 16 random characters>
WHATSAPP_VERIFY_TOKEN=<any string, also entered in Meta>
META_APP_SECRET=<Meta app secret>            # or ALLOW_UNSIGNED_WEBHOOKS=true for local tests only
# GRAPH_BASE_URL=http://127.0.0.1:4999       # optional: send to a fake WhatsApp API while testing
```

Open http://localhost:8787 and sign in with `ADMIN_API_KEY`. Workers AI always runs on Cloudflare (uses your AI allowance) even locally.
Meta's webhook can't reach localhost, so real replies only arrive on the deployed URL.

## Deploy

Already set up (Worker `whatsapp-agent-outreach`, D1 `whatsapp-agent-outreach`, secrets set). To ship changes:

```powershell
npm run db:migrate:remote   # only when there is a new migration
npm run deploy
```

From scratch: `npx wrangler d1 create whatsapp-agent-outreach` → put the id in `wrangler.jsonc`, `npm run db:migrate:remote`,
`npx wrangler secret put` for `ADMIN_API_KEY`, `TOKEN_ENCRYPTION_KEY`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, then `npm run deploy`.

Meta → WhatsApp → Configuration → Webhook: `https://whatsapp-agent-outreach.hasya7893828468.workers.dev/webhook`, your verify token, subscribe to `messages`.

## API

`GET /api/outreach/:tid?state=REPLIED|TO_SEND|SENT|SKIPPED` · `POST /api/outreach/:tid/import` (CSV) ·
`POST /api/outreach/:tid/:phone/suggest { force? }` · `POST /api/outreach/:tid/:phone/send { text, status? }` ·
`PATCH /api/outreach/:tid/:phone { skip | status }`. All need `Authorization: Bearer <key>`.

## Settings (`wrangler.jsonc` → `vars`)

- `AI_MODEL` — Workers AI chat model with JSON output (default `@cf/meta/llama-3.3-70b-instruct-fp8-fast`).
- `BROADCAST_RATE_PER_SECOND`, `DEFAULT_BROADCAST_TEMPLATE` / `DEFAULT_BROADCAST_LANGUAGE`, `SITE_UTC_OFFSET`, `R2_PUBLIC_BASE_URL`.

## Good practice

Message a few leads a day, only the best ones, always about their real problem, with an opt-out line. Many blocks or reports lower your number's quality rating.
