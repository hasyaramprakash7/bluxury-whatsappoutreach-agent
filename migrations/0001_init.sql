-- Bluxury Outreach Agent: one business per deployment.

-- Setup saved from the dashboard: whatsapp (phone number id, WABA id, encrypted token),
-- template (first-message template), profile (your business, services, prices), limits (AI calls and first messages per day).
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                       -- JSON
);

-- Businesses imported from the map-ai lead finder.
CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,               -- digits with country code
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'NEW',       -- NEW, CONTACTED, ENGAGED, QUALIFIED, CONVERTED, COLD (opted out)
  state TEXT NOT NULL DEFAULT 'TO_SEND',    -- TO_SEND, SENT, SKIPPED
  info TEXT NOT NULL DEFAULT '{}',          -- JSON: category, city, website, painPoints[], impact, pitch, mapsLink, ...
  suggestions TEXT,                         -- JSON: latest AI drafts { kind, items[], recommended, intent, forMessageAt, at }
  first_sent_at TEXT,                       -- when the first message went out
  first_message_id TEXT,                    -- WhatsApp id of the first message (delivery status)
  delivery TEXT,                            -- SENT, DELIVERED, READ, FAILED (first message)
  delivery_error TEXT,
  last_message_at TEXT,
  last_message_preview TEXT,
  last_message_direction TEXT,              -- in | out
  last_inbound_at TEXT,                     -- opens WhatsApp's 24h free-text window
  unread INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX leads_state ON leads (state, updated_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL,                  -- in | out
  type TEXT NOT NULL,                       -- text | template | image | ...
  text TEXT NOT NULL DEFAULT '',
  wa_message_id TEXT,
  status TEXT NOT NULL,                     -- received | sent | delivered | read | failed
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX messages_chat ON messages (phone, created_at);
CREATE UNIQUE INDEX messages_wa ON messages (wa_message_id) WHERE wa_message_id IS NOT NULL;

-- AI suggestion calls per day (cost cap).
CREATE TABLE ai_usage (
  day TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
);
