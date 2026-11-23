-- Outreach: leads imported from the map-ai lead finder, each with its own pain points.
-- The AI drafts messages for that exact business; nothing is sent until a person picks one.
ALTER TABLE leads ADD COLUMN outreach TEXT;            -- JSON: business, category, city, website, painPoints[], impact, pitch, mapsLink, ...
ALTER TABLE leads ADD COLUMN outreach_state TEXT;      -- TO_SEND (imported, waiting for approval), SENT, SKIPPED
ALTER TABLE leads ADD COLUMN outreach_at TEXT;         -- when the first message went out
ALTER TABLE leads ADD COLUMN suggestions TEXT;         -- JSON: latest AI drafts { kind, items[], recommended, forMessageAt, at }
CREATE INDEX leads_tenant_outreach ON leads (tenant_id, outreach_state, updated_at DESC);
