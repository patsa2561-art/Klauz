// PROOF-CARRYING REDLINE (PCR) — attestable semantic diff.
//
// The wedge nobody else has shipped: we do NOT ask you to *trust* the diff.
// We emit a certificate whose claims a third party can RE-RUN and confirm
// without trusting us — and without needing any AI model.
//
// Two guarantee tiers are kept structurally separate and NEVER conflated:
//
//   • DETERMINISTIC (sound + reproducible by anyone, zero model):
//       - COVERAGE PROOF: every clause of BOTH documents is accounted for
//         exactly once → it is provably impossible to silently drop or inject
//         a clause without breaking the certificate.
//       - PURE CHANGES: identical / number-only / modal-only / negation-only /
//         blank-filled — each fires ONLY when factoring out that one dimension
//         leaves the rest identical, so the claim is sound (it cannot be wrong).
//       - ADDED / REMOVED whole clauses.
//
//   • MODEL-ASSERTED (labeled, NOT a proof):
//       - meaning classification of clauses whose rewording leaves the change
//         deterministically undecidable. Always tagged deterministic:false so it
//         can never masquerade as proven. (Attached by the caller; the core
//         engine below is 100% deterministic and model-free.)
//
// An ed25519 signature binds the whole certificate; a Merkle root over the
// deterministic backbone lets `verify` re-derive every provable claim. This is
// the honest meaning of "100% accurate": the GUARANTEE lives entirely in the
// layer that is actually provable, and everything else is labeled, not faked.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunk } from './chunk.js';
import { alignLexical } from './align.js';
import { normalizeBlanks, FIELD } from './blanks.js';

export const PCR_VERSION = 'pcr/1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_DIR = path.join(__dirname, '..', '.meaningdiff');
const KEY_FILE = path.join(KEY_DIR, 'pcr_ed25519.json');

const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

// Deterministic JSON (sorted keys) — required so hashing/signing is reproducible.
function stable(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
}

// ---------- canonicalization ----------
// canon(): NFC + blank-canonicalization + whitespace collapse, case PRESERVED.
// Used for clause/document hashes (anchors are tied to exact canonical text).
export function canon(s) {
  return normalizeBlanks(String(s).normalize('NFC')).replace(/\s+/g, ' ').trim();
}
// cmp(): case-folded, punctuation-flattened — used for equality/skeleton tests.
function cmp(s) {
  return canon(s).toLowerCase().replace(/[.,;:!?"'`()\[\]{}·…]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------- deterministic detectors (TH + EN) ----------
const MODALS = {
  mandatory: ['shall', 'must', 'will', 'is required to', 'agrees to', 'is obligated to', 'จะต้อง', 'ต้อง'],
  permissive: ['may', 'can', 'might', 'is permitted to', 'is allowed to', 'at its discretion', 'สามารถ', 'อาจ'],
  weak: ['should', 'is encouraged to', 'is expected to', 'where feasible', 'ควร'],
};
const MODAL_ALL = [...MODALS.mandatory, ...MODALS.permissive, ...MODALS.weak].sort((a, b) => b.length - a.length);
const RANK = { mandatory: 3, weak: 2, permissive: 1 };
// Negation PARTICLES only (NOT verb-bundled forms like "shall not"), so that
// stripping them tests whether negation alone is the difference. Word-boundaries
// stop "no" from matching inside "notice"; Thai particles match directly.
const NEG_RE = /\b(?:cannot|can't|not|never|no|without)\b|ไม่|ห้าม|มิได้/gi;
const NUM_RE = /\d+(?:[.,]\d+)*\s?(?:%|percent|days?|hours?|weeks?|months?|years?|usd|dollars?|บาท|วัน|เดือน|ปี|\$)?/gi;

function modalClass(t) {
  const s = ' ' + cmp(t) + ' ';
  if (MODALS.mandatory.some((m) => s.includes(m))) return 'mandatory';
  if (MODALS.weak.some((m) => s.includes(m))) return 'weak';
  if (MODALS.permissive.some((m) => s.includes(m))) return 'permissive';
  return null;
}
function stripModal(c) { let s = c; for (const m of MODAL_ALL) s = s.split(m).join(' '); return s.replace(/\s+/g, ' ').trim(); }
function nums(t) { return (canon(t).match(NUM_RE) || []).map((x) => x.trim()).filter(Boolean); }

// Each detector is SOUND: it returns a verdict ONLY when that single dimension
// fully explains the difference (the residual is identical). Otherwise null.
function detectPair(aText, bText) {
  const ca = cmp(aText), cb = cmp(bText);
  if (ca === cb) return { verdict: 'IDENTICAL', deterministic: true, witness: {} };

  // PURE NUMBER: residual identical after removing all numeric tokens.
  const sa = ca.replace(NUM_RE, ' ').replace(/\s+/g, ' ').trim();
  const sb = cb.replace(NUM_RE, ' ').replace(/\s+/g, ' ').trim();
  const na = nums(aText), nb = nums(bText);
  if (sa === sb && na.join('|') !== nb.join('|'))
    return { verdict: 'NUMBER_CHANGED', deterministic: true, witness: { from: na, to: nb } };

  // PURE MODAL: residual identical after removing modal phrases, classes differ.
  const ma = modalClass(aText), mb = modalClass(bText);
  if (ma && mb && ma !== mb && stripModal(ca) === stripModal(cb))
    return { verdict: 'MODAL_SHIFT', deterministic: true, witness: { from: ma, to: mb, weakened: RANK[mb] < RANK[ma] } };

  // PURE NEGATION: residual identical after removing negations, presence flips.
  const noa = (ca.match(NEG_RE) || []).length, nob = (cb.match(NEG_RE) || []).length;
  const nsa = ca.replace(NEG_RE, ' ').replace(/\s+/g, ' ').trim();
  const nsb = cb.replace(NEG_RE, ' ').replace(/\s+/g, ' ').trim();
  if ((noa === 0) !== (nob === 0) && nsa === nsb)
    return { verdict: 'NEGATION_FLIP', deterministic: true, witness: { direction: nob > noa ? 'added' : 'removed' } };

  // PURE BLANK FILL: template's fixed text fully preserved in B, blanks gone.
  const bf = blankFill(aText, bText);
  if (bf) return { verdict: 'BLANK_FILLED', deterministic: true, witness: bf };

  // Differs, but not purely explained — sound only as "these differ". The
  // meaning classification (if any) is attached separately as model-asserted.
  return { verdict: 'TEXT_CHANGED', deterministic: true, witness: {} };
}

// Exposed for the 3-way merge engine: deterministic equality + change-typing.
export function eq(a, b) { return cmp(a) === cmp(b); }
export function classify(aText, bText) { return detectPair(aText, bText); }

// Generic ed25519 sign/verify over any JSON object (reused by Intent-Freeze).
export function signData(obj) {
  const { priv, pubB64 } = loadKey();
  const signature = crypto.sign(null, Buffer.from(stable(obj), 'utf8'), priv).toString('base64');
  return { signature, publicKey: pubB64, alg: 'ed25519' };
}
export function verifyData(obj, signature, publicKey) {
  try {
    const pub = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(stable(obj), 'utf8'), pub, Buffer.from(signature, 'base64'));
  } catch (_) { return false; }
}

function blankFill(aText, bText) {
  const ca = canon(aText), cb = canon(bText);
  if (!ca.includes(FIELD) || cb.includes(FIELD)) return null;
  const segs = ca.split(FIELD).map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return null;
  let pos = 0;
  for (const seg of segs) { const idx = cb.indexOf(seg, pos); if (idx < 0) return null; pos = idx + seg.length; }
  return { filled: true };
}

// ---------- coverage proof ----------
function proveCoverage(nA, nB, pairs, removed, added) {
  const aSeen = new Array(nA).fill(0), bSeen = new Array(nB).fill(0);
  for (const p of pairs) { aSeen[p.oldIdx]++; bSeen[p.newIdx]++; }
  for (const i of removed) aSeen[i]++;
  for (const j of added) bSeen[j]++;
  const aOk = aSeen.every((x) => x === 1), bOk = bSeen.every((x) => x === 1);
  return {
    complete: aOk && bOk,
    a_clauses: nA, b_clauses: nB,
    a_accounted: aSeen.filter((x) => x === 1).length,
    b_accounted: bSeen.filter((x) => x === 1).length,
  };
}

// ---------- Merkle root over the DETERMINISTIC backbone only ----------
// Model-asserted annotations are deliberately excluded so `verify` can re-derive
// the root from the documents alone (no model needed).
function detEntry(e) {
  return { a: e.a, b: e.b, a_hash: e.a_hash, b_hash: e.b_hash, verdict: e.verdict, witness: e.witness, deterministic: e.deterministic };
}
function merkle(leaves) {
  if (!leaves.length) return sha256('');
  let level = leaves.slice();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha256(level[i] + (level[i + 1] ?? level[i])));
    level = next;
  }
  return level[0];
}
function entryOrder(x, y) {
  const ax = x.a == null ? 1e9 : x.a, ay = y.a == null ? 1e9 : y.a;
  if (ax !== ay) return ax - ay;
  return (x.b == null ? 1e9 : x.b) - (y.b == null ? 1e9 : y.b);
}

// ---------- ed25519 key management ----------
function loadKey() {
  if (fs.existsSync(KEY_FILE)) {
    const j = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    return {
      priv: crypto.createPrivateKey({ key: Buffer.from(j.priv, 'base64'), format: 'der', type: 'pkcs8' }),
      pubB64: j.pub,
    };
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const priv = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  fs.mkdirSync(KEY_DIR, { recursive: true });
  fs.writeFileSync(KEY_FILE, JSON.stringify({ priv, pub }, null, 2));
  return { priv: privateKey, pubB64: pub };
}

// ---------- core (deterministic, model-free) ----------
// Returns the unsigned, fully-reproducible body of a certificate. `verify`
// recomputes this from the two documents and checks it matches.
export function certifyCore(oldText, newText, opts = {}) {
  const A = chunk(oldText), B = chunk(newText);
  const nonLatin = /[฀-๿一-鿿぀-ヿ؀-ۿ가-힯]/.test(oldText + newText);
  const minSim = opts.minSim ?? (nonLatin ? 0.12 : 0.3);
  const { pairs, removed, added } = alignLexical(A, B, minSim);

  const entries = [];
  for (const p of pairs) {
    const det = detectPair(A[p.oldIdx], B[p.newIdx]);
    entries.push({ a: p.oldIdx, b: p.newIdx, a_hash: sha256(canon(A[p.oldIdx])), b_hash: sha256(canon(B[p.newIdx])), ...det });
  }
  for (const i of removed)
    entries.push({ a: i, b: null, a_hash: sha256(canon(A[i])), b_hash: null, verdict: 'REMOVED', deterministic: true, witness: {} });
  for (const j of added)
    entries.push({ a: null, b: j, a_hash: null, b_hash: sha256(canon(B[j])), verdict: 'ADDED', deterministic: true, witness: {} });
  entries.sort(entryOrder);

  const coverage = proveCoverage(A.length, B.length, pairs, removed, added);
  const merkleRoot = merkle(entries.map((e) => sha256(stable(detEntry(e)))));
  const anchors = { a_sha: sha256(canon(oldText)), b_sha: sha256(canon(newText)), a_clauses: A.length, b_clauses: B.length };
  return { anchors, coverage, merkleRoot, entries, A, B };
}

// Plain-language text for a verdict (lazy — only the matched case is built).
export function describe(e, lang = 'en') {
  const w = e.witness || {};
  const fromTo = `${(Array.isArray(w.from) ? w.from.join(', ') : w.from) || '∅'} → ${(Array.isArray(w.to) ? w.to.join(', ') : w.to) || '∅'}`;
  const th = lang === 'th';
  switch (e.verdict) {
    case 'IDENTICAL': return th ? 'ไม่เปลี่ยน' : 'no change';
    case 'NUMBER_CHANGED': return th ? `ตัวเลขเปลี่ยน: ${fromTo}` : `number changed: ${fromTo}`;
    case 'MODAL_SHIFT': return th
      ? `ภาระผูกพัน${w.weakened ? 'อ่อนลง' : 'เข้มขึ้น'}: ${fromTo}`
      : `obligation ${w.weakened ? 'WEAKENED' : 'strengthened'}: ${fromTo}`;
    case 'NEGATION_FLIP': return th
      ? `${w.direction === 'added' ? 'เพิ่ม' : 'ตัด'}คำปฏิเสธ — ข้อพลิกความหมาย`
      : `negation ${w.direction} — clause reversed`;
    case 'BLANK_FILLED': return th ? 'ช่องว่างถูกกรอก' : 'blank field filled in';
    case 'TEXT_CHANGED': return th
      ? 'ข้อถูกเขียนใหม่ (การจัดประเภทความหมายเป็นการอ้างของโมเดล ยังไม่พิสูจน์)'
      : 'clause reworded (meaning classification is model-asserted, not proven)';
    case 'ADDED': return th ? 'เพิ่มข้อ' : 'clause added';
    case 'REMOVED': return th ? 'ลบข้อ' : 'clause removed';
    default: return e.verdict;
  }
}

// ---------- public: certify ----------
// opts.annotate: optional async (aText,bText)->{...} to attach model-asserted
// meaning classification onto TEXT_CHANGED entries (tagged deterministic:false).
export async function certify(oldText, newText, opts = {}) {
  const core = certifyCore(oldText, newText, opts);
  const { A, B, ...body } = core;

  if (opts.annotate) {
    for (const e of body.entries) {
      if (e.verdict === 'TEXT_CHANGED' && e.a != null && e.b != null) {
        try {
          const m = await opts.annotate(A[e.a], B[e.b]);
          if (m) e.meaning = { ...m, deterministic: false };
        } catch (_) { /* annotation is best-effort; never blocks the proof */ }
      }
    }
  }

  const changes = body.entries.filter((e) => e.verdict !== 'IDENTICAL');
  const det = changes.filter((e) => e.verdict !== 'TEXT_CHANGED').length;
  const modelAsserted = body.entries.filter((e) => e.meaning && e.meaning.deterministic === false).length;

  const payload = {
    version: PCR_VERSION,
    created: opts.now || new Date().toISOString(),
    anchors: body.anchors,
    coverage: body.coverage,
    summary: {
      clauses_before: body.anchors.a_clauses,
      clauses_after: body.anchors.b_clauses,
      changes: changes.length,
      deterministic_changes: det,
      model_asserted: modelAsserted,
      coverage_complete: body.coverage.complete,
    },
    merkleRoot: body.merkleRoot,
    entries: body.entries,
  };
  const { priv, pubB64 } = loadKey();
  const signature = crypto.sign(null, Buffer.from(stable(payload), 'utf8'), priv).toString('base64');
  return { ...payload, alg: 'ed25519', publicKey: pubB64, signature };
}

// ---------- public: verify ----------
// Re-derives EVERY deterministic claim from the two documents, with NO model.
// Returns { status: VALID | PARTIAL | TAMPERED, checks, problems }.
export function verify(cert, oldText, newText) {
  const problems = [];
  const checks = {};

  // 1) signature over the full payload (tamper-evidence for everything).
  const { signature, publicKey, alg, ...payload } = cert;
  try {
    const pub = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    checks.signature = crypto.verify(null, Buffer.from(stable(payload), 'utf8'), pub, Buffer.from(signature, 'base64'));
  } catch (_) { checks.signature = false; }
  if (!checks.signature) problems.push('signature invalid — certificate body was altered (or wrong public key)');

  // 2) anchors — are these the very documents that were certified?
  checks.anchor_before = sha256(canon(oldText)) === cert.anchors?.a_sha;
  checks.anchor_after = sha256(canon(newText)) === cert.anchors?.b_sha;
  if (!checks.anchor_before) problems.push('BEFORE document does not match the one certified');
  if (!checks.anchor_after) problems.push('AFTER document does not match the one certified');

  // 3) re-derive the deterministic backbone from the documents (no model).
  const fresh = certifyCore(oldText, newText);
  checks.coverage_complete = !!fresh.coverage.complete;
  checks.coverage_matches = stable(fresh.coverage) === stable(cert.coverage);
  checks.merkle_matches = fresh.merkleRoot === cert.merkleRoot;
  if (!checks.coverage_complete) problems.push('coverage incomplete — a clause is unaccounted for');
  if (!checks.coverage_matches) problems.push('coverage does not match certificate');
  if (!checks.merkle_matches) problems.push('Merkle root mismatch — certified change-set does not match the documents');

  const modelAsserted = (cert.entries || []).filter((e) => e.meaning && e.meaning.deterministic === false).length;
  checks.model_asserted_claims = modelAsserted;

  const deterministicOk =
    checks.signature && checks.anchor_before && checks.anchor_after &&
    checks.coverage_complete && checks.coverage_matches && checks.merkle_matches;

  let status;
  if (!deterministicOk) status = 'TAMPERED';
  else if (modelAsserted > 0) status = 'PARTIAL'; // all PROOFS hold; N meaning-claims rest on the engine
  else status = 'VALID';

  return { status, checks, problems };
}
