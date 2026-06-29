// CLAUSE FINGERPRINT — "Shazam for contract clauses".
// We reduce each clause to a meaning SKELETON (party names → PARTY, numbers/
// dates/money → #, punctuation stripped) and hash it. Same legal substance →
// same fingerprint, even if names/amounts differ. That lets you: spot the same
// risky clause recurring across many contracts, and match clauses against a
// library of known-predatory patterns. Fully deterministic.
import crypto from 'node:crypto';
import { chunk } from './chunk.js';
import { canon } from './pcr.js';

const NUM = /\d+(?:[.,]\d+)*\s?(?:%|percent|days?|hours?|weeks?|months?|years?|usd|dollars?|บาท|วัน|เดือน|ปี|\$)?/gi;
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

export function skeleton(clause, parties = []) {
  let s = canon(clause).toLowerCase();
  for (const p of parties) if (p) s = s.split(p.toLowerCase()).join(' party ');
  s = s.replace(NUM, ' # ').replace(/[^\p{L}\p{N}# ]/gu, ' ').replace(/\s+/g, ' ').trim();
  return s;
}
export function fingerprint(clause, parties = []) { return sha(skeleton(clause, parties)).slice(0, 16); }

export function fingerprintClauses(text, parties = []) {
  return chunk(text).map((c) => ({ clause: c, fp: fingerprint(c, parties), skeleton: skeleton(c, parties) }));
}

// Across MANY documents: which clauses recur, and where?
export function recurring(docs, parties = []) {
  const map = new Map(); // fp -> { skeleton, hits:[{doc, clause}] }
  docs.forEach((text, d) => {
    for (const c of chunk(text)) {
      const fp = fingerprint(c, parties);
      if (!map.has(fp)) map.set(fp, { fp, skeleton: skeleton(c, parties), hits: [] });
      map.get(fp).hits.push({ doc: d, clause: c });
    }
  });
  return [...map.values()].filter((e) => new Set(e.hits.map((h) => h.doc)).size >= 2)
    .sort((a, b) => b.hits.length - a.hits.length);
}

// Starter library of well-known one-sided / risky clause patterns. Deterministic
// keyword match on the skeleton. Honest: this is a SEED list to extend, not law.
export const RISK_LIBRARY = [
  { name: 'unlimited liability', en: 'Liability is uncapped/unlimited', th: 'รับผิดแบบไม่จำกัด', all: [['unlimited', 'liability'], ['liability', 'unlimited']], any: ['ไม่จำกัด'] },
  { name: 'unilateral termination', en: 'One side may terminate at any time', th: 'ฝ่ายเดียวเลิกสัญญาเมื่อใดก็ได้', all: [['terminate', 'any time'], ['terminate', 'sole discretion']], any: ['เลิกจ้างเมื่อใดก็ได้', 'บอกเลิกเมื่อใดก็ได้'] },
  { name: 'auto-renewal', en: 'Auto-renews unless cancelled', th: 'ต่ออายุอัตโนมัติ', all: [['automatically', 'renew']], any: ['ต่ออายุอัตโนมัติ'] },
  { name: 'unilateral amendment', en: 'One side may change terms at will', th: 'แก้ไขเงื่อนไขฝ่ายเดียว', all: [['modify', 'sole discretion'], ['change', 'any time']], any: ['แก้ไขเงื่อนไขฝ่ายเดียว'] },
  { name: 'waiver of liability', en: 'A party waives all claims', th: 'สละสิทธิเรียกร้องทั้งหมด', all: [['waive', 'all'], ['no', 'liable']], any: ['สละสิทธิ'] },
  { name: 'all IP assigned', en: 'All intellectual property assigned to one side', th: 'ทรัพย์สินทางปัญญาตกเป็นของฝ่ายเดียว', all: [['all', 'intellectual property']], any: ['ทรัพย์สินทางปัญญาทั้งหมด'] },
];

export function scanRisky(text, parties = []) {
  const out = [];
  for (const c of chunk(text)) {
    const sk = skeleton(c, parties);
    const low = canon(c).toLowerCase();
    for (const r of RISK_LIBRARY) {
      const hitAll = (r.all || []).some((grp) => grp.every((w) => sk.includes(w)));
      const hitAny = (r.any || []).some((w) => low.includes(w.toLowerCase()));
      if (hitAll || hitAny) out.push({ pattern: r.name, en: r.en, th: r.th, clause: c, fp: fingerprint(c, parties) });
    }
  }
  return { summary: { clauses: chunk(text).length, flagged: out.length }, findings: out };
}
