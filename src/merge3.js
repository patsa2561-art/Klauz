// SEMANTIC 3-WAY MERGE — the "git merge" of contract negotiation.
// Given a BASE contract and two independent redlines (LEFT = party A's edits,
// RIGHT = party B's edits), find the CONFLICTS: clauses both sides changed in
// incompatible ways — even when their text edits don't textually overlap (which
// is exactly the case a plain text merge tool misses). Deterministic: a conflict
// is reported only when both sides demonstrably altered the same base clause to
// different results, so a flagged conflict is a real one.
import { chunk } from './chunk.js';
import { alignLexical } from './align.js';
import { eq, classify, describe } from './pcr.js';

function sideMap(base, variant, minSim) {
  const { pairs, removed } = alignLexical(base, variant, minSim);
  const map = new Map(); // baseIdx -> { text|null(=deleted) }
  for (const p of pairs) map.set(p.oldIdx, { text: variant[p.newIdx] });
  for (const i of removed) map.set(i, { text: null });
  return map;
}

export function merge3(baseText, leftText, rightText, opts = {}) {
  const base = chunk(baseText), left = chunk(leftText), right = chunk(rightText);
  const nonLatin = /[฀-๿一-鿿぀-ヿ؀-ۿ가-힯]/.test(baseText + leftText + rightText);
  const minSim = opts.minSim ?? (nonLatin ? 0.12 : 0.3);
  const L = sideMap(base, left, minSim), R = sideMap(base, right, minSim);

  const conflicts = [], clean = [];
  base.forEach((bText, i) => {
    const l = L.get(i), r = R.get(i);
    const lText = l ? l.text : bText; // not in map → unchanged by left
    const rText = r ? r.text : bText;
    const lDeleted = l && l.text === null, rDeleted = r && r.text === null;
    const lChanged = lDeleted || (lText != null && !eq(lText, bText));
    const rChanged = rDeleted || (rText != null && !eq(rText, bText));

    if (!lChanged && !rChanged) return; // both left it alone

    const row = (kind, resolution, extra = {}) => ({
      base: bText, left: lDeleted ? '(deleted)' : lText, right: rDeleted ? '(deleted)' : rText,
      kind, resolution, ...extra,
    });

    if (lChanged && !rChanged) { clean.push(row('left-only', 'take LEFT')); return; }
    if (rChanged && !lChanged) { clean.push(row('right-only', 'take RIGHT')); return; }

    // both changed
    if (lDeleted && rDeleted) { clean.push(row('both-deleted', 'delete (agree)')); return; }
    if (!lDeleted && !rDeleted && eq(lText, rText)) { clean.push(row('both-same', 'take EITHER (agree)')); return; }

    // genuine conflict
    if (lDeleted || rDeleted) {
      conflicts.push(row('modify/delete', 'HUMAN', {
        detail_en: 'one side deleted this clause, the other modified it',
        detail_th: 'ฝ่ายหนึ่งลบข้อนี้ อีกฝ่ายแก้ไข',
      }));
    } else {
      const lc = classify(bText, lText), rc = classify(bText, rText);
      conflicts.push(row('both-modified', 'HUMAN', {
        left_change: describe({ verdict: lc.verdict, witness: lc.witness }, 'en'),
        right_change: describe({ verdict: rc.verdict, witness: rc.witness }, 'en'),
        left_change_th: describe({ verdict: lc.verdict, witness: lc.witness }, 'th'),
        right_change_th: describe({ verdict: rc.verdict, witness: rc.witness }, 'th'),
        detail_en: 'both sides changed this clause to different results',
        detail_th: 'ทั้งสองฝ่ายแก้ข้อนี้เป็นคนละแบบ',
      }));
    }
  });

  return {
    summary: {
      base_clauses: base.length,
      conflicts: conflicts.length,
      clean_merges: clean.length,
      auto_mergeable: conflicts.length === 0,
      verdict: conflicts.length ? 'CONFLICTS — human resolution needed' : 'CLEAN — auto-mergeable',
    },
    conflicts, clean,
  };
}
