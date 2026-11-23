// Business Profile: what the AI tells leads about your business (services, prices, contact).
const str = (v) => (v == null ? '' : String(v)).trim();

export function validateProfile(input) {
  const p = input && typeof input === 'object' ? input : {};
  const lim = { displayName: 120, about: 2000, services: 4000, hours: 600, address: 300, contactPhone: 20, website: 200 };
  const value = {}; const errors = [];
  for (const [k, max] of Object.entries(lim)) {
    value[k] = str(p[k]);
    if (value[k].length > max) errors.push(`${k}: must be ${max} characters or fewer.`);
  }
  if (!value.displayName) errors.push('Business name is required.');
  const faq = Array.isArray(p.faq) ? p.faq : [];
  if (faq.length > 40) errors.push('Up to 40 FAQ entries.');
  value.faq = faq.map((f, i) => {
    const q = str(f?.q); const a = str(f?.a);
    if (!q || !a) errors.push(`FAQ ${i + 1}: write both the question and the answer.`);
    if (q.length > 200 || a.length > 1000) errors.push(`FAQ ${i + 1}: question up to 200 and answer up to 1000 characters.`);
    return { q, a };
  }).slice(0, 40);
  return { value, errors };
}

/** Facts about your business for the AI prompts. */
export function businessFacts(tenant) {
  const p = tenant.profile || {};
  const lines = [
    `Business name: ${p.displayName || tenant.businessName}`,
    p.about && `About: ${p.about}`,
    p.services && `Services, products and prices:\n${p.services}`,
    p.hours && `Opening hours: ${p.hours}`,
    p.address && `Address: ${p.address}`,
    p.contactPhone && `Phone: +${String(p.contactPhone).replace(/^\+/, '')}`,
    p.website && `Website: ${p.website}`,
  ].filter(Boolean);
  if (Array.isArray(p.faq) && p.faq.length) lines.push('FAQ:\n' + p.faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n'));
  return lines.join('\n');
}
