// Local web server — zero dependencies (Node built-in http). Serves a file-picker
// UI so non-technical users (lawyers, ops) can drag-drop or browse two files and
// see the semantic diff + Power-Shift meter. Runs 100% local; nothing uploads.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { semanticDiff } from './diff.js';
import { extractText } from './extract.js';
import { ping } from './ollama.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });
}

export function serve(port = 7700, opts = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(HTML);
      }
      if (req.method === 'GET' && req.url === '/health') {
        const p = await ping();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, ollama: p.ok, models: p.models || [] }));
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
        const body = JSON.parse(await readBody(req));
        const tmp = path.join(os.tmpdir(), 'md-' + Date.now() + '-' + (body.filename || 'file.bin').replace(/[^\w.\-]/g, '_'));
        fs.writeFileSync(tmp, Buffer.from(body.dataBase64, 'base64'));
        try {
          const r = await extractText(tmp);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ text: r.text, engine: r.engine, format: r.format, pages: r.pages, sheets: r.sheets }));
        } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
      }
      if (req.method === 'POST' && req.url === '/diff') {
        const body = JSON.parse(await readBody(req));
        const parties = (body.parties || '').split(',').map((s) => s.trim()).filter(Boolean);
        const report = await semanticDiff(body.old || '', body.new || '', { parties });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(report));
      }
      if (req.method === 'POST' && req.url === '/audit') {
        const body = JSON.parse(await readBody(req));
        const parties = (body.parties || '').split(',').map((s) => s.trim()).filter(Boolean);
        const { auditDocument } = await import('./audit.js');
        const report = await auditDocument(body.text || '', { parties });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(report));
      }
      if (req.method === 'POST' && req.url === '/certify') {
        const body = JSON.parse(await readBody(req));
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
        const body = JSON.parse(await readBody(req));
        const { verify } = await import('./pcr.js');
        const result = verify(body.cert, body.old || '', body.new || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }
      if (req.method === 'POST' && req.url === '/lint') {
        const body = JSON.parse(await readBody(req));
        const { lint } = await import('./linter.js');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(lint(body.text || '')));
      }
      res.writeHead(404); res.end('not found');
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
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
