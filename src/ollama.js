// Ollama client — embeddings (bge-m3) + chat judge (llama3.3). Local, no API key.
import http from 'node:http';

const HOST = process.env.MEANINGDIFF_OLLAMA || 'http://127.0.0.1:11434';
// nomic-embed-text is the stable default — bge-m3 gives higher quality but has a
// real Ollama bug where some inputs return HTTP 500 NaN, triggering slow per-item
// fallback. Opt into bge-m3 via MEANINGDIFF_EMBED=bge-m3 if you want max quality.
// Mutable so auto-detection (capabilities.js) can point us at whatever model the
// user actually has installed, without anyone editing config or env vars.
let EMBED_MODEL = process.env.MEANINGDIFF_EMBED || 'nomic-embed-text';
let JUDGE_MODEL = process.env.MEANINGDIFF_JUDGE || 'gemma3:12b';
export function setModels({ judge, embed } = {}) {
  if (judge) JUDGE_MODEL = judge;
  if (embed) EMBED_MODEL = embed;
}

function postJSON(pathname, payload, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const u = new URL(HOST);
    const body = JSON.stringify(payload);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`Ollama ${res.statusCode}: ${data.slice(0, 200)}`));
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`bad JSON from ollama: ${data.slice(0, 200)}`)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('ollama timeout')); });
    req.write(body);
    req.end();
  });
}

// embed one string -> Float64Array
export async function embed(text) {
  const [v] = await embedWith(EMBED_MODEL, [text]); // shares transient-retry path
  if (!v) throw new Error('no embedding returned');
  return v;
}

const FALLBACK_EMBED = process.env.MEANINGDIFF_EMBED_FALLBACK || 'nomic-embed-text';

// Retry only on TRANSIENT failures (server busy / timeout / dropped socket).
// Deliberately does NOT retry 500 — bge-m3's NaN bug returns 500 on specific
// inputs and embedBatch relies on that throwing to trigger per-item fallback.
const isTransient = (msg) => /\b503\b|timeout|ECONNRESET|ECONNREFUSED|socket hang up|EPIPE/i.test(msg);

async function embedWith(model, inputs, retries = 4) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await postJSON('/api/embed', { model, input: inputs });
      if (!r.embeddings || r.embeddings.length !== inputs.length) {
        throw new Error(`embed batch mismatch: asked ${inputs.length}, got ${r.embeddings?.length}`);
      }
      return r.embeddings;
    } catch (e) {
      lastErr = e;
      if (attempt < retries && isTransient(e.message)) {
        await new Promise((r) => setTimeout(r, 600 * 2 ** attempt)); // 0.6s,1.2s,2.4s,4.8s
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// embed a batch -> array of vectors. Robust against the real bge-m3 bug where
// certain inputs make Ollama return 500 "json: unsupported value: NaN":
//   1) try primary model (batch)
//   2) on failure, retry per-item with primary (isolate the bad input)
//   3) for any item the primary still NaNs on, fall back to nomic-embed-text
// NOTE: mixing embedding models would break cosine, so if ANY item needs the
// fallback we re-embed the WHOLE batch with the fallback for consistency.
export async function embedBatch(texts) {
  if (texts.length === 0) return [];
  const safe = texts.map((t) => (t && t.trim()) ? t : '(empty)');
  try {
    return await embedWith(EMBED_MODEL, safe);
  } catch (e1) {
    // primary failed on the batch — check if ANY single item fails on primary
    let primaryBroken = false;
    for (const t of safe) {
      try { await embedWith(EMBED_MODEL, [t]); }
      catch (e2) { primaryBroken = true; break; }
    }
    if (primaryBroken) {
      // re-embed whole batch with fallback model so all vectors share a space
      return await embedWith(FALLBACK_EMBED, safe);
    }
    // primary works per-item but not as a batch -> embed item-by-item on primary
    const out = [];
    for (const t of safe) out.push((await embedWith(EMBED_MODEL, [t]))[0]);
    return out;
  }
}

// strict JSON judge — used ONLY for borderline pairs. Returns parsed object or null.
// Retries on timeout/transient errors (model eviction under concurrent load).
export async function judge(systemPrompt, userPrompt, timeoutMs = 180000, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await postJSON('/api/chat', {
        model: JUDGE_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        format: 'json',
        options: { temperature: 0 },
      }, timeoutMs);
      const content = r.message?.content;
      if (!content) return null;
      try { return JSON.parse(content); } catch (e) { return null; }
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function ping() {
  return new Promise((resolve) => {
    const u = new URL(HOST);
    const req = http.request({ hostname: u.hostname, port: u.port, path: '/api/tags', method: 'GET' }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { const j = JSON.parse(d); resolve({ ok: true, models: (j.models || []).map(m => m.name) }); }
        catch (e) { resolve({ ok: false }); }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.setTimeout(3000, () => { req.destroy(); resolve({ ok: false }); });
    req.end();
  });
}

// Getters so callers always read the CURRENT (possibly auto-detected) models.
export const MODELS = { get EMBED_MODEL() { return EMBED_MODEL; }, get JUDGE_MODEL() { return JUDGE_MODEL; }, HOST };
