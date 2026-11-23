// Bluxury Outreach Agent — Cloudflare Worker: dashboard API, Meta webhook.
import { Hono } from 'hono';
import {
  getSettings, saveSetting, publicSettings, whatsappAuth, getLead, updateLead, raisedStatus, listLeads, importLeads,
  leadsSentLast24h, recordMessage, listMessages, applyStatus, STATUSES, TABS,
} from './lib/db.js';
import { safeEqual, verifyMetaSignature, encryptToken } from './lib/crypto.js';
import { parseCsv, clip, nowIso } from './lib/text.js';
import { WhatsAppClient, sentId } from './lib/whatsapp.js';
import { leadFromRow, renderOpener, templateParams, generateSuggestions, suggestionKind, MAX_IMPORT } from './lib/outreach.js';

const app = new Hono();
const REPLY_WINDOW_MS = 24 * 3600 * 1000;
const OPT_OUT = ['stop', 'unsubscribe', 'opt out', 'optout', 'not interested', 'remove me'];
const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_RE = /^[a-z]{2,3}(_[A-Z]{2})?$/;

const fail = (c, status, error, extra = {}) => c.json({ success: false, error, ...extra }, status);
const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, extra });
const windowOpen = (lead) => !!lead.lastInboundAt && Date.now() - new Date(lead.lastInboundAt).getTime() < REPLY_WINDOW_MS;

app.onError((err, c) => {
  if (err.status) return fail(c, err.status, err.message, { ...(err.code ? { code: err.code } : {}), ...(err.extra || {}) });
  console.error('[Worker] unhandled:', err.stack || err.message);
  return fail(c, 500, 'Internal Server Error');
});

// ---------- auth: one admin key (ADMIN_API_KEY) ----------
app.use('/api/*', async (c, next) => {
  const key = (c.req.header('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const admin = c.env.ADMIN_API_KEY;
  if (!key || !admin || admin.length < 32 || !await safeEqual(key, admin)) return fail(c, 401, 'Missing or invalid key.');
  return next();
});

app.get('/health', async (c) => {
  try { await c.env.DB.prepare('SELECT 1').first(); return c.json({ status: 'OK', d1: 'up', timestamp: nowIso() }); }
  catch { return c.json({ status: 'DEGRADED', d1: 'down', timestamp: nowIso() }, 503); }
});

// ---------- Meta webhook ----------
app.get('/webhook', async (c) => {
  const expected = c.env.WHATSAPP_VERIFY_TOKEN;
  const token = c.req.query('hub.verify_token');
  if (expected && c.req.query('hub.mode') === 'subscribe' && token && await safeEqual(token, expected)) return c.text(c.req.query('hub.challenge') || '');
  return c.text('Forbidden', 403);
});

/** Text shown in the chat for an incoming message. */
function inboundText(m) {
  if (m.type === 'text') return m.text?.body || '';
  if (m.type === 'button') return m.button?.text || '';
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
  if (m.type === 'reaction') return m.reaction?.emoji || '';
  const media = m[m.type] || {};
  return `[${m.type}]${media.caption ? ` ${media.caption}` : ''}`;
}
const isOptOut = (text) => OPT_OUT.includes(String(text).toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim());

app.post('/webhook', async (c) => {
  const raw = await c.req.arrayBuffer();
  if (c.env.META_APP_SECRET) {
    if (!await verifyMetaSignature(c.env.META_APP_SECRET, raw, c.req.header('x-hub-signature-256'))) return c.text('Invalid signature', 401);
  } else if (c.env.ALLOW_UNSIGNED_WEBHOOKS !== 'true') {
    console.error('[Webhook] META_APP_SECRET is not set — rejecting.');
    return c.text('Webhook secret not configured', 500);
  }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return c.text('Bad JSON', 400); }

  const s = await getSettings(c.env);
  try {
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        const v = change?.value;
        if (!v?.metadata?.phone_number_id || v.metadata.phone_number_id !== s.whatsapp.phoneNumberId) continue;
        for (const st of v.statuses || []) {
          const e = st.errors?.[0];
          if (st?.id && st?.status) await applyStatus(c.env, st.id, st.status, e ? `${e.code}: ${e.error_data?.details || e.message || e.title || 'Unknown error'}` : null);
        }
        for (const m of v.messages || []) {
          if (!m?.id || !m?.from) continue;
          const lead = await getLead(c.env, m.from);
          if (!lead) continue; // only businesses we imported
          const text = inboundText(m);
          const rec = await recordMessage(c.env, { phone: m.from, direction: 'in', type: m.type, text, waMessageId: m.id });
          if (!rec) continue; // Meta retry of a message we already have
          if (isOptOut(text)) { await updateLead(c.env, m.from, { status: 'COLD', suggestions: null }); continue; }
          let updated = rec.lead;
          if (updated.status !== raisedStatus(updated.status, 'ENGAGED')) updated = await updateLead(c.env, m.from, { status: 'ENGAGED' });
          // Draft replies right away (in the background) so they are ready when the dashboard opens the chat.
          if (updated.state === 'SENT' && m.type !== 'reaction') {
            c.executionCtx.waitUntil(generateSuggestions(c.env, s, updated).catch((err) => console.warn('[Webhook] suggestions failed:', err.message)));
          }
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] could not store events, asking Meta to retry:', err.message);
    return c.text('Retry later', 500);
  }
  return c.text('OK');
});

// ---------- setup ----------
app.get('/api/settings', async (c) => c.json({ success: true, data: publicSettings(await getSettings(c.env)), webhookUrl: `${new URL(c.req.url).origin}/webhook` }));

app.patch('/api/settings', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const s = await getSettings(c.env);
  const errors = [];
  if (b.whatsapp) {
    const w = { ...s.whatsapp };
    if (b.whatsapp.phoneNumberId !== undefined) { const v = String(b.whatsapp.phoneNumberId).trim(); if (!/^\d{5,30}$/.test(v)) errors.push('Phone number ID must be digits (Meta → WhatsApp → API Setup).'); w.phoneNumberId = v; }
    if (b.whatsapp.wabaId !== undefined) w.wabaId = String(b.whatsapp.wabaId).trim().slice(0, 40);
    if (b.whatsapp.accessToken) w.tokenEnc = await encryptToken(c.env.TOKEN_ENCRYPTION_KEY, String(b.whatsapp.accessToken).trim());
    if (!errors.length) await saveSetting(c.env, 'whatsapp', w);
  }
  if (b.template) {
    const t = { name: String(b.template.name || '').trim(), language: String(b.template.language || 'en').trim(), body: String(b.template.body || '').trim() };
    if (t.name && !TEMPLATE_NAME_RE.test(t.name)) errors.push('Template name: lowercase letters, numbers and _ only (as in Meta).');
    if (!LANGUAGE_RE.test(t.language)) errors.push('Language looks like en or en_US.');
    if (t.body.length > 1024) errors.push('Template text: at most 1024 characters.');
    if (!errors.length) await saveSetting(c.env, 'template', t.name ? t : {});
  }
  if (b.profile) {
    const p = { name: clip(b.profile.name, 120), about: String(b.profile.about || '').trim().slice(0, 1500), services: String(b.profile.services || '').trim().slice(0, 3000), website: clip(b.profile.website, 300) };
    await saveSetting(c.env, 'profile', p);
  }
  if (b.limits) {
    const l = { aiPerDay: Math.round(Number(b.limits.aiPerDay)), firstPerDay: Math.round(Number(b.limits.firstPerDay)) };
    if (!(l.aiPerDay >= 0 && l.aiPerDay <= 20000)) errors.push('AI suggestions per day: 0–20000.');
    if (!(l.firstPerDay >= 0 && l.firstPerDay <= 1000)) errors.push('First messages per day: 0–1000.');
    if (!errors.length) await saveSetting(c.env, 'limits', l);
  }
  if (errors.length) return fail(c, 400, errors[0], { errors });
  return c.json({ success: true, data: publicSettings(await getSettings(c.env)) });
});

// ---------- leads ----------
const phoneOk = (c, next) => (/^\d{6,15}$/.test(c.req.param('phone')) ? next() : fail(c, 400, 'Invalid phone'));
async function leadOr404(c) {
  const lead = await getLead(c.env, c.req.param('phone'));
  if (!lead) throw httpError(404, 'Lead not found');
  return lead;
}

app.get('/api/leads', async (c) => {
  const tab = TABS.includes(c.req.query('tab')) ? c.req.query('tab') : 'TO_SEND';
  return c.json({ success: true, tab, ...await listLeads(c.env, { tab, search: (c.req.query('search') || '').trim() }) });
});

app.post('/api/leads/import', async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return fail(c, 400, 'Choose a CSV file.');
  if (file.size > 10 * 1024 * 1024) return fail(c, 400, 'CSV files can be at most 10 MB.');
  const rows = parseCsv(await file.text());
  if (!rows.length) return fail(c, 400, 'The CSV is empty.');
  if (rows.length > MAX_IMPORT) return fail(c, 400, `Up to ${MAX_IMPORT} leads per CSV.`);
  const seen = new Set(); const leads = []; const invalid = []; let duplicates = 0;
  for (const row of rows) {
    const l = leadFromRow(row);
    if (l.error) { invalid.push(l.error); continue; }
    if (seen.has(l.phone)) { duplicates++; continue; }
    seen.add(l.phone); leads.push(l);
  }
  if (!leads.length) return fail(c, 400, 'No valid phone numbers found in the CSV.', { invalidSamples: invalid.slice(0, 10) });
  const counts = await importLeads(c.env, leads);
  return c.json({ success: true, summary: { total: rows.length, ...counts, invalid: invalid.length, duplicates }, invalidSamples: invalid.slice(0, 10) });
});

/** One lead with its chat; opening it marks it read. */
app.get('/api/leads/:phone', phoneOk, async (c) => {
  let lead = await leadOr404(c);
  if (lead.unread) lead = await updateLead(c.env, lead.phone, { unread: 0 });
  return c.json({ success: true, lead, messages: await listMessages(c.env, lead.phone) });
});

app.post('/api/leads/:phone/suggest', phoneOk, async (c) => {
  const lead = await leadOr404(c);
  if (lead.status === 'COLD') return fail(c, 409, 'This business opted out. WhatsApp policy does not allow messaging them.');
  const body = await c.req.json().catch(() => ({}));
  return c.json({ success: true, lead: await generateSuggestions(c.env, await getSettings(c.env), lead, { force: body.force === true }) });
});

app.post('/api/leads/:phone/send', phoneOk, async (c) => {
  const lead = await leadOr404(c);
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.text || '').trim();
  if (!text) return fail(c, 400, 'Pick or type a message first.');
  if (text.length > 1000) return fail(c, 400, 'Keep it under 1000 characters.');
  if (lead.status === 'COLD') return fail(c, 409, 'This business opted out. WhatsApp policy does not allow messaging them.');
  const s = await getSettings(c.env);
  const client = new WhatsAppClient(c.env, await whatsappAuth(c.env, s));
  const first = suggestionKind(lead) === 'opener';

  let res; let shown; let type = 'text';
  try {
    if (windowOpen(lead)) {
      // They wrote in the last 24h: any text is allowed.
      shown = first ? renderOpener(s, lead, text) : text;
      res = await client.text(lead.phone, shown);
    } else if (first) {
      if (!s.template.name) return fail(c, 409, 'Add your outreach template first (Setup → First-message template). WhatsApp only allows an approved template as the first message.', { code: 'TEMPLATE_MISSING' });
      if (await leadsSentLast24h(c.env) >= s.limits.firstPerDay) return fail(c, 429, `Daily limit reached: ${s.limits.firstPerDay} first messages per 24h (Setup → Limits).`);
      shown = s.template.body ? renderOpener(s, lead, text) : `Template “${s.template.name}”`;
      res = await client.template(lead.phone, s.template.name, templateParams(s, lead, text), s.template.language || 'en');
      type = 'template';
    } else {
      return fail(c, 409, 'More than 24 hours since their last message, so WhatsApp only allows a template now. Wait for them to reply.', { code: 'WINDOW_CLOSED' });
    }
  } catch (err) {
    return fail(c, 502, `WhatsApp rejected the message: ${err.text || err.message}`);
  }

  const rec = await recordMessage(c.env, { phone: lead.phone, direction: 'out', type, text: shown, waMessageId: sentId(res) });
  const set = { suggestions: null };
  if (first) Object.assign(set, { state: 'SENT', firstSentAt: nowIso(), firstMessageId: sentId(res), delivery: 'SENT', deliveryError: null });
  const next = STATUSES.includes(body.status) && body.status !== 'COLD' ? body.status : 'CONTACTED';
  set.status = body.status ? next : raisedStatus(lead.status, 'CONTACTED');
  return c.json({ success: true, message: rec?.message || null, lead: await updateLead(c.env, lead.phone, set) }, 201);
});

app.patch('/api/leads/:phone', phoneOk, async (c) => {
  const lead = await leadOr404(c);
  const body = await c.req.json().catch(() => ({}));
  const set = {};
  if (body.skip === true && lead.state === 'TO_SEND') set.state = 'SKIPPED';
  if (body.skip === false && lead.state === 'SKIPPED' && lead.status !== 'COLD') set.state = 'TO_SEND';
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status) || body.status === 'COLD') return fail(c, 400, 'Status must be NEW, CONTACTED, ENGAGED, QUALIFIED or CONVERTED.');
    if (lead.status === 'COLD') return fail(c, 409, 'This business opted out.');
    set.status = body.status;
  }
  if (!Object.keys(set).length) return fail(c, 400, 'Nothing to update.');
  return c.json({ success: true, lead: await updateLead(c.env, lead.phone, set) });
});

app.notFound((c) => (c.req.path.startsWith('/api/') ? fail(c, 404, 'Not found') : c.env.ASSETS.fetch(c.req.raw)));

export default { fetch: app.fetch };
