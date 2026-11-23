/* Agent Desk — WhatsApp for every business. Vanilla JS dashboard served by the Cloudflare Worker. */
(() => {
  'use strict';

  // ============================================================
  // Utilities
  // ============================================================
  const API = '/api';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; return d; };
  const store = {
    get(k, s = localStorage) { try { return s.getItem(k); } catch { return null; } },
    set(k, v, s = localStorage) { try { v === null ? s.removeItem(k) : s.setItem(k, v); } catch { /* private mode */ } },
  };
  const rid = () => Math.random().toString(36).slice(2, 8);

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16.5h5"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    users: '<path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M21 20v-1.5a4 4 0 0 0-3-3.9M15.5 4.1a3.5 3.5 0 0 1 0 6.8"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    up: '<path d="M18 15l-6-6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
    fire: '<path d="M12 22c4 0 7-2.7 7-7 0-5-5-7-5-12-2 2-3 4-3 6-1.5-1-2-2.5-2-4-2 2.5-4 5.4-4 9 0 4.3 3 8 7 8z"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
    reply: '<path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    template: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
    food: '<path d="M3 2v7a3 3 0 0 0 3 3v10M9 2v7M6 2v7M18 2c-2 0-3 2-3 5v5h3v10"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  };
  const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.chat}</svg>`;
  const hydrateIcons = (root = document) => $$('[data-icon]', root).forEach((el) => { if (!el.querySelector('svg')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); });
  const TICK1 = '<svg class="tick" viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l3 3 7-7"/></svg>';
  const TICK2 = (cls) => `<svg class="tick ${cls}" viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6l3 3 7-7"/><path d="M7 8.5l.5.5 7-7"/></svg>`;

  const AVATAR_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];
  const colorFor = (seed) => { let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; };
  const initials = (name) => { const p = String(name || '').trim().split(/\s+/).filter(Boolean); return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase(); };
  const avatar = (name, seed, cls = '') => { const ini = initials(name); return `<span class="avatar ${cls}" style="background:${colorFor(seed || name)}">${ini ? esc(ini) : icon('user', 'sm')}</span>`; };
  const displayName = (lead) => (lead?.name ? lead.name : `+${lead?.phone || ''}`);
  const fmtPhone = (p) => (p ? `+${p}` : '');

  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  function shortWhen(d) {
    if (!d) return '';
    const date = new Date(d); const now = new Date();
    if (sameDay(date, now)) return timeOf(date);
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (sameDay(date, y)) return 'Yesterday';
    if (now - date < 6 * 864e5) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  function dayLabel(d) {
    const date = new Date(d); const now = new Date();
    if (sameDay(date, now)) return 'Today';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (sameDay(date, y)) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }
  const relTime = (d) => {
    if (!d) return '—';
    const s = Math.round((Date.now() - new Date(d)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };
  const wa = (text) => esc(text)
    .replace(/```([\s\S]+?)```/g, '<code>$1</code>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>');

  const STATUS_LABELS = { NEW: 'New', CONTACTED: 'Contacted', ENGAGED: 'Engaged', QUALIFIED: 'Qualified', CONVERTED: 'Converted', COLD: 'Opted out' };
  const statusPill = (s) => `<span class="pill s-${esc(s)}">${esc(STATUS_LABELS[s] || s)}</span>`;
  const deliveryPill = (lead) => {
    if (lead.broadcastStatus) return `<span class="pill d-${esc(lead.broadcastStatus)}" ${lead.broadcastError ? `title="${esc(lead.broadcastError)}"` : ''}>${esc(lead.broadcastStatus[0] + lead.broadcastStatus.slice(1).toLowerCase())}</span>`;
    return lead.lastBroadcastAt ? '<span class="pill d-QUEUED">Queued</span>' : '<span class="muted">—</span>';
  };
  const bookedLabel = (lead) => (lead.bookedAt ? new Date(lead.bookedAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

  // ============================================================
  // Toasts, modal, activity log
  // ============================================================
  function toast(title, text = '', { kind = 'ok', onClick, timeout = 4500 } = {}) {
    const kinds = { ok: ['check', ''], error: ['alert', 'red'], info: ['info', 'blue'], chat: ['chat', ''], warn: ['alert', 'amber'] };
    const [ic, cls] = kinds[kind] || kinds.ok;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="section-icon ${cls}">${icon(ic, 'sm')}</span><div style="min-width:0"><strong>${esc(title)}</strong>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
    el.addEventListener('click', () => { onClick?.(); el.remove(); });
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), timeout);
  }
  function modal(html, { onMount, wide } = {}) {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="${wide ? '' : 'max-width:560px'}">${html}</div>`;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    hydrateIcons(back);
    $$('[data-close]', back).forEach((b) => b.addEventListener('click', close));
    onMount?.(back, close);
    return close;
  }
  const LOG_KEY = 'agent_desk_logs';
  function log(message, type = 'info') {
    let logs = [];
    try { logs = JSON.parse(store.get(LOG_KEY)) || []; } catch { logs = []; }
    logs.push({ time: new Date().toLocaleString(), message, type });
    store.set(LOG_KEY, JSON.stringify(logs.slice(-300)));
    if (state.route.page === 'activity') renderActivity();
  }

  // ============================================================
  // State & API
  // ============================================================
  const KEY_STORAGE = 'agent_desk_api_key';
  const state = {
    auth: null, tenants: [], tenantId: null, tenant: null, fields: [],
    unreadChats: 0, live: null, route: { page: 'overview', arg: null }, inbox: null, profileDraft: null,
  };
  const isAdmin = () => state.auth?.role === 'admin';
  const getKey = () => store.get(KEY_STORAGE, sessionStorage);
  const bizName = () => state.tenant?.profile?.displayName || state.tenant?.businessName || '';

  async function authFetch(url, opts = {}) {
    const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${getKey()}` } });
    if (res.status === 401) { signOut('Your session expired or the key is no longer valid. Please sign in again.'); throw new Error('Not signed in'); }
    return res;
  }
  async function api(method, url, body) {
    const opts = { method };
    if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers = { 'Content-Type': 'application/json' }; }
    const res = await authFetch(API + url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || `Request failed (${res.status})`); err.data = data; err.status = res.status; throw err; }
    return data;
  }
  async function uploadFile(url, file, extra = {}) {
    const fd = new FormData(); fd.append('file', file);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const res = await authFetch(API + url, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || `Upload failed (${res.status})`); err.data = data; throw err; }
    return data;
  }
  const errorList = (err) => {
    const list = err.data?.errors || [err.message];
    return `<div class="banner red">${icon('alert')}<div><strong>Please fix these:</strong><ul class="errors">${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`;
  };

  // ============================================================
  // Theme
  // ============================================================
  function applyTheme(theme) {
    if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
    const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    $('#theme-btn').innerHTML = icon(dark ? 'sun' : 'moon');
  }
  $('#theme-btn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    store.set('theme', next); applyTheme(next);
  });
  applyTheme(store.get('theme'));

  // ============================================================
  // Session
  // ============================================================
  function showLogin(message = '') {
    $('#shell').hidden = true; $('#login').hidden = false;
    $('#login-error').textContent = message;
    setTimeout(() => $('#api-key').focus(), 50);
  }
  function signOut(message = '') {
    store.set(KEY_STORAGE, null, sessionStorage);
    state.auth = null;
    disconnectLive();
    showLogin(message);
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = $('#api-key').value.trim();
    if (!key) return;
    store.set(KEY_STORAGE, key, sessionStorage);
    $('#api-key').value = ''; $('#login-error').textContent = '';
    await startSession();
  });
  $('#logout').addEventListener('click', () => { log('Signed out.'); signOut(); });
  $('#menu-btn').addEventListener('click', () => $('#shell').classList.toggle('nav-open'));
  $('#shell').addEventListener('click', (e) => { if (e.target === $('#shell')) $('#shell').classList.remove('nav-open'); });

  async function startSession() {
    try { ({ auth: state.auth } = await api('GET', '/tenants/me')); }
    catch (err) { if (err.message !== 'Not signed in') showLogin(err.message); return; }
    $('#login').hidden = true; $('#shell').hidden = false;
    $('#me-name').textContent = isAdmin() ? 'Administrator' : state.auth.businessName;
    $('#me-role').textContent = isAdmin() ? 'All businesses' : 'Business account';
    $('#me-avatar').outerHTML = avatar(isAdmin() ? 'Admin' : state.auth.businessName, 'me').replace('class="avatar ', 'id="me-avatar" class="avatar ');
    log(`Signed in as ${isAdmin() ? 'admin' : state.auth.businessName}.`, 'success');
    await loadTenants();
    renderNav();
    route();
  }

  async function loadTenants() {
    const { data } = await api('GET', '/tenants');
    state.tenants = data;
    $('#tenant-switch').hidden = !isAdmin() || !data.length;
    if (isAdmin()) renderTenantSelect();
    const saved = store.get('tenantId');
    const preferred = isAdmin() ? (data.find((t) => t._id === saved) || data[0]) : data.find((t) => t._id === state.auth.tenantId);
    if (preferred) await selectTenant(preferred._id, { silent: true });
    else { state.tenantId = null; state.tenant = null; disconnectLive(); setLive('off'); }
  }
  const renderTenantSelect = () => { $('#tenant-select').innerHTML = state.tenants.map((t) => `<option value="${t._id}" ${t._id === state.tenantId ? 'selected' : ''}>${esc(t.businessName)}</option>`).join(''); };

  function applyTenantPayload(res) {
    state.tenant = res.data;
    const i = state.tenants.findIndex((x) => x._id === res.data._id);
    if (i >= 0) state.tenants[i] = res.data;
    if (isAdmin()) renderTenantSelect();
  }

  async function selectTenant(id, { silent } = {}) {
    state.tenantId = id;
    if (isAdmin()) store.set('tenantId', id);
    applyTenantPayload(await api('GET', `/tenants/${id}`));
    state.inbox = null; state.profileDraft = null;
    connectLive();
    refreshUnread();
    if (!silent) route();
  }
  $('#tenant-select').addEventListener('change', (e) => {
    if (!confirmLeave()) { e.target.value = state.tenantId; return; }
    selectTenant(e.target.value);
  });

  const refreshUnread = debounce(async () => {
    if (!state.tenantId) return;
    try {
      const { unreadChats } = await api('GET', `/chats/${state.tenantId}?limit=1`);
      state.unreadChats = unreadChats;
      const b = $('#nav-unread');
      if (b) { b.textContent = unreadChats; b.hidden = !unreadChats; }
      document.title = `${unreadChats ? `(${unreadChats}) ` : ''}Agent Desk · WhatsApp for every business`;
    } catch { /* ignore */ }
  }, 300);

  // ============================================================
  // Live updates (WebSocket to the business's Durable Object)
  // ============================================================
  let liveRetry = 0;
  function setLive(status) {
    const el = $('#live');
    el.className = `live ${status === 'on' ? 'on' : status === 'off' ? 'off' : ''}`;
    el.innerHTML = `<span>${status === 'on' ? 'Live' : status === 'off' ? 'Offline' : 'Connecting…'}</span>`;
  }
  function disconnectLive() {
    const l = state.live;
    state.live = null;
    if (l) { clearInterval(l.ping); clearTimeout(l.retry); l.ws.onclose = null; try { l.ws.close(); } catch { /* */ } }
  }
  function connectLive() {
    disconnectLive();
    if (!state.tenantId || !getKey()) return;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?tenant=${encodeURIComponent(state.tenantId)}&token=${encodeURIComponent(getKey())}`;
    const ws = new WebSocket(url);
    const live = { ws, ping: null, retry: null, tenantId: state.tenantId };
    state.live = live;
    setLive('connecting');
    ws.onopen = () => { liveRetry = 0; setLive('on'); live.ping = setInterval(() => { try { ws.send('ping'); } catch { /* */ } }, 25000); };
    ws.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; } // "pong"
      if (msg.event === 'message:new') onLiveMessage(msg.data);
      else if (msg.event === 'message:status') onLiveStatus(msg.data);
      else if (msg.event === 'lead:update') onLeadUpdate(msg.data.lead);
    };
    ws.onclose = () => {
      clearInterval(live.ping);
      if (state.live !== live) return;
      setLive('off');
      const delay = Math.min(30000, 1000 * 2 ** liveRetry++);
      live.retry = setTimeout(() => { if (state.live === live) connectLive(); }, delay);
    };
  }

  function onLiveMessage({ message, lead }) {
    if (!message || String(message.tenantId) !== String(state.tenantId)) return;
    if (lead) onLeadUpdate(lead);
    onOutreachMessage(message);
    const ib = state.inbox;
    if (ib && state.route.page === 'inbox' && ib.active === message.phone) {
      appendMessages([message]);
      if (message.direction === 'in' && document.visibilityState === 'visible') markRead(message.phone);
    }
    if (message.direction === 'in') {
      refreshUnread();
      const viewing = state.route.page === 'inbox' && ib?.active === message.phone && document.visibilityState === 'visible';
      if (!viewing) toast(displayName(lead || { phone: message.phone }), message.text || 'New message', { kind: 'chat', onClick: () => { location.hash = `#/inbox/${message.phone}`; } });
    }
    if (state.route.page === 'overview') refreshOverview();
  }
  function onLiveStatus({ id, status, error, phone }) {
    const ib = state.inbox;
    if (!ib || ib.active !== phone) return;
    const m = ib.messages.find((x) => String(x._id) === String(id));
    if (!m) return;
    m.status = status; m.error = error;
    const el = $(`.msg[data-id="${id}"] .meta`);
    if (el) el.outerHTML = metaHtml(m);
  }
  function onLeadUpdate(lead) {
    if (!lead || String(lead.tenantId) !== String(state.tenantId)) return;
    const ib = state.inbox;
    if (ib) {
      const had = ib.chats.get(lead.phone);
      if (had || lead.lastMessageAt) {
        ib.chats.set(lead.phone, { ...(had || {}), ...lead });
        if (state.route.page === 'inbox') renderChatList({ flash: lead.phone });
      }
      if (ib.active === lead.phone) {
        ib.lead = { ...(ib.lead || {}), ...lead };
        if (state.route.page === 'inbox') { renderConvHead(); renderComposer(); renderDetails(); }
      }
    }
    if (state.route.page === 'overview') refreshOverview();
    if (state.route.page === 'leads') refreshLeads();
    if (state.route.page === 'confirmed') refreshConfirmed();
    onOutreachLead(lead);
  }

  // ============================================================
  // Navigation & routing
  // ============================================================
  const PAGES = {
    overview: { title: 'Overview', icon: 'grid', render: renderOverview },
    inbox: { title: 'Inbox', icon: 'chat', render: renderInbox, flush: true },
    leads: { title: 'Leads', icon: 'users', render: renderLeads },
    confirmed: { title: 'Confirmed', icon: 'check', render: renderConfirmed },
    broadcast: { title: 'Broadcast', icon: 'megaphone', render: renderBroadcast },
    outreach: { title: 'Outreach', icon: 'send', render: renderOutreach },
    profile: { title: 'Business Profile', icon: 'building', render: renderProfile },
    settings: { title: 'Settings', icon: 'sliders', render: renderSettings },
    clients: { title: 'Businesses', icon: 'key', render: renderClients, admin: true },
    activity: { title: 'Activity log', icon: 'activity', render: renderActivity },
  };
  function renderNav() {
    const link = (p, extra = '') => `<a href="#/${p}" data-page="${p}">${icon(PAGES[p].icon)}<span>${PAGES[p].title}</span>${extra}</a>`;
    $('#nav').innerHTML = `
      <div class="nav-label">Workspace</div>
      ${link('overview')}${link('inbox', `<span class="badge" id="nav-unread" ${state.unreadChats ? '' : 'hidden'}>${state.unreadChats}</span>`)}${link('leads')}${link('confirmed')}${link('outreach')}${link('broadcast')}
      <div class="nav-label">Configure</div>
      ${link('profile')}${link('settings')}
      ${isAdmin() ? `<div class="nav-label">Admin</div>${link('clients')}` : ''}
      ${link('activity')}`;
    $$('#nav a').forEach((a) => a.addEventListener('click', () => $('#shell').classList.remove('nav-open')));
  }

  let skipNextRoute = false;
  let lastHash = location.hash;
  const isDirty = () => state.route.page === 'profile' && state.profileDraft?.dirty;
  function confirmLeave() { return !isDirty() || confirm('You have unsaved changes. Leave without saving?'); }
  window.addEventListener('hashchange', () => {
    if (skipNextRoute) { skipNextRoute = false; return; }
    if (!confirmLeave()) { skipNextRoute = true; location.hash = lastHash; return; }
    route();
  });
  window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  function route() {
    lastHash = location.hash;
    if (!state.auth) return;
    const [, page = 'overview', arg = null] = (location.hash || '#/overview').split('/');
    let p = PAGES[page] ? page : 'overview';
    if (PAGES[p].admin && !isAdmin()) p = 'overview';
    const prev = state.route.page;
    state.route = { page: p, arg: arg ? decodeURIComponent(arg) : null };
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === p));
    $('#page-title').textContent = PAGES[p].title;
    const pageEl = $('#page');
    pageEl.className = `page ${PAGES[p].flush ? 'flush' : ''}`;
    if (p === 'inbox' && prev === 'inbox' && state.inbox && $('#inbox')) { openChat(state.route.arg); return; }
    if (p === 'outreach' && prev === 'outreach' && $('#or-list')) { if (state.route.arg) openOutreach(state.route.arg); return; }
    if (!state.tenant && !['clients', 'activity'].includes(p)) { pageEl.innerHTML = noTenantHtml(); hydrateIcons(pageEl); return; }
    PAGES[p].render();
    hydrateIcons(pageEl);
  }
  const noTenantHtml = () => `<div class="page-inner"><div class="card"><div class="empty">
    <span class="section-icon">${icon('building', 'lg')}</span><h3>No business yet</h3>
    <p>${isAdmin() ? 'Add your first business to start.' : 'Your account is not set up yet. Please contact your administrator.'}</p>
    ${isAdmin() ? '<a class="btn primary" href="#/clients">Add a business</a>' : ''}</div></div></div>`;

  // ============================================================
  // Overview
  // ============================================================
  async function renderOverview() {
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    $('#page').innerHTML = `<div class="page-inner">
      <div class="page-head"><div><h1>${greet}, ${esc(state.tenant.businessName)}</h1><p>Here's how your WhatsApp is doing.</p></div>
        <span class="spacer"></span><a class="btn" href="#/broadcast">${icon('megaphone')}New broadcast</a><a class="btn primary" href="#/inbox">${icon('chat')}Open inbox</a></div>
      <div id="ov-attention"></div>
      <div class="kpis" id="ov-kpis">${'<div class="card kpi"><div class="skeleton" style="height:64px"></div></div>'.repeat(5)}</div>
      <div class="overview-grid">
        <div class="stack">
          <div class="card"><div class="card-head"><span class="section-icon">${icon('fire')}</span><div><h2>Funnel</h2><p>New → Contacted → Replied → Qualified → Won</p></div></div><div class="card-body" id="ov-funnel"></div></div>
          <div class="card"><div class="card-head"><span class="section-icon blue">${icon('send')}</span><div><h2>Broadcast delivery</h2><p>Latest broadcast per customer, from WhatsApp</p></div></div><div class="card-body" id="ov-delivery"></div></div>
        </div>
        <div class="card"><div class="card-head"><span class="section-icon amber">${icon('send')}</span><div><h2>Outreach</h2><p>Leads from the lead finder</p></div><span class="spacer"></span><a class="btn sm" href="#/outreach">Open</a></div><div id="ov-outreach" class="list-rows"></div></div>
      </div></div>`;
    await loadOverview();
  }
  async function loadOverview() {
    if (!$('#ov-kpis')) return;
    let s;
    try { ({ data: s } = await api('GET', `/leads/${state.tenantId}/stats`)); } catch (err) { toast('Could not load stats', err.message, { kind: 'error' }); return; }
    const st = s.status;
    const kpi = (label, value, ic, cls, sub) => `<div class="card kpi"><div class="row"><span class="label">${label}</span><span class="section-icon ${cls}">${icon(ic, 'sm')}</span></div><div class="value">${value.toLocaleString()}</div><div class="sub">${sub}</div></div>`;
    const pct = (n) => (s.total ? `${Math.round((n / s.total) * 100)}% of customers` : '—');
    $('#ov-kpis').innerHTML = [
      kpi('Customers', s.total, 'users', 'indigo', `${s.newToday} new in the last 24h`),
      kpi('Engaged', st.ENGAGED, 'chat', 'amber', pct(st.ENGAGED)),
      kpi('Qualified', st.QUALIFIED, 'sparkle', 'blue', pct(st.QUALIFIED)),
      kpi('Converted', st.CONVERTED, 'check', '', pct(st.CONVERTED)),
      kpi('Opted out', st.COLD, 'x', 'red', pct(st.COLD)),
    ].join('');
    const reached = {
      'Reached': s.total - st.COLD,
      'Replied': st.ENGAGED + st.QUALIFIED + st.CONVERTED,
      'Qualified': st.QUALIFIED + st.CONVERTED,
      'Converted': st.CONVERTED,
    };
    const top = Math.max(1, reached.Reached);
    $('#ov-funnel').innerHTML = `<div class="funnel">${Object.entries(reached).map(([name, n]) => `
      <div class="funnel-row"><span class="name">${name}</span><div class="bar"><i style="width:${Math.max(n ? 3 : 0, (n / top) * 100)}%"></i></div><span class="num">${n.toLocaleString()}<small>${Math.round((n / top) * 100)}%</small></span></div>`).join('')}</div>`;
    const d = s.delivery; const dT = d.SENT + d.DELIVERED + d.READ + d.FAILED;
    const colors = { READ: '#10b981', DELIVERED: '#3b82f6', SENT: '#94a3b8', FAILED: '#e5484d' };
    $('#ov-delivery').innerHTML = dT ? `
      <div class="stacked">${['READ', 'DELIVERED', 'SENT', 'FAILED'].filter((k) => d[k]).map((k) => `<i style="width:${(d[k] / dT) * 100}%;background:${colors[k]}" title="${k}: ${d[k]}"></i>`).join('')}</div>
      <div class="legend">${['READ', 'DELIVERED', 'SENT', 'FAILED'].map((k) => `<span><i style="background:${colors[k]}"></i>${k[0] + k.slice(1).toLowerCase()} <b>${d[k].toLocaleString()}</b></span>`).join('')}</div>`
      : '<div class="empty" style="padding:16px"><p>No broadcasts tracked yet. <a href="#/broadcast">Send your first one</a>.</p></div>';
    api('GET', `/outreach/${state.tenantId}?state=REPLIED&limit=5`).then((o) => {
      const el = $('#ov-outreach'); if (!el) return;
      const c = o.counts;
      const row = (label, n, tab, ic, cls) => `<a class="list-row" href="#/outreach" data-ov-tab="${tab}" style="color:inherit;text-decoration:none"><span class="section-icon ${cls}" style="width:28px;height:28px">${icon(ic, 'sm')}</span><div class="grow"><div class="title">${label}</div></div><strong>${n}</strong></a>`;
      el.innerHTML = (c.REPLIED + c.TO_SEND + c.SENT + c.SKIPPED)
        ? row('Replied — waiting for you', c.REPLIED, 'REPLIED', 'chat', '') + row('To send', c.TO_SEND, 'TO_SEND', 'send', 'blue') + row('Waiting for reply', c.SENT, 'SENT', 'clock', 'amber') + row('Skipped', c.SKIPPED, 'SKIPPED', 'x', 'red')
        : `<div class="empty"><span class="section-icon amber">${icon('upload', 'lg')}</span><h3>No outreach leads yet</h3><p>Import <code>whatsapp_leads.csv</code> on the <a href="#/outreach">Outreach</a> page.</p></div>`;
      $$('[data-ov-tab]', el).forEach((x) => x.addEventListener('click', () => { orState.tab = x.dataset.ovTab; }));
    }).catch(() => {});
    const att = [];
    if (s.unreadChats) att.push(`<div class="banner green">${icon('chat')}<div><strong>${s.unreadChats} unread conversation${s.unreadChats > 1 ? 's' : ''}.</strong> <a href="#/inbox">Open inbox →</a></div></div>`);
    if (s.needsReply) att.push(`<div class="banner">${icon('pause')}<div><strong>${s.needsReply} chat${s.needsReply > 1 ? 's' : ''} waiting for your reply</strong> — the customer wrote last.</div></div>`);
    $('#ov-attention').innerHTML = att.length ? `<div class="stack" style="gap:10px">${att.join('')}</div>` : '';
  }
  const refreshOverview = debounce(loadOverview, 600);

  // ============================================================
  // Inbox
  // ============================================================
  function renderInbox() {
    state.inbox = state.inbox || { chats: new Map(), filter: 'all', search: '', hasMore: false, active: null, lead: null, messages: [], hasOlder: false, detailsOpen: window.innerWidth > 1280 };
    const ib = state.inbox;
    $('#page').innerHTML = `<div class="inbox-wrap" style="height:100%"><div class="inbox ${ib.detailsOpen ? '' : 'no-details'}" id="inbox">
      <aside class="chat-list">
        <div class="chat-list-head">
          <div class="search">${icon('search', 'sm')}<input class="input" id="chat-search" placeholder="Search name or number" value="${esc(ib.search)}" /></div>
          <div class="tabs"><button data-filter="all" class="${ib.filter === 'all' ? 'active' : ''}">All chats</button><button data-filter="unread" class="${ib.filter === 'unread' ? 'active' : ''}">Unread</button></div>
        </div>
        <div class="chats" id="chats"></div>
      </aside>
      <section class="conversation" id="conversation"></section>
      <aside class="details" id="details"></aside>
    </div></div>`;
    $('#chat-search').addEventListener('input', debounce((e) => { ib.search = e.target.value.trim(); loadChats(true); }, 300));
    $$('.tabs button', $('#page')).forEach((b) => b.addEventListener('click', () => {
      ib.filter = b.dataset.filter;
      $$('.tabs button', $('#page')).forEach((x) => x.classList.toggle('active', x === b));
      loadChats(true);
    }));
    $('#chats').addEventListener('scroll', (e) => { const el = e.target; if (ib.hasMore && !ib.loading && el.scrollTop + el.clientHeight > el.scrollHeight - 120) loadChats(false); });
    loadChats(true);
    openChat(state.route.arg);
  }
  async function loadChats(reset) {
    const ib = state.inbox; if (!ib) return;
    ib.loading = true;
    if (reset) { ib.chats = new Map(); $('#chats').innerHTML = '<div style="padding:16px;display:grid;gap:12px">' + '<div class="skeleton" style="height:48px"></div>'.repeat(6) + '</div>'; }
    const last = reset ? null : [...ib.chats.values()].sort((a, b) => new Date(a.lastMessageAt) - new Date(b.lastMessageAt))[0];
    const q = new URLSearchParams({ limit: '30' });
    if (ib.search) q.set('search', ib.search);
    if (ib.filter === 'unread') q.set('unread', 'true');
    if (last?.lastMessageAt) q.set('before', last.lastMessageAt);
    try {
      const res = await api('GET', `/chats/${state.tenantId}?${q}`);
      res.data.forEach((l) => ib.chats.set(l.phone, l));
      ib.hasMore = res.hasMore; state.unreadChats = res.unreadChats;
      refreshUnread(); renderChatList();
    } catch (err) { $('#chats').innerHTML = `<div class="empty"><p>${esc(err.message)}</p></div>`; } finally { ib.loading = false; }
  }
  function renderChatList({ flash } = {}) {
    const ib = state.inbox; const el = $('#chats');
    if (!ib || !el) return;
    let list = [...ib.chats.values()].filter((l) => l.lastMessageAt).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
    if (ib.filter === 'unread') list = list.filter((l) => l.unreadCount > 0 || l.phone === ib.active);
    if (ib.search) { const s = ib.search.toLowerCase(); const dg = s.replace(/\D/g, ''); list = list.filter((l) => (l.name || '').toLowerCase().includes(s) || (dg && l.phone.includes(dg))); }
    if (!list.length) {
      el.innerHTML = `<div class="empty"><span class="section-icon">${icon('chat', 'lg')}</span><h3>${ib.search || ib.filter === 'unread' ? 'Nothing here' : 'No conversations yet'}</h3><p>${ib.search ? 'No chat matches your search.' : ib.filter === 'unread' ? "You're all caught up." : 'Chats appear here as soon as a customer messages you.'}</p></div>`;
      return;
    }
    el.innerHTML = list.map((l) => {
      const by = { bot: 'Bot', ai: 'AI', agent: 'You', broadcast: 'Broadcast' }[l.lastMessageSentBy] || '';
      const plain = String(l.lastMessagePreview || '').replace(/\*([^*\n]+)\*/g, '$1').replace(/~([^~\n]+)~/g, '$1');
      return `<div class="chat-item ${l.unreadCount ? 'unread' : ''} ${l.phone === ib.active ? 'active' : ''} ${flash === l.phone ? 'flash' : ''}" data-phone="${esc(l.phone)}" role="button" tabindex="0">
        ${avatar(l.name, l.phone)}
        <div class="grow">
          <div class="top"><span class="name">${esc(displayName(l))}</span><span class="time">${shortWhen(l.lastMessageAt)}</span></div>
          <div class="bottom"><span class="preview">${by ? `<span style="opacity:.7">${by}: </span>` : ''}${esc(plain)}</span>${l.unreadCount ? `<span class="badge">${l.unreadCount}</span>` : ''}</div>
          <div class="tags">${statusPill(l.status)}</div>
        </div></div>`;
    }).join('') + (ib.hasMore ? '<div style="padding:12px;text-align:center" class="muted small">Scroll for more…</div>' : '');
    $$('.chat-item', el).forEach((item) => {
      const go = () => { location.hash = `#/inbox/${item.dataset.phone}`; };
      item.addEventListener('click', go);
      item.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
  }
  async function openChat(phone) {
    const ib = state.inbox; if (!ib) return;
    ib.active = phone || null;
    $('#inbox')?.classList.toggle('chat-open', !!phone);
    renderChatList();
    if (!phone) {
      ib.lead = null; ib.messages = [];
      $('#conversation').innerHTML = `<div class="no-chat"><div class="card">
        <span class="section-icon" style="margin:0 auto 12px;width:52px;height:52px;border-radius:16px">${icon('chat', 'lg')}</span>
        <h2>Your WhatsApp inbox</h2><p class="muted" style="margin-top:6px">Pick a conversation to see the full chat and reply. For outreach leads, the Outreach page suggests replies.</p></div></div>`;
      $('#details').innerHTML = '';
      return;
    }
    $('#conversation').innerHTML = `<div class="conv-head"><div class="skeleton" style="width:40px;height:40px;border-radius:50%"></div><div class="grow"><div class="skeleton" style="width:160px;height:14px"></div></div></div><div class="messages"></div>`;
    try {
      const res = await api('GET', `/chats/${state.tenantId}/${phone}/messages?limit=60`);
      if (ib.active !== phone) return;
      ib.lead = res.lead; ib.messages = res.data; ib.hasOlder = res.hasMore;
      if (!ib.chats.has(phone)) ib.chats.set(phone, res.lead);
    } catch (err) {
      $('#conversation').innerHTML = `<div class="no-chat"><div class="card"><h2>Chat not found</h2><p class="muted">${esc(err.message)}</p></div></div>`;
      return;
    }
    $('#conversation').innerHTML = '<div class="conv-head" id="conv-head"></div><div class="messages" id="messages"></div><div class="composer" id="composer"></div>';
    renderConvHead(); renderMessages(); renderComposer(); renderDetails();
    requestAnimationFrame(() => { const m = $('#messages'); if (m) m.scrollTop = m.scrollHeight; });
    if (ib.lead.unreadCount) markRead(phone);
  }
  const markRead = debounce(async (phone) => {
    try { const { lead } = await api('POST', `/chats/${state.tenantId}/${phone}/read`); onLeadUpdate(lead); refreshUnread(); } catch { /* ignore */ }
  }, 250);
  function renderConvHead() {
    const ib = state.inbox; const l = ib?.lead; const el = $('#conv-head');
    if (!l || !el) return;
    el.innerHTML = `
      <button class="btn icon ghost back" aria-label="Back to chats" id="conv-back">${icon('back')}</button>
      ${avatar(l.name, l.phone)}
      <div class="grow"><div class="name">${esc(displayName(l))}</div><div class="sub"><span>${esc(fmtPhone(l.phone))}</span>${statusPill(l.status)}</div></div>
      <button class="btn icon ghost" id="details-toggle" title="Customer details" aria-label="Customer details">${icon('panel')}</button>`;
    $('#conv-back').addEventListener('click', () => { location.hash = '#/inbox'; });
    $('#details-toggle').addEventListener('click', () => { ib.detailsOpen = !ib.detailsOpen; $('#inbox').classList.toggle('no-details', !ib.detailsOpen); });
  }
  const SENDER = { bot: ['bot', 'Bot'], ai: ['sparkle', 'AI assistant'], agent: ['user', 'You'], broadcast: ['megaphone', 'Broadcast'] };
  function metaHtml(m) {
    let ticks = '';
    if (m.direction === 'out') {
      if (m.status === 'failed') ticks = `<span title="${esc(m.error || 'Not delivered')}">${icon('alert', 'tick failed')}</span>`;
      else if (m.status === 'read') ticks = TICK2('read');
      else if (m.status === 'delivered') ticks = TICK2('');
      else ticks = TICK1;
    }
    return `<span class="meta">${m.createdAt ? timeOf(m.createdAt) : ''}${ticks}</span>`;
  }
  function messageHtml(m, prev) {
    const out = m.direction === 'out';
    const gap = !prev || prev.direction !== m.direction || prev.sentBy !== m.sentBy || new Date(m.createdAt) - new Date(prev.createdAt) > 5 * 60e3;
    const [ic, who] = SENDER[m.sentBy] || [];
    const whoHtml = out && gap && who ? `<div class="who ${m.sentBy}">${icon(ic, 'sm')}${who}</div>` : '';
    const meta = m.meta || {};
    let inner = ''; let after = '';
    const textHtml = (t) => (t ? `<div class="text">${wa(t)}</div>` : '');
    const photo = (src) => `<a href="${esc(src)}" target="_blank" rel="noopener" class="bubble-photo"><img src="${esc(src)}" alt="" loading="lazy" /></a>`;
    switch (m.type) {
      case 'image':
        inner = `${meta.link ? photo(meta.link) : ''}${textHtml(m.text)}`;
        break;
      case 'buttons':
        inner = `${meta.image ? photo(meta.image) : ''}${textHtml(m.text)}`;
        after = `<div class="chips">${(meta.buttons || []).map((b) => `<div class="chip">${icon('reply', 'sm')}${esc(b)}</div>`).join('')}</div>`;
        break;
      case 'list':
        inner = `${meta.header ? `<div style="font-weight:700;margin-bottom:2px">${esc(meta.header)}</div>` : ''}${textHtml(m.text)}
          <div class="list-rows-preview">${(meta.rows || []).map((r) => `<div>• ${esc(r.title)}${r.description ? `<small>${esc(r.description)}</small>` : ''}</div>`).join('')}</div>`;
        after = `<div class="chips"><div class="chip">${icon('list', 'sm')}${esc(meta.button || 'Options')}</div></div>`;
        break;
      case 'document':
        inner = `<a class="attach" href="${esc(meta.link || '#')}" target="_blank" rel="noopener"><span class="file-ico">PDF</span><div class="grow"><strong>${esc(meta.filename || 'Document')}</strong><small>Open document</small></div></a>${textHtml(m.text)}`;
        break;
      case 'location': {
        const href = meta.latitude != null ? `https://www.google.com/maps?q=${encodeURIComponent(`${meta.latitude},${meta.longitude}`)}` : '#';
        inner = `<a class="attach" href="${href}" target="_blank" rel="noopener"><span class="file-ico map">${icon('pin', 'sm')}</span><div class="grow"><strong>${esc(meta.name || m.text || 'Location')}</strong><small>${esc(meta.address || 'Open in Maps')}</small></div></a>`;
        break;
      }
      case 'template':
        inner = `<div class="attach" style="margin-bottom:2px"><span class="file-ico" style="background:#d97706">${icon('template', 'sm')}</span><div class="grow"><strong>${esc(meta.name || 'Template')}</strong><small>${(meta.params || []).length ? esc(meta.params.join(' · ')) : 'Approved WhatsApp template'}</small></div></div>`;
        break;
      case 'reply': inner = `<div class="tapped">${icon('reply', 'sm')}Tapped</div>${textHtml(m.text)}`; break;
      case 'reaction': inner = `<div class="reaction">${esc(m.text)}</div>`; break;
      case 'text': inner = textHtml(m.text); break;
      default: inner = `<div class="tapped">${esc(meta.label || m.type)}</div>${textHtml(m.text)}${!m.text ? '<div class="text muted small">Media is shown in WhatsApp</div>' : ''}`;
    }
    return `<div class="msg ${out ? 'out' : 'in'} ${gap ? 'gap' : ''}" data-id="${esc(m._id)}"><div class="bubble">${whoHtml}${inner}${metaHtml(m)}</div>${after}</div>`;
  }
  function messagesHtml(list, prevBefore = null) {
    let html = ''; let prev = prevBefore;
    for (const m of list) {
      if (!prev || !sameDay(new Date(prev.createdAt), new Date(m.createdAt))) { html += `<div class="day-sep">${esc(dayLabel(m.createdAt))}</div>`; prev = null; }
      html += messageHtml(m, prev); prev = m;
    }
    return html;
  }
  function renderMessages() {
    const ib = state.inbox; const el = $('#messages'); if (!el) return;
    el.innerHTML = (ib.hasOlder ? '<button class="btn sm load-older" id="load-older">Load earlier messages</button>' : '') + (ib.messages.length ? messagesHtml(ib.messages) : '<div class="empty"><p>No messages yet.</p></div>');
    $('#load-older')?.addEventListener('click', loadOlder);
    el.scrollTop = el.scrollHeight;
  }
  async function loadOlder() {
    const ib = state.inbox; const el = $('#messages'); const first = ib.messages[0]; if (!first) return;
    const h = el.scrollHeight;
    try {
      const res = await api('GET', `/chats/${state.tenantId}/${ib.active}/messages?limit=60&before=${encodeURIComponent(first.createdAt)}`);
      ib.messages = [...res.data, ...ib.messages]; ib.hasOlder = res.hasMore;
      renderMessages(); el.scrollTop = el.scrollHeight - h;
    } catch (err) { toast('Could not load older messages', err.message, { kind: 'error' }); }
  }
  function appendMessages(list) {
    const ib = state.inbox; const el = $('#messages');
    const fresh = list.filter((m) => !ib.messages.some((x) => String(x._id) === String(m._id)));
    if (!fresh.length) return;
    const nearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    const prev = ib.messages[ib.messages.length - 1] || null;
    ib.messages.push(...fresh);
    if (!el) return;
    $('.empty', el)?.remove();
    el.insertAdjacentHTML('beforeend', messagesHtml(fresh, prev));
    if (nearBottom || fresh.some((m) => m.sentBy === 'agent')) el.scrollTop = el.scrollHeight;
  }
  function windowInfo(lead) {
    if (!lead?.lastInboundAt) return { open: false, left: 0 };
    const left = 24 * 3600e3 - (Date.now() - new Date(lead.lastInboundAt));
    return { open: left > 0, left };
  }
  function renderComposer() {
    const ib = state.inbox; const l = ib?.lead; const el = $('#composer');
    if (!l || !el) return;
    const draft = $('#reply-text')?.value || '';
    if (l.status === 'COLD') { el.innerHTML = `<div class="banner red">${icon('x')}<div><strong>This customer opted out.</strong> WhatsApp policy doesn't allow messaging them again unless they write to you first.</div></div>`; return; }
    const w = windowInfo(l);
    if (!w.open) { el.innerHTML = `<div class="banner">${icon('clock')}<div><strong>The 24-hour reply window is closed.</strong> WhatsApp only lets you reply within 24 hours of the customer's last message. Re-engage them with a <a href="#/broadcast">broadcast template</a>.</div></div>`; return; }
    const hours = Math.floor(w.left / 3600e3); const mins = Math.floor((w.left % 3600e3) / 60e3);
    el.innerHTML = `
      <div class="row"><textarea id="reply-text" rows="1" placeholder="Type a reply…" aria-label="Reply">${esc(draft)}</textarea>
        <button class="btn primary" id="send-btn" aria-label="Send" title="Send (Enter)">${icon('send')}</button></div>
      <div class="composer-note">${icon('clock', 'sm')}Reply window closes in ${hours ? `${hours}h ` : ''}${mins}m<span class="spacer"></span><span class="hide-sm">Enter to send · Shift+Enter for a new line</span></div>`;
    const ta = $('#reply-text');
    const grow = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(160, ta.scrollHeight)}px`; };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } });
    $('#send-btn').addEventListener('click', sendReply);
    grow();
  }
  async function sendReply() {
    const ib = state.inbox; const ta = $('#reply-text'); const btn = $('#send-btn');
    const text = ta.value.trim(); if (!text) return;
    btn.disabled = true; ta.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      const res = await api('POST', `/chats/${state.tenantId}/${ib.active}/messages`, { text });
      ta.value = '';
      if (res.data) appendMessages([res.data]);
      if (res.lead) onLeadUpdate(res.lead);
      log(`Replied to +${ib.active}.`, 'success');
    } catch (err) {
      toast('Message not sent', err.message, { kind: 'error', timeout: 7000 });
      if (err.data?.code === 'WINDOW_CLOSED') renderComposer();
    } finally {
      const b = $('#send-btn'); const t = $('#reply-text');
      if (b) { b.disabled = false; b.innerHTML = icon('send'); }
      if (t) { t.disabled = false; t.focus(); t.dispatchEvent(new Event('input')); }
    }
  }
  function renderDetails() {
    const l = state.inbox?.lead; const el = $('#details');
    if (!l || !el) return;
    const answers = state.fields.filter((f) => l.data?.[f.field]);
    el.innerHTML = `
      <div class="details-head">${avatar(l.name, l.phone)}<div class="name">${esc(displayName(l))}</div>
        <a href="tel:+${esc(l.phone)}" class="small">${icon('phone', 'sm')} ${esc(fmtPhone(l.phone))}</a>${statusPill(l.status)}</div>
      <div class="details-section"><h4>Answers</h4>${answers.length ? `<dl class="kv">${answers.map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(l.data[f.field])}</dd>`).join('')}</dl>` : '<p class="muted small">No answers yet.</p>'}</div>
      ${l.bookedAt && new Date(l.bookedAt) > new Date() ? `<div class="details-section"><div class="banner green">${icon('calendar')}<div><strong>Booked</strong><br>${esc(bookedLabel(l))}</div></div></div>` : ''}
      <div class="details-section"><h4>Broadcast</h4><dl class="kv">
        <dt>Delivery</dt><dd>${deliveryPill(l)}</dd><dt>Last sent</dt><dd>${l.lastBroadcastAt ? esc(new Date(l.lastBroadcastAt).toLocaleString()) : '—'}</dd>
        ${l.broadcastError ? `<dt>Error</dt><dd style="color:var(--danger)">${esc(l.broadcastError)}</dd>` : ''}</dl></div>
      <div class="details-section"><h4>Team alert</h4><dl class="kv">
        <dt>Alert</dt><dd>${l.adminAlertStatus ? `<span class="pill ${l.adminAlertStatus === 'FAILED' ? 'd-FAILED' : 'd-READ'}">${esc(l.adminAlertStatus.toLowerCase())}</span>` : '<span class="muted">None yet</span>'}</dd>
        ${l.adminAlertError ? `<dt>Why</dt><dd style="color:var(--danger)">${esc(l.adminAlertError)}</dd>` : ''}</dl></div>
      <div class="details-section"><h4>Timeline</h4><dl class="kv"><dt>First seen</dt><dd>${esc(new Date(l.createdAt).toLocaleString())}</dd><dt>Last message</dt><dd>${relTime(l.lastMessageAt)}</dd></dl></div>`;
  }

  // ============================================================
  // Leads
  // ============================================================
  const leadsState = { page: 1, status: '', search: '' };
  function renderLeads() {
    $('#page').innerHTML = `<div class="page-inner">
      <div class="page-head"><div><h1>Leads</h1><p>Everyone you've broadcast to or who has messaged ${esc(bizName())}.</p></div><span class="spacer"></span>
        <a class="btn primary" href="#/broadcast">${icon('upload')}Import & broadcast</a></div>
      <div class="row wrap"><div class="filters" id="lead-filters"></div><span class="spacer"></span>
        <div class="search" style="width:min(280px,100%)">${icon('search', 'sm')}<input class="input" id="lead-search" placeholder="Search name or number" value="${esc(leadsState.search)}" /></div></div>
      <div class="card"><div class="table-wrap" id="leads-table"><div style="padding:20px;display:grid;gap:12px">${'<div class="skeleton" style="height:36px"></div>'.repeat(6)}</div></div><div id="leads-pager"></div></div></div>`;
    $('#lead-search').addEventListener('input', debounce((e) => { leadsState.search = e.target.value.trim(); leadsState.page = 1; loadLeads(); }, 300));
    loadLeads();
  }
  const refreshLeads = debounce(() => { if ($('#leads-table')) loadLeads(); }, 1500);
  async function loadLeads() {
    const q = new URLSearchParams({ page: leadsState.page, limit: 50 });
    if (leadsState.status) q.set('status', leadsState.status);
    if (leadsState.search) q.set('search', leadsState.search);
    let res; let stats;
    try { [res, { data: stats }] = await Promise.all([api('GET', `/leads/${state.tenantId}?${q}`), api('GET', `/leads/${state.tenantId}/stats`)]); }
    catch (err) { $('#leads-table').innerHTML = `<div class="empty"><p>${esc(err.message)}</p></div>`; return; }
    if (!$('#lead-filters')) return;
    const filters = [['', 'All', stats.total], ...Object.keys(STATUS_LABELS).map((s) => [s, STATUS_LABELS[s], stats.status[s]])];
    $('#lead-filters').innerHTML = filters.map(([v, label, n]) => `<button class="filter ${leadsState.status === v ? 'active' : ''}" data-v="${v}">${label}<span class="n">${(n || 0).toLocaleString()}</span></button>`).join('');
    $$('#lead-filters .filter').forEach((b) => b.addEventListener('click', () => { leadsState.status = b.dataset.v; leadsState.page = 1; loadLeads(); }));
    if (!res.data.length) {
      $('#leads-table').innerHTML = `<div class="empty"><span class="section-icon indigo">${icon('users', 'lg')}</span><h3>No leads here</h3><p>${leadsState.status || leadsState.search ? 'Nothing matches these filters.' : 'Import a CSV on the Broadcast page, or wait for customers to message you.'}</p></div>`;
      $('#leads-pager').innerHTML = '';
      return;
    }
    const cols = state.fields.filter((f) => f.type !== 'slots').slice(0, 3);
    const hasSlots = state.fields.some((f) => f.type === 'slots');
    $('#leads-table').innerHTML = `<table class="table"><thead><tr><th>Customer</th>${cols.map((f) => `<th>${esc(f.label)}</th>`).join('')}${hasSlots ? '<th>Booking</th>' : ''}<th>Delivery</th><th>Status</th><th>Last activity</th><th></th></tr></thead><tbody>
      ${res.data.map((l) => `<tr>
        <td><div class="person">${avatar(l.name, l.phone)}<div><strong>${esc(displayName(l))}</strong><small>${esc(fmtPhone(l.phone))}</small></div></div></td>
        ${cols.map((f) => `<td>${l.data?.[f.field] ? esc(l.data[f.field]) : '<span class="muted">—</span>'}</td>`).join('')}
        ${hasSlots ? `<td>${l.bookedAt ? esc(bookedLabel(l)) : '<span class="muted">—</span>'}</td>` : ''}
        <td>${deliveryPill(l)}</td>
        <td>${statusPill(l.status)}${l.adminAlertStatus === 'FAILED' ? ` <span class="pill d-FAILED" title="${esc(l.adminAlertError || 'The WhatsApp alert to your team could not be delivered')}">alert failed</span>` : ''}</td>
        <td class="muted">${relTime(l.lastMessageAt || l.updatedAt)}</td>
        <td>${l.lastMessageAt ? `<a class="btn sm" href="#/inbox/${esc(l.phone)}">${icon('chat', 'sm')}Chat</a>` : ''}</td></tr>`).join('')}
      </tbody></table>`;
    const from = (res.page - 1) * res.limit + 1;
    $('#leads-pager').innerHTML = `<div class="pager"><span>Showing ${from}–${from + res.data.length - 1} of ${res.total.toLocaleString()}</span><span class="spacer"></span>
      <button class="btn sm" id="pg-prev" ${res.page <= 1 ? 'disabled' : ''}>${icon('back', 'sm')}Prev</button><span>Page ${res.page} of ${res.pages}</span>
      <button class="btn sm" id="pg-next" ${res.page >= res.pages ? 'disabled' : ''}>Next</button></div>`;
    $('#pg-prev').addEventListener('click', () => { leadsState.page -= 1; loadLeads(); });
    $('#pg-next').addEventListener('click', () => { leadsState.page += 1; loadLeads(); });
  }

  // ============================================================
  // Confirmed: leads you marked Won, kept apart from the others
  // ============================================================
  const confState = { tab: 'upcoming', search: '', rows: null };
  const fieldLabel = (key) => state.fields.find((f) => f.field === key)?.label || key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  /** Everything stored about the lead. */
  const leadDetails = (l) => {
    const d = l.data || {}; const order = state.fields.map((f) => f.field);
    const slotFields = new Set(state.fields.filter((f) => f.type === 'slots').map((f) => f.field)); // shown as "Booked for"
    return Object.keys(d).filter((k) => d[k] !== '' && d[k] != null && typeof d[k] !== 'object' && !(l.bookedAt && slotFields.has(k)))
      .sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999)).map((k) => [fieldLabel(k), String(d[k])]);
  };
  function renderConfirmed() {
    $('#page').innerHTML = `<div class="page-inner">
      <div class="page-head"><div><h1>Confirmed</h1><p>Leads you marked <strong>Won</strong> — your confirmed sales.</p></div><span class="spacer"></span>
        <button class="btn" id="conf-export">${icon('download')}Export CSV</button></div>
      <div class="row wrap"><div class="filters" id="conf-tabs"></div><span class="spacer"></span>
        <div class="search" style="width:min(280px,100%)">${icon('search', 'sm')}<input class="input" id="conf-search" placeholder="Search name, number or detail" value="${esc(confState.search)}" /></div></div>
      <div class="card"><div class="table-wrap" id="conf-table"><div style="padding:20px;display:grid;gap:12px">${'<div class="skeleton" style="height:36px"></div>'.repeat(5)}</div></div></div></div>`;
    $('#conf-search').addEventListener('input', debounce((e) => { confState.search = e.target.value.trim().toLowerCase(); drawConfirmed(); }, 200));
    $('#conf-export').addEventListener('click', exportConfirmed);
    loadConfirmed();
  }
  const refreshConfirmed = debounce(() => { if ($('#conf-table')) loadConfirmed(); }, 1500);
  async function loadConfirmed() {
    try {
      const rows = []; let page = 1; let pages = 1;
      do { const r = await api('GET', `/leads/${state.tenantId}?status=CONVERTED&limit=500&page=${page}`); rows.push(...r.data); pages = r.pages; page += 1; } while (page <= pages && page <= 10);
      confState.rows = rows;
    } catch (err) { if ($('#conf-table')) $('#conf-table').innerHTML = `<div class="empty"><p>${esc(err.message)}</p></div>`; return; }
    drawConfirmed();
  }
  function confirmedList() {
    const now = Date.now(); const all = confState.rows || [];
    const tabs = {
      upcoming: all.filter((l) => l.bookedAt && new Date(l.bookedAt).getTime() >= now).sort((a, b) => new Date(a.bookedAt) - new Date(b.bookedAt)),
      past: all.filter((l) => l.bookedAt && new Date(l.bookedAt).getTime() < now).sort((a, b) => new Date(b.bookedAt) - new Date(a.bookedAt)),
      nodate: all.filter((l) => !l.bookedAt),
      all: [...all].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    };
    return tabs;
  }
  function drawConfirmed() {
    if (!$('#conf-table')) return;
    const tabs = confirmedList();
    const labels = [['upcoming', 'Upcoming'], ['past', 'Past'], ['nodate', 'No time picked'], ['all', 'All confirmed']].filter(([k]) => k !== 'nodate' || tabs.nodate.length);
    if (!labels.some(([k]) => k === confState.tab)) confState.tab = 'all';
    $('#conf-tabs').innerHTML = labels.map(([k, l]) => `<button class="filter ${confState.tab === k ? 'active' : ''}" data-tab="${k}">${l}<span class="n">${tabs[k].length}</span></button>`).join('');
    $$('#conf-tabs .filter').forEach((b) => b.addEventListener('click', () => { confState.tab = b.dataset.tab; drawConfirmed(); }));
    const q = confState.search;
    const rows = tabs[confState.tab].filter((l) => !q || `${l.name || ''} ${l.phone} ${leadDetails(l).map((x) => x[1]).join(' ')}`.toLowerCase().includes(q));
    if (!rows.length) {
      $('#conf-table').innerHTML = `<div class="empty"><span class="section-icon">${icon('check', 'lg')}</span><h3>${(confState.rows || []).length ? 'Nothing here' : 'No confirmed customers yet'}</h3><p>${(confState.rows || []).length ? (q ? 'Nothing matches your search.' : 'Try another tab.') : 'Mark a lead as Won on the Outreach page or in Leads and it appears here.'}</p></div>`;
      return;
    }
    $('#conf-table').innerHTML = `<table class="table"><thead><tr><th>Customer</th><th>Booked for</th><th>Details</th><th>Team alert</th><th>Confirmed</th><th></th></tr></thead><tbody>
      ${rows.map((l) => `<tr>
        <td><div class="person">${avatar(l.name, l.phone)}<div><strong>${esc(displayName(l))}</strong><small>${esc(fmtPhone(l.phone))}</small></div></div></td>
        <td>${l.bookedAt ? `<strong>${esc(bookedLabel(l))}</strong>` : '<span class="muted">—</span>'}</td>
        <td><div class="conf-details">${leadDetails(l).map(([k, v]) => `<span class="pill plain" title="${esc(k)}"><span class="muted">${esc(k)}:</span>&nbsp;${esc(v)}</span>`).join('') || '<span class="muted">—</span>'}</div></td>
        <td>${l.adminAlertStatus === 'SENT' ? '<span class="pill d-READ">sent</span>' : l.adminAlertStatus === 'FAILED' ? `<span class="pill d-FAILED" title="${esc(l.adminAlertError || '')}">failed</span>` : '<span class="muted">—</span>'}</td>
        <td class="muted">${relTime(l.adminAlertAt || l.updatedAt)}</td>
        <td><a class="btn sm" href="#/inbox/${esc(l.phone)}">${icon('chat', 'sm')}Chat</a></td></tr>`).join('')}
      </tbody></table>`;
  }
  function exportConfirmed() {
    const rows = confirmedList()[confState.tab] || [];
    if (!rows.length) { toast('Nothing to export'); return; }
    const keys = [...new Set(rows.flatMap((l) => leadDetails(l).map((x) => x[0])))];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Name', 'Phone', 'Booked for', ...keys, 'Confirmed at'].map(cell).join(',')];
    for (const l of rows) {
      const d = Object.fromEntries(leadDetails(l));
      lines.push([l.name || '', `+${l.phone}`, bookedLabel(l), ...keys.map((k) => d[k] || ''), l.adminAlertAt || l.updatedAt].map(cell).join(','));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
    a.download = `confirmed-${confState.tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ============================================================
  // Broadcast
  // ============================================================
  function renderBroadcast() {
    const t = state.tenant; const tp = t.templates || {};
    $('#page').innerHTML = `<div class="page-inner">
      <div class="page-head"><div><h1>Broadcast</h1><p>Upload a contact list and send your approved WhatsApp template. Replies land in your Inbox.</p></div></div>
      <div class="overview-grid">
        <div class="card"><div class="card-head"><span class="section-icon">${icon('upload')}</span><div><h2>Import contacts</h2><p>CSV with a <code>phone</code> column (and optionally <code>name</code>)</p></div></div>
          <div class="card-body stack">
            <label class="dropzone" id="csv-drop"><input type="file" id="csv-file" accept=".csv,text/csv" />
              <span class="section-icon">${icon('upload', 'lg')}</span><strong>Drop your CSV here or click to choose</strong><span class="hint">10-digit Indian numbers get +91 automatically · you choose who gets it before sending</span></label>
            <div id="csv-picked"></div>
            <div id="csv-contacts"></div>
            <button class="btn primary" id="send-broadcast" disabled style="height:42px">${icon('send')}Send broadcast</button>
            <div id="broadcast-result"></div></div></div>
        <div class="stack">
          <div class="card card-pad stack"><div class="row"><span class="section-icon indigo">${icon('template')}</span><div><h2>Template</h2><p class="muted small">Change it in <a href="#/settings">Settings</a></p></div></div>
            <dl class="kv"><dt>Name</dt><dd><code>${esc(tp.broadcastName || 'Server default')}</code></dd><dt>Language</dt><dd>${esc(tp.broadcastLanguage || 'Server default')}</dd>
            <dt>Variables</dt><dd>${tp.broadcastName && tp.broadcastHasParams === false ? 'None' : '{{1}} customer name · {{2}} business name'}</dd></dl></div>
          <div class="card"><div class="card-head"><span class="section-icon blue">${icon('activity')}</span><div><h2>Sending queue</h2><p>Paced to protect your WhatsApp quality rating</p></div><span class="spacer"></span><button class="btn sm" id="q-refresh">${icon('refresh', 'sm')}Refresh</button></div><div class="card-body" id="queue-stats"></div></div>
          <div class="card card-pad stack"><div class="row"><span class="section-icon amber">${icon('info')}</span><h2>Good to know</h2></div>
            <ul style="margin:0;padding-left:18px;color:var(--text-2);display:grid;gap:6px">
              <li>Daily limit follows your WhatsApp tier (Tier ${t.tier ?? 0}).</li>
              <li>Customers who opted out are never messaged again.</li>
              <li>Numbers WhatsApp refuses (e.g. not on your test list) show as Failed with the reason.</li></ul></div>
        </div></div></div>`;
    let file = null;
    const bc = { contacts: null, sel: new Set(), filter: 'all', search: '', summary: null };
    const pick = async (f) => {
      file = f || null; bc.contacts = null; bc.sel = new Set();
      $('#csv-picked').innerHTML = file ? `<div class="file-picked">${icon('file')}<div class="grow" style="min-width:0"><strong>${esc(file.name)}</strong><div class="hint">${(file.size / 1024).toFixed(1)} KB</div></div><button class="btn icon sm ghost" id="csv-clear" aria-label="Remove file">${icon('x', 'sm')}</button></div>` : '';
      $('#csv-clear')?.addEventListener('click', (e) => { e.preventDefault(); $('#csv-file').value = ''; pick(null); });
      $('#csv-contacts').innerHTML = file ? '<div class="skeleton" style="height:160px"></div>' : '';
      $('#broadcast-result').innerHTML = '';
      updateSendButton();
      if (!file) return;
      try {
        const res = await uploadFile(`/leads/${state.tenantId}/preview`, file);
        if (file !== f) return; // another file was picked meanwhile
        bc.contacts = res.data; bc.summary = res.summary; bc.filter = 'all'; bc.search = '';
        // Everyone new is ticked; people who already got a broadcast are not, to avoid sending twice.
        bc.sel = new Set(res.data.filter((x) => x.state === 'new').map((x) => x.phone));
        drawContacts();
      } catch (err) { $('#csv-contacts').innerHTML = `<div class="banner red">${icon('alert')}<div>${esc(err.message)}</div></div>`; }
    };
    const updateSendButton = () => {
      const btn = $('#send-broadcast'); if (!btn || btn.querySelector('.spinner')) return;
      const n = bc.sel.size;
      btn.disabled = !file || !bc.contacts || !n;
      btn.innerHTML = `${icon('send')}${bc.contacts ? `Send to ${n.toLocaleString()} selected` : 'Send broadcast'}`;
    };
    const visibleContacts = () => {
      const q = bc.search.toLowerCase(); const qd = q.replace(/\D/g, '');
      return (bc.contacts || []).filter((x) => (bc.filter === 'all' || x.state === bc.filter) && (!q || (x.name || '').toLowerCase().includes(q) || (qd && x.phone.includes(qd))));
    };
    const sentLabel = (x) => {
      const when = relTime(x.lastBroadcastAt);
      const how = x.replied ? 'replied' : (x.broadcastStatus || 'sent').toLowerCase();
      return `<span class="pill ${how === 'failed' ? 'd-FAILED' : 'd-QUEUED'}" title="${esc(x.broadcastError || `Last broadcast ${new Date(x.lastBroadcastAt).toLocaleString()}`)}">Already sent ${esc(when)} · ${esc(how)}</span>`;
    };
    function drawContacts() {
      const el = $('#csv-contacts'); if (!el || !bc.contacts) return;
      const all = bc.contacts; const s = bc.summary || {};
      const count = (st) => all.filter((x) => x.state === st).length;
      const sentCount = count('sent'); const sentPicked = all.filter((x) => x.state === 'sent' && bc.sel.has(x.phone)).length;
      const vis = visibleContacts(); const pickable = vis.filter((x) => x.state !== 'optedOut');
      const allOn = pickable.length > 0 && pickable.every((x) => bc.sel.has(x.phone));
      const shown = vis.slice(0, 300);
      el.innerHTML = `<div class="bc-picker stack">
        <div class="row wrap" style="gap:8px"><strong>${all.length.toLocaleString()} contacts</strong><span class="muted small">${[s.duplicates ? `${s.duplicates} duplicate rows merged` : '', s.invalid ? `${s.invalid} invalid numbers skipped` : ''].filter(Boolean).join(' · ')}</span></div>
        ${sentCount ? `<div class="banner amber">${icon('info')}<div><strong>${sentCount} already got a broadcast before.</strong> ${sentPicked ? `${sentPicked} of them are selected: they get it again.` : 'They are not selected, so nobody gets it twice.'} Tick them if you want to send again — WhatsApp may block repeated marketing messages to the same person.</div></div>` : ''}
        ${bc.sel.size > (s.quotaRemaining ?? Infinity) ? `<div class="banner red">${icon('alert')}<div>You selected ${bc.sel.size.toLocaleString()}, but only <strong>${(s.quotaRemaining || 0).toLocaleString()}</strong> more can be sent in the next 24 hours (Tier ${s.tier ?? 0}).</div></div>` : ''}
        <div class="row wrap" style="gap:8px"><div class="filters">${[['all', 'All', all.length], ['new', 'New', count('new')], ['sent', 'Already sent', sentCount], ['optedOut', 'Opted out', count('optedOut')]].filter(([k, , n]) => k === 'all' || n).map(([k, l, n]) => `<button type="button" class="filter ${bc.filter === k ? 'active' : ''}" data-bcf="${k}">${l}<span class="n">${n}</span></button>`).join('')}</div>
          <span class="spacer"></span><div class="search" style="width:min(220px,100%)">${icon('search', 'sm')}<input class="input" id="bc-search" placeholder="Search" value="${esc(bc.search)}" /></div></div>
        <div class="bc-list"><table class="table"><thead><tr><th style="width:36px"><input type="checkbox" id="bc-all" ${allOn ? 'checked' : ''} ${pickable.length ? '' : 'disabled'} aria-label="Select all shown" /></th><th>Contact</th><th>Status</th></tr></thead><tbody>
          ${shown.map((x) => `<tr class="${x.state === 'optedOut' ? 'muted-row' : ''}"><td><input type="checkbox" data-ph="${esc(x.phone)}" ${bc.sel.has(x.phone) ? 'checked' : ''} ${x.state === 'optedOut' ? 'disabled' : ''} aria-label="Select ${esc(x.name || x.phone)}" /></td>
            <td><strong>${esc(x.name || '—')}</strong><div class="hint">+${esc(x.phone)}</div></td>
            <td>${x.state === 'new' ? '<span class="pill d-READ">New</span>' : x.state === 'optedOut' ? '<span class="pill d-FAILED">Opted out · never sent</span>' : sentLabel(x)}</td></tr>`).join('')}
          </tbody></table>${vis.length > shown.length ? `<p class="hint" style="padding:8px 12px">Showing 300 of ${vis.length.toLocaleString()} — search to find others. The top checkbox covers all ${vis.length.toLocaleString()}.</p>` : ''}${vis.length ? '' : '<p class="hint" style="padding:12px">Nothing matches.</p>'}</div>
        <div class="row wrap" style="gap:8px"><span class="muted small"><strong>${bc.sel.size.toLocaleString()}</strong> selected</span><span class="spacer"></span>
          <button type="button" class="btn sm" data-bcq="new">Only new</button><button type="button" class="btn sm" data-bcq="all">Everyone</button><button type="button" class="btn sm" data-bcq="none">Clear</button></div>
      </div>`;
      hydrateIcons(el);
      $('#bc-search').addEventListener('input', debounce((e) => { bc.search = e.target.value.trim(); drawContacts(); const i = $('#bc-search'); i.focus(); i.setSelectionRange(99, 99); }, 200));
      updateSendButton();
    }
    $('#csv-contacts').addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'bc-all') { for (const x of visibleContacts()) if (x.state !== 'optedOut') { if (t.checked) bc.sel.add(x.phone); else bc.sel.delete(x.phone); } drawContacts(); }
      else if (t.dataset.ph) { if (t.checked) bc.sel.add(t.dataset.ph); else bc.sel.delete(t.dataset.ph); drawContacts(); }
    });
    $('#csv-contacts').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.bcf) { bc.filter = b.dataset.bcf; drawContacts(); }
      if (b.dataset.bcq) {
        const ok = (bc.contacts || []).filter((x) => x.state !== 'optedOut');
        bc.sel = new Set(b.dataset.bcq === 'none' ? [] : ok.filter((x) => b.dataset.bcq === 'all' || x.state === 'new').map((x) => x.phone));
        drawContacts();
      }
    });
    wireDropzone($('#csv-drop'), $('#csv-file'), pick);
    $('#send-broadcast').addEventListener('click', async () => {
      if (!file || !bc.sel.size) return;
      const btn = $('#send-broadcast');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Sending…';
      try {
        const data = await uploadFile(`/leads/${state.tenantId}/upload`, file, { phones: JSON.stringify([...bc.sel]) });
        const s = data.summary || {};
        $('#broadcast-result').innerHTML = `<div class="banner green">${icon('check')}<div><strong>${esc(data.message)}</strong></div></div>
          <div class="stat-chips" style="margin-top:12px">
            ${[['Queued', s.enqueued], ['Rows in file', s.total], ['Not selected', s.notSelected], ['Duplicates', s.duplicatesSkipped], ['Invalid numbers', s.invalidSkipped], ['Opted out', s.optedOutSkipped], ['Recently contacted', s.recentlyContactedSkipped], ['Quota left today', s.quotaRemaining]]
              .filter(([, v]) => v !== undefined).map(([k, v]) => `<div class="stat-chip"><b>${(v ?? 0).toLocaleString()}</b><span>${k}</span></div>`).join('')}</div>
          ${data.invalidSamples?.length ? `<p class="hint" style="margin-top:8px">Invalid examples: ${data.invalidSamples.map(esc).join(', ')}</p>` : ''}`;
        toast('Broadcast queued', `${s.enqueued} messages are on their way.`);
        log(`Broadcast queued: ${s.enqueued} messages.`, 'success');
        $('#csv-file').value = ''; file = null; bc.contacts = null; bc.sel = new Set(); $('#csv-picked').innerHTML = ''; $('#csv-contacts').innerHTML = '';
        setTimeout(loadQueueStats, 1500);
      } catch (err) {
        $('#broadcast-result').innerHTML = `<div class="banner red">${icon('alert')}<div>${esc(err.message)}</div></div>`;
        log(`Broadcast failed: ${err.message}`, 'error');
      } finally { btn.innerHTML = `${icon('send')}Send broadcast`; updateSendButton(); }
    });
    $('#q-refresh').addEventListener('click', loadQueueStats);
    loadQueueStats();
  }
  async function loadQueueStats() {
    const el = $('#queue-stats'); if (!el) return;
    try {
      const { stats } = await api('GET', `/leads/${state.tenantId}/queue`);
      el.innerHTML = `<div class="stat-chips">${[['Waiting', stats.waiting], ['Sent', stats.sent], ['Failed', stats.failed], ['Skipped', stats.skipped]].map(([k, v]) => `<div class="stat-chip"><b>${(v || 0).toLocaleString()}</b><span>${k}</span></div>`).join('')}</div>`;
    } catch (err) { el.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
  }
  function wireDropzone(zone, input, onFile) {
    input.addEventListener('change', () => onFile(input.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) onFile(f); });
  }

  // ============================================================
  // Business Profile
  // ============================================================
  function renderProfile() {
    if (!state.profileDraft) state.profileDraft = { draft: clone(state.tenant.profile || {}), dirty: false };
    const p = state.profileDraft.draft; p.faq = p.faq || [];
    const f = (k, label, max, hint = '', type = 'text') => `<label class="field"><span>${label}</span><input class="input" data-k="${k}" type="${type}" maxlength="${max}" value="${esc(p[k] ?? '')}" />${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
    const ta = (k, label, max, rows, hint = '', ph = '') => `<label class="field"><span>${label}</span><textarea data-k="${k}" rows="${rows}" maxlength="${max}" placeholder="${esc(ph)}">${esc(p[k] ?? '')}</textarea>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
    $('#page').innerHTML = `<div class="page-inner">
      <div class="page-head"><div><h1>Business Profile</h1><p>What the AI tells leads about you: your services, prices and answers to common questions.</p></div></div>
      <div class="stack" id="profile-form" style="max-width:860px">
        <div class="stack">
          <div class="card"><div class="card-head"><span class="section-icon">${icon('building')}</span><div><h2>About your business</h2><p>Use simple, factual sentences — the AI answers from these</p></div></div>
            <div class="card-body stack">
              ${f('displayName', 'Name shown to customers', 120, 'Used as {business} in messages.')}
              ${ta('about', 'About', 2000, 3, '', 'e.g. Family dental clinic since 2009 with 4 specialists.')}
              ${ta('services', 'Services, products & prices', 4000, 6, 'One per line works best.', 'Dental cleaning – ₹1,200\nRoot canal – from ₹6,000\nConsultation – ₹500')}
              ${f('hours', 'Opening hours', 600, '', 'text')}
              <div class="grid-2">${f('contactPhone', 'Contact number', 20)}${f('website', 'Website', 200)}</div>
              ${ta('address', 'Address', 300, 2)}</div></div>
          <div class="card"><div class="card-head"><span class="section-icon blue">${icon('question')}</span><div><h2>Frequently asked questions</h2><p>The AI uses these word for word</p></div><span class="spacer"></span><button type="button" class="btn sm" id="faq-add">${icon('plus', 'sm')}Add</button></div>
            <div class="card-body stack" id="faq-rows"></div></div>
        </div>
      </div>
      <div id="profile-errors"></div>
      <div class="save-bar" id="p-save-bar" ${state.profileDraft.dirty ? '' : 'hidden'}><span>${icon('info')}</span><strong>You have unsaved changes</strong><span class="spacer"></span>
        <button class="btn ghost" id="p-discard">Discard</button><button class="btn primary" id="p-save">${icon('check')}Save profile</button></div></div>`;
    const dirty = () => { state.profileDraft.dirty = true; $('#p-save-bar').hidden = false; };
    const renderFaq = () => {
      $('#faq-rows').innerHTML = p.faq.length ? p.faq.map((x, i) => `<div class="faq-row">
        <label class="field"><span>Question</span><input class="input" data-faq="${i}.q" maxlength="200" value="${esc(x.q)}" /></label>
        <label class="field"><span>Answer</span><textarea data-faq="${i}.a" rows="2" maxlength="1000">${esc(x.a)}</textarea></label>
        <button type="button" class="btn icon sm ghost danger" data-faq-del="${i}" aria-label="Remove" style="margin-top:24px">${icon('trash', 'sm')}</button></div>`).join('') : '<p class="muted small">No questions yet. Add the ones customers ask most.</p>';
    };
    renderFaq();
    const root = $('#profile-form');
    root.addEventListener('input', (e) => {
      const k = e.target.dataset.k; const fq = e.target.dataset.faq;
      if (k) { p[k] = e.target.value; dirty(); }
      if (fq) { const [i, key] = fq.split('.'); p.faq[i][key] = e.target.value; dirty(); }
    });
    root.addEventListener('click', (e) => {
      const del = e.target.closest('[data-faq-del]');
      if (del) { p.faq.splice(Number(del.dataset.faqDel), 1); renderFaq(); dirty(); }
    });
    $('#faq-add').addEventListener('click', () => { if (p.faq.length >= 40) return toast('Up to 40 questions', '', { kind: 'warn' }); p.faq.push({ q: '', a: '' }); renderFaq(); dirty(); $$('[data-faq]').at(-2)?.focus(); });
    $('#p-discard').addEventListener('click', () => { state.profileDraft = null; renderProfile(); hydrateIcons($('#page')); });
    $('#p-save').addEventListener('click', async () => {
      const btn = $('#p-save'); btn.disabled = true;
      try {
        const res = await api('PATCH', `/tenants/${state.tenantId}`, { profile: p });
        applyTenantPayload(res); state.profileDraft = null; renderProfile(); hydrateIcons($('#page'));
        toast('Profile saved', 'The AI uses the new details right away.'); log('Business Profile saved.', 'success');
      } catch (err) { $('#profile-errors').innerHTML = errorList(err); btn.disabled = false; }
    });
  }

  // ============================================================
  // Settings
  // ============================================================
  // ============================================================
  // Outreach — leads from the lead finder; the AI drafts 3 messages; you pick one and it's sent
  // ============================================================
  const OR_TABS = [['REPLIED', 'Replied'], ['TO_SEND', 'To send'], ['SENT', 'Waiting for reply'], ['SKIPPED', 'Skipped']];
  const INTENT_LABELS = { interested: 'Interested', question: 'Asked a question', price: 'Asked the price', objection: 'Has a doubt', not_interested: 'Not interested', ready_to_buy: 'Ready to buy', other: 'Replied' };
  const orState = { tab: null, search: '', list: [], counts: {}, template: null, active: null, lead: null, thread: [], loadingSugg: false, suggError: '' };

  const orTemplateBody = () => orState.template?.body || '';
  /** Same text the server sends: the approved template filled in, or the plain first message. */
  function orPreview(lead, hook) {
    const name = lead.outreach?.business || lead.name || 'there';
    const h = String(hook || '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
    const body = orTemplateBody();
    if (body) return body.replace(/\{\{1\}\}/g, name).replace(/\{\{2\}\}/g, h).replace(/\{\{3\}\}/g, bizName());
    return `Hi ${name},\n\n${h}\n\n— ${bizName()}\nReply STOP if you'd rather not hear from us.`;
  }
  const windowOpen = (lead) => !!lead.lastInboundAt && Date.now() - new Date(lead.lastInboundAt) < 864e5;

  function renderOutreach() {
    orState.active = state.route.arg || orState.active;
    $('#page').innerHTML = `<div class="page-inner">
      <div class="page-head"><div><h1>Outreach</h1><p>Businesses from the lead finder, with the problems found on their website. The AI writes 3 messages for each one — you pick the best and it's sent.</p></div>
        <span class="spacer"></span>
        <label class="switch" title="Uses your outreach template. {{2}} = each business's own problem sentence from the CSV."><input type="checkbox" id="or-send-now" /><span class="track"></span>Send first message to everyone</label>
        <label class="btn primary" style="cursor:pointer">${icon('upload')}Import leads CSV<input type="file" id="or-file" accept=".csv,text/csv" hidden /></label></div>
      <div id="or-banner"></div>
      <div class="filters" id="or-tabs"></div>
      <div class="or-layout">
        <div class="card or-list-card"><div style="padding:12px"><div class="search">${icon('search', 'sm')}<input class="input" id="or-search" placeholder="Search business or number" value="${esc(orState.search)}" /></div></div><div id="or-list" class="or-list"><div class="skeleton" style="height:200px;margin:12px"></div></div></div>
        <div class="card" id="or-detail"><div class="empty"><span class="section-icon">${icon('send', 'lg')}</span><h3>Pick a lead</h3><p>Choose a business on the left to see its problems and the AI's suggested messages.</p></div></div>
      </div></div>`;
    $('#or-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importOutreach(f); });
    $('#or-search').addEventListener('input', debounce((e) => { orState.search = e.target.value.trim(); loadOutreach(); }, 250));
    $('#or-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-ortab]'); if (!b) return; orState.tab = b.dataset.ortab; loadOutreach(); });
    $('#or-list').addEventListener('click', (e) => { const b = e.target.closest('[data-orph]'); if (b) location.hash = `#/outreach/${b.dataset.orph}`; });
    loadOutreach().then(() => { if (orState.active) openOutreach(orState.active); });
  }

  function drawOrBanner() {
    const el = $('#or-banner'); if (!el) return;
    el.innerHTML = orState.template ? '' : `<div class="banner">${icon('alert')}<div><strong>Set up your outreach template before sending first messages.</strong> WhatsApp only allows a Meta-approved template as the first message to a business that never wrote to you. Add it in <a href="#/settings">Settings → Outreach template</a>. Until then you can only message leads who wrote to you in the last 24 hours.</div></div>`;
    hydrateIcons(el);
  }

  async function loadOutreach() {
    if (!$('#or-list')) return;
    const tab = orState.tab || 'REPLIED';
    try {
      let res = await api('GET', `/outreach/${state.tenantId}?state=${tab}&search=${encodeURIComponent(orState.search)}`);
      // First visit: start where there's work — replies first, else the "To send" list.
      if (!orState.tab) { orState.tab = res.counts.REPLIED ? 'REPLIED' : 'TO_SEND'; if (orState.tab !== tab) res = await api('GET', `/outreach/${state.tenantId}?state=${orState.tab}&search=${encodeURIComponent(orState.search)}`); }
      orState.list = res.data; orState.counts = res.counts; orState.template = res.template;
    } catch (err) { $('#or-list').innerHTML = `<div class="banner red" style="margin:12px">${icon('alert')}<div>${esc(err.message)}</div></div>`; return; }
    drawOrBanner();
    $('#or-tabs').innerHTML = OR_TABS.map(([k, l]) => `<button type="button" class="filter ${orState.tab === k ? 'active' : ''}" data-ortab="${k}">${l}<span class="n">${orState.counts[k] || 0}</span></button>`).join('');
    drawOrList();
  }

  function drawOrList() {
    const el = $('#or-list'); if (!el) return;
    if (!orState.list.length) {
      const total = Object.values(orState.counts).reduce((a, b) => a + b, 0);
      el.innerHTML = `<div class="empty" style="padding:28px 16px"><p>${total ? 'Nothing here right now.' : 'No leads yet. Import <code>whatsapp_leads.csv</code> from the lead finder.'}</p></div>`;
      return;
    }
    el.innerHTML = orState.list.map((l) => {
      const o = l.outreach || {};
      const sub = [o.city, o.category].filter(Boolean).join(' · ') || `+${l.phone}`;
      const line = orState.tab === 'REPLIED' || orState.tab === 'SENT' ? (l.lastMessagePreview || '') : (o.painPoints?.[0] || '');
      return `<button type="button" class="or-item ${orState.active === l.phone ? 'active' : ''}" data-orph="${esc(l.phone)}">
        ${avatar(o.business || l.name, l.phone)}
        <div class="grow"><div class="row" style="gap:6px"><span class="title grow">${esc(o.business || displayName(l))}</span>${l.unreadCount ? `<span class="badge">${l.unreadCount}</span>` : ''}</div>
          <div class="sub">${esc(sub)}${o.rating ? ` · ★ ${esc(o.rating)}` : ''}</div>
          ${line ? `<div class="pain">${esc(line)}</div>` : ''}</div></button>`;
    }).join('');
    hydrateIcons(el);
  }

  async function importOutreach(file) {
    const sendNow = $('#or-send-now')?.checked;
    if (sendNow && !confirm(`Import ${file.name} and send the first message to every new business in it now?\n\nEach one gets your outreach template with its own problem sentence. Replies show up under "Replied" with suggested answers.`)) return;
    toast('Importing leads…', file.name, { kind: 'info' });
    try {
      const res = await uploadFile(`/outreach/${state.tenantId}/import`, file, sendNow ? { sendNow: 'true' } : {});
      const s = res.summary;
      const parts = [`${s.added} new`, s.updated ? `${s.updated} updated` : '', s.alreadyContacted ? `${s.alreadyContacted} already contacted (kept)` : '', s.optedOut ? `${s.optedOut} opted out (never messaged)` : '', s.invalid ? `${s.invalid} invalid numbers skipped` : '',
        s.queued ? `${s.queued} first messages sending now` : '', s.overLimit ? `${s.overLimit} not sent (daily limit)` : ''].filter(Boolean);
      toast('Leads imported', parts.join(' · '), { timeout: 9000 });
      if (res.sendError) toast('Not sent', res.sendError, { kind: 'warn', timeout: 9000 });
      log(`Outreach import: ${parts.join(', ')}.`, 'success');
      orState.tab = s.queued ? 'SENT' : 'TO_SEND';
      await loadOutreach();
    } catch (err) { toast('Import failed', err.message, { kind: 'error', timeout: 8000 }); }
  }

  async function openOutreach(phone) {
    orState.active = phone; orState.suggError = '';
    $$('.or-item').forEach((b) => b.classList.toggle('active', b.dataset.orph === phone));
    const el = $('#or-detail'); if (!el) return;
    el.innerHTML = '<div style="padding:20px"><div class="skeleton" style="height:320px"></div></div>';
    try {
      const res = await api('GET', `/chats/${state.tenantId}/${phone}/messages?limit=40`);
      const lead = res.lead; const msgs = res;
      if (!lead?.outreach) { el.innerHTML = `<div class="empty"><p>This number is not an outreach lead.</p></div>`; return; }
      if (orState.active !== phone) return;
      orState.lead = lead; orState.thread = msgs.data || [];
      drawOrDetail();
      if (lead.unreadCount) markRead(phone);
      // Draft automatically only when it's our turn (new lead, or they wrote last). Follow-ups are on request.
      const ourTurn = lead.outreachState === 'TO_SEND' || lead.lastMessageDirection === 'in';
      if (ourTurn && lead.status !== 'COLD' && !freshSuggestions(lead)) loadSuggestions(false);
    } catch (err) { el.innerHTML = `<div class="banner red" style="margin:20px">${icon('alert')}<div>${esc(err.message)}</div></div>`; }
  }
  const suggKind = (lead) => (lead.outreachState === 'SENT' ? 'reply' : 'opener');
  const freshSuggestions = (lead) => { const s = lead.suggestions; return s && s.kind === suggKind(lead) && (s.forMessageAt || null) === (lead.lastInboundAt || null) ? s : null; };

  async function loadSuggestions(force) {
    const lead = orState.lead; if (!lead) return;
    orState.loadingSugg = true; orState.suggError = ''; drawOrSuggestions();
    try {
      const res = await api('POST', `/outreach/${state.tenantId}/${lead.phone}/suggest`, { force });
      if (orState.lead?.phone !== lead.phone) return;
      orState.lead = res.lead; orState.template = res.template;
    } catch (err) { orState.suggError = err.message; }
    finally { orState.loadingSugg = false; drawOrSuggestions(); }
  }

  function threadHtml() {
    if (!orState.thread.length) return '<p class="muted small">No messages yet.</p>';
    return `<div class="or-thread" id="or-thread">${orState.thread.map((m) => {
      const text = m.type === 'template' ? (m.meta?.params?.[1] ? `${m.meta.params[1]}` : m.text) : (m.text || m.meta?.label || `[${m.type}]`);
      const who = m.direction === 'in' ? '' : m.sentBy === 'agent' ? 'You · ' : m.sentBy === 'broadcast' ? 'Broadcast · ' : `${m.sentBy} · `;
      return `<div class="or-msg ${m.direction === 'out' ? 'out' : ''}">${m.type === 'template' ? '<em class="muted">First message: </em>' : ''}${wa(text)}<small>${esc(who)}${esc(shortWhen(m.createdAt))}${m.status === 'failed' ? ` · failed${m.error ? `: ${esc(m.error)}` : ''}` : ''}</small></div>`;
    }).join('')}</div>`;
  }

  function drawOrDetail() {
    const el = $('#or-detail'); const l = orState.lead; if (!el || !l) return;
    const o = l.outreach || {};
    const sug = freshSuggestions(l);
    el.innerHTML = `
      <div class="or-head">${avatar(o.business || l.name, l.phone)}
        <div class="grow"><h2>${esc(o.business || displayName(l))}</h2>
          <div class="muted small">+${esc(l.phone)}${o.city ? ` · ${esc(o.city)}` : ''}${o.category ? ` · ${esc(o.category)}` : ''}${o.rating ? ` · ★ ${esc(o.rating)}${o.reviews ? ` (${esc(o.reviews)} reviews)` : ''}` : ''}</div>
          <div class="row wrap" style="gap:6px;margin-top:8px">${statusPill(l.status)}${l.outreachState === 'SENT' ? deliveryPill(l) : ''}${sug?.intent && INTENT_LABELS[sug.intent] ? `<span class="pill intent">${esc(INTENT_LABELS[sug.intent])}</span>` : ''}${o.websiteBroken ? '<span class="pill d-FAILED">Website broken</span>' : ''}</div></div>
        <div class="row wrap" style="gap:6px">
          ${o.website ? `<a class="btn sm" href="${esc(o.website)}" target="_blank" rel="noopener noreferrer">${icon('external', 'sm')}Website</a>` : ''}
          ${o.mapsLink ? `<a class="btn sm" href="${esc(o.mapsLink)}" target="_blank" rel="noopener noreferrer">${icon('pin', 'sm')}Maps</a>` : ''}
          <a class="btn sm" href="#/inbox/${esc(l.phone)}">${icon('chat', 'sm')}Inbox</a></div></div>
      <div class="or-section"><h3>${icon('alert', 'sm')}Problems on their website</h3>
        ${o.painPoints?.length ? `<ol class="or-pains">${o.painPoints.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>` : '<p class="muted small">None listed.</p>'}
        ${o.impact ? `<p class="small" style="margin-top:10px;color:var(--text-2)"><strong>What it costs them:</strong> ${esc(o.impact)}</p>` : ''}</div>
      ${l.outreachState === 'SENT' || orState.thread.length ? `<div class="or-section"><h3>${icon('chat', 'sm')}Conversation</h3><div id="or-thread-wrap">${threadHtml()}</div></div>` : ''}
      <div class="or-section"><div class="row wrap" style="margin-bottom:10px"><h3 style="margin:0">${icon('sparkle', 'sm')}${suggKind(l) === 'opener' ? 'Suggested first messages' : l.lastMessageDirection === 'in' ? 'Suggested replies' : 'Suggested follow-ups'}</h3><span class="spacer"></span>
          <button class="btn sm" id="or-regen" ${l.status === 'COLD' ? 'disabled' : ''}>${icon('refresh', 'sm')}New suggestions</button></div>
        <div id="or-suggs"></div></div>
      <div class="or-section row wrap" style="gap:8px">
        <label class="field" style="width:200px;margin:0"><span>Lead status</span><select id="or-status" ${l.status === 'COLD' ? 'disabled' : ''}>${['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'CONVERTED'].map((s) => `<option value="${s}" ${l.status === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}${l.status === 'COLD' ? '<option selected>Opted out</option>' : ''}</select></label>
        <span class="spacer"></span>
        ${l.outreachState === 'TO_SEND' ? `<button class="btn" id="or-skip">${icon('x', 'sm')}Skip this lead</button>` : ''}
        ${l.outreachState === 'SKIPPED' ? `<button class="btn" id="or-unskip">${icon('reply', 'sm')}Move back to To send</button>` : ''}</div>`;
    hydrateIcons(el);
    const th = $('#or-thread'); if (th) th.scrollTop = th.scrollHeight;
    $('#or-regen').addEventListener('click', () => loadSuggestions(true));
    $('#or-status').addEventListener('change', (e) => patchOutreach({ status: e.target.value }, 'Status updated'));
    $('#or-skip')?.addEventListener('click', () => patchOutreach({ skip: true }, 'Lead skipped'));
    $('#or-unskip')?.addEventListener('click', () => patchOutreach({ skip: false }, 'Moved back to To send'));
    drawOrSuggestions();
  }

  function drawOrSuggestions() {
    const el = $('#or-suggs'); const l = orState.lead; if (!el || !l) return;
    if (l.status === 'COLD') { el.innerHTML = `<div class="banner red">${icon('alert')}<div>This business opted out. WhatsApp policy does not allow messaging them again.</div></div>`; hydrateIcons(el); return; }
    if (l.outreachState === 'SKIPPED') { el.innerHTML = '<p class="muted small">Skipped. Move it back to “To send” to write to them.</p>'; return; }
    const sug = freshSuggestions(l);
    const opener = suggKind(l) === 'opener';
    const blocked = opener ? (!orState.template && !windowOpen(l)) : !windowOpen(l);
    const warn = blocked ? `<div class="banner ${opener ? '' : 'blue'}">${icon('info')}<div>${opener
      ? 'No outreach template set, so this first message cannot be sent yet. Add it in <a href="#/settings">Settings → Outreach template</a>.'
      : 'More than 24 hours since their last message: WhatsApp blocks free text until they write again.'}</div></div>` : '';
    if (orState.loadingSugg && !sug) { el.innerHTML = `${warn}<div class="or-suggs">${'<div class="skeleton" style="height:110px"></div>'.repeat(3)}</div><p class="hint">The AI is reading their problems${opener ? '' : ' and the chat'}…</p>`; hydrateIcons(el); return; }
    if (orState.suggError && !sug) { el.innerHTML = `${warn}<div class="banner red">${icon('alert')}<div>${esc(orState.suggError)}</div></div>`; hydrateIcons(el); return; }
    if (!sug) { el.innerHTML = `${warn}${l.lastMessageDirection === 'out' && !opener ? '<p class="muted small" style="margin-bottom:8px">Your message was the last one. Wait for their reply, or get follow-up ideas.</p>' : ''}<button class="btn primary" id="or-gen">${icon('sparkle')}Write suggestions</button>`; hydrateIcons(el); $('#or-gen').addEventListener('click', () => loadSuggestions(false)); return; }
    const order = sug.items.map((s, i) => i).sort((a, b) => (a === sug.recommended ? -1 : b === sug.recommended ? 1 : a - b));
    el.innerHTML = `${warn}<div class="or-suggs">${order.map((i) => {
      const s = sug.items[i];
      return `<div class="or-sugg ${i === sug.recommended ? 'best' : ''}" data-si="${i}">
        <div class="row wrap" style="gap:6px"><strong>${esc(s.label)}</strong>${i === sug.recommended ? `<span class="pill best">${icon('sparkle', 'sm')}Best pick</span>` : ''}</div>
        <textarea rows="3" data-stext aria-label="Message ${i + 1}">${esc(s.text)}</textarea>
        ${opener ? `<div><div class="hint" style="margin-bottom:4px">They will see:</div><div class="or-preview" data-sprev>${esc(orPreview(l, s.text))}</div></div>` : ''}
        <div class="row"><span class="hint">${opener ? (windowOpen(l) ? 'Sent as a normal message (they wrote in the last 24h).' : orState.template ? `Sent with template <code>${esc(orState.template.name)}</code>.` : '') : 'You can edit it before sending.'}</span><span class="spacer"></span>
          <button class="btn ${i === sug.recommended ? 'primary' : ''}" data-ssend ${blocked ? 'disabled' : ''}>${icon('send', 'sm')}Send this</button></div></div>`;
    }).join('')}</div>${orState.loadingSugg ? '<p class="hint">Writing new suggestions…</p>' : ''}`;
    hydrateIcons(el);
    $$('.or-sugg', el).forEach((card) => {
      const ta = $('[data-stext]', card); const prev = $('[data-sprev]', card);
      if (prev) ta.addEventListener('input', () => { prev.textContent = orPreview(l, ta.value); });
      $('[data-ssend]', card).addEventListener('click', (e) => sendOutreach(ta.value, e.currentTarget));
    });
  }

  async function sendOutreach(text, btn) {
    const l = orState.lead; if (!l || !text.trim()) return;
    const who = l.outreach?.business || displayName(l);
    if (!confirm(`Send this to ${who} (+${l.phone}) on WhatsApp now?`)) return;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Sending…';
    try {
      const res = await api('POST', `/outreach/${state.tenantId}/${l.phone}/send`, { text: text.trim() });
      toast('Sent', `${who}${res.viaTemplate ? ' · first message (template)' : ''}`);
      log(`Outreach message sent to ${who} (+${l.phone}).`, 'success');
      orState.lead = res.lead;
      if (res.data) orState.thread.push(res.data);
      await loadOutreach();
      drawOrDetail();
    } catch (err) {
      toast('Not sent', err.message, { kind: 'error', timeout: 9000 });
      btn.disabled = false; btn.innerHTML = `${icon('send', 'sm')}Send this`;
    }
  }

  async function patchOutreach(body, okMsg) {
    const l = orState.lead; if (!l) return;
    try {
      const res = await api('PATCH', `/outreach/${state.tenantId}/${l.phone}`, body);
      orState.lead = res.lead; toast(okMsg);
      await loadOutreach(); drawOrDetail();
    } catch (err) { toast('Could not update', err.message, { kind: 'error' }); }
  }

  const refreshOutreachList = debounce(() => { if (state.route.page === 'outreach') loadOutreach(); }, 400);
  function onOutreachLead(lead) {
    if (state.route.page !== 'outreach' || !lead.outreach) return;
    refreshOutreachList();
    if (orState.lead?.phone !== lead.phone) return;
    const before = orState.lead.suggestions?.at; const beforeState = orState.lead.outreachState; const beforeStatus = orState.lead.status;
    orState.lead = { ...orState.lead, ...lead };
    if (lead.suggestions?.at && lead.suggestions.at !== before) orState.loadingSugg = false;
    // New AI drafts arrived (e.g. after they replied) or the lead moved on: redraw. Otherwise keep what you are typing.
    if (lead.suggestions?.at !== before || lead.outreachState !== beforeState || lead.status !== beforeStatus) drawOrDetail();
  }
  function onOutreachMessage(message) {
    if (state.route.page !== 'outreach' || orState.lead?.phone !== message.phone) return;
    if (orState.thread.some((m) => String(m._id) === String(message._id))) return;
    orState.thread.push(message);
    const w = $('#or-thread-wrap');
    if (w) { w.innerHTML = threadHtml(); const th = $('#or-thread'); if (th) th.scrollTop = th.scrollHeight; } else drawOrDetail();
    if (message.direction === 'in') { orState.loadingSugg = true; drawOrSuggestions(); setTimeout(() => { orState.loadingSugg = false; drawOrSuggestions(); }, 20000); }
  }

  function renderSettings() {
    const t = state.tenant; const tp = t.templates || {};
    $('#page').innerHTML = `<div class="page-inner">
      <div class="page-head"><div><h1>Settings</h1><p>Account details, team alerts and WhatsApp templates.</p></div></div>
      <div class="overview-grid">
        <div class="stack">
          <form class="card" id="biz-form"><div class="card-head"><span class="section-icon">${icon('building')}</span><div><h2>Account</h2><p>Your business account on Agent Desk</p></div></div>
            <div class="card-body stack">
              <label class="field"><span>Business name</span><input class="input" name="businessName" required maxlength="120" value="${esc(t.businessName)}" /></label>
              <label class="field"><span>Team alert number</span><input class="input" name="adminNotificationPhone" required value="${esc(t.adminNotificationPhone)}" inputmode="tel" />
                <span class="hint">Your own WhatsApp number for alerts. Include the country code.</span></label>
              <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">${icon('check')}Save</button></div></div></form>
          <form class="card" id="tpl-form"><div class="card-head"><span class="section-icon indigo">${icon('template')}</span><div><h2>WhatsApp templates</h2><p>Names approved in your Meta Business account</p></div></div>
            <div class="card-body stack">
              <div class="grid-2"><label class="field"><span>Broadcast template</span><input class="input" name="broadcastName" placeholder="my_offer_v1" value="${esc(tp.broadcastName || '')}" /></label>
                <label class="field"><span>Language</span><input class="input" name="broadcastLanguage" placeholder="en" value="${esc(tp.broadcastLanguage || '')}" /></label></div>
              <label class="switch"><input type="checkbox" name="broadcastHasParams" ${tp.broadcastHasParams === false ? '' : 'checked'} /><span class="track"></span>Template uses {{1}} customer name and {{2}} business name</label>
              <div class="grid-2"><label class="field"><span>Team alert template</span><input class="input" name="adminAlertName" placeholder="admin_lead_alert" value="${esc(tp.adminAlertName || '')}" /></label>
                <label class="field"><span>Language</span><input class="input" name="adminAlertLanguage" placeholder="en" value="${esc(tp.adminAlertLanguage || '')}" /></label></div>
              <div class="banner blue">${icon('info')}<div>Without an alert template, alerts are plain messages that WhatsApp only delivers if your alert number messaged the business number in the last 24 hours. Alert template variables: {{1}} headline, {{2}} name, {{3}} phone, {{4}} details.</div></div>
              <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">${icon('check')}Save templates</button></div></div></form>
          <form class="card" id="or-tpl-form"><div class="card-head"><span class="section-icon">${icon('send')}</span><div><h2>Outreach template</h2><p>First message to businesses from the lead finder (Outreach page)</p></div></div>
            <div class="card-body stack">
              <div class="grid-2"><label class="field"><span>Template name</span><input class="input" name="outreachName" placeholder="website_audit_intro" value="${esc(tp.outreachName || '')}" /></label>
                <label class="field"><span>Language</span><input class="input" name="outreachLanguage" placeholder="en" value="${esc(tp.outreachLanguage || '')}" /></label></div>
              <label class="field"><span>Template text (exactly as approved in Meta)</span><textarea name="outreachBody" rows="5" maxlength="1024" placeholder="Hi {{1}}, I found your business on Google Maps. {{2}}&#10;&#10;— {{3}}&#10;Reply STOP to opt out.">${esc(tp.outreachBody || '')}</textarea>
                <span class="hint">{{1}} their business name · {{2}} the sentence the AI writes about their website problem (you pick it) · {{3}} your business name (optional). Used for the preview and to fill the variables.</span></label>
              <div class="banner blue">${icon('info')}<div>Create it in Meta Business Manager → WhatsApp → Message templates, category <strong>Marketing</strong>, with the same text. Include an opt-out line like “Reply STOP to opt out”. It can only be used once Meta approves it.</div></div>
              <div class="row"><span class="spacer"></span><button class="btn primary" type="submit">${icon('check')}Save outreach template</button></div></div></form>
        </div>
        <div class="stack">
          <div class="card card-pad stack"><div class="row"><span class="section-icon blue">${icon('phone')}</span><h2>WhatsApp account</h2></div>
            <dl class="kv"><dt>Phone ID</dt><dd><code>${esc(t.phoneNumberId)}</code></dd><dt>WABA ID</dt><dd><code>${esc(t.wabaId || '—')}</code></dd><dt>Tier</dt><dd>Tier ${t.tier ?? 0}</dd><dt>Status</dt><dd>${t.isActive ? '<span class="pill d-READ">Active</span>' : '<span class="pill d-FAILED">Paused</span>'}</dd></dl>
            ${isAdmin() ? '' : '<span class="hint">Ask your administrator to change these.</span>'}</div>
          ${isAdmin() ? `<form class="card" id="admin-form"><div class="card-head"><span class="section-icon red">${icon('key')}</span><div><h2>Admin controls</h2><p>Only visible to administrators</p></div></div>
            <div class="card-body stack">
              <div class="grid-2"><label class="field"><span>Tier</span><select name="tier">${[0, 1, 2, 3].map((n) => `<option value="${n}" ${Number(t.tier) === n ? 'selected' : ''}>Tier ${n}</option>`).join('')}</select></label>
                <label class="field"><span>WABA ID</span><input class="input" name="wabaId" value="${esc(t.wabaId || '')}" /></label></div>
              <label class="field"><span>Phone number ID</span><input class="input" name="phoneNumberId" value="${esc(t.phoneNumberId)}" /><span class="hint">Change this when moving from Meta's test number to your real business number.</span></label>
              <label class="field"><span>New access token</span><input class="input" name="accessToken" type="password" autocomplete="off" placeholder="Leave empty to keep the current token" /></label>
              <label class="switch"><input type="checkbox" name="isActive" ${t.isActive ? 'checked' : ''} /><span class="track"></span>Account active</label>
              <div class="row"><button class="btn danger" type="button" id="rotate-key">${icon('key')}New API key</button><span class="spacer"></span><button class="btn primary" type="submit">${icon('check')}Save</button></div></div></form>` : ''}
        </div></div></div>`;
    const save = async (form, body, okMsg) => {
      const btn = $('button[type=submit]', form); btn.disabled = true;
      try { applyTenantPayload(await api('PATCH', `/tenants/${state.tenantId}`, body)); toast(okMsg); log(okMsg, 'success'); return true; }
      catch (err) { toast('Could not save', err.message, { kind: 'error', timeout: 7000 }); return false; } finally { btn.disabled = false; }
    };
    $('#biz-form').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; save(f, { businessName: f.businessName.value, adminNotificationPhone: f.adminNotificationPhone.value }, 'Account saved'); });
    $('#tpl-form').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; save(f, { templates: { broadcastName: f.broadcastName.value, broadcastLanguage: f.broadcastLanguage.value, broadcastHasParams: f.broadcastHasParams.checked, adminAlertName: f.adminAlertName.value, adminAlertLanguage: f.adminAlertLanguage.value } }, 'Templates saved'); });
    $('#or-tpl-form').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; save(f, { templates: { outreachName: f.outreachName.value, outreachLanguage: f.outreachLanguage.value, outreachBody: f.outreachBody.value } }, 'Outreach template saved'); });
    if (isAdmin()) {
      $('#admin-form').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.target;
        const body = { tier: Number(f.tier.value), wabaId: f.wabaId.value, isActive: f.isActive.checked, phoneNumberId: f.phoneNumberId.value.trim() };
        if (f.accessToken.value.trim()) body.accessToken = f.accessToken.value.trim();
        if (await save(f, body, 'Account settings saved')) f.accessToken.value = '';
      });
      $('#rotate-key').addEventListener('click', () => rotateKey(state.tenant));
    }
  }
  async function rotateKey(t) {
    if (!confirm(`Create a new API key for ${t.businessName}? Their current key stops working immediately.`)) return;
    try { const { apiKey } = await api('POST', `/tenants/${t._id}/rotate-key`); showKey(`New key for ${t.businessName}`, apiKey); log(`API key rotated for ${t.businessName}.`, 'warn'); }
    catch (err) { toast('Could not rotate key', err.message, { kind: 'error' }); }
  }
  function showKey(title, key) {
    modal(`<div class="card-head"><span class="section-icon">${icon('key')}</span><div><h2>${esc(title)}</h2><p>Copy it now — it will not be shown again.</p></div></div>
      <div class="card-body stack"><div class="key-reveal"><code>${esc(key)}</code><button class="btn sm" id="copy-key">${icon('copy', 'sm')}Copy</button></div>
      <span class="hint">Share it privately with the business. They sign in to this dashboard with it.</span></div>
      <div class="modal-foot"><button class="btn primary" data-close>Done</button></div>`, {
      onMount: (root) => $('#copy-key', root).addEventListener('click', async () => { try { await navigator.clipboard.writeText(key); toast('Key copied'); } catch { toast('Copy failed — select the key and copy it manually', '', { kind: 'warn' }); } }),
    });
  }

  // ============================================================
  // Businesses (admin)
  // ============================================================
  async function renderClients() {
    $('#page').innerHTML = `<div class="page-inner">
      <div class="page-head"><div><h1>Businesses</h1><p>Every business connected to this Agent Desk.</p></div><span class="spacer"></span><button class="btn primary" id="new-client">${icon('plus')}New business</button></div>
      <div class="clients" id="client-list"></div></div>`;
    const list = $('#client-list');
    list.innerHTML = state.tenants.length ? state.tenants.map((t) => `
      <div class="card client">
        <div class="row">${avatar(t.businessName, t._id)}<div style="min-width:0"><strong>${esc(t.businessName)}</strong><div class="muted small">${esc(t.profile?.displayName || '')}</div></div><span class="spacer"></span>${t.isActive ? '<span class="pill d-READ">Active</span>' : '<span class="pill d-FAILED">Paused</span>'}</div>
        <dl class="kv"><dt>Phone ID</dt><dd><code>${esc(t.phoneNumberId)}</code></dd><dt>Tier</dt><dd>${t.tier ?? 0}</dd><dt>WABA ID</dt><dd>${esc(t.wabaId || '—')}</dd></dl>
        <div class="row"><button class="btn sm" data-open="${t._id}">${icon('grid', 'sm')}Open dashboard</button><span class="spacer"></span><button class="btn sm ghost" data-rotate="${t._id}">${icon('key', 'sm')}New key</button></div>
      </div>`).join('') : `<div class="card" style="grid-column:1/-1"><div class="empty"><span class="section-icon">${icon('building', 'lg')}</span><h3>No businesses yet</h3><p>Add your first business to start.</p></div></div>`;
    $$('[data-open]', list).forEach((b) => b.addEventListener('click', async () => { await selectTenant(b.dataset.open, { silent: true }); location.hash = '#/overview'; }));
    $$('[data-rotate]', list).forEach((b) => b.addEventListener('click', () => rotateKey(state.tenants.find((t) => t._id === b.dataset.rotate))));
    $('#new-client').addEventListener('click', newClientModal);
    hydrateIcons($('#page'));
  }
  function newClientModal() {
    modal(`<form id="client-form"><div class="card-head"><span class="section-icon">${icon('plus')}</span><div><h2>New business</h2><p>Connect a WhatsApp Business number</p></div><span class="spacer"></span><button type="button" class="btn icon ghost" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="card-body stack">
        <div class="grid-2">
          <label class="field"><span>Business name</span><input class="input" name="businessName" required /></label>
          <label class="field"><span>Name shown to customers</span><input class="input" name="displayName" placeholder="Same as business name" /></label>
          <label class="field"><span>Phone number ID</span><input class="input" name="phoneNumberId" required inputmode="numeric" /></label>
          <label class="field"><span>WABA ID</span><input class="input" name="wabaId" /></label>
          <label class="field span-2"><span>Access token</span><input class="input" name="accessToken" type="password" autocomplete="off" required placeholder="EAA…" /><span class="hint">Stored encrypted.</span></label>
          <label class="field"><span>Team alert number</span><input class="input" name="adminNotificationPhone" required placeholder="919876543210" /></label>
          <label class="field"><span>Tier</span><select name="tier">${[0, 1, 2, 3].map((n) => `<option value="${n}">Tier ${n}</option>`).join('')}</select></label>
          <label class="field span-2"><span>Address <span class="muted">(optional)</span></span><input class="input" name="address" /></label>
        </div><p class="form-error" id="client-error"></p></div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${icon('check')}Create business</button></div></form>`, {
      wide: true,
      onMount: (root, close) => {
        $('#client-form', root).addEventListener('submit', async (e) => {
          e.preventDefault(); const f = e.target; const btn = $('button[type=submit]', f);
          btn.disabled = true; $('#client-error', root).textContent = '';
          try {
            const res = await api('POST', '/tenants', {
              businessName: f.businessName.value, displayName: f.displayName.value || f.businessName.value, phoneNumberId: f.phoneNumberId.value.trim(), wabaId: f.wabaId.value,
              accessToken: f.accessToken.value, adminNotificationPhone: f.adminNotificationPhone.value, tier: Number(f.tier.value), address: f.address.value,
            });
            close(); log(`Business ${res.tenant.businessName} created.`, 'success');
            await loadTenants(); await selectTenant(res.tenant._id, { silent: true }); renderNav(); route();
            showKey(`API key for ${res.tenant.businessName}`, res.apiKey);
          } catch (err) { $('#client-error', root).textContent = (err.data?.errors || [err.message]).join(' · '); btn.disabled = false; }
        });
      },
    });
  }

  // ============================================================
  // Activity log
  // ============================================================
  function renderActivity() {
    let logs = [];
    try { logs = JSON.parse(store.get(LOG_KEY)) || []; } catch { logs = []; }
    $('#page').innerHTML = `<div class="page-inner"><div class="page-head"><div><h1>Activity log</h1><p>What you did in this browser. Stored only on this device.</p></div><span class="spacer"></span><button class="btn" id="clear-logs">${icon('trash')}Clear</button></div>
      <div class="card"><div class="console" id="console">${logs.length ? logs.map((l) => `<div class="${esc(l.type)}"><span class="t">${esc(l.time)}</span>${esc(l.message)}</div>`).join('') : '<div class="debug">No activity yet.</div>'}</div></div></div>`;
    const c = $('#console'); c.scrollTop = c.scrollHeight;
    $('#clear-logs').addEventListener('click', () => { store.set(LOG_KEY, null); renderActivity(); });
    hydrateIcons($('#page'));
  }

  // ============================================================
  // Boot
  // ============================================================
  hydrateIcons();
  document.addEventListener('visibilitychange', () => {
    const ib = state.inbox;
    if (document.visibilityState === 'visible' && state.route.page === 'inbox' && ib?.active && ib.chats.get(ib.active)?.unreadCount) markRead(ib.active);
  });
  setInterval(() => { if (state.route.page === 'inbox' && state.inbox?.lead && !$('#reply-text')?.value) renderComposer(); }, 60e3);
  if (getKey()) startSession(); else showLogin();
})();
