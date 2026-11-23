// Outreach logic: CSV rows → leads, AI-drafted messages, template filling.
// The AI only drafts. A person picks one message and only then it is sent.
import { recentTurns, takeAiCall, updateLead } from './db.js';
import { fill, clip, normalizePhone, nowIso } from './text.js';

export const MAX_IMPORT = 2000;
const COUNT = 3;

// ---------- CSV import ----------
const col = (row, ...names) => {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((x) => x.trim().toLowerCase().replace(/[\s-]+/g, '_') === n);
    if (k && String(row[k]).trim()) return String(row[k]).trim();
  }
  return '';
};
const safeUrl = (u) => (/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(String(u || '').trim()) ? String(u).trim().slice(0, 500) : '');

/** One CSV row (export_whatsapp_leads.py format, or similar column names) → { phone, name, info } or { error }. */
export function leadFromRow(row) {
  const rawPhone = col(row, 'phone', 'whatsapp', 'mobile', 'phone_number', 'number');
  const phone = normalizePhone(rawPhone);
  if (!phone) return { error: rawPhone || '(blank)' };
  return {
    phone,
    name: clip(col(row, 'name', 'business', 'business_name', 'company'), 120),
    info: {
      category: clip(col(row, 'category', 'industry'), 80),
      city: clip(col(row, 'city'), 80),
      country: clip(col(row, 'country'), 60),
      rating: clip(col(row, 'rating'), 8),
      reviews: clip(col(row, 'reviews', 'review_count'), 10),
      website: safeUrl(col(row, 'website', 'website_url')),
      websiteBroken: /^(yes|true|1)$/i.test(col(row, 'website_broken', 'is_broken')),
      payScore: clip(col(row, 'pay_score'), 4),
      painPoints: col(row, 'pain_points', 'problems', 'website_problems').split(/\s*\|\s*|\s*\n\s*/).map((p) => clip(p, 240)).filter(Boolean).slice(0, 5),
      impact: clip(col(row, 'client_impact', 'client_problem_translation'), 600),
      pitch: clip(col(row, 'pitch_angle', 'pitch'), 300),
      mapsLink: safeUrl(col(row, 'maps_link', 'google_maps_link')),
      importedAt: nowIso(),
    },
  };
}

// ---------- first message (template) ----------
/** Meta template variables can't contain new lines, tabs or more than 4 spaces in a row. */
export const templateParam = (s, max = 600) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max);
const ourName = (s) => s.profile.name || 'our team';

/** Variables the saved template text uses: highest {{n}}. No text saved → {{1}} and {{2}}. */
export function templateVarCount(t) {
  const body = t?.body || '{{1}}{{2}}';
  return Math.max(0, ...[...body.matchAll(/\{\{(\d)\}\}/g)].map((m) => Number(m[1])));
}
export const templateParams = (s, lead, sentence) =>
  [lead.name || 'there', templateParam(sentence), ourName(s)].slice(0, templateVarCount(s.template));

/** The exact text the lead will see for a first message. */
export function renderOpener(s, lead, sentence) {
  const name = lead.name || 'there';
  if (s.template?.body) return s.template.body.replace(/\{\{1\}\}/g, name).replace(/\{\{2\}\}/g, templateParam(sentence)).replace(/\{\{3\}\}/g, ourName(s));
  return fill('Hi {name},\n\n{sentence}\n\n— {us}\nReply STOP if you\'d rather not hear from us.', { name, sentence: sentence.trim(), us: ourName(s) });
}

// ---------- AI ----------
const SCHEMA = {
  type: 'object',
  properties: {
    suggestions: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, text: { type: 'string' } }, required: ['label', 'text'] } },
    recommended: { type: 'integer' },
    intent: { type: 'string' },
  },
  required: ['suggestions', 'recommended'],
};

function ourFacts(p) {
  return [
    `Business: ${p.name || '(not set)'}`,
    p.about && `About: ${p.about}`,
    p.services && `Services and prices:\n${p.services}`,
    p.website && `Website: ${p.website}`,
  ].filter(Boolean).join('\n');
}

function leadFacts(lead) {
  const o = lead.info || {};
  return [
    `Business: ${lead.name || 'unknown'}`,
    o.category && `Category: ${o.category}`,
    (o.city || o.country) && `Location: ${[o.city, o.country].filter(Boolean).join(', ')}`,
    o.rating && `Google rating: ${o.rating}${o.reviews ? ` from ${o.reviews} reviews` : ''}`,
    o.website ? `Website: ${o.website}${o.websiteBroken ? ' (currently broken / not loading)' : ''}` : 'Website: none found',
    o.painPoints?.length && `Problems we found on their website:\n${o.painPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
    o.impact && `What it costs them: ${o.impact}`,
    o.pitch && `Our angle: ${o.pitch}`,
  ].filter(Boolean).join('\n');
}

const RULES = [
  '- Write like a real person on WhatsApp: warm, plain, short. No "As an AI", no buzzwords, no hashtags, at most one emoji.',
  '- Only promise services and prices that appear in OUR BUSINESS. If a price is not there, offer a quick call or a free preview instead of a number.',
  '- Never invent facts about their business beyond the problems listed. Never write links except their own website.',
  '- Never ask for payment details, passwords or ID numbers.',
  '- Reply in the language the lead writes in (default English).',
];

const openerPrompt = (s, lead) => [
  'You write the FIRST WhatsApp message from our business to another business that has never heard from us.',
  '', 'OUR BUSINESS (who is writing):', ourFacts(s.profile),
  '', 'THE LEAD (who we are writing to):', leadFacts(lead),
  '',
  `TASK: write ${COUNT} different versions of ONE complete sentence (max 45 words, starting with a capital letter) that will be inserted into an approved WhatsApp template, after the greeting "Hi <their business name>," and a short intro.`,
  'Each version names ONE concrete problem from their list in plain words (what it costs them: calls, bookings, enquiries) and ends with a low-pressure offer, e.g. a free 1-page preview or a 10-minute call.',
  'Version 1: the biggest problem, friendly. Version 2: compliment their reviews/rating first, then the problem. Version 3: the shortest and most direct.',
  'No greeting, no sign-off, no line breaks.',
  ...RULES,
  '', 'label: 2–4 words describing the approach. recommended: index (0-based) of the one most likely to get a reply.',
  'Respond with JSON only: {"suggestions":[{"label":string,"text":string}],"recommended":number}.',
].join('\n');

const replyPrompt = (s, lead) => [
  'You help our sales person reply on WhatsApp to a business we contacted. You draft replies; the person picks one and sends it.',
  'Goal: turn their interest into a confirmed lead (a call booked or a yes to the free preview) and then into a sale.',
  '', 'OUR BUSINESS (who is writing):', ourFacts(s.profile),
  '', 'THE LEAD (who we are talking to):', leadFacts(lead),
  '',
  `TASK: read the chat and write ${COUNT} different replies to their LAST message (if our message is the last one, write follow-ups instead):`,
  '1. "Answer" — answer exactly what they said or asked, then one soft next step.',
  '2. "Proof" — answer briefly, then show value: relate it to their own website problem and what fixing it brings (more calls/bookings), offer the free preview.',
  '3. "Close" — move to a decision: propose a specific short call (e.g. "tomorrow 11am or 4pm?") or ask for the go-ahead.',
  'If they said they are not interested, make all three polite, short, no-pressure closes.',
  'If they ask a price that is not in OUR BUSINESS, do not make one up: say it depends on the scope and offer the call or preview.',
  'Each reply: 1–4 short sentences, plain WhatsApp text (you may use *bold* once).',
  ...RULES,
  '', 'intent: one of "interested", "question", "price", "objection", "not_interested", "ready_to_buy", "other" for their last message.',
  'recommended: index (0-based) of the reply most likely to move this lead to a sale.',
  'Respond with JSON only: {"suggestions":[{"label":string,"text":string}],"recommended":number,"intent":string}.',
].join('\n');

async function runAi(env, system, turns) {
  if (!env.AI) throw Object.assign(new Error('Workers AI is not available.'), { status: 503 });
  const messages = [{ role: 'system', content: system }];
  for (const t of turns) messages.push({ role: t.direction === 'in' ? 'user' : 'assistant', content: t.text.slice(0, 1500) });
  if (messages[messages.length - 1].role !== 'user') messages.push({ role: 'user', content: turns.length ? '(Draft the messages now.)' : '(Write the versions now.)' });
  let out;
  try {
    const res = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages, response_format: { type: 'json_schema', json_schema: SCHEMA }, max_tokens: 700, temperature: 0.6,
    });
    out = typeof res?.response === 'string' ? JSON.parse(res.response.replace(/^```(?:json)?\s*|\s*```$/g, '')) : res?.response;
  } catch (err) {
    console.warn('[AI] failed:', err.message);
    throw Object.assign(new Error('The AI could not write suggestions right now. Try again in a moment.'), { status: 502 });
  }
  const items = (Array.isArray(out?.suggestions) ? out.suggestions : [])
    .map((x) => ({
      label: clip(x?.label, 40) || 'Suggestion',
      // Links the AI made up are dropped; only links already in the facts survive.
      text: String(x?.text || '').replace(/(?:https?:\/\/|www\.)[^\s)]+/gi, (u) => (system.includes(u.replace(/[.,!?]+$/, '')) ? u : '')).replace(/[ \t]{2,}/g, ' ').trim().slice(0, 1000),
    }))
    .filter((x) => x.text).slice(0, COUNT);
  if (!items.length) throw Object.assign(new Error('The AI returned no usable suggestions. Try again.'), { status: 502 });
  const rec = Number.isInteger(out.recommended) && out.recommended >= 0 && out.recommended < items.length ? out.recommended : 0;
  return { items, recommended: rec, intent: clip(out.intent, 20) || null };
}

/** Not contacted yet → first-message versions. Contacted → replies (or follow-ups). */
export const suggestionKind = (lead) => (lead.state === 'SENT' ? 'reply' : 'opener');

/** Drafts 3 messages for this lead and stores them. Cached until the lead writes again (unless force). */
export async function generateSuggestions(env, s, lead, { force = false } = {}) {
  const kind = suggestionKind(lead);
  const cached = lead.suggestions;
  if (!force && cached?.kind === kind && cached.forMessageAt === (lead.lastInboundAt || null)) return lead;
  if (!await takeAiCall(env, Number(s.limits.aiPerDay) || 300)) {
    throw Object.assign(new Error('Daily AI limit reached. Raise it in Setup → Limits.'), { status: 429 });
  }
  const turns = kind === 'reply' ? await recentTurns(env, lead.phone, 16) : [];
  const r = await runAi(env, kind === 'reply' ? replyPrompt(s, lead) : openerPrompt(s, lead), turns);
  if (kind === 'opener') r.items = r.items.map((x) => ({ ...x, text: templateParam(x.text, 400) }));
  return updateLead(env, lead.phone, { suggestions: { kind, ...r, forMessageAt: lead.lastInboundAt || null, at: nowIso() } });
}
