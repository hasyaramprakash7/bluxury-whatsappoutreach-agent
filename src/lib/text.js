// Phone numbers, CSV parsing and small text helpers.

/** Digits with country code. "+1 647…" keeps its code; 10-digit numbers without one get +91. Null if invalid. */
export function normalizePhone(raw, defaultCountryCode = '91') {
  if (!raw) return null;
  const s = String(raw).trim();
  let digits = s.replace(/[^0-9]/g, '');
  if (s.startsWith('00')) digits = digits.slice(2);
  else if (!s.startsWith('+')) {
    if (digits.length === 10) digits = defaultCountryCode + digits;
    else if (digits.startsWith('0') && digits.length === 11) digits = defaultCountryCode + digits.slice(1);
  }
  return /^\d{11,15}$/.test(digits) ? digits : null;
}

/** RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF). Returns objects keyed by the header row. */
export function parseCsv(text) {
  const rows = [];
  let row = []; let field = ''; let inQuotes = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/** Replaces {placeholders}. */
export const fill = (text, vars) => String(text || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null && vars[k] !== '' ? String(vars[k]) : m));
export const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
export const nowIso = () => new Date().toISOString();
export const json = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
