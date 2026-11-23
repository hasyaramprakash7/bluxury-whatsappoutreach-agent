// Minimal WhatsApp Cloud API client: text and template messages, with retries for rate limits and server errors.

export class WhatsAppError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.status = status; this.code = code; this.details = details;
  }
  /** 4xx errors (other than rate limits) won't succeed on retry, e.g. #131030 number not on the test list. */
  get permanent() { return this.status >= 400 && this.status < 500 && this.status !== 429 && this.code !== 130429 && this.code !== 131056; }
  get text() { return `${this.code ? `${this.code}: ` : ''}${this.details || this.message}`; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class WhatsAppClient {
  constructor(env, { accessToken, phoneNumberId }) {
    const base = String(env.GRAPH_BASE_URL || 'https://graph.facebook.com').replace(/\/$/, '');
    this.endpoint = `${base}/${env.GRAPH_API_VERSION || 'v25.0'}/${phoneNumberId}/messages`;
    this.accessToken = accessToken;
  }

  async post(payload) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await sleep(attempt * 600);
      let res;
      try {
        res = await fetch(this.endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
        });
      } catch (err) {
        lastErr = new WhatsAppError(`Network error: ${err.message}`, { status: 0 });
        continue;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      const e = data?.error || {};
      lastErr = new WhatsAppError(e.message || `HTTP ${res.status}`, { status: res.status, code: e.code, details: e.error_data?.details || e.message });
      if (lastErr.permanent) break;
    }
    throw lastErr;
  }

  text(to, body) { return this.post({ to, type: 'text', text: { preview_url: false, body } }); }

  template(to, name, params = [], language = 'en') {
    const template = { name, language: { code: language } };
    if (params.length) template.components = [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }];
    return this.post({ to, type: 'template', template });
  }
}

/** WhatsApp message id from a send response. */
export const sentId = (res) => res?.messages?.[0]?.id || null;
