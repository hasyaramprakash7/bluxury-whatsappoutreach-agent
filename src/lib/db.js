// D1 data layer: settings, leads, messages, AI usage.
import { json, nowIso } from './text.js';
import { decryptToken } from './crypto.js';

export const STATUSES = ['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'CONVERTED', 'COLD'];
const RANK = { NEW: 0, CONTACTED: 1, ENGAGED: 2, QUALIFIED: 3, CONVERTED: 4 };

// ---------- settings ----------
export async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(results.map((r) => [r.key, json(r.value, {})]));
  return { whatsapp: s.whatsapp || {}, template: s.template || {}, profile: s.profile || {}, limits: { aiPerDay: 300, firstPerDay: 30, ...(s.limits || {}) } };
}
export const saveSetting = (env, key, value) =>
  env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)).run();

/** Settings without the encrypted token, for the dashboard. */
export function publicSettings(s) {
  const { tokenEnc, ...wa } = s.whatsapp;
  return { whatsapp: { ...wa, hasToken: !!tokenEnc }, template: s.template, profile: s.profile, limits: s.limits };
}
export async function whatsappAuth(env, s) {
  if (!s.whatsapp.phoneNumberId || !s.whatsapp.tokenEnc) {
    throw Object.assign(new Error('Connect your WhatsApp number first (Setup → WhatsApp).'), { status: 409, code: 'NOT_CONNECTED' });
  }
  return { phoneNumberId: s.whatsapp.phoneNumberId, accessToken: await decryptToken(env.TOKEN_ENCRYPTION_KEY, s.whatsapp.tokenEnc) };
}

// ---------- leads ----------
const COLS = {
  name: 'name', status: 'status', state: 'state', info: 'info', suggestions: 'suggestions',
  firstSentAt: 'first_sent_at', firstMessageId: 'first_message_id', delivery: 'delivery', deliveryError: 'delivery_error',
  lastMessageAt: 'last_message_at', lastMessagePreview: 'last_message_preview', lastMessageDirection: 'last_message_direction',
  lastInboundAt: 'last_inbound_at', unread: 'unread',
};
const JSON_COLS = new Set(['info', 'suggestions']);
const toDb = (k, v) => (JSON_COLS.has(k) ? (v == null ? null : JSON.stringify(v)) : v ?? null);

export function rowToLead(r) {
  if (!r) return null;
  const l = { id: r.id, phone: r.phone, createdAt: r.created_at, updatedAt: r.updated_at };
  for (const [k, col] of Object.entries(COLS)) l[k] = r[col];
  l.info = json(r.info, {});
  l.suggestions = json(r.suggestions, null);
  return l;
}

export const getLead = async (env, phone) => rowToLead(await env.DB.prepare('SELECT * FROM leads WHERE phone = ?').bind(phone).first());

/** UPDATE one lead; returns it. `inc` adds to numeric columns (e.g. { unread: 1 }). */
export async function updateLead(env, phone, set = {}, inc = {}) {
  const sets = []; const vals = [];
  for (const [k, v] of Object.entries(set)) if (COLS[k]) { sets.push(`${COLS[k]} = ?`); vals.push(toDb(k, v)); }
  for (const [k, v] of Object.entries(inc)) if (COLS[k]) { sets.push(`${COLS[k]} = ${COLS[k]} + ?`); vals.push(v); }
  sets.push('updated_at = ?'); vals.push(nowIso());
  return rowToLead(await env.DB.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE phone = ? RETURNING *`).bind(...vals, phone).first());
}

/** Moves the status forward only (never backwards, never out of COLD). */
export const raisedStatus = (cur, next) => (cur === 'COLD' || (RANK[next] ?? -1) <= (RANK[cur] ?? 0) ? cur : next);

// Replied = they wrote after our first message and theirs is the latest message: waiting for us
// (not when that message was "STOP").
const NEEDS_ANSWER = "(status <> 'COLD' AND last_inbound_at > first_sent_at AND last_message_direction = 'in')";
export const TABS = ['REPLIED', 'TO_SEND', 'SENT', 'SKIPPED'];

export async function listLeads(env, { tab = 'TO_SEND', search = '', limit = 200 } = {}) {
  const where = []; const vals = [];
  if (tab === 'REPLIED') where.push(`state = 'SENT' AND ${NEEDS_ANSWER}`);
  else if (tab === 'SENT') where.push(`state = 'SENT' AND NOT COALESCE(${NEEDS_ANSWER}, 0)`);
  else { where.push('state = ?'); vals.push(tab === 'SKIPPED' ? 'SKIPPED' : 'TO_SEND'); }
  if (search) { where.push('(name LIKE ? OR phone LIKE ?)'); vals.push(`%${search}%`, `%${search.replace(/\D/g, '') || search}%`); }
  const order = tab === 'REPLIED' ? 'last_inbound_at DESC' : tab === 'TO_SEND' ? "CAST(json_extract(info, '$.payScore') AS INTEGER) DESC, created_at" : 'updated_at DESC';
  const [{ results }, counts] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM leads WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`).bind(...vals, limit),
    env.DB.prepare(`SELECT
        SUM(state = 'TO_SEND') AS TO_SEND,
        SUM(state = 'SENT' AND NOT COALESCE(${NEEDS_ANSWER}, 0)) AS SENT,
        SUM(state = 'SENT' AND COALESCE(${NEEDS_ANSWER}, 0)) AS REPLIED,
        SUM(state = 'SKIPPED') AS SKIPPED,
        SUM(status = 'CONVERTED') AS CONVERTED
      FROM leads`),
  ]);
  const c = counts.results[0] || {};
  return { data: results.map(rowToLead), counts: Object.fromEntries(['REPLIED', 'TO_SEND', 'SENT', 'SKIPPED', 'CONVERTED'].map((k) => [k, c[k] || 0])) };
}

/**
 * Insert or refresh imported leads. Already-contacted leads keep their state and drafts;
 * opted-out ones stay skipped. Returns counts.
 */
export async function importLeads(env, leads) {
  const known = new Map();
  for (let i = 0; i < leads.length; i += 90) {
    const chunk = leads.slice(i, i + 90).map((l) => l.phone);
    const { results } = await env.DB.prepare(`SELECT phone, state, status FROM leads WHERE phone IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all();
    for (const r of results) known.set(r.phone, r);
  }
  const now = nowIso();
  const stmt = env.DB.prepare(`INSERT INTO leads (id, phone, name, info, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (phone) DO UPDATE SET
      name = excluded.name,
      info = excluded.info,
      state = CASE WHEN leads.state = 'SENT' THEN 'SENT' WHEN leads.status = 'COLD' THEN 'SKIPPED' ELSE 'TO_SEND' END,
      suggestions = CASE WHEN leads.state = 'SENT' THEN leads.suggestions ELSE NULL END,
      updated_at = excluded.updated_at`);
  for (let i = 0; i < leads.length; i += 50) {
    await env.DB.batch(leads.slice(i, i + 50).map((l) => stmt.bind(crypto.randomUUID(), l.phone, l.name, JSON.stringify(l.info), now)));
  }
  const counts = { added: 0, updated: 0, alreadyContacted: 0, optedOut: 0 };
  for (const l of leads) {
    const k = known.get(l.phone);
    if (!k) counts.added++;
    else if (k.status === 'COLD') counts.optedOut++;
    else if (k.state === 'SENT') counts.alreadyContacted++;
    else counts.updated++;
  }
  return counts;
}

export async function leadsSentLast24h(env) {
  return (await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE first_sent_at >= ?').bind(new Date(Date.now() - 864e5).toISOString()).first()).n;
}

// ---------- messages ----------
export function rowToMessage(r) {
  return r && { id: r.id, phone: r.phone, direction: r.direction, type: r.type, text: r.text, waMessageId: r.wa_message_id, status: r.status, error: r.error, createdAt: r.created_at };
}

/** Saves a message and updates the lead's chat fields. Inbound duplicates (Meta retries) return null. */
export async function recordMessage(env, { phone, direction, type, text = '', waMessageId = null, status }) {
  const createdAt = nowIso();
  const row = await env.DB.prepare(`INSERT INTO messages (id, phone, direction, type, text, wa_message_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING RETURNING *`).bind(crypto.randomUUID(), phone, direction, type, text, waMessageId, status || (direction === 'in' ? 'received' : 'sent'), createdAt).first();
  if (!row) return null;
  const set = { lastMessageAt: createdAt, lastMessagePreview: (text || `[${type}]`).replace(/\s+/g, ' ').slice(0, 140), lastMessageDirection: direction };
  if (direction === 'in') set.lastInboundAt = createdAt;
  const lead = await updateLead(env, phone, set, direction === 'in' ? { unread: 1 } : {});
  return { message: rowToMessage(row), lead };
}

export async function listMessages(env, phone, limit = 100) {
  const { results } = await env.DB.prepare('SELECT * FROM messages WHERE phone = ? ORDER BY created_at DESC LIMIT ?').bind(phone, limit).all();
  return results.reverse().map(rowToMessage);
}

/** Last chat turns for the AI, oldest first; a template shows as the text we sent. */
export async function recentTurns(env, phone, limit = 16) {
  const { results } = await env.DB.prepare('SELECT direction, type, text FROM messages WHERE phone = ? ORDER BY created_at DESC LIMIT ?').bind(phone, limit).all();
  return results.reverse().map((t) => ({ direction: t.direction, text: t.text || `[${t.type}]` }));
}

const STATUS_ORDER = { sent: 1, delivered: 2, read: 3 };
/** Applies a WhatsApp delivery status (never moves backwards). Also updates the lead's first-message delivery. */
export async function applyStatus(env, waMessageId, status, error) {
  const s = String(status).toLowerCase();
  if (s === 'failed') {
    await env.DB.prepare("UPDATE messages SET status = 'failed', error = ? WHERE wa_message_id = ?").bind(error || 'Failed', waMessageId).run();
    await env.DB.prepare("UPDATE leads SET delivery = 'FAILED', delivery_error = ?, updated_at = ? WHERE first_message_id = ?").bind(error || 'Failed', nowIso(), waMessageId).run();
    return;
  }
  if (!STATUS_ORDER[s]) return;
  const earlier = Object.keys(STATUS_ORDER).filter((k) => STATUS_ORDER[k] < STATUS_ORDER[s]);
  const marks = earlier.map(() => '?').join(',') || "''";
  await env.DB.prepare(`UPDATE messages SET status = ? WHERE wa_message_id = ? AND status IN (${marks})`).bind(s, waMessageId, ...earlier).run();
  await env.DB.prepare(`UPDATE leads SET delivery = ?, updated_at = ? WHERE first_message_id = ? AND (delivery IS NULL OR lower(delivery) IN (${marks}))`)
    .bind(s.toUpperCase(), nowIso(), waMessageId, ...earlier).run();
}

// ---------- AI usage cap ----------
export async function takeAiCall(env, dailyLimit) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare('INSERT INTO ai_usage (day, n) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET n = n + 1 RETURNING n').bind(day).first();
  return row.n <= dailyLimit;
}
