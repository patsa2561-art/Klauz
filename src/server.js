// Local web server — zero dependencies (Node built-in http). Serves a file-picker
// UI so non-technical users (lawyers, ops) can drag-drop or browse two files and
// see the semantic diff + Power-Shift meter. Runs 100% local; nothing uploads.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { semanticDiff } from './diff.js';
import { extractText } from './extract.js';
import { ping } from './ollama.js';
import { logVisit, readVisits } from './visits.js';
import {
  rateLimit, adminLocked, adminAuthFail, adminAuthOk,
  readBodyCapped, applySecurityHeaders, sendError, logInternalError,
  resolveAdminCreds, SECURITY_CONFIG,
} from './security.js';
import { ruleManifest, bootCanary } from './integrity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const ADMIN_HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');

// Admin gate — random by default; override via env in production.
const ADMIN = resolveAdminCreds();
// Paths we don't want polluting the visit log (admin self-views, health checks, etc).
const SKIP_LOG = /^\/(admin007|health|capabilities|favicon|integrity)/;

// Constant-time string compare — defends against timing-based credential probes.
function safeEq(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function checkAdminAuth(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  try {
    const [u, p] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':');
    return safeEq(u, ADMIN.user) && safeEq(p, ADMIN.pass);
  } catch { return false; }
}

// Parse JSON without ever leaking parser internals — invalid body → empty object.
// The caller defensively reads `body.text`, `body.old`, etc. with `|| ''` so the
// empty-object fallback is safe and prevents 500s on garbage input.
function safeParseBody(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { __parseError: true }; }
}

export function serve(port = 7700, opts = {}) {
  // Boot canary — refuse to start if rule modules are tampered with.
  bootCanary().then(
    (r) => console.log(`  ✓ engine canary passed (${r.checks} checks); engine_hash=${ruleManifest().engine_hash.slice(0, 16)}…`),
    (e) => { console.error(`  ✗ engine canary FAILED: ${e.message}`); process.exit(2); }
  );

  const server = http.createServer(async (req, res) => {
    // Defense headers applied to EVERY response (including 404/500).
    applySecurityHeaders(res);
    res.setHeader('X-Klauz-Engine', ruleManifest().engine_hash.slice(0, 32));
    try {
      // Rate limit BEFORE body read — cheap reject for hot loops.
      const rl = rateLimit(req);
      if (!rl.ok) {
        res.setHeader('Retry-After', String(rl.retryAfterSec));
        return sendError(res, 429, 'rate_limited');
      }

      // Visit logger — silently records IP/country/path for the admin page.
      // Skips noisy endpoints + the admin page itself so it doesn't pollute the log.
      if (!SKIP_LOG.test(req.url || '')) logVisit(req);

      // ADMIN — HTTP Basic auth + per-IP lockout after repeated failures.
      if (req.method === 'GET' && (req.url === '/admin007' || req.url.startsWith('/admin007?') || req.url.startsWith('/admin007/'))) {
        if (adminLocked(req)) {
          res.setHeader('Retry-After', '900');
          return sendError(res, 429, 'admin_locked_too_many_failed_attempts');
        }
        if (!checkAdminAuth(req)) {
          adminAuthFail(req);
          res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Klauz Admin", charset="UTF-8"', 'Content-Type': 'text/plain' });
          return res.end('Authentication required');
        }
        adminAuthOk(req);
        const u = new URL(req.url, 'http://x');
        if (u.pathname === '/admin007/data') {
          const page = parseInt(u.searchParams.get('page') || '1', 10) || 1;
          const per = parseInt(u.searchParams.get('per') || '20', 10) || 20;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(readVisits(page, Math.min(50, Math.max(5, per)))));
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(ADMIN_HTML);
      }

      // serve the SPA on / and /index.html (query strings ok: /?utm=... still works)
      const _pn = (req.url || '').split('?')[0];
      if (req.method === 'GET' && (_pn === '/' || _pn === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(HTML);
      }
      if (req.method === 'GET' && req.url === '/health') {
        const p = await ping();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, ollama: p.ok, models: p.models || [] }));
      }
      if (req.method === 'GET' && req.url === '/integrity') {
        // Signed rule manifest — verifiable engine identity. Unique to Klauz.
        // Lets users prove which version of the rules produced their verdict.
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ...ruleManifest(), security: SECURITY_CONFIG }));
      }
      if (req.method === 'GET' && req.url === '/capabilities') {
        // Auto-detect a local LLM and wire it (smart mode) or report deterministic mode.
        const { autoConfigure } = await import('./capabilities.js');
        const cap = await autoConfigure();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(cap));
      }
      if (req.method === 'POST' && req.url === '/extract') {
        // { filename, dataBase64 } -> extract real text from docx/pdf/xlsx/image
        const body = safeParseBody(await readBodyCapped(req));
        const tmp = path.join(os.tmpdir(), 'md-' + Date.now() + '-' + (body.filename || 'file.bin').replace(/[^\w.\-]/g, '_'));
        fs.writeFileSync(tmp, Buffer.from(body.dataBase64, 'base64'));
        try {
          const r = await extractText(tmp);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ text: r.text, engine: r.engine, format: r.format, pages: r.pages, sheets: r.sheets }));
        } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
      }
      if (req.method === 'POST' && req.url === '/diff') {
        const body = safeParseBody(await readBodyCapped(req));
        const parties = (body.parties || '').split(',').map((s) => s.trim()).filter(Boolean);
        const report = await semanticDiff(body.old || '', body.new || '', { parties });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(report));
      }
      if (req.method === 'POST' && req.url === '/audit') {
        const body = safeParseBody(await readBodyCapped(req));
        const parties = (body.parties || '').split(',').map((s) => s.trim()).filter(Boolean);
        const { auditDocument } = await import('./audit.js');
        const report = await auditDocument(body.text || '', { parties });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(report));
      }
      if (req.method === 'POST' && req.url === '/certify') {
        const body = safeParseBody(await readBodyCapped(req));
        const { certify, describe } = await import('./pcr.js');
        const { autoConfigure } = await import('./capabilities.js');
        const parties = (body.parties || '').split(',').map((s) => s.trim()).filter(Boolean);
        const cap = await autoConfigure();
        let annotate;
        if (cap.llm) { const { tribunalAnnotator } = await import('./tribunal.js'); annotate = tribunalAnnotator(parties); }
        const cert = await certify(body.old || '', body.new || '', { annotate });
        const rows = cert.entries.filter((e) => e.verdict !== 'IDENTICAL')
          .map((e) => ({
            verdict: e.verdict, proven: e.verdict !== 'TEXT_CHANGED',
            tier: (e.meaning && e.meaning.tier) || (e.verdict !== 'TEXT_CHANGED' ? 'PROVEN' : null),
            en: describe(e, 'en'), th: describe(e, 'th'),
          }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ cert, rows, capability: { llm: cap.llm, judge: cap.judge, mode: cap.mode } }));
      }
      if (req.method === 'POST' && req.url === '/verify') {
        const body = safeParseBody(await readBodyCapped(req));
        const { verify } = await import('./pcr.js');
        const result = verify(body.cert, body.old || '', body.new || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }
      if (req.method === 'POST' && req.url === '/lint') {
        const body = safeParseBody(await readBodyCapped(req));
        const { lint } = await import('./linter.js');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(lint(body.text || '')));
      }
      if (req.method === 'POST' && req.url === '/tripwire') {
        // Context-aware legal tripwire — pure rules, persona-weighted risk.
        // Response carries engine_hash so the verdict can be tied to a specific rule set.
        const body = safeParseBody(await readBodyCapped(req));
        const { scanTripwire } = await import('./tripwire.js');
        const out = scanTripwire(body.text || '', body.persona || 'sme');
        out.engine_hash = ruleManifest().engine_hash;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(out));
      }
      if (req.method === 'POST' && req.url === '/templates') {
        // Template fingerprint — known ToS signatures + known-issue annotations.
        const body = safeParseBody(await readBodyCapped(req));
        const { identifyTemplates } = await import('./templates.js');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ matches: identifyTemplates(body.text || ''), engine_hash: ruleManifest().engine_hash }));
      }
      if (req.method === 'GET' && _pn === '/journey') {
        // Personal Klauz Graph — client-side localStorage page (privacy preserving:
        // history never reaches the server, lives only in the user's browser).
        try {
          const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'journey.html'), 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(html);
        } catch (e) { /* fall through to 404 */ }
      }
      return sendError(res, 404, 'not_found');
    } catch (e) {
      if (e && e.code === 'BODY_TOO_LARGE') {
        return sendError(res, 413, 'payload_too_large');
      }
      logInternalError(req.url || '?', e);
      // Generic shape; never leak e.message / stack / module paths to the client.
      return sendError(res, 500, 'internal_error');
    }
  });
  // Default bind = loopback only ("local only — documents never leave this machine").
  // For public hosting (e.g. behind Caddy/Cloudflare) set MEANINGDIFF_HOST=0.0.0.0.
  const HOST = opts.host || process.env.MEANINGDIFF_HOST || '127.0.0.1';
  server.listen(port, HOST, () => {
    const isLocal = HOST === '127.0.0.1' || HOST === '::1';
    console.log(`\n  meaningdiff web UI → http://${HOST}:${port}`);
    console.log(isLocal
      ? '  (local only · your documents never leave this machine)'
      : `  ⚠ public bind (${HOST}) — documents reach this server (put behind a reverse proxy / Cloudflare)`);
    console.log('  Ctrl-C to stop.\n');
  });
  return server;
}
