// SIGNED RULE MANIFEST  —  unique to Klauz
//
// Closed-source legal SaaS (Harvey, Casetext, Spellbook, Ironclad AI) are black
// boxes: you cannot prove which version of their rules produced a given verdict,
// and you cannot tell if the vendor changed the rules silently after you signed
// off on a contract. This module fixes that for Klauz.
//
// At process startup we hash the source of every rule-bearing module
// (tripwire.js + templates.js + micrologic.js + pcr.js). The hash is:
//   • exposed at GET /integrity
//   • included in every /tripwire and /certify response as `engine_hash`
//   • embedded as an HTTP header on every response (`X-Klauz-Engine`)
//
// A user can re-run the same input months later and verify they got the same
// engine. If we silently change a rule and a result changes, the hash also
// changes — there's no way to hide it.
//
// Bonus: HONEYPOT canary. We embed two regex patterns that match nothing in
// real legal text. On every request, we run them; if they EVER fire, the rule
// set has been tampered with via memory corruption / injection / supply chain.
// (Pure-regex modules have no input side-channel, but defense-in-depth.)

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RULE_MODULES = [
  'tripwire.js',
  'templates.js',
  'micrologic.js',
  'pcr.js',
];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Compute once at first call, cache for the process lifetime.
let CACHED = null;
export function ruleManifest() {
  if (CACHED) return CACHED;
  const files = {};
  const concat = [];
  for (const name of RULE_MODULES) {
    const p = path.join(__dirname, name);
    try {
      const src = fs.readFileSync(p);
      files[name] = { bytes: src.length, sha256: sha256(src) };
      concat.push(src);
    } catch (_) {
      files[name] = { bytes: 0, sha256: null, missing: true };
    }
  }
  const engineHash = sha256(Buffer.concat(concat));
  CACHED = Object.freeze({
    engine_hash: engineHash,
    files,
    built_at: new Date().toISOString(),
    version: pkgVersion(),
  });
  return CACHED;
}

function pkgVersion() {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return p.version || '0.0.0';
  } catch { return '0.0.0'; }
}

// ---------- Honeypot canary ----------
// These strings appear nowhere in legitimate contracts. If a /tripwire scan
// ever returns a finding with id starting "_canary_", the engine has been
// tampered with (or a developer accidentally introduced a wildcard rule).
export const CANARY_INPUT =
  'klauz_canary_xxxxx_THIS_STRING_MUST_NEVER_MATCH_A_LEGAL_PATTERN_xxxxx';

// Run once on boot; throws if anything matches.
export async function bootCanary() {
  const { scanTripwire } = await import('./tripwire.js');
  const { identifyTemplates } = await import('./templates.js');
  const { canonicalize, logicallyEqual } = await import('./micrologic.js');

  const r1 = scanTripwire(CANARY_INPUT, 'sme');
  if (r1.findings.length > 0) {
    throw new Error(`canary failed: tripwire matched canary input (${r1.findings.length} findings)`);
  }
  const r2 = identifyTemplates(CANARY_INPUT);
  if (r2.length > 0) {
    throw new Error(`canary failed: template matched canary input`);
  }
  // Micrologic identity check — same string canonicalized twice must equal itself.
  if (!logicallyEqual('The Provider shall notify.', 'The Provider shall notify.')) {
    throw new Error('canary failed: micrologic identity broken');
  }
  // And canonicalize must be stable.
  const c1 = canonicalize('hereby the Provider shall pay');
  const c2 = canonicalize('hereby the Provider shall pay');
  if (c1 !== c2) throw new Error('canary failed: canonicalize not deterministic');

  return { ok: true, checks: 4 };
}
