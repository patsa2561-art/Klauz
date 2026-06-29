// Defense-in-depth unit tests — body cap, rate limit, admin lockout, IP truncation,
// integrity manifest, boot canary, safe error scrub. Pure-logic tests; no HTTP server.

// Force-disable rate limiting for the unit suite UNLESS the test itself wants it on.
// Each test toggles env explicitly to keep determinism.
process.env.KLAUZ_SECURITY_OFF = '0';
process.env.KLAUZ_RL_POST_MAX = '5';
process.env.KLAUZ_RL_GET_MAX = '10';
process.env.KLAUZ_RL_WINDOW_MS = '60000';
process.env.KLAUZ_RL_ADMIN_FAILS = '3';
process.env.KLAUZ_RL_ADMIN_LOCK_MS = '60000';
process.env.KLAUZ_MAX_BODY_BYTES = '1024';
process.env.KLAUZ_ADMIN_USER = 'tester';
process.env.KLAUZ_ADMIN_PASS = 'secret123';

import {
  truncateIp, rateLimit, adminLocked, adminAuthFail, adminAuthOk,
  readBodyCapped, applySecurityHeaders, sendError, resolveAdminCreds,
  SECURITY_CONFIG,
} from '../src/security.js';
import { ruleManifest, bootCanary, CANARY_INPUT } from '../src/integrity.js';
import { Readable } from 'node:stream';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  \x1b[92m✓\x1b[0m ${n}`); } else { fail++; console.log(`  \x1b[91m✗ ${n}\x1b[0m`); } };
const S = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const mockReq = (ip, method = 'POST', headers = {}) => ({
  method,
  url: '/x',
  headers: { ...headers },
  socket: { remoteAddress: ip },
  on() {},
});

S('1. IP truncation — /24 IPv4, /48 IPv6');
ok('1.2.3.4 → 1.2.3.0',                              truncateIp('1.2.3.4') === '1.2.3.0');
ok('203.150.42.99 → 203.150.42.0',                   truncateIp('203.150.42.99') === '203.150.42.0');
ok('empty → empty',                                  truncateIp('') === '');
ok('IPv6 2001:db8::1 → /48 truncation',              truncateIp('2001:db8:1234:5678::1').startsWith('2001:db8:1234'));
ok('localhost IPv6 ::1 stays in shape',              truncateIp('::1').length > 0);

S('2. Rate limit — POST burst gets 429 after 5');
{
  const ip = '10.20.30.40';
  let allowed = 0;
  for (let i = 0; i < 8; i++) if (rateLimit(mockReq(ip, 'POST')).ok) allowed++;
  ok('exactly 5 POSTs allowed in window', allowed === 5);
}
{
  const ip = '10.20.30.50';  // different IP
  ok('different IP not affected', rateLimit(mockReq(ip, 'POST')).ok === true);
}
{
  const ip = '10.20.30.60';
  let allowed = 0;
  for (let i = 0; i < 12; i++) if (rateLimit(mockReq(ip, 'GET')).ok) allowed++;
  ok('GET has higher quota (10 allowed)', allowed === 10);
}

S('3. Admin lockout — 3rd failure locks the IP');
{
  const ip = '99.99.99.99';
  ok('initially not locked', adminLocked(mockReq(ip)) === false);
  adminAuthFail(mockReq(ip));
  adminAuthFail(mockReq(ip));
  ok('after 2 fails, still not locked', adminLocked(mockReq(ip)) === false);
  adminAuthFail(mockReq(ip));
  ok('after 3 fails, IP is locked',     adminLocked(mockReq(ip)) === true);
}
{
  const ip = '88.88.88.88';
  adminAuthFail(mockReq(ip));
  adminAuthFail(mockReq(ip));
  adminAuthOk(mockReq(ip));
  ok('successful auth resets the counter', adminLocked(mockReq(ip)) === false);
}

S('4. Body cap — rejects over the limit');
{
  const stream = Readable.from(['a'.repeat(2000)]);
  stream.headers = {}; stream.method = 'POST'; stream.url = '/x';
  stream.socket = { remoteAddress: '1.1.1.1' };
  let caught = false;
  await readBodyCapped(stream, 1024).catch((e) => { caught = e.code === 'BODY_TOO_LARGE'; });
  ok('payload > 1024 bytes → BODY_TOO_LARGE', caught);
}
{
  const stream = Readable.from(['short body']);
  stream.headers = {}; stream.method = 'POST'; stream.url = '/x';
  stream.socket = { remoteAddress: '1.1.1.1' };
  const body = await readBodyCapped(stream, 1024);
  ok('payload within cap returns body', body === 'short body');
}

S('5. Security headers — applied without overwriting body');
{
  const captured = {};
  const fakeRes = { setHeader: (k, v) => { captured[k] = v; } };
  applySecurityHeaders(fakeRes);
  ok('CSP set',                       /default-src 'self'/.test(captured['Content-Security-Policy']));
  ok('X-Frame-Options DENY',          captured['X-Frame-Options'] === 'DENY');
  ok('X-Content-Type-Options nosniff', captured['X-Content-Type-Options'] === 'nosniff');
  ok('Referrer-Policy set',           !!captured['Referrer-Policy']);
  ok('Permissions-Policy set',        /geolocation=\(\)/.test(captured['Permissions-Policy']));
  ok('X-Klauz-Privacy attestation',   /in-memory-only/.test(captured['X-Klauz-Privacy']));
}

S('6. sendError — never leaks internals');
{
  const chunks = [];
  let head = null;
  const fakeRes = {
    headersSent: false,
    writeHead(code, h) { head = { code, h }; this.headersSent = true; },
    end(s) { chunks.push(s); },
  };
  sendError(fakeRes, 500, 'internal_error');
  ok('writes JSON with code',         /"code":500/.test(chunks[0]) && /"error":"internal_error"/.test(chunks[0]));
  // No file paths, stack frames, "TypeError", or "at file://" should leak.
  ok('no stack / message leakage',    !/TypeError|at\s+file:|\/src\/|node_modules|stack|\.js:\d+/i.test(chunks[0]));
}

S('7. Admin creds — random generation when env unset');
{
  const stash = { u: process.env.KLAUZ_ADMIN_USER, p: process.env.KLAUZ_ADMIN_PASS };
  delete process.env.KLAUZ_ADMIN_USER;
  delete process.env.KLAUZ_ADMIN_PASS;
  // Suppress the boot banner in the test output.
  const origErr = console.error; console.error = () => {};
  const c = resolveAdminCreds();
  console.error = origErr;
  ok('generated flag set',            c.generated === true);
  ok('user defaults to "admin"',      c.user === 'admin');
  ok('password is 96-bit hex',        /^[0-9a-f]{24}$/.test(c.pass));
  process.env.KLAUZ_ADMIN_USER = stash.u;
  process.env.KLAUZ_ADMIN_PASS = stash.p;
}
{
  const c = resolveAdminCreds();
  ok('env-set creds preserved',       c.user === 'tester' && c.pass === 'secret123' && c.generated === false);
}

S('8. Rule manifest — stable, signed, traceable');
{
  const m = ruleManifest();
  ok('engine_hash is sha256 hex',     /^[0-9a-f]{64}$/.test(m.engine_hash));
  ok('manifest lists all rule files', ['tripwire.js','templates.js','micrologic.js','pcr.js'].every((f) => f in m.files));
  ok('per-file hashes present',       Object.values(m.files).every((f) => f.sha256 && /^[0-9a-f]{64}$/.test(f.sha256)));
  ok('built_at is ISO date',          /^\d{4}-\d{2}-\d{2}T/.test(m.built_at));
  ok('version present',               typeof m.version === 'string');
  const m2 = ruleManifest();
  ok('manifest is cached (same ref)', m === m2);
}

S('9. Boot canary — passes on clean engine');
{
  const r = await bootCanary();
  ok('boot canary passes',            r.ok === true && r.checks >= 4);
}

S('10. Honeypot input fires no patterns');
{
  const { scanTripwire } = await import('../src/tripwire.js');
  const { identifyTemplates } = await import('../src/templates.js');
  const r1 = scanTripwire(CANARY_INPUT, 'sme');
  ok('tripwire silent on canary',     r1.findings.length === 0);
  const r2 = identifyTemplates(CANARY_INPUT);
  ok('templates silent on canary',    r2.length === 0);
}

S('11. SECURITY_CONFIG exposed for /integrity transparency');
{
  ok('body_cap_bytes is number',      typeof SECURITY_CONFIG.body_cap_bytes === 'number');
  ok('rate_post_per_window is number', typeof SECURITY_CONFIG.rate_post_per_window === 'number');
  ok('config is frozen',              Object.isFrozen(SECURITY_CONFIG));
}

console.log(`\n\x1b[1mRESULT:\x1b[0m ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
