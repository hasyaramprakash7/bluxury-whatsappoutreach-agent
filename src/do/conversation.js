// One Durable Object per customer chat (name: "<tenantId>:<phone>").
// Inbound messages are stored here before Meta gets its 200, then processed strictly in order by alarm,
// so a crash never loses a message and two messages from one person never race.
// Nothing is sent automatically: messages land in the Inbox, "STOP" opts out, and an outreach lead's
// reply gets 3 AI-drafted answers for a person to pick from.
import { DurableObject } from 'cloudflare:workers';
import { getTenant, getLead, upsertLead } from '../lib/db.js';
import { recordInbound, publish } from '../lib/chatlog.js';
import { generateSuggestions } from '../lib/outreach.js';

const SEEN_TTL_MS = 7 * 24 * 3600 * 1000;
const OPT_OUT_TEXTS = ['stop', 'unsubscribe', 'opt out', 'optout', 'not interested', 'remove me'];

/** Case, punctuation and extra spaces are ignored, so "Stop." or "NOT interested!!" also opt out. */
export function isOptOut(message) {
  const id = message?.interactive?.button_reply?.id || message?.button?.payload;
  if (id === 'NOT_INTERESTED') return true;
  const t = (message?.text?.body || message?.button?.text || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return OPT_OUT_TEXTS.includes(t);
}

export class ConversationDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS inbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, wa_id TEXT, event TEXT NOT NULL, received_at INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS seen (wa_id TEXT PRIMARY KEY, at INTEGER NOT NULL)`);
  }

  /** Stores one webhook message event. Duplicates (Meta retries) are ignored. */
  async enqueue(event) {
    const waId = event.message?.id || null;
    if (waId) {
      if (this.sql.exec('SELECT 1 FROM seen WHERE wa_id = ?', waId).toArray().length) return { duplicate: true };
      this.sql.exec('INSERT INTO seen (wa_id, at) VALUES (?, ?)', waId, Date.now());
    }
    this.sql.exec('INSERT INTO inbox (wa_id, event, received_at) VALUES (?, ?, ?)', waId, JSON.stringify(event), Date.now());
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now());
    return { queued: true };
  }

  /** Kept for broadcasts, which call it before re-contacting someone. Nothing to reset without a bot. */
  async reset() { return true; }

  async alarm() {
    for (;;) {
      const row = this.sql.exec('SELECT seq, event FROM inbox ORDER BY seq LIMIT 1').toArray()[0];
      if (!row) break;
      const event = JSON.parse(row.event);
      // Throws on D1/network trouble: the alarm is retried and the event stays queued.
      const ready = await this.prepare(event);
      this.sql.exec('DELETE FROM inbox WHERE seq = ?', row.seq);
      if (ready) await this.respond(ready).catch((err) => console.error('[ConversationDO] respond failed:', err.message));
    }
    this.sql.exec('DELETE FROM seen WHERE at < ?', Date.now() - SEEN_TTL_MS);
  }

  /** Records the inbound message in D1 (idempotent). */
  async prepare(event) {
    const { tenantId, from, message, profileName } = event;
    const tenant = await getTenant(this.env, tenantId);
    if (!tenant || !tenant.isActive) return null;
    const exists = message.id
      ? await this.env.DB.prepare("SELECT 1 FROM messages WHERE tenant_id = ? AND wa_message_id = ? AND direction = 'in'").bind(tenantId, message.id).first()
      : null;
    if (exists) return null;
    const lead = (await recordInbound(this.env, tenantId, from, message, profileName)).lead;
    if (!lead) throw new Error('Could not record the inbound message');
    return { tenant, lead, from, message };
  }

  async respond({ tenant, lead, from, message }) {
    if (isOptOut(message)) {
      const updated = await upsertLead(this.env, tenant._id, from, { set: { status: 'COLD', suggestions: null } });
      await publish(this.env, tenant._id, 'lead:update', { lead: updated });
      return;
    }
    // Outreach lead replied: the AI drafts 3 replies from their website problems and the chat.
    if (lead.outreach && lead.outreachState === 'SENT' && message.type !== 'reaction') {
      if (lead.status === 'CONTACTED' || lead.status === 'NEW') {
        lead = await upsertLead(this.env, tenant._id, from, { set: { status: 'ENGAGED' } });
        await publish(this.env, tenant._id, 'lead:update', { lead });
      }
      await generateSuggestions(this.env, tenant, lead).catch((err) => console.warn('[ConversationDO] suggestions failed:', err.message));
    }
  }
}
