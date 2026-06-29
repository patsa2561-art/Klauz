// INTENT-FREEZE — "lock a clause's meaning with a signature".
// You declare the INTENT of a critical clause once and sign it. The anchor binds
// to the clause's meaning-SKELETON (party/number-insensitive), so cosmetic edits
// (renumbering, reformatting, changing an amount placeholder) do NOT break it —
// but a change that alters the substance does. Re-checkable by anyone with the
// public key; no model needed. Combines our fingerprint + ed25519 signing.
import { chunk } from './chunk.js';
import { skeleton, fingerprint } from './fingerprint.js';
import { signData, verifyData } from './pcr.js';
import { lexicalSim } from './heuristic.js';

const FIND = 0.4;

// Locate the clause in `text` that best matches a label/snippet.
function locate(text, label) {
  const clauses = chunk(text);
  let best = -1, bestSim = FIND;
  for (let i = 0; i < clauses.length; i++) {
    const s = lexicalSim(clauses[i], label);
    if (s >= bestSim) { bestSim = s; best = i; }
  }
  return best >= 0 ? clauses[best] : null;
}

// Freeze: declare intent for a clause (given by its current text) → signed anchor.
export function freezeIntent(clauseText, intentText, parties = []) {
  const anchor = {
    type: 'intent-freeze/1',
    clause_snippet: clauseText.trim().slice(0, 120),
    skeleton_fp: fingerprint(clauseText, parties),
    intent: intentText,
    created: new Date().toISOString(),
  };
  const sig = signData(anchor);
  return { ...anchor, ...sig };
}

// Check an anchor against a (possibly edited) document.
export function checkIntent(anchor, newText, parties = []) {
  const { signature, publicKey, alg, ...body } = anchor;
  const sigOk = verifyData(body, signature, publicKey);
  const clause = locate(newText, anchor.clause_snippet);
  let status, detail_en, detail_th;
  if (!sigOk) {
    status = 'INVALID'; detail_en = 'anchor signature invalid (anchor was altered)'; detail_th = 'ลายเซ็น anchor ไม่ถูกต้อง (ถูกแก้)';
  } else if (!clause) {
    status = 'CLAUSE_GONE'; detail_en = 'the frozen clause was removed from the document'; detail_th = 'ข้อที่ตรึงไว้ถูกลบออกจากเอกสาร';
  } else if (fingerprint(clause, parties) === anchor.skeleton_fp) {
    status = 'INTACT'; detail_en = 'meaning unchanged (cosmetic edits ok)'; detail_th = 'ความหมายไม่เปลี่ยน (แก้ผิวเผินได้)';
  } else {
    status = 'BROKEN'; detail_en = 'the clause meaning changed — frozen intent may be violated'; detail_th = 'ความหมายของข้อเปลี่ยน — เจตนาที่ตรึงไว้อาจถูกละเมิด';
  }
  return { status, intact: status === 'INTACT', intent: anchor.intent, detail_en, detail_th, clause: clause || null };
}
