// WhatsApp agent for any business — Cloudflare Worker entry: API, Meta webhook, WebSockets, dashboard.
import { Hono } from 'hono';
import { ConversationDO } from './do/conversation.js';
import { BusinessHub } from './do/hub.js';
import {
  getTenant, getTenantByPhoneNumberId, getTenantByKeyHash, listTenants, insertTenant, updateTenant, publicTenant, tenantAccessToken,
  getLead, upsertLead, updateLeads, listLeads, leadStats, listChats, listMessages, applyMessageStatus,
} from './lib/db.js';
import { sha256Hex, safeEqual, verifyMetaSignature, generateApiKey, encryptToken, TENANT_KEY_PREFIX } from './lib/crypto.js';
import { normalizePhone, isValidPhone, parseCsv, pickPhone, pickName, nowIso } from './lib/text.js';
import { validateProfile } from './lib/profile.js';
import { WhatsAppClient } from './lib/whatsapp.js';
import { outboundRecorder, publish } from './lib/chatlog.js';
import { listOutreach, LEAD_STATUSES } from './lib/db.js';
import { outreachFromRow, outreachTemplate, renderOpener, outreachParams, problemSentence, generateSuggestions, MAX_OUTREACH_IMPORT } from './lib/outreach.js';

export { ConversationDO, BusinessHub };

const app = new Hono();
const DAILY_LIMIT_BY_TIER = { 0: 250, 1: 1000, 2: 10000, 3: 100000 };
const REPLY_WINDOW_MS = 24 * 3600 * 1000;
const fail = (c, status, error, extra = {}) => c.json({ success: false, error, ...extra }, status);
const isId = (s) => /^[0-9a-f-]{36}$/i.test(String(s || ''));

app.onError((err, c) => {
  console.error('[Worker] unhandled:', err.stack || err.message);
  return fail(c, 500, 'Internal Server Error');
});

// ---------------- auth ----------------
async function resolveApiKey(env, key) {
  if (!key) return null;
  if (env.ADMIN_API_KEY && env.ADMIN_API_KEY.length >= 32 && await safeEqual(key, env.ADMIN_API_KEY)) return { role: 'admin' };
  if (key.startsWith(TENANT_KEY_PREFIX)) {
    const t = await getTenantByKeyHash(env, await sha256Hex(key));
    if (t && t.isActive) return { role: 'tenant', tenantId: t._id, businessName: t.businessName };
  }
  return null;
}
const bearer = (c) => (c.req.header('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;

app.use('/api/*', async (c, next) => {
  const auth = await resolveApiKey(c.env, bearer(c));
  if (!auth) return fail(c, 401, 'Missing or invalid API key. Send "Authorization: Bearer <key>".');
  c.set('auth', auth);
  return next();
});
const requireAdmin = (c, next) => (c.get('auth').role === 'admin' ? next() : fail(c, 403, 'Admin access required.'));
/** Admins, or the business whose id is in the URL. */
const tenantAccess = (param = 'tid') => async (c, next) => {
  const id = c.req.param(param);
  if (!isId(id)) return fail(c, 400, 'Invalid business id');
  const a = c.get('auth');
  if (a.role === 'admin' || a.tenantId === id) return next();
  return fail(c, 403, 'You do not have access to this business.');
};

// ---------------- health ----------------
app.get('/health', async (c) => {
  try { await c.env.DB.prepare('SELECT 1').first(); return c.json({ status: 'OK', d1: 'up', timestamp: nowIso() }); }
  catch { return c.json({ status: 'DEGRADED', d1: 'down', timestamp: nowIso() }, 503); }
});

// ---------------- Meta webhook ----------------
app.get('/webhook', async (c) => {
  const expected = c.env.WHATSAPP_VERIFY_TOKEN;
  const token = c.req.query('hub.verify_token');
  if (expected && c.req.query('hub.mode') === 'subscribe' && token && await safeEqual(token, expected)) return c.text(c.req.query('hub.challenge') || '');
  return c.text('Forbidden', 403);
});

app.post('/webhook', async (c) => {
  const raw = await c.req.arrayBuffer();
  const secret = c.env.META_APP_SECRET;
  if (secret) {
    if (!await verifyMetaSignature(secret, raw, c.req.header('x-hub-signature-256'))) return c.text('Invalid signature', 401);
  } else if (c.env.ALLOW_UNSIGNED_WEBHOOKS !== 'true') {
    console.error('[Webhook] META_APP_SECRET is not set — rejecting.');
    return c.text('Webhook secret not configured', 500);
  }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return c.text('Bad JSON', 400); }

  const tenants = new Map();
  const tenantFor = async (pnid) => {
    if (!tenants.has(pnid)) tenants.set(pnid, await getTenantByPhoneNumberId(c.env, pnid));
    return tenants.get(pnid);
  };

  try {
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        const v = change?.value; const pnid = v?.metadata?.phone_number_id;
        if (!pnid) continue;
        const tenant = await tenantFor(pnid);
        if (!tenant) { console.warn(`[Webhook] no business for phone number id ${pnid}`); continue; }
        const names = new Map((v.contacts || []).map((x) => [x?.wa_id, x?.profile?.name]));
        // Messages: stored durably in the chat's Durable Object before we answer Meta.
        for (const m of v.messages || []) {
          if (!m?.id || !m?.from) continue;
          const stub = c.env.CONVERSATION.get(c.env.CONVERSATION.idFromName(`${tenant._id}:${m.from}`));
          await stub.enqueue({ tenantId: tenant._id, from: m.from, profileName: names.get(m.from) || null, message: m });
        }
        // Delivery statuses: applied straight to D1 (idempotent; a failure makes Meta retry).
        for (const s of v.statuses || []) if (s?.id && s?.status) await applyStatus(c.env, tenant, s);
      }
    }
  } catch (err) {
    console.error('[Webhook] could not store events, asking Meta to retry:', err.message);
    return c.text('Retry later', 500);
  }
  return c.text('OK');
});

const MARKETING_OPT_OUT = 131050;
const RANK = { SENT: 1, DELIVERED: 2, READ: 3 };
async function applyStatus(env, tenant, s) {
  const up = String(s.status).toUpperCase();
  const err = s.errors?.[0];
  const errorText = err ? `${err.code}: ${err.error_data?.details || err.message || err.title || 'Unknown error'}` : null;
  const at = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : nowIso();
  const msg = await applyMessageStatus(env, tenant._id, s.id, s.status, errorText);
  if (msg) await publish(env, tenant._id, 'message:status', { id: msg._id, waMessageId: s.id, phone: msg.phone, status: msg.status, error: msg.error });
  const changed = [];
  if (up === 'FAILED') {
    changed.push(...await updateLeads(env, tenant._id, 'last_broadcast_message_id = ?', [s.id], { broadcastStatus: 'FAILED', broadcastStatusAt: at, broadcastError: errorText, ...(err?.code === MARKETING_OPT_OUT ? { status: 'COLD' } : {}) }));
    changed.push(...await updateLeads(env, tenant._id, 'admin_alert_message_id = ?', [s.id], { adminAlertStatus: 'FAILED', adminAlertError: errorText }));
  } else if (RANK[up]) {
    const earlier = Object.keys(RANK).filter((k) => RANK[k] < RANK[up]);
    changed.push(...await updateLeads(env, tenant._id, `last_broadcast_message_id = ? AND (broadcast_status IS NULL OR broadcast_status IN (${earlier.map(() => '?').join(',') || "''"}))`, [s.id, ...earlier], { broadcastStatus: up, broadcastStatusAt: at }));
    if (up !== 'SENT') changed.push(...await updateLeads(env, tenant._id, "admin_alert_message_id = ? AND admin_alert_status = 'SENT'", [s.id], { adminAlertStatus: 'DELIVERED' }));
  }
  for (const lead of changed) await publish(env, tenant._id, 'lead:update', { lead });
}

// ---------------- live dashboard WebSocket ----------------
app.get('/ws', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') return c.text('Expected a WebSocket', 426);
  const auth = await resolveApiKey(c.env, c.req.query('token'));
  const tenantId = c.req.query('tenant');
  if (!auth || !isId(tenantId) || (auth.role !== 'admin' && auth.tenantId !== tenantId)) return c.text('Unauthorized', 401);
  return c.env.HUB.get(c.env.HUB.idFromName(tenantId)).fetch(c.req.raw);
});

// ---------------- businesses (tenants) ----------------
const tenantPayload = (t) => ({ success: true, data: publicTenant(t) });

app.get('/api/tenants/me', (c) => c.json({ success: true, auth: c.get('auth') }));

app.get('/api/tenants', async (c) => {
  const a = c.get('auth');
  const list = await listTenants(c.env, a.role === 'admin' ? null : a.tenantId);
  return c.json({ success: true, count: list.length, data: list.map(publicTenant) });
});

app.post('/api/tenants', requireAdmin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const errors = [];
  const businessName = String(b.businessName || '').trim();
  const phoneNumberId = String(b.phoneNumberId || '').trim();
  const accessToken = String(b.accessToken || '').trim();
  const adminPhone = normalizePhone(b.adminNotificationPhone);
  if (!businessName) errors.push('Business name is required.');
  if (!/^\d{5,30}$/.test(phoneNumberId)) errors.push('Phone number ID must be digits (from Meta → WhatsApp → API Setup).');
  if (!accessToken) errors.push('Access token is required.');
  if (!isValidPhone(adminPhone)) errors.push('Team alert number must include the country code.');
  const industry = 'general';
  const { value: profile, errors: pErr } = validateProfile({ displayName: b.displayName || businessName, address: b.address, latitude: b.latitude, longitude: b.longitude, faq: [] });
  errors.push(...pErr);
  if (errors.length) return fail(c, 400, errors[0], { errors });
  if (await getTenantByPhoneNumberId(c.env, phoneNumberId)) return fail(c, 409, 'That phone number ID is already connected to another business.');

  const { key, hash } = await generateApiKey();
  const tenant = await insertTenant(c.env, {
    businessName, industry, phoneNumberId, wabaId: String(b.wabaId || '').trim(), accessTokenEnc: await encryptToken(c.env.TOKEN_ENCRYPTION_KEY, accessToken),
    apiKeyHash: hash, adminNotificationPhone: adminPhone, tier: [0, 1, 2, 3].includes(Number(b.tier)) ? Number(b.tier) : 0, isActive: true,
    profile, flow: {}, ai: {}, templates: {},
  });
  return c.json({ success: true, tenant: publicTenant(tenant), apiKey: key }, 201);
});

app.get('/api/tenants/:tid', tenantAccess(), async (c) => {
  const t = await getTenant(c.env, c.req.param('tid'));
  return t ? c.json(tenantPayload(t)) : fail(c, 404, 'Not found');
});

const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_RE = /^[a-z]{2,3}(_[A-Z]{2})?$/;

app.patch('/api/tenants/:tid', tenantAccess(), async (c) => {
  const id = c.req.param('tid');
  const current = await getTenant(c.env, id);
  if (!current) return fail(c, 404, 'Not found');
  const b = await c.req.json().catch(() => ({}));
  const isAdmin = c.get('auth').role === 'admin';
  const patch = {}; const errors = [];

  if (b.businessName !== undefined) { const v = String(b.businessName).trim(); if (!v || v.length > 120) errors.push('Business name: 1–120 characters.'); patch.businessName = v; }
  if (b.adminNotificationPhone !== undefined) { const p = normalizePhone(b.adminNotificationPhone); if (!isValidPhone(p)) errors.push('Team alert number must include the country code.'); patch.adminNotificationPhone = p; }
  if (b.profile !== undefined) {
    const { value, errors: e } = validateProfile(b.profile);
    errors.push(...e); patch.profile = value;
  }
  if (b.templates !== undefined) {
    const t = { ...current.templates };
    for (const [k, re, label] of [['broadcastName', TEMPLATE_NAME_RE, 'Broadcast template name'], ['adminAlertName', TEMPLATE_NAME_RE, 'Alert template name'],
      ['broadcastLanguage', LANGUAGE_RE, 'Broadcast language'], ['adminAlertLanguage', LANGUAGE_RE, 'Alert language'],
      ['outreachName', TEMPLATE_NAME_RE, 'Outreach template name'], ['outreachLanguage', LANGUAGE_RE, 'Outreach language']]) {
      if (b.templates[k] === undefined) continue;
      const v = String(b.templates[k] ?? '').trim();
      if (v && !re.test(v)) errors.push(`${label} looks invalid (names use lowercase letters, numbers and _; languages look like en or en_US).`);
      t[k] = v || null;
    }
    if (b.templates.broadcastHasParams !== undefined) t.broadcastHasParams = b.templates.broadcastHasParams === null ? null : !!b.templates.broadcastHasParams;
    if (b.templates.outreachBody !== undefined) {
      const v = String(b.templates.outreachBody ?? '').trim();
      if (v.length > 1024) errors.push('Outreach template text: at most 1024 characters.');
      // No {{2}} is allowed (e.g. Meta's hello_world for testing): the template is then sent without the AI sentence.
      t.outreachBody = v || null;
    }
    patch.templates = t;
  }
  const adminOnly = ['tier', 'isActive', 'wabaId', 'accessToken', 'phoneNumberId'];
  if (!isAdmin && adminOnly.some((k) => b[k] !== undefined)) return fail(c, 403, 'Only an admin can change WhatsApp credentials, tier or account status.');
  if (isAdmin) {
    if (b.tier !== undefined) { const v = Number(b.tier); if (![0, 1, 2, 3].includes(v)) errors.push('Tier must be 0–3.'); patch.tier = v; }
    if (b.isActive !== undefined) patch.isActive = !!b.isActive;
    if (b.wabaId !== undefined) patch.wabaId = String(b.wabaId).trim();
    if (b.accessToken) patch.accessTokenEnc = await encryptToken(c.env.TOKEN_ENCRYPTION_KEY, String(b.accessToken).trim());
    if (b.phoneNumberId !== undefined && b.phoneNumberId !== current.phoneNumberId) {
      const v = String(b.phoneNumberId).trim();
      if (!/^\d{5,30}$/.test(v)) errors.push('Phone number ID must be digits.');
      else if (await getTenantByPhoneNumberId(c.env, v)) errors.push('That phone number ID is already used by another business.');
      patch.phoneNumberId = v;
    }
  }
  if (errors.length) return fail(c, 400, errors[0], { errors });
  if (!Object.keys(patch).length) return fail(c, 400, 'Nothing to update.');
  return c.json(tenantPayload(await updateTenant(c.env, id, patch)));
});

app.post('/api/tenants/:tid/rotate-key', requireAdmin, async (c) => {
  if (!await getTenant(c.env, c.req.param('tid'))) return fail(c, 404, 'Not found');
  const { key, hash } = await generateApiKey();
  await updateTenant(c.env, c.req.param('tid'), { apiKeyHash: hash });
  return c.json({ success: true, apiKey: key });
});

// ---------------- leads & broadcast ----------------
app.get('/api/leads/:tid', tenantAccess(), async (c) => {
  const q = c.req.query();
  const res = await listLeads(c.env, c.req.param('tid'), {
    page: Math.max(parseInt(q.page, 10) || 1, 1), limit: Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 500), status: q.status || '', search: (q.search || '').trim(),
  });
  return c.json({ success: true, count: res.data.length, ...res });
});

app.get('/api/leads/:tid/stats', tenantAccess(), async (c) => c.json({ success: true, data: await leadStats(c.env, c.req.param('tid')) }));

app.get('/api/leads/:tid/queue', tenantAccess(), async (c) => c.json({ success: true, stats: await c.env.HUB.get(c.env.HUB.idFromName(c.req.param('tid'))).queueStats() }));

/** Reads the uploaded CSV: unique valid numbers (first name wins), plus invalid samples and duplicate count. */
async function readCsvRecipients(c) {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') throw Object.assign(new Error('Choose a CSV file.'), { status: 400 });
  if (file.size > 10 * 1024 * 1024) throw Object.assign(new Error('CSV files can be at most 10 MB.'), { status: 400 });
  const rows = parseCsv(await file.text());
  if (!rows.length) throw Object.assign(new Error('The CSV is empty.'), { status: 400 });
  const seen = new Set(); const recipients = []; const invalid = [];
  for (const row of rows) {
    const raw = pickPhone(row); const phone = normalizePhone(raw);
    if (!isValidPhone(phone)) { invalid.push(raw || '(blank)'); continue; }
    if (seen.has(phone)) continue;
    seen.add(phone); recipients.push({ phone, name: pickName(row) || '' });
  }
  let selected = null; // phones the user ticked on the Broadcast page (null = everyone in the file)
  const raw = form.get('phones');
  if (typeof raw === 'string' && raw) { try { selected = new Set(JSON.parse(raw).map((p) => normalizePhone(String(p)))); } catch { /* ignore */ } }
  return { rows, recipients, invalid, selected, duplicates: rows.length - recipients.length - invalid.length };
}
/** What we already know about these numbers: opted out, broadcast before (when, delivery), chatted. */
async function knownLeads(c, tid, phones) {
  const map = new Map();
  for (let i = 0; i < phones.length; i += 90) {
    const chunk = phones.slice(i, i + 90);
    const { results } = await c.env.DB.prepare(`SELECT phone, name, status, last_broadcast_at, broadcast_status, broadcast_error, last_message_at, last_message_direction FROM leads WHERE tenant_id = ? AND phone IN (${chunk.map(() => '?').join(',')})`).bind(tid, ...chunk).all();
    for (const l of results) map.set(l.phone, l);
  }
  return map;
}

/** Step 1 of a broadcast: shows who is in the CSV and who already got a broadcast, so the user can choose. */
app.post('/api/leads/:tid/preview', tenantAccess(), async (c) => {
  const tid = c.req.param('tid');
  const tenant = await getTenant(c.env, tid);
  if (!tenant) return fail(c, 404, 'Not found');
  let csv; try { csv = await readCsvRecipients(c); } catch (err) { return fail(c, err.status || 500, err.message); }
  if (!csv.recipients.length) return fail(c, 400, 'No valid phone numbers found in the CSV.', { invalidSamples: csv.invalid.slice(0, 10) });
  if (csv.recipients.length > 10000) return fail(c, 400, 'Up to 10,000 numbers per CSV.');
  const known = await knownLeads(c, tid, csv.recipients.map((r) => r.phone));
  const contacts = csv.recipients.map((r) => {
    const l = known.get(r.phone);
    const state = l?.status === 'COLD' ? 'optedOut' : l?.last_broadcast_at ? 'sent' : 'new';
    return { phone: r.phone, name: r.name || l?.name || '', state, leadStatus: l?.status || null, lastBroadcastAt: l?.last_broadcast_at || null, broadcastStatus: l?.broadcast_status || null, broadcastError: l?.broadcast_error || null, replied: !!(l?.last_broadcast_at && l.last_message_direction === 'in' && l.last_message_at > l.last_broadcast_at) };
  });
  const limit = DAILY_LIMIT_BY_TIER[tenant.tier] ?? 250;
  const sent24h = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE tenant_id = ? AND last_broadcast_at >= ?').bind(tid, new Date(Date.now() - 864e5).toISOString()).first()).n;
  return c.json({ success: true, data: contacts, summary: { total: csv.rows.length, duplicates: csv.duplicates, invalid: csv.invalid.length, invalidSamples: csv.invalid.slice(0, 10), quotaRemaining: Math.max(limit - sent24h, 0), limit, tier: tenant.tier } });
});

app.post('/api/leads/:tid/upload', tenantAccess(), async (c) => {
  const tid = c.req.param('tid');
  const tenant = await getTenant(c.env, tid);
  if (!tenant || !tenant.isActive) return fail(c, 400, 'This business is not active.');
  let csv; try { csv = await readCsvRecipients(c); } catch (err) { return fail(c, err.status || 500, err.message); }
  const { rows, invalid, selected } = csv;
  const recipients = selected ? csv.recipients.filter((r) => selected.has(r.phone)) : csv.recipients;
  const summary = { total: rows.length, enqueued: 0, duplicatesSkipped: csv.duplicates, invalidSkipped: invalid.length, notSelected: csv.recipients.length - recipients.length, optedOutSkipped: 0, recentlyContactedSkipped: 0 };
  if (!recipients.length) return fail(c, 400, selected ? 'Select at least one contact to send to.' : 'No valid phone numbers found in the CSV.', { invalidSamples: invalid.slice(0, 10), summary });

  // Never message people who opted out. The cooldown only applies when nobody was picked by hand:
  // a contact the user ticked again on purpose is sent again.
  const cooldownDays = selected ? 0 : Number(c.env.BROADCAST_COOLDOWN_DAYS) || 0;
  const cooldownStart = cooldownDays ? new Date(Date.now() - cooldownDays * 864e5).toISOString() : null;
  const skip = new Set();
  for (const l of (await knownLeads(c, tid, recipients.map((r) => r.phone))).values()) {
    if (l.status === 'COLD') { skip.add(l.phone); summary.optedOutSkipped++; }
    else if (cooldownStart && l.last_broadcast_at && l.last_broadcast_at >= cooldownStart) { skip.add(l.phone); summary.recentlyContactedSkipped++; }
  }
  const toSend = recipients.filter((r) => !skip.has(r.phone));
  if (!toSend.length) return c.json({ success: true, message: 'Nothing to send: every valid number has opted out or was contacted recently.', summary, invalidSamples: invalid.slice(0, 10) });

  const limit = DAILY_LIMIT_BY_TIER[tenant.tier] ?? 250;
  const sent24h = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE tenant_id = ? AND last_broadcast_at >= ?').bind(tid, new Date(Date.now() - 864e5).toISOString()).first()).n;
  if (toSend.length + sent24h > limit) return fail(c, 429, `Tier ${tenant.tier} limit exceeded. Allowed: ${limit}/24h, already sent: ${sent24h}.`);

  const now = nowIso();
  const stmt = c.env.DB.prepare(`INSERT INTO leads (id, tenant_id, phone, name, status, last_broadcast_at, updated_at) VALUES (?, ?, ?, ?, 'CONTACTED', ?, ?)
    ON CONFLICT (tenant_id, phone) DO UPDATE SET name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE leads.name END,
      status = CASE WHEN leads.status = 'NEW' THEN 'CONTACTED' ELSE leads.status END,
      last_broadcast_at = excluded.last_broadcast_at, last_broadcast_message_id = NULL, broadcast_status = NULL, broadcast_status_at = NULL, broadcast_error = NULL, updated_at = excluded.updated_at`);
  for (let i = 0; i < toSend.length; i += 50) {
    await c.env.DB.batch(toSend.slice(i, i + 50).map((r) => stmt.bind(crypto.randomUUID(), tid, r.phone, r.name, now, now)));
  }

  const t = tenant.templates || {};
  const template = {
    name: t.broadcastName || c.env.DEFAULT_BROADCAST_TEMPLATE,
    language: t.broadcastLanguage || c.env.DEFAULT_BROADCAST_LANGUAGE || 'en',
    hasParams: t.broadcastName ? t.broadcastHasParams !== false : true,
  };
  await c.env.HUB.get(c.env.HUB.idFromName(tid)).startBroadcast(tid, toSend, template);
  summary.enqueued = toSend.length;
  return c.json({ success: true, message: `Queued ${toSend.length} messages. Sending in the background.`, summary: { ...summary, quotaRemaining: limit - sent24h - toSend.length, tier: tenant.tier }, invalidSamples: invalid.slice(0, 10) }, 202);
});

// ---------------- inbox ----------------
const phoneOk = (c, next) => (/^\d{6,15}$/.test(c.req.param('phone')) ? next() : fail(c, 400, 'Invalid phone'));

// ---------------- outreach (leads from the map-ai lead finder) ----------------
// Import a CSV of businesses with their website problems; the AI drafts 3 messages per lead;
// a person picks one and only then it is sent. Outreach chats are never auto-answered by the bot.
const outreachInfo = (tenant) => {
  const tpl = outreachTemplate(tenant);
  return { template: tpl ? { name: tpl.name, language: tpl.language, body: tpl.body } : null };
};

app.get('/api/outreach/:tid', tenantAccess(), async (c) => {
  const tenant = await getTenant(c.env, c.req.param('tid'));
  if (!tenant) return fail(c, 404, 'Not found');
  const q = c.req.query();
  const res = await listOutreach(c.env, tenant._id, { state: q.state || '', search: (q.search || '').trim(), limit: Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), 500) });
  return c.json({ success: true, ...res, ...outreachInfo(tenant) });
});

app.post('/api/outreach/:tid/import', tenantAccess(), async (c) => {
  const tid = c.req.param('tid');
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return fail(c, 400, 'Choose a CSV file.');
  if (file.size > 10 * 1024 * 1024) return fail(c, 400, 'CSV files can be at most 10 MB.');
  const rows = parseCsv(await file.text());
  if (!rows.length) return fail(c, 400, 'The CSV is empty.');
  if (rows.length > MAX_OUTREACH_IMPORT) return fail(c, 400, `Up to ${MAX_OUTREACH_IMPORT} leads per CSV.`);

  const seen = new Set(); const leads = []; const invalid = []; let duplicates = 0;
  for (const row of rows) {
    const r = outreachFromRow(row);
    if (r.error) { invalid.push(r.error); continue; }
    if (seen.has(r.phone)) { duplicates++; continue; }
    seen.add(r.phone); leads.push(r);
  }
  if (!leads.length) return fail(c, 400, 'No valid phone numbers found in the CSV.', { invalidSamples: invalid.slice(0, 10) });

  const known = await knownLeads(c, tid, leads.map((l) => l.phone));
  const summary = { total: rows.length, added: 0, updated: 0, alreadyContacted: 0, optedOut: 0, invalid: invalid.length, duplicates };
  for (const l of leads) {
    const k = known.get(l.phone);
    if (!k) summary.added++; else if (k.status === 'COLD') summary.optedOut++; else summary.updated++;
  }
  const now = nowIso();
  // Already-contacted leads keep their state and drafts; others (re)enter the "To send" list.
  const stmt = c.env.DB.prepare(`INSERT INTO leads (id, tenant_id, phone, name, status, outreach, outreach_state, bot_paused, updated_at)
      VALUES (?, ?, ?, ?, 'NEW', ?, 'TO_SEND', 1, ?)
    ON CONFLICT (tenant_id, phone) DO UPDATE SET
      name = CASE WHEN leads.name = '' THEN excluded.name ELSE leads.name END,
      outreach = excluded.outreach,
      outreach_state = CASE WHEN leads.outreach_state = 'SENT' OR leads.status = 'COLD' THEN leads.outreach_state ELSE 'TO_SEND' END,
      suggestions = CASE WHEN leads.outreach_state = 'SENT' THEN leads.suggestions ELSE NULL END,
      bot_paused = 1,
      updated_at = excluded.updated_at
    RETURNING outreach_state`);
  for (let i = 0; i < leads.length; i += 50) {
    const res = await c.env.DB.batch(leads.slice(i, i + 50).map((l) => stmt.bind(crypto.randomUUID(), tid, l.phone, l.name, JSON.stringify(l.outreach), now)));
    summary.alreadyContacted += res.filter((r) => r.results?.[0]?.outreach_state === 'SENT').length;
  }
  summary.updated -= summary.alreadyContacted;

  // "Send the first message to everyone now": queued at a safe pace with each business's own problem sentence.
  if (form.get('sendNow') === 'true') {
    const tenant = await getTenant(c.env, tid);
    const tpl = outreachTemplate(tenant);
    if (!tpl) return c.json({ success: true, summary, invalidSamples: invalid.slice(0, 10), sendError: 'Leads imported, but nothing was sent: add your outreach template in Settings first.' });
    const phones = leads.map((l) => l.phone);
    const ready = [];
    for (let i = 0; i < phones.length; i += 90) {
      const chunk = phones.slice(i, i + 90);
      const { results } = await c.env.DB.prepare(`SELECT phone, name, outreach FROM leads WHERE tenant_id = ? AND outreach_state = 'TO_SEND' AND status <> 'COLD' AND phone IN (${chunk.map(() => '?').join(',')})`).bind(tid, ...chunk).all();
      ready.push(...results.map((r) => ({ phone: r.phone, name: r.name, outreach: JSON.parse(r.outreach || '{}') })));
    }
    const limit = DAILY_LIMIT_BY_TIER[tenant.tier] ?? 250;
    const sent24h = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE tenant_id = ? AND last_broadcast_at >= ?').bind(tid, new Date(Date.now() - 864e5).toISOString()).first()).n;
    const room = Math.max(limit - sent24h, 0);
    const toSend = ready.slice(0, room);
    if (toSend.length) {
      const stamp = c.env.DB.prepare('UPDATE leads SET last_broadcast_at = ?, broadcast_status = NULL, broadcast_error = NULL, updated_at = ? WHERE tenant_id = ? AND phone = ?');
      for (let i = 0; i < toSend.length; i += 50) await c.env.DB.batch(toSend.slice(i, i + 50).map((l) => stamp.bind(now, now, tid, l.phone)));
      const recipients = toSend.map((l) => ({ phone: l.phone, name: l.name, params: outreachParams(tenant, tpl, l, problemSentence(l.outreach)) }));
      await c.env.HUB.get(c.env.HUB.idFromName(tid)).startBroadcast(tid, recipients, { name: tpl.name, language: tpl.language, outreach: true });
    }
    summary.queued = toSend.length;
    summary.overLimit = ready.length - toSend.length;
  }
  return c.json({ success: true, summary, invalidSamples: invalid.slice(0, 10) });
});

/** Loads the business and the outreach lead for /api/outreach/:tid/:phone/* routes. */
async function outreachLead(c) {
  const { tid, phone } = c.req.param();
  const [tenant, lead] = await Promise.all([getTenant(c.env, tid), getLead(c.env, tid, phone)]);
  if (!tenant || !tenant.isActive) throw Object.assign(new Error('Business not found or inactive'), { status: 404 });
  if (!lead?.outreach) throw Object.assign(new Error('This number is not an outreach lead. Import it from the Outreach page first.'), { status: 404 });
  return { tenant, lead };
}
const outreachRoute = (handler) => async (c) => {
  try { return await handler(c, await outreachLead(c)); }
  catch (err) { if (err.status) return fail(c, err.status, err.message, err.extra || {}); throw err; }
};

app.post('/api/outreach/:tid/:phone/suggest', tenantAccess(), phoneOk, outreachRoute(async (c, { tenant, lead }) => {
  if (lead.status === 'COLD') return fail(c, 409, 'This business opted out. WhatsApp policy does not allow messaging them.');
  const body = await c.req.json().catch(() => ({}));
  const r = await generateSuggestions(c.env, tenant, lead, { force: body.force === true });
  return c.json({ success: true, lead: r.lead, suggestions: r.suggestions, ...outreachInfo(tenant) });
}));

app.post('/api/outreach/:tid/:phone/send', tenantAccess(), phoneOk, outreachRoute(async (c, { tenant, lead }) => {
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.text || '').trim();
  if (!text) return fail(c, 400, 'Pick or type a message first.');
  if (text.length > 1000) return fail(c, 400, 'Keep it under 1000 characters.');
  if (lead.status === 'COLD') return fail(c, 409, 'This business opted out. WhatsApp policy does not allow messaging them.');
  const opener = lead.outreachState !== 'SENT';
  const windowOpen = !!lead.lastInboundAt && Date.now() - new Date(lead.lastInboundAt).getTime() < REPLY_WINDOW_MS;
  const tpl = outreachTemplate(tenant);

  let recorded = null;
  const record = outboundRecorder(c.env, tenant._id, 'agent');
  const client = new WhatsAppClient(c.env, { accessToken: await tenantAccessToken(c.env, tenant), phoneNumberId: tenant.phoneNumberId }, { onSent: async (p, d) => { recorded = await record(p, d); } });
  let res; let viaTemplate = false;
  try {
    if (windowOpen) {
      // They wrote to us in the last 24h: any text is allowed.
      res = await client.text(lead.phone, opener ? renderOpener(tenant, lead, text) : text);
    } else if (opener) {
      if (!tpl) return fail(c, 409, 'Set up your outreach template first (Settings → Outreach template). WhatsApp only allows an approved template as the first message.', { code: 'TEMPLATE_MISSING' });
      const limit = DAILY_LIMIT_BY_TIER[tenant.tier] ?? 250;
      const sent24h = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE tenant_id = ? AND last_broadcast_at >= ?').bind(tenant._id, new Date(Date.now() - 864e5).toISOString()).first()).n;
      if (sent24h >= limit) return fail(c, 429, `Tier ${tenant.tier} limit reached: ${limit} new conversations per 24h.`);
      res = await client.template(lead.phone, tpl.name, outreachParams(tenant, tpl, lead, text), tpl.language);
      viaTemplate = true;
    } else {
      return fail(c, 409, 'More than 24 hours since their last message, so WhatsApp only allows a template now. Wait for them to reply.', { code: 'WINDOW_CLOSED' });
    }
  } catch (err) {
    return fail(c, 502, `WhatsApp rejected the message: ${err.text || err.message}`);
  }

  const now = nowIso();
  const set = { suggestions: null, botPaused: true };
  if (opener) { set.outreachState = 'SENT'; set.outreachAt = now; }
  if (viaTemplate) Object.assign(set, { lastBroadcastAt: now, lastBroadcastMessageId: res?.messages?.[0]?.id || null, broadcastStatus: 'SENT', broadcastStatusAt: now, broadcastError: null });
  if (lead.status === 'NEW') set.status = 'CONTACTED';
  if (body.status && LEAD_STATUSES.includes(body.status) && body.status !== 'COLD') set.status = body.status;
  const updated = await upsertLead(c.env, tenant._id, lead.phone, { set });
  await publish(c.env, tenant._id, 'lead:update', { lead: updated });
  return c.json({ success: true, data: recorded?.message || null, lead: updated, viaTemplate }, 201);
}));

app.patch('/api/outreach/:tid/:phone', tenantAccess(), phoneOk, outreachRoute(async (c, { tenant, lead }) => {
  const body = await c.req.json().catch(() => ({}));
  const set = {};
  if (body.skip === true && lead.outreachState !== 'SENT') set.outreachState = 'SKIPPED';
  if (body.skip === false && lead.outreachState === 'SKIPPED') set.outreachState = 'TO_SEND';
  if (body.status !== undefined) {
    if (!LEAD_STATUSES.includes(body.status) || body.status === 'COLD') return fail(c, 400, 'Status must be NEW, CONTACTED, ENGAGED, QUALIFIED or CONVERTED.');
    if (lead.status === 'COLD') return fail(c, 409, 'This business opted out.');
    set.status = body.status;
  }
  if (!Object.keys(set).length) return fail(c, 400, 'Nothing to update.');
  const updated = await upsertLead(c.env, tenant._id, lead.phone, { set });
  await publish(c.env, tenant._id, 'lead:update', { lead: updated });
  return c.json({ success: true, lead: updated });
}));

app.get('/api/chats/:tid', tenantAccess(), async (c) => {
  const q = c.req.query();
  const res = await listChats(c.env, c.req.param('tid'), { limit: Math.min(Math.max(parseInt(q.limit, 10) || 30, 1), 100), search: (q.search || '').trim(), unread: q.unread === 'true', before: q.before || null });
  return c.json({ success: true, ...res });
});

app.get('/api/chats/:tid/:phone/messages', tenantAccess(), phoneOk, async (c) => {
  const { tid, phone } = c.req.param();
  const lead = await getLead(c.env, tid, phone);
  if (!lead) return fail(c, 404, 'Chat not found');
  const res = await listMessages(c.env, tid, phone, { limit: Math.min(Math.max(parseInt(c.req.query('limit'), 10) || 50, 1), 200), before: c.req.query('before') || null });
  return c.json({ success: true, lead, ...res });
});

app.post('/api/chats/:tid/:phone/messages', tenantAccess(), phoneOk, async (c) => {
  const { tid, phone } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.text || '').trim();
  if (!text) return fail(c, 400, 'Type a message first.');
  if (text.length > 4096) return fail(c, 400, 'Messages can be at most 4096 characters.');
  const [tenant, lead] = await Promise.all([getTenant(c.env, tid), getLead(c.env, tid, phone)]);
  if (!tenant || !tenant.isActive) return fail(c, 404, 'Business not found or inactive');
  if (!lead) return fail(c, 404, 'Chat not found');
  if (lead.status === 'COLD') return fail(c, 409, 'This customer opted out. WhatsApp policy does not allow messaging them.');
  if (!lead.lastInboundAt || Date.now() - new Date(lead.lastInboundAt).getTime() > REPLY_WINDOW_MS) {
    return fail(c, 409, "More than 24 hours since this customer's last message. WhatsApp only allows a template now — re-engage them with a broadcast.", { code: 'WINDOW_CLOSED' });
  }
  let recorded = null;
  const record = outboundRecorder(c.env, tid, 'agent');
  const client = new WhatsAppClient(c.env, { accessToken: await tenantAccessToken(c.env, tenant), phoneNumberId: tenant.phoneNumberId }, { onSent: async (p, d) => { recorded = await record(p, d); } });
  try { await client.text(phone, text); } catch (err) { return fail(c, 502, `WhatsApp rejected the message: ${err.text || err.message}`); }
  let updated = recorded?.lead || lead;
  if (body.pauseBot !== false && !lead.botPaused) {
    updated = await upsertLead(c.env, tid, phone, { set: { botPaused: true } });
    await publish(c.env, tid, 'lead:update', { lead: updated });
  }
  return c.json({ success: true, data: recorded?.message || null, lead: updated }, 201);
});

app.post('/api/chats/:tid/:phone/read', tenantAccess(), phoneOk, async (c) => {
  const { tid, phone } = c.req.param();
  const [lead] = await updateLeads(c.env, tid, 'phone = ?', [phone], { unreadCount: 0 });
  if (!lead) return fail(c, 404, 'Chat not found');
  await publish(c.env, tid, 'lead:update', { lead });
  return c.json({ success: true, lead });
});

app.patch('/api/chats/:tid/:phone', tenantAccess(), phoneOk, async (c) => {
  const { tid, phone } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.botPaused !== 'boolean') return fail(c, 400, 'Send { "botPaused": true | false }.');
  const [lead] = await updateLeads(c.env, tid, 'phone = ?', [phone], { botPaused: body.botPaused });
  if (!lead) return fail(c, 404, 'Chat not found');
  await publish(c.env, tid, 'lead:update', { lead });
  return c.json({ success: true, lead });
});

app.notFound((c) => (c.req.path.startsWith('/api/') ? fail(c, 404, 'Not found') : c.env.ASSETS.fetch(c.req.raw)));

export default { fetch: app.fetch };
