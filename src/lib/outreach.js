// Outreach to businesses found by the map-ai lead finder.
// The AI drafts 3 messages for exactly that business (its own pain points); a person picks one and it is sent.
// Nothing here sends on its own.
import { businessFacts } from './profile.js';
import { recentTurns, takeAiReply, upsertLead } from './db.js';
import { publish } from './chatlog.js';
import { fill, normalizePhone, isValidPhone, nowIso } from './text.js';

export const MAX_OUTREACH_IMPORT = 2000;
const SUGGESTION_COUNT = 3;

// ---------- CSV import ----------
const col = (row, ...names) => {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((x) => x.trim().toLowerCase().replace(/[\s-]+/g, '_') === n);
    if (k && String(row[k]).trim()) return String(row[k]).trim();
  }
  return '';
};
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
/** http(s) link with a real host, without tracking parameters; '' otherwise (e.g. Google ad links "https:///aclk?…"). */
const safeUrl = (u) => {
  const s = String(u || '').trim();
  if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(s)) return '';
  try { const x = new URL(s); if (/maps\.google|google\.[a-z.]+\/maps/.test(x.href)) return s.slice(0, 1000); return `${x.origin}${x.pathname}`.replace(/\/$/, '').slice(0, 500); } catch { return ''; }
};

/** One CSV row (export_whatsapp_leads.py format, or similar column names) → { phone, name, outreach } or { error }. */
// Calling codes for numbers written without "+" (Google Maps usually shows "+1 …" for foreign businesses).
const COUNTRY_CODES = {
  canada: '1', usa: '1', 'united states': '1', us: '1', india: '91', 'united kingdom': '44', uk: '44', australia: '61',
  'new zealand': '64', 'united arab emirates': '971', uae: '971', singapore: '65', ireland: '353', germany: '49',
  france: '33', 'south africa': '27', 'saudi arabia': '966', qatar: '974',
};
/** Digits with country code: "+1 647-…" keeps its code; otherwise the row's country decides (India by default). */
export function phoneFor(raw, country) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.startsWith('+') || s.startsWith('00')) {
    const d = s.replace(/\D/g, '').replace(/^00/, '');
    return isValidPhone(d) ? d : null;
  }
  const code = COUNTRY_CODES[String(country || '').trim().toLowerCase()];
  if (!code) return normalizePhone(s);
  let d = s.replace(/\D/g, '').replace(/^0+/, '');
  if (!d.startsWith(code) || d.length <= 10) d = code + d;
  return isValidPhone(d) ? d : null;
}

/**
 * Website problems → separate points. Accepts "a | b" (export script) and the scraper's own
 * "1) LEAD CAPTURE: … 2) Trust gaps: …" text, dropping the section labels.
 */
export function splitPains(text) {
  const t = String(text || '').replace(/�/g, "'").replace(/\s+/g, ' ').trim();
  if (!t) return [];
  let parts = t.includes('|') ? t.split(/\s*\|\s*/) : t.split(/(?:^|\s)\d{1,2}[).]\s*/);
  parts = parts.map((p) => p.trim().replace(/^[;.\-\s]+|[;\s]+$/g, '')).filter(Boolean);
  if (parts.length <= 1) parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(0, 5).map((p) => {
    p = p.replace(/^[A-Za-z &/]{3,40}:\s*/, '');
    return p.length > 240 ? `${p.slice(0, 240).replace(/\s+\S*$/, '')}…` : p;
  });
}

/** One CSV row → { phone, name, outreach } or { error }. Reads the map scraper's high_paying_leads.csv directly, or whatsapp_leads.csv. */
export function outreachFromRow(row) {
  const rawPhone = col(row, 'phone', 'whatsapp', 'mobile', 'phone_number', 'number');
  const country = col(row, 'country');
  const phone = phoneFor(rawPhone, country);
  if (!phone) return { error: rawPhone || '(blank)' };
  const name = clip(col(row, 'name', 'business', 'business_name', 'company'), 120);
  const pains = splitPains(col(row, 'pain_points', 'problems', 'website_problems'));
  const outreach = {
    business: name,
    category: clip(col(row, 'category', 'industry'), 80),
    city: clip(col(row, 'city'), 80),
    country: clip(col(row, 'country'), 60),
    rating: clip(col(row, 'rating'), 8),
    reviews: clip(col(row, 'reviews', 'review_count'), 10),
    website: safeUrl(col(row, 'website', 'website_url')),
    websiteBroken: /^(yes|true|1)$/i.test(col(row, 'website_broken', 'is_broken')),
    payScore: clip(col(row, 'pay_score'), 4),
    painPoints: pains,
    impact: clip(col(row, 'client_impact', 'client_problem_translation'), 600),
    pitch: clip(col(row, 'pitch_angle', 'pitch'), 300),
    mapsLink: safeUrl(col(row, 'maps_link', 'google_maps_link')),
    importedAt: nowIso(),
  };
  return { phone, name, outreach };
}

// ---------- first message (template) ----------
/** What the business set up in Settings → Outreach template. */
export function outreachTemplate(tenant) {
  const t = tenant.templates || {};
  return t.outreachName ? { name: t.outreachName, language: t.outreachLanguage || 'en', body: t.outreachBody || '' } : null;
}
/** Meta template variables can't contain new lines, tabs or more than 4 spaces in a row. */
export const templateParam = (s, max = 600) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max);

/** Variables the template text uses (highest {{n}}; 0 for e.g. hello_world). No text saved → {{1}} and {{2}}. */
export function templateVarCount(tpl) {
  return Math.max(0, ...[...(tpl?.body || '{{1}}{{2}}').matchAll(/\{\{(\d)\}\}/g)].map((m) => Number(m[1])));
}
/** {{1}} their business name, {{2}} the sentence about their problem, {{3}} your business name. */
export function outreachParams(tenant, tpl, lead, sentence) {
  return [lead.outreach?.business || lead.name || 'there', templateParam(sentence), tenant.profile?.displayName || tenant.businessName].slice(0, templateVarCount(tpl));
}

/**
 * Sentence about their problem for first messages sent straight from the CSV (no AI):
 * the first sentence of "what it costs them", else the pitch, else the top pain point.
 */
export function problemSentence(o = {}) {
  const first = (t) => (String(t || '').match(/^.*?[.!?](?=\s|$)/)?.[0] || String(t || '')).trim();
  const s = first(o.impact) || first(o.pitch) || (o.painPoints?.[0] ? `I noticed on your website: ${o.painPoints[0]}` : '');
  return templateParam(s, 300);
}

/** The exact text the lead will see for an opener: the template filled in, or the free-text fallback. */
export function renderOpener(tenant, lead, hook) {
  const tpl = outreachTemplate(tenant);
  const name = lead.outreach?.business || lead.name || 'there';
  const seller = tenant.profile?.displayName || tenant.businessName;
  if (tpl?.body) return tpl.body.replace(/\{\{1\}\}/g, name).replace(/\{\{2\}\}/g, templateParam(hook)).replace(/\{\{3\}\}/g, seller);
  return fill('Hi {name},\n\n{hook}\n\n— {seller}\nReply STOP if you\'d rather not hear from us.', { name, hook: hook.trim(), seller });
}

// ---------- AI ----------
const SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: { type: 'object', properties: { label: { type: 'string' }, text: { type: 'string' } }, required: ['label', 'text'] },
    },
    recommended: { type: 'integer' },
    intent: { type: 'string' },
  },
  required: ['suggestions', 'recommended'],
};

function leadFacts(o, lead) {
  if (!o) return `Business: ${lead.name || 'unknown'}`;
  return [
    `Business: ${o.business || lead.name || 'unknown'}`,
    o.category && `Category: ${o.category}`,
    (o.city || o.country) && `Location: ${[o.city, o.country].filter(Boolean).join(', ')}`,
    o.rating && `Google rating: ${o.rating}${o.reviews ? ` from ${o.reviews} reviews` : ''}`,
    o.website ? `Website: ${o.website}${o.websiteBroken ? ' (currently broken / not loading)' : ''}` : 'Website: none found',
    o.painPoints?.length && `Problems we found on their website:\n${o.painPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
    o.impact && `What it costs them: ${o.impact}`,
    o.pitch && `Our angle: ${o.pitch}`,
  ].filter(Boolean).join('\n');
}

const COMMON_RULES = [
  '- Write like a real person on WhatsApp: warm, plain, short. No "As an AI", no buzzwords, no hashtags, no emoji spam (one at most).',
  '- Only promise services and prices that appear in OUR BUSINESS above. If a price is not there, offer a quick call or a free preview instead of a number.',
  '- Never invent facts about their business beyond the problems listed. Never write links except their own website.',
  '- Never ask for payment details, passwords or ID numbers.',
  '- Reply in the language the lead writes in (default English).',
];

function openerPrompt(tenant, lead) {
  return [
    'You write the FIRST WhatsApp message from our business to another business that has never heard from us.',
    '',
    'OUR BUSINESS (who is writing):',
    businessFacts(tenant),
    '',
    'THE LEAD (who we are writing to):',
    leadFacts(lead.outreach, lead),
    '',
    `TASK: write ${SUGGESTION_COUNT} different versions of ONE complete sentence (max 45 words, starting with a capital letter) that will be inserted into an approved WhatsApp template, after the greeting "Hi <their business name>," and a short intro.`,
    'Each version must name ONE concrete problem from their list in plain words (what it costs them: calls, bookings, enquiries) and end with a low-pressure offer, e.g. a free 1-page preview or a 10-minute call.',
    'Version 1: the biggest problem, friendly. Version 2: compliment their reviews/rating first, then the problem. Version 3: the shortest and most direct.',
    'No greeting (it is already in the template), no sign-off, no line breaks.',
    ...COMMON_RULES,
    '',
    'label: 2–4 words describing the approach (e.g. "Broken site, friendly"). recommended: index (0-based) of the one most likely to get a reply.',
    'Respond with JSON only: {"suggestions":[{"label":string,"text":string}],"recommended":number}.',
  ].join('\n');
}

function replyPrompt(tenant, lead) {
  return [
    'You help our sales person reply on WhatsApp to a business we contacted. You draft replies; the person picks one and sends it.',
    'Goal: turn their interest into a confirmed lead (a call booked or a yes to the free preview) and then into a sale.',
    '',
    'OUR BUSINESS (who is writing):',
    businessFacts(tenant),
    '',
    'THE LEAD (who we are talking to):',
    leadFacts(lead.outreach, lead),
    '',
    `TASK: read the chat and write ${SUGGESTION_COUNT} different replies to their LAST message:`,
    '1. "Answer" — answer exactly what they said or asked, then one soft next step.',
    '2. "Proof" — answer briefly, then show value: relate it to their own website problem and what fixing it brings (more calls/bookings), offer the free preview.',
    '3. "Close" — move to a decision: propose a specific short call (e.g. "tomorrow 11am or 4pm?") or ask for the go-ahead.',
    'If they said they are not interested, make all three polite, short, no-pressure closes (one may leave the door open).',
    'If they ask a price that is not in OUR BUSINESS, do not make one up: say it depends on the scope and offer the call/preview.',
    'Each reply: 1–4 short sentences, plain WhatsApp text (you may use *bold* once).',
    ...COMMON_RULES,
    '',
    'intent: one of "interested", "question", "price", "objection", "not_interested", "ready_to_buy", "other" for their last message.',
    'recommended: index (0-based) of the reply most likely to move this lead to a sale.',
    'Respond with JSON only: {"suggestions":[{"label":string,"text":string}],"recommended":number,"intent":string}.',
  ].join('\n');
}

const turnText = (t) => (t.text || (t.type === 'template' ? '[our first message]' : `[${t.type}]`)).slice(0, 1500);

async function runAi(env, system, history) {
  if (!env.AI) throw Object.assign(new Error('Workers AI is not available.'), { status: 503 });
  const messages = [{ role: 'system', content: system }];
  for (const t of history) messages.push({ role: t.direction === 'in' ? 'user' : 'assistant', content: turnText(t) });
  if (messages[messages.length - 1].role !== 'user') messages.push({ role: 'user', content: history.length ? '(Draft the replies now.)' : '(Write the versions now.)' });
  let out;
  try {
    const res = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages, response_format: { type: 'json_schema', json_schema: SCHEMA }, max_tokens: 700, temperature: 0.6,
    });
    out = typeof res?.response === 'string' ? JSON.parse(res.response.replace(/^```(?:json)?\s*|\s*```$/g, '')) : res?.response;
  } catch (err) {
    console.warn('[Outreach AI] failed:', err.message);
    throw Object.assign(new Error('The AI could not write suggestions right now. Try again in a moment.'), { status: 502 });
  }
  const known = system;
  const items = (Array.isArray(out?.suggestions) ? out.suggestions : [])
    .map((s) => ({
      label: clip(s?.label, 40) || 'Suggestion',
      // Links the AI made up are dropped; only links already in the facts survive.
      text: String(s?.text || '').replace(/(?:https?:\/\/|www\.)[^\s)]+/gi, (u) => (known.includes(u.replace(/[.,!?]+$/, '')) ? u : '')).replace(/[ \t]{2,}/g, ' ').trim().slice(0, 1000),
    }))
    .filter((s) => s.text).slice(0, SUGGESTION_COUNT);
  if (!items.length) throw Object.assign(new Error('The AI returned no usable suggestions. Try again.'), { status: 502 });
  const rec = Number.isInteger(out.recommended) && out.recommended >= 0 && out.recommended < items.length ? out.recommended : 0;
  return { items, recommended: rec, intent: clip(out.intent, 20) || null };
}

/**
 * Drafts 3 messages for this lead and stores them on the lead.
 * Before the first message: openers. After they reply: replies to their last message.
 */
export async function generateSuggestions(env, tenant, lead, { force = false } = {}) {
  // Not contacted yet → first-message versions. Contacted → replies to their last message
  // (or, before they answer, follow-ups to our own message).
  const kind = lead.outreachState === 'SENT' ? 'reply' : 'opener';
  const cached = lead.suggestions;
  if (!force && cached?.kind === kind && cached.forMessageAt === (lead.lastInboundAt || null)) return { lead, suggestions: cached };
  if (!await takeAiReply(env, tenant._id, tenant.ai?.dailyLimit ?? 300)) {
    throw Object.assign(new Error('Daily AI limit reached for this business. Raise it on the AI Assistant page.'), { status: 429 });
  }
  const history = kind === 'reply' ? await recentTurns(env, tenant._id, lead.phone, 16) : [];
  const r = await runAi(env, kind === 'reply' ? replyPrompt(tenant, lead) : openerPrompt(tenant, lead), history);
  if (kind === 'opener') r.items = r.items.map((s) => ({ ...s, text: templateParam(s.text, 400), preview: renderOpener(tenant, lead, s.text) }));
  const suggestions = { kind, ...r, forMessageAt: lead.lastInboundAt || null, at: nowIso() };
  const updated = await upsertLead(env, tenant._id, lead.phone, { set: { suggestions } });
  await publish(env, tenant._id, 'lead:update', { lead: updated });
  return { lead: updated, suggestions };
}
