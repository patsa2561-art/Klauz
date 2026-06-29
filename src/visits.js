// Lightweight visit logger — append-only JSONL with size-based rotation.
// One entry per real user request (admin/health/capabilities are skipped).
// Country comes from CF-IPCountry when behind a Cloudflare proxy; otherwise blank.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = process.env.KLAUZ_VISITS_LOG || path.join(__dirname, '..', '.klauz-visits.log');
const MAX_BYTES = 50 * 1024 * 1024; // rotate at ~50 MB (rename → .1)

function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf);
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return String(req.socket && req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

export function logVisit(req) {
  try {
    const entry = {
      t: new Date().toISOString(),
      ip: clientIp(req),
      country: String(req.headers['cf-ipcountry'] || '').toUpperCase(),
      method: req.method || '',
      path: String(req.url || '').slice(0, 300),
      ua: String(req.headers['user-agent'] || '').slice(0, 200),
      ref: String(req.headers.referer || '').slice(0, 200),
    };
    try {
      const s = fs.statSync(LOG_PATH);
      if (s.size > MAX_BYTES) fs.renameSync(LOG_PATH, LOG_PATH + '.1');
    } catch (_) { /* file doesn't exist yet — fine */ }
    fs.appendFile(LOG_PATH, JSON.stringify(entry) + '\n', () => {});
  } catch (_) { /* never crash the request on logging */ }
}

// Newest-first paginated read + aggregate stats over the whole log.
export function readVisits(page = 1, perPage = 20) {
  let raw = '';
  try { raw = fs.readFileSync(LOG_PATH, 'utf8'); } catch (_) {}
  const lines = raw.trim() ? raw.trim().split('\n').filter(Boolean) : [];
  lines.reverse(); // newest first

  const total = lines.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(Math.max(1, page | 0), totalPages);
  const start = (p - 1) * perPage;
  const rows = lines.slice(start, start + perPage)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  const ips = new Set();
  const countries = {};
  let last24 = 0;
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const l of lines) {
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (e.ip) ips.add(e.ip);
    if (e.country) countries[e.country] = (countries[e.country] || 0) + 1;
    if (Date.parse(e.t) >= cutoff) last24++;
  }
  const top = Object.entries(countries).sort((a, b) => b[1] - a[1])[0];

  return {
    rows, total, page: p, totalPages, perPage,
    stats: {
      uniqueIps: ips.size,
      last24h: last24,
      topCountry: top ? `${top[0]} (${top[1]})` : '—',
    },
  };
}
