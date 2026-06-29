// KLAUZ CHAIN  —  verifiable contract-review history (Node-side verifier).
//
// What this is, in one line:
//   A Merkle-flavoured hash chain that lets a user prove "these reviews
//   happened in this order on these inputs with this engine, and nothing was
//   added or changed retroactively" — purely client-side, no Klauz account,
//   no third-party trust, no blockchain.
//
// Why it matters (legal context):
//   Existing legal-tech tools (Harvey, Casetext, Spellbook, DocuSign,
//   Ironclad) sign *documents* and store reviews on their own servers.
//   None signs the *review verdict itself* in a way the user can verify
//   without trusting the vendor. Klauz Chain fixes that. It is the first
//   verifiable, vendor-independent, tamper-evident contract-review log.
//
// Trust model:
//   • SHA-256 collision resistance (same primitive as Bitcoin / Git / TLS).
//   • Each link binds prev_link || ts || engine_hash || kind || input_hash || output_hash.
//   • Any retroactive edit to entry N invalidates entries N..end (their
//     `prev` field no longer matches the hash of the modified entry).
//   • Genesis = 64 zero hex chars (0x00…). First entry's `prev` must be that.
//
// What this module does NOT do (intentionally):
//   • Does not call the network. Verification is a pure function.
//   • Does not store anything. Chains live in the user's browser localStorage
//     and / or a file they export — never on the Klauz server.
//   • Does not bind real-world identity. If the user wants signed-by-them
//     attestation, they can wrap the chain with their own PGP/WebAuthn key.

import crypto from 'node:crypto';

export const GENESIS_PREV = '0'.repeat(64);
export const CHAIN_VERSION = 'klauz-chain-v1';
const REQUIRED_FIELDS = ['seq', 'prev', 'ts', 'engine_hash', 'kind', 'input_hash', 'output_hash', 'link'];
const KIND_WHITELIST = new Set(['tripwire', 'templates', 'certify', 'diff', 'audit', 'lint']);

function sha256Hex(s) {
  return crypto.createHash('sha256').update(typeof s === 'string' ? s : Buffer.from(s)).digest('hex');
}

// Canonical preimage — order is fixed so any implementation (browser, node,
// CLI written in any language) produces the same link hash.
// We use a pipe separator + length prefixes so no field-boundary ambiguity.
function preimage(entry) {
  const parts = [
    String(entry.prev || ''),
    String(entry.ts || ''),
    String(entry.engine_hash || ''),
    String(entry.kind || ''),
    String(entry.input_hash || ''),
    String(entry.output_hash || ''),
  ];
  // length-prefix each field so a value that happens to contain '|' cannot
  // be shifted into the next slot. Format: `<len>:<value>` for each field.
  return parts.map((p) => `${p.length}:${p}`).join('|');
}

export function computeLink(entry) {
  return sha256Hex(preimage(entry));
}

// Build a new link to append to a chain. `prev` is the previous link's hash
// (or GENESIS_PREV for the first entry).
export function makeEntry({ prev, ts, engine_hash, kind, input_hash, output_hash, summary, seq }) {
  if (!KIND_WHITELIST.has(kind)) throw new Error(`unknown kind: ${kind}`);
  if (!/^[0-9a-f]{64}$/.test(prev || '')) throw new Error(`prev must be 64-hex; got ${prev}`);
  if (!/^[0-9a-f]{64}$/.test(engine_hash || '')) throw new Error(`engine_hash must be 64-hex`);
  if (!/^[0-9a-f]{64}$/.test(input_hash  || '')) throw new Error(`input_hash must be 64-hex`);
  if (!/^[0-9a-f]{64}$/.test(output_hash || '')) throw new Error(`output_hash must be 64-hex`);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(ts)) throw new Error(`ts must be ISO-8601`);
  const e = { seq, prev, ts, engine_hash, kind, input_hash, output_hash };
  e.link = computeLink(e);
  if (summary !== undefined) e.summary = summary;  // summary is metadata, not in preimage
  return e;
}

// Verify a chain end-to-end. Returns:
//   { ok: true, length, lastLink }                       — all good
//   { ok: false, brokenAt, reason, lastValidIndex }      — first break
export function verifyChain(chain) {
  if (!chain || typeof chain !== 'object') return { ok: false, reason: 'not_object' };
  if (chain.version !== CHAIN_VERSION) return { ok: false, reason: 'wrong_version' };
  const entries = chain.chain;
  if (!Array.isArray(entries)) return { ok: false, reason: 'no_chain_array' };
  if (entries.length === 0) return { ok: true, length: 0, lastLink: GENESIS_PREV };

  let expectedPrev = GENESIS_PREV;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    // shape check
    for (const f of REQUIRED_FIELDS) {
      if (!(f in e)) return { ok: false, brokenAt: i, reason: `missing_${f}`, lastValidIndex: i - 1 };
    }
    if (e.seq !== i) return { ok: false, brokenAt: i, reason: 'seq_mismatch', lastValidIndex: i - 1 };
    if (e.prev !== expectedPrev) return { ok: false, brokenAt: i, reason: 'prev_mismatch', lastValidIndex: i - 1 };
    // link integrity
    const recomputed = computeLink(e);
    if (recomputed !== e.link) return { ok: false, brokenAt: i, reason: 'link_mismatch', lastValidIndex: i - 1 };
    expectedPrev = e.link;
  }
  return { ok: true, length: entries.length, lastLink: expectedPrev };
}

// Convenience: hash a piece of user text the same way the browser will.
export function hashInput(text) {
  return sha256Hex(String(text || ''));
}

// Canonical hash of a verdict object (order-independent JSON).
export function hashOutput(verdict) {
  return sha256Hex(stableJSON(verdict));
}

function stableJSON(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableJSON).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableJSON(v[k])).join(',') + '}';
}

// Used by /chain/verify to surface a nice report for the UI / a lawyer.
export function describeVerification(result, chain) {
  const out = { verified: !!result.ok };
  if (result.ok) {
    const e = chain.chain;
    out.entries = e.length;
    out.first_ts = e.length ? e[0].ts : null;
    out.last_ts  = e.length ? e[e.length - 1].ts : null;
    out.last_link = result.lastLink;
    const engines = new Set(e.map((x) => x.engine_hash));
    out.engine_versions_used = engines.size;
    const kinds = {};
    for (const x of e) kinds[x.kind] = (kinds[x.kind] || 0) + 1;
    out.by_kind = kinds;
  } else {
    out.broken_at = result.brokenAt ?? null;
    out.reason = result.reason;
    out.last_valid_index = result.lastValidIndex ?? -1;
    out.proves_what =
      'Entries 0..lastValid are still cryptographically intact; everything after that index is untrusted.';
  }
  return out;
}
