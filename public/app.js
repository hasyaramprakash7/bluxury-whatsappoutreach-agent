/* Bluxury Outreach — dashboard. The AI suggests messages for each lead; you pick one and it's sent. */
(() => {
  'use strict';

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const store = {
    get(k, s = localStorage) { try { return s.getItem(k); } catch { return null; } },
    set(k, v, s = localStorage) { try { v === null ? s.removeItem(k) : s.setItem(k, v); } catch { /* private mode */ } },
  };
  const ICONS = {
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  };
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  const hydrateIcons = (root = document) => $$('[data-icon]', root).forEach((el) => { if (!el.querySelector('svg')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); });
  const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6'];
  const avatar = (name, seed) => {
    let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const ini = String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
    return `<span class="avatar" style="background:${COLORS[h % COLORS.length]}">${esc(ini || '#')}</span>`;
  };
  const wa = (t) => esc(t).replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>');
  const when = (d) => {
    if (!d) return '';
    const date = new Date(d); const now = new Date();
    return date.toDateString() === now.toDateString() ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };
  const STATUS = { NEW: 'New', CONTACTED: 'Contacted', ENGAGED: 'Replied', QUALIFIED: 'Qualified', CONVERTED: 'Won', COLD: 'Opted out' };
  const INTENT = { interested: 'Interested', question: 'Asked a question', price: 'Asked the price', objection: 'Has a doubt', not_interested: 'Not interested', ready_to_buy: 'Ready to buy', other: 'Replied' };
  const TABS = [['REPLIED', 'Replied'], ['TO_SEND', 'To send'], ['SENT', 'Waiting for reply'], ['SKIPPED', 'Skipped']];

  function toast(title, text = '', { error = false, timeout = 5000 } = {}) {
    const el = document.createElement('div');
    el.className = `toast ${error ? 'error' : ''}`;
    el.innerHTML = `<strong>${esc(title)}</strong>${text ? `<p>${esc(text)}</p>` : ''}`;
    el.onclick = () => el.remove();
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), timeout);
  }

  // ---------- API ----------
  const KEY = 'outreach_admin_key';
  const getKey = () => store.get(KEY, sessionStorage);
  async function request(url, opts = {}) {
    const res = await fetch(`/api${url}`, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${getKey()}` } });
    if (res.status === 401) { signOut('Your key is not valid. Please sign in again.'); throw new Error('Not signed in'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { data, status: res.status });
    return data;
  }
  const api = (method, url, body) => request(url, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });

  // ---------- state ----------
  const st = { tab: null, search: '', list: [], counts: {}, settings: null, webhookUrl: '', active: null, lead: null, messages: [], loading: false, error: '' };
  const isFirst = (l) => l.state !== 'SENT';
  const windowOpen = (l) => !!l.lastInboundAt && Date.now() - new Date(l.lastInboundAt) < 864e5;
  const fresh = (l) => { const s = l.suggestions; return s && s.kind === (isFirst(l) ? 'opener' : 'reply') && (s.forMessageAt || null) === (l.lastInboundAt || null) ? s : null; };
  const ourName = () => st.settings?.profile?.name || 'our team';
  /** Same text the server sends for a first message. */
  function preview(l, sentence) {
    const name = l.name || 'there';
    const s = String(sentence || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
    const body = st.settings?.template?.body;
    if (body) return body.replace(/\{\{1\}\}/g, name).replace(/\{\{2\}\}/g, s).replace(/\{\{3\}\}/g, ourName());
    if (st.settings?.template?.name && !windowOpen(l)) return `(Template “${st.settings.template.name}” — add its text in Setup to see a preview)`;
    return `Hi ${name},\n\n${s}\n\n— ${ourName()}\nReply STOP if you'd rather not hear from us.`;
  }

  // ---------- theme & session ----------
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    $('#theme-btn').innerHTML = icon(dark ? 'sun' : 'moon');
  }
  $('#theme-btn').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark'; store.set('theme', next); applyTheme(next);
  };
  applyTheme(store.get('theme'));
  hydrateIcons();

  let poll = null;
  function signOut(msg = '') {
    store.set(KEY, null, sessionStorage); clearInterval(poll);
    $('#app').hidden = true; $('#login').hidden = false; $('#login-error').textContent = msg;
  }
  $('#logout').onclick = () => signOut();
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    store.set(KEY, $('#api-key').value.trim(), sessionStorage); $('#api-key').value = '';
    start();
  };

  async function start() {
    if (!getKey()) { signOut(); return; }
    try { await loadSettings(); } catch (err) { if (err.message !== 'Not signed in') signOut(err.message); return; }
    $('#login').hidden = true; $('#app').hidden = false;
    st.active = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || null;
    await loadList();
    if (st.active) openLead(st.active);
    else drawEmptyDetail();
    clearInterval(poll);
    poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 8000);
  }

  // ---------- settings / setup ----------
  async function loadSettings() {
    const r = await api('GET', '/settings');
    st.settings = r.data; st.webhookUrl = r.webhookUrl;
    drawSetupBanner();
  }
  function drawSetupBanner() {
    const s = st.settings; const missing = [];
    if (!s.whatsapp.phoneNumberId || !s.whatsapp.hasToken) missing.push('connect your WhatsApp number');
    if (!s.template.name) missing.push('add your first-message template');
    if (!s.profile.name || !s.profile.services) missing.push('describe your business and services (the AI uses it)');
    $('#setup-banner').innerHTML = missing.length ? `<div class="banner">${icon('info')}<div><strong>Finish setup:</strong> ${esc(missing.join(', '))}. <a href="#" id="open-setup">Open Setup</a></div></div>` : '';
    $('#open-setup')?.addEventListener('click', (e) => { e.preventDefault(); openSetup(); });
  }

  $('#setup-btn').onclick = () => openSetup();
  function openSetup() {
    const s = st.settings; const w = s.whatsapp; const t = s.template; const p = s.profile; const l = s.limits;
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Setup">
      <div class="modal-head"><h2>Setup</h2><span class="spacer"></span><button class="btn icon ghost" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="modal-body">
        <form data-key="whatsapp"><h3>${icon('chat', 'sm')}WhatsApp number</h3>
          <p class="hint">From Meta for Developers → your app → WhatsApp → API Setup.</p>
          <div class="grid-2"><label class="field"><span>Phone number ID</span><input class="input" name="phoneNumberId" value="${esc(w.phoneNumberId || '')}" inputmode="numeric" /></label>
            <label class="field"><span>WhatsApp Business Account ID</span><input class="input" name="wabaId" value="${esc(w.wabaId || '')}" /></label></div>
          <label class="field"><span>Access token</span><input class="input" name="accessToken" type="password" autocomplete="off" placeholder="${w.hasToken ? 'Saved — paste a new one to replace it' : 'Paste the token'}" /></label>
          <div class="field"><span>Webhook (paste in Meta → WhatsApp → Configuration, subscribe to “messages”)</span>
            <div class="copy-row"><input class="input" readonly value="${esc(st.webhookUrl)}" /><button type="button" class="btn" data-copy="${esc(st.webhookUrl)}">${icon('copy', 'sm')}Copy</button></div>
            <span class="hint">Verify token: the WHATSAPP_VERIFY_TOKEN secret of this Worker.</span></div>
          <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">Save</button></div></form>
        <form data-key="template"><h3>${icon('send', 'sm')}First-message template</h3>
          <p class="hint">WhatsApp only allows a Meta-approved template as the first message. Create it in WhatsApp Manager → Message templates (category Marketing) and copy it here exactly.</p>
          <div class="grid-2"><label class="field"><span>Template name</span><input class="input" name="name" placeholder="website_audit_intro" value="${esc(t.name || '')}" /></label>
            <label class="field"><span>Language</span><input class="input" name="language" placeholder="en" value="${esc(t.language || 'en')}" /></label></div>
          <label class="field"><span>Template text</span><textarea name="body" rows="5" placeholder="Hi {{1}}, I found your business on Google Maps. {{2}}&#10;&#10;— {{3}}&#10;Reply STOP to opt out.">${esc(t.body || '')}</textarea>
            <span class="hint">{{1}} their business name · {{2}} the sentence you pick · {{3}} your business name. For testing, Meta's free <code>hello_world</code> (language <code>en_US</code>, no variables) works — then the AI sentence is not sent.</span></label>
          <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">Save</button></div></form>
        <form data-key="profile"><h3>${icon('sparkle', 'sm')}Your business (the AI writes from this)</h3>
          <div class="grid-2"><label class="field"><span>Business name</span><input class="input" name="name" value="${esc(p.name || '')}" placeholder="Bluxury Tech" /></label>
            <label class="field"><span>Website</span><input class="input" name="website" value="${esc(p.website || '')}" placeholder="https://…" /></label></div>
          <label class="field"><span>About you</span><textarea name="about" rows="2" placeholder="We build fast, mobile-first websites that turn visitors into calls and bookings.">${esc(p.about || '')}</textarea></label>
          <label class="field"><span>Services and prices</span><textarea name="services" rows="4" placeholder="Website redesign from $…&#10;WhatsApp chat button + quote form&#10;Free 1-page preview before you pay">${esc(p.services || '')}</textarea>
            <span class="hint">The AI only mentions prices written here; otherwise it offers a call or a free preview.</span></label>
          <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">Save</button></div></form>
        <form data-key="limits"><h3>${icon('alert', 'sm')}Limits</h3>
          <div class="grid-2"><label class="field"><span>First messages per day</span><input class="input" name="firstPerDay" type="number" min="0" max="1000" value="${esc(l.firstPerDay)}" /><span class="hint">Keep it small to protect your number's quality rating.</span></label>
            <label class="field"><span>AI suggestions per day</span><input class="input" name="aiPerDay" type="number" min="0" max="20000" value="${esc(l.aiPerDay)}" /></label></div>
          <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">Save</button></div></form>
      </div></div>`;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    $('[data-close]', back).onclick = close;
    $$('[data-copy]', back).forEach((b) => { b.onclick = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => toast('Copied')); });
    $$('form', back).forEach((f) => {
      f.onsubmit = async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f).entries());
        if (f.dataset.key === 'whatsapp' && !data.accessToken) delete data.accessToken;
        const btn = $('button[type=submit]', f); btn.disabled = true;
        try {
          const r = await api('PATCH', '/settings', { [f.dataset.key]: data });
          st.settings = r.data; drawSetupBanner(); toast('Saved');
          if (f.dataset.key === 'whatsapp') f.accessToken.value = '';
          if (st.lead) drawDetail();
        } catch (err) { toast('Not saved', err.message, { error: true, timeout: 8000 }); }
        finally { btn.disabled = false; }
      };
    });
    document.body.appendChild(back);
  }

  // ---------- import ----------
  $('#csv-file').onchange = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    toast('Importing…', file.name);
    try {
      const { summary: s } = await request('/leads/import', { method: 'POST', body: fd });
      toast('Leads imported', [`${s.added} new`, s.updated && `${s.updated} updated`, s.alreadyContacted && `${s.alreadyContacted} already contacted (kept)`, s.optedOut && `${s.optedOut} opted out (never messaged)`, s.invalid && `${s.invalid} invalid numbers skipped`].filter(Boolean).join(' · '), { timeout: 9000 });
      st.tab = 'TO_SEND'; await loadList();
    } catch (err) { toast('Import failed', err.message, { error: true, timeout: 9000 }); }
  };

  // ---------- list ----------
  $('#search').oninput = debounce((e) => { st.search = e.target.value.trim(); loadList(); }, 250);
  $('#tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { st.tab = b.dataset.tab; loadList(); } };
  $('#list').onclick = (e) => { const b = e.target.closest('[data-phone]'); if (b) openLead(b.dataset.phone); };

  async function loadList() {
    const tab = st.tab || 'REPLIED';
    let r = await api('GET', `/leads?tab=${tab}&search=${encodeURIComponent(st.search)}`);
    // First load: start where there's work — replies first, else "To send".
    if (!st.tab) { st.tab = r.counts.REPLIED ? 'REPLIED' : 'TO_SEND'; if (st.tab !== tab) r = await api('GET', `/leads?tab=${st.tab}&search=${encodeURIComponent(st.search)}`); }
    st.list = r.data; st.counts = r.counts;
    $('#tabs').innerHTML = TABS.map(([k, label]) => `<button type="button" class="filter ${st.tab === k ? 'active' : ''}" data-tab="${k}">${label}<span class="n">${r.counts[k] || 0}</span></button>`).join('');
    const won = $('#won'); won.hidden = !r.counts.CONVERTED; won.textContent = `${r.counts.CONVERTED} won`;
    drawList();
  }
  function drawList() {
    const el = $('#list');
    if (!st.list.length) {
      const any = Object.entries(st.counts).some(([k, n]) => k !== 'CONVERTED' && n);
      el.innerHTML = `<div class="empty"><p>${any ? 'Nothing here right now.' : 'No leads yet. Import <code>whatsapp_leads.csv</code> from the lead finder.'}</p></div>`;
      return;
    }
    el.innerHTML = st.list.map((l) => {
      const o = l.info || {};
      const line = st.tab === 'TO_SEND' || st.tab === 'SKIPPED' ? o.painPoints?.[0] : l.lastMessagePreview;
      return `<button type="button" class="item ${st.active === l.phone ? 'active' : ''}" data-phone="${esc(l.phone)}">${avatar(l.name, l.phone)}
        <div class="grow"><div class="row" style="gap:6px"><span class="title grow">${esc(l.name || `+${l.phone}`)}</span>${l.unread ? `<span class="badge">${l.unread}</span>` : ''}</div>
          <div class="sub">${esc([o.city, o.category].filter(Boolean).join(' · ') || `+${l.phone}`)}${o.rating ? ` · ★ ${esc(o.rating)}` : ''}</div>
          ${line ? `<div class="line">${esc(line)}</div>` : ''}</div></button>`;
    }).join('');
  }

  // ---------- detail ----------
  function drawEmptyDetail() {
    $('#detail').innerHTML = `<div class="empty">${icon('send')}<h2>Pick a lead</h2><p>Choose a business to see its website problems and the AI's suggested messages.</p></div>`;
  }

  async function openLead(phone) {
    st.active = phone; st.error = '';
    history.replaceState(null, '', `#${phone}`);
    $$('.item').forEach((b) => b.classList.toggle('active', b.dataset.phone === phone));
    $('#detail').innerHTML = '<div style="padding:20px"><div class="skeleton" style="height:320px"></div></div>';
    try {
      const r = await api('GET', `/leads/${phone}`);
      if (st.active !== phone) return;
      st.lead = r.lead; st.messages = r.messages;
      drawDetail();
      if (r.lead.unread === 0) $$(`.item[data-phone="${phone}"] .badge`).forEach((b) => b.remove());
      // Draft automatically only when it's our turn (new lead, or they wrote last). Follow-ups are on request.
      const ourTurn = r.lead.state === 'TO_SEND' || r.lead.lastMessageDirection === 'in';
      if (ourTurn && r.lead.status !== 'COLD' && !fresh(r.lead)) suggest(false);
    } catch (err) {
      if (err.status === 404) { st.active = null; history.replaceState(null, '', '#'); drawEmptyDetail(); return; }
      $('#detail').innerHTML = `<div class="banner red" style="margin:20px">${icon('alert')}<div>${esc(err.message)}</div></div>`;
    }
  }

  async function suggest(force) {
    const l = st.lead; if (!l) return;
    st.loading = true; st.error = ''; drawSuggestions();
    try {
      const r = await api('POST', `/leads/${l.phone}/suggest`, { force });
      if (st.lead?.phone === l.phone) st.lead = r.lead;
    } catch (err) { st.error = err.message; }
    finally { st.loading = false; drawSuggestions(); }
  }

  const threadHtml = () => (st.messages.length ? `<div class="thread" id="thread">${st.messages.map((m) => `<div class="msg ${m.direction === 'out' ? 'out' : ''}">${m.type === 'template' ? '<em>First message · </em>' : ''}${wa(m.text || `[${m.type}]`)}<small>${esc(when(m.createdAt))}${m.direction === 'out' && m.status !== 'sent' ? ` · ${esc(m.status)}` : ''}${m.error ? ` · ${esc(m.error)}` : ''}</small></div>`).join('')}</div>` : '<p class="muted small">No messages yet.</p>');

  function drawDetail() {
    const l = st.lead; const o = l.info || {};
    const sug = fresh(l);
    const heading = isFirst(l) ? 'Suggested first messages' : l.lastMessageDirection === 'in' ? 'Suggested replies' : 'Suggested follow-ups';
    $('#detail').innerHTML = `
      <div class="d-head">${avatar(l.name, l.phone)}
        <div class="grow"><h2>${esc(l.name || `+${l.phone}`)}</h2>
          <div class="muted small">+${esc(l.phone)}${o.city ? ` · ${esc(o.city)}` : ''}${o.category ? ` · ${esc(o.category)}` : ''}${o.rating ? ` · ★ ${esc(o.rating)}${o.reviews ? ` (${esc(o.reviews)} reviews)` : ''}` : ''}</div>
          <div class="row wrap" style="gap:6px;margin-top:8px"><span class="pill s-${esc(l.status)}">${esc(STATUS[l.status] || l.status)}</span>
            ${l.delivery ? `<span class="pill d-${esc(l.delivery)}" ${l.deliveryError ? `title="${esc(l.deliveryError)}"` : ''}>First message ${esc(l.delivery.toLowerCase())}</span>` : ''}
            ${sug?.intent && INTENT[sug.intent] ? `<span class="pill intent">${esc(INTENT[sug.intent])}</span>` : ''}
            ${o.websiteBroken ? '<span class="pill bad">Website broken</span>' : ''}</div></div>
        <div class="row wrap" style="gap:6px">
          ${o.website ? `<a class="btn sm" href="${esc(o.website)}" target="_blank" rel="noopener noreferrer">${icon('external', 'sm')}Website</a>` : ''}
          ${o.mapsLink ? `<a class="btn sm" href="${esc(o.mapsLink)}" target="_blank" rel="noopener noreferrer">${icon('pin', 'sm')}Maps</a>` : ''}</div></div>
      ${l.deliveryError ? `<div class="section"><div class="banner red">${icon('alert')}<div>WhatsApp could not deliver the first message: ${esc(l.deliveryError)}</div></div></div>` : ''}
      <div class="section"><h3>${icon('alert', 'sm')}Problems on their website</h3>
        ${o.painPoints?.length ? `<ol class="pains">${o.painPoints.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>` : '<p class="muted small">None listed.</p>'}
        ${o.impact ? `<p class="small"><strong>What it costs them:</strong> ${esc(o.impact)}</p>` : ''}</div>
      ${l.state === 'SENT' || st.messages.length ? `<div class="section"><h3>${icon('chat', 'sm')}Conversation</h3><div id="thread-wrap">${threadHtml()}</div></div>` : ''}
      <div class="section"><div class="row wrap"><h3>${icon('sparkle', 'sm')}${heading}</h3><span class="spacer"></span>
          <button class="btn sm" id="regen" ${l.status === 'COLD' || l.state === 'SKIPPED' ? 'disabled' : ''}>${icon('refresh', 'sm')}New suggestions</button></div>
        <div id="suggs"></div></div>
      <div class="section row wrap">
        <label class="field" style="width:200px"><span>Lead status</span><select id="status" ${l.status === 'COLD' ? 'disabled' : ''}>
          ${['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'CONVERTED'].map((k) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${STATUS[k]}</option>`).join('')}${l.status === 'COLD' ? '<option selected>Opted out</option>' : ''}</select></label>
        <span class="spacer"></span>
        ${l.state === 'TO_SEND' ? `<button class="btn" id="skip">${icon('x', 'sm')}Skip this lead</button>` : ''}
        ${l.state === 'SKIPPED' && l.status !== 'COLD' ? `<button class="btn" id="unskip">${icon('undo', 'sm')}Back to To send</button>` : ''}</div>`;
    const th = $('#thread'); if (th) th.scrollTop = th.scrollHeight;
    $('#regen').onclick = () => suggest(true);
    $('#status').onchange = (e) => patch({ status: e.target.value }, 'Status updated');
    if ($('#skip')) $('#skip').onclick = () => patch({ skip: true }, 'Lead skipped');
    if ($('#unskip')) $('#unskip').onclick = () => patch({ skip: false }, 'Moved back to To send');
    drawSuggestions();
  }

  function drawSuggestions() {
    const el = $('#suggs'); const l = st.lead; if (!el || !l) return;
    if (l.status === 'COLD') { el.innerHTML = `<div class="banner red">${icon('alert')}<div>This business opted out. WhatsApp policy does not allow messaging them again.</div></div>`; return; }
    if (l.state === 'SKIPPED') { el.innerHTML = '<p class="muted small">Skipped. Move it back to “To send” to write to them.</p>'; return; }
    const sug = fresh(l); const first = isFirst(l); const s = st.settings;
    const connected = s.whatsapp.phoneNumberId && s.whatsapp.hasToken;
    const blockReason = !connected ? 'Connect your WhatsApp number in Setup to send.'
      : first ? (!s.template.name && !windowOpen(l) ? 'Add your first-message template in Setup to send.' : '')
        : (!windowOpen(l) ? 'More than 24 hours since their last message: WhatsApp blocks free text until they write again.' : '');
    const warn = blockReason ? `<div class="banner blue">${icon('info')}<div>${esc(blockReason)}</div></div>` : '';
    if (st.loading && !sug) { el.innerHTML = `${warn}<div class="suggs">${'<div class="skeleton" style="height:110px"></div>'.repeat(3)}</div><p class="hint">The AI is reading their problems${first ? '' : ' and the chat'}…</p>`; return; }
    if (st.error && !sug) { el.innerHTML = `${warn}<div class="banner red">${icon('alert')}<div>${esc(st.error)}</div></div>`; return; }
    if (!sug) {
      el.innerHTML = `${warn}${!first && l.lastMessageDirection === 'out' ? '<p class="muted small">Your message was the last one. Wait for their reply, or get follow-up ideas.</p>' : ''}<button class="btn primary" id="gen">${icon('sparkle')}Write suggestions</button>`;
      $('#gen').onclick = () => suggest(false); return;
    }
    const order = sug.items.map((_, i) => i).sort((a, b) => (a === sug.recommended ? -1 : b === sug.recommended ? 1 : a - b));
    const how = first ? (windowOpen(l) ? 'Sent as a normal message (they wrote in the last 24h).' : s.template.name ? `Sent with template ${s.template.name}.` : '') : 'You can edit it before sending.';
    el.innerHTML = `${warn}<div class="suggs">${order.map((i) => {
      const x = sug.items[i];
      return `<div class="sugg ${i === sug.recommended ? 'best' : ''}">
        <div class="row wrap" style="gap:6px"><strong>${esc(x.label)}</strong>${i === sug.recommended ? `<span class="pill best">${icon('sparkle', 'sm')}Best pick</span>` : ''}</div>
        <textarea rows="3" aria-label="Message ${i + 1}">${esc(x.text)}</textarea>
        ${first ? `<div><div class="hint">They will see:</div><div class="preview">${esc(preview(l, x.text))}</div></div>` : ''}
        <div class="row"><span class="hint">${esc(how)}</span><span class="spacer"></span>
          <button class="btn ${i === sug.recommended ? 'primary' : ''}" data-send ${blockReason ? 'disabled' : ''}>${icon('send', 'sm')}Send this</button></div></div>`;
    }).join('')}</div>${st.loading ? '<p class="hint">Writing new suggestions…</p>' : ''}`;
    $$('.sugg', el).forEach((card) => {
      const ta = $('textarea', card); const pv = $('.preview', card);
      if (pv) ta.oninput = () => { pv.textContent = preview(l, ta.value); };
      $('[data-send]', card).onclick = (e) => send(ta.value, e.currentTarget);
    });
  }

  async function send(text, btn) {
    const l = st.lead; if (!l || !text.trim()) return;
    if (!confirm(`Send this to ${l.name || `+${l.phone}`} on WhatsApp now?`)) return;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Sending…';
    try {
      const r = await api('POST', `/leads/${l.phone}/send`, { text: text.trim() });
      toast('Sent', l.name || `+${l.phone}`);
      st.lead = r.lead; if (r.message) st.messages.push(r.message);
      drawDetail(); loadList();
    } catch (err) {
      toast('Not sent', err.message, { error: true, timeout: 10000 });
      btn.disabled = false; btn.innerHTML = `${icon('send', 'sm')}Send this`;
    }
  }

  async function patch(body, ok) {
    try { const r = await api('PATCH', `/leads/${st.lead.phone}`, body); st.lead = r.lead; toast(ok); drawDetail(); loadList(); }
    catch (err) { toast('Not updated', err.message, { error: true }); }
  }

  // ---------- polling: new replies and AI drafts ----------
  async function refresh() {
    try {
      await loadList();
      const l = st.lead;
      if (!l || l.state !== 'SENT' || $('#suggs textarea:focus')) return; // don't disturb typing
      const r = await api('GET', `/leads/${l.phone}`);
      if (st.lead?.phone !== l.phone || r.lead.updatedAt === l.updatedAt) return;
      st.lead = r.lead; st.messages = r.messages;
      drawDetail();
    } catch { /* offline for a moment */ }
  }

  start();
})();
