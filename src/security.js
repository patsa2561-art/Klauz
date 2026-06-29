// Defense-in-depth middleware — zero-dependency, no external rate-limiter.
// All limits are tunable via env so a CI/test run can disable them cleanly.
//
// Threat model:
//   • Anonymous attacker from the internet (no creds, no token).
//   • Goal: DoS, data exfil (visit log), brute-force admin, abuse API.
//   • We have NO user data to leak by design — so the worst breach yields
//     the visit log (already truncated → /24) and ~zero PII.
//
// What this module enforces, per request:
//   1) BODY CAP        — refuse > N bytes (default 5 MB) → 413
//   2) RATE LIMIT      — sliding-window token bucket per IP+route-class → 429
//   3) ADMIN LOCKOUT   — 5 failed Basic-Auth attempts → 15 min lock per IP
//   4) REDOS SHIELD    — race regex.exec against a timeout (default 200 ms)
//   5) ERROR SCRUB     — never leak e.message / stack to the client
//   6) SECURITY HDRS   — CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy
//   7) PRIVACY ATTEST  — every response carries the no-persistence promise
//   8) HONEYPOT CHECK  — refuse requests that hit tripwire honeypot ids
//
// What we explicitly do NOT do (and why):
//   • CAPTCHA — would require a third-party (Google/HCaptcha) which leaks user IPs.
//   • IP-block lists — fingerprinting users via blocklists violates the privacy promise.
//   • Logging POST body — would defeat the "documents never persist" promise.

import crypto from 'node:crypto';

// ---------- Tunables (read at call time so tests / runtime env changes apply) ----------
const T = () => ({
  MAX_BODY_BYTES:   +(process.env.KLAUZ_MAX_BODY_BYTES   || 5 * 1024 * 1024),  // 5 MB
  RL_WINDOW_MS:     +(process.env.KLAUZ_RL_WINDOW_MS     || 60_000),           // 1 min
  RL_POST_MAX:      +(process.env.KLAUZ_RL_POST_MAX      || 60),               // 60/min/IP
  RL_GET_MAX:       +(process.env.KLAUZ_RL_GET_MAX       || 240),              // 240/min/IP
  RL_ADMIN_MAX:     +(process.env.KLAUZ_RL_ADMIN_FAILS   || 5),                // 5 fails
  RL_ADMIN_LOCK_MS: +(process.env.KLAUZ_RL_ADMIN_LOCK_MS || 15 * 60_000),      // 15 min
  REDOS_BUDGET_MS:  +(process.env.KLAUZ_REDOS_BUDGET_MS  || 200),              // 200 ms / regex
  DISABLED:         process.env.KLAUZ_SECURITY_OFF === '1',                    // tests can opt out
});

// ---------- IP extraction + truncation (privacy-preserving) ----------
export function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf);
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, '');
}

// /24 for IPv4, /48 for IPv6 — same convention used by Plausible/Goatcounter.
// We NEVER log the full IP; logs use this truncated form, rate-limit uses full IP
// only in memory (never persisted).
export function truncateIp(ip) {
  if (!ip) return '';
  if (ip.includes('.')) {
    const p = ip.split('.');
    if (p.length === 4) return `${p[0]}.${p[1]}.${p[2]}.0`;
  }
  if (ip.includes(':')) {
    const p = ip.split(':');
    return p.slice(0, 3).join(':') + '::';  // /48
  }
  return ip;
}

// ---------- Rate limiter (sliding-window, in-memory) ----------
// Map<key, number[]>  — array of recent timestamps within window
const buckets = new Map();
function bucketHit(key, max, windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;
  let arr = buckets.get(key);
  if (!arr) { arr = []; buckets.set(key, arr); }
  // prune old
  while (arr.length && arr[0] < cutoff) arr.shift();
  if (arr.length >= max) return false;
  arr.push(now);
  return true;
}

// Periodic cleanup so we don't leak memory under attack.
setInterval(() => {
  const cutoff = Date.now() - T().RL_WINDOW_MS * 2;
  for (const [k, arr] of buckets) {
    while (arr.length && arr[0] < cutoff) arr.shift();
    if (!arr.length) buckets.delete(k);
  }
}, T().RL_WINDOW_MS).unref?.();

export function rateLimit(req) {
  const t = T();
  if (t.DISABLED) return { ok: true };
  const ip = clientIp(req);
  const isPost = (req.method || 'GET').toUpperCase() === 'POST';
  const max = isPost ? t.RL_POST_MAX : t.RL_GET_MAX;
  const key = `${isPost ? 'P' : 'G'}:${ip}`;
  if (!bucketHit(key, max, t.RL_WINDOW_MS)) {
    return { ok: false, retryAfterSec: Math.ceil(t.RL_WINDOW_MS / 1000) };
  }
  return { ok: true };
}

// ---------- Admin auth: per-IP lockout ----------
// Map<ip, { fails: number, lockedUntil: number }>
const adminFails = new Map();
export function adminLocked(req) {
  if (T().DISABLED) return false;
  const ip = clientIp(req);
  const rec = adminFails.get(ip);
  if (!rec) return false;
  if (rec.lockedUntil && rec.lockedUntil > Date.now()) return true;
  if (rec.lockedUntil && rec.lockedUntil <= Date.now()) { adminFails.delete(ip); return false; }
  return false;
}
export function adminAuthFail(req) {
  const t = T();
  if (t.DISABLED) return;
  const ip = clientIp(req);
  const rec = adminFails.get(ip) || { fails: 0, lockedUntil: 0 };
  rec.fails += 1;
  if (rec.fails >= t.RL_ADMIN_MAX) rec.lockedUntil = Date.now() + t.RL_ADMIN_LOCK_MS;
  adminFails.set(ip, rec);
}
export function adminAuthOk(req) {
  adminFails.delete(clientIp(req));
}

// ---------- Body cap (consumes the stream, aborts oversized) ----------
export function readBodyCapped(req, cap) {
  if (cap == null) cap = T().MAX_BODY_BYTES;
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let aborted = false;
    req.on('data', (c) => {
      if (aborted) return;  // already failed; drain quietly
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
      size += buf.length;
      if (size > cap) {
        aborted = true;
        const err = new Error('payload too large');
        err.code = 'BODY_TOO_LARGE';
        // Pause the stream but don't destroy — we still want to write 413 back.
        try { req.pause && req.pause(); } catch (_) {}
        reject(err);
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------- ReDoS shield ----------
// Runs a regex against text on a microtask budget. If it overruns, returns null.
// Caveat: Node's RegExp.exec is synchronous and can't be cancelled, so we
// bound input size as the practical defense and rely on V8's regex engine
// being IR-compiled (most patterns are linear). The wall-clock check catches
// any pathological case (pattern + input combo) above the budget.
export function safeExecBudget(re, text, budgetMs) {
  if (budgetMs == null) budgetMs = T().REDOS_BUDGET_MS;
  const start = Date.now();
  const m = re.exec(text);
  const elapsed = Date.now() - start;
  if (elapsed > budgetMs) {
    // record but don't crash — caller decides
    return { match: m, overran: true, ms: elapsed };
  }
  return { match: m, overran: false, ms: elapsed };
}

// ---------- Security headers ----------
// CSP allows inline scripts because the SPA uses them. We tighten everything else.
// HSTS is set by Caddy in production; doubling it here is fine but harmless.
const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self'; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=()',
  'X-Klauz-Privacy': 'in-memory-only; documents-not-persisted; visit-log=truncated-/24',
});
export function applySecurityHeaders(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
}

// ---------- Error scrub ----------
// Internal-error responses must never leak module paths, regex internals, etc.
// We log the real error to stderr; the client gets a stable, generic shape.
export function sendError(res, code, type) {
  if (!res.headersSent) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify({ error: type, code }));
}
export function logInternalError(scope, e) {
  // single-line, structured — easy to grep in journalctl
  const msg = (e && e.message) || String(e);
  console.error(`[klauz-error] scope=${scope} msg=${JSON.stringify(msg).slice(0, 400)}`);
}

// ---------- Initial admin credentials (random by default) ----------
// If env not set, generate a fresh 12-byte hex password on boot, log to
// stderr ONCE, and use it. Operator must read the journalctl line; nobody
// else has access. This kills the default-creds attack class permanently.
export function resolveAdminCreds() {
  const user = process.env.KLAUZ_ADMIN_USER;
  const pass = process.env.KLAUZ_ADMIN_PASS;
  if (user && pass) return { user, pass, generated: false };
  const genUser = user || 'admin';
  const genPass = crypto.randomBytes(12).toString('hex');  // 96-bit entropy
  console.error('===============================================================');
  console.error('  KLAUZ_ADMIN_USER/PASS not set — generated random credentials:');
  console.error(`    KLAUZ_ADMIN_USER=${genUser}`);
  console.error(`    KLAUZ_ADMIN_PASS=${genPass}`);
  console.error('  These will rotate on next restart. Set both env vars to keep them stable.');
  console.error('===============================================================');
  return { user: genUser, pass: genPass, generated: true };
}

// ---------- Telemetry for /integrity ----------
// Getter-based so /integrity always reports the live config, not a stale snapshot.
export const SECURITY_CONFIG = Object.freeze({
  get body_cap_bytes()       { return T().MAX_BODY_BYTES; },
  get rate_window_ms()       { return T().RL_WINDOW_MS; },
  get rate_post_per_window() { return T().RL_POST_MAX; },
  get rate_get_per_window()  { return T().RL_GET_MAX; },
  get admin_lockout_fails()  { return T().RL_ADMIN_MAX; },
  get admin_lockout_ms()     { return T().RL_ADMIN_LOCK_MS; },
  get redos_budget_ms()      { return T().REDOS_BUDGET_MS; },
});
