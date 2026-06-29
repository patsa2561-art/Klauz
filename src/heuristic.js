// TIER-3 FALLBACK — zero-dependency, zero-model, zero-network engine.
// When there is NO local LLM (Ollama) and NO API key, meaningdiff still runs
// using pure deterministic rules. Lower recall than the LLM judge, but it never
// silently passes a modal/negation/number flip — the legal-critical cases are
// exactly the keyword-detectable ones.

// ---- text-layer corruption detector ----
// PDF text layers frequently corrupt non-Latin (Thai/Arabic) text: the glyphs
// render fine on screen but the text layer returns CID/glyph-index garbage,
// replacement chars, or control bytes. This flags such text so the caller can
// fall back to vision OCR. Returns { corrupted, ratio, reason }.
export function looksCorrupted(text) {
  if (!text || text.trim().length < 3) return { corrupted: true, ratio: 1, reason: 'empty/too short' };
  const chars = [...text];
  const n = chars.length;
  let replacement = 0, control = 0, printable = 0;
  for (const c of chars) {
    const cp = c.codePointAt(0);
    if (c === '�') replacement++;
    else if (cp < 9 || (cp > 13 && cp < 32)) control++;
    else if (cp >= 32) printable++;
  }
  const repRatio = replacement / n, ctrlRatio = control / n;
  if (repRatio > 0.02) return { corrupted: true, ratio: repRatio, reason: `${(repRatio*100).toFixed(0)}% replacement chars (�)` };
  if (ctrlRatio > 0.05) return { corrupted: true, ratio: ctrlRatio, reason: `${(ctrlRatio*100).toFixed(0)}% control chars` };
  // "no word spacing" gibberish check applies ONLY to space-using scripts.
  // Thai/CJK/etc. legitimately have no spaces, so skip them (was a false positive).
  const noSpaceScript = /[฀-๿一-鿿぀-ヿ가-힯]/.test(text);
  if (!noSpaceScript) {
    const latin = (text.match(/[a-z]/gi) || []).length;
    const spaces = (text.match(/\s/g) || []).length;
    if (latin > 40 && spaces / n < 0.02) return { corrupted: true, ratio: spaces / n, reason: 'no word spacing — possible glyph-index garbage' };
  }
  return { corrupted: false, ratio: 0, reason: 'ok' };
}

// ---- lexical embedding replacement: character 3-gram set -> cosine-ish ----
function trigrams(s) {
  // Unicode-aware: keep letters/numbers of ANY script (Thai, CJK, …), strip only
  // punctuation/symbols. The old [^a-z0-9] regex silently deleted all Thai text.
  const t = ` ${s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim()} `;
  const grams = new Set();
  for (let i = 0; i < t.length - 2; i++) grams.add(t.slice(i, i + 3));
  return grams;
}
export function lexicalSim(a, b) {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter); // Jaccard
}

// ---- rule-based judge ----
export const MODALS = {
  mandatory: ['shall', 'must', 'will', 'is required to', 'agrees to', 'is obligated to'],
  permissive: ['may', 'can', 'might', 'is permitted to', 'is allowed to', 'at its discretion'],
  weak: ['should', 'is encouraged to', 'is expected to', 'where feasible'],
};
// Word-boundary match — NOT substring. Substring matching wrongly fired on words
// that merely CONTAIN a keyword ("can" inside "cannot", "no"/"not" inside "notify").
const _wordRe = (m) => new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
export function modalClass(text) {
  if (MODALS.mandatory.some((m) => _wordRe(m).test(text))) return 'mandatory';
  if (MODALS.weak.some((m) => _wordRe(m).test(text))) return 'weak';
  if (MODALS.permissive.some((m) => _wordRe(m).test(text))) return 'permissive';
  return null;
}
// Sound negation detector: whole-word negators + the hyphenated "non-" prefix.
// Bare "un" is intentionally excluded — too ambiguous ("until", "unique", "fund").
const NEG_RE = /\b(?:not|no|never|cannot|can't|without|neither|nor|none)\b|\bnon-/gi;
export function negCount(text) {
  return (text.toLowerCase().match(NEG_RE) || []).length;
}
export function numbers(text) {
  return (text.match(/\b\d+(?:\.\d+)?\s?(?:%|percent|days?|hours?|weeks?|months?|years?|usd|dollars?|\$)?/gi) || [])
    .map((s) => s.trim().toLowerCase());
}

// returns same shape as the LLM judge
export function heuristicJudge(oldText, newText, parties = []) {
  const result = { meaning_changed: false, category: 'none', severity: 'none', evidence: '', explanation: '', favors: 'neutral', engine: 'heuristic' };

  // 1) modal shift
  const mo = modalClass(oldText), mn = modalClass(newText);
  const rank = { mandatory: 3, weak: 2, permissive: 1 };
  if (mo && mn && mo !== mn) {
    result.meaning_changed = true; result.category = 'modal_shift'; result.severity = 'high';
    result.evidence = `${mo} → ${mn}`;
    result.explanation = `Obligation strength changed from ${mo} to ${mn}.`;
    // weakening a duty favors the party who HELD the duty (subject); strengthening favors counterparty
    const weakened = rank[mn] < rank[mo];
    result.favors = inferDutyHolder(oldText, parties) || 'neutral';
    if (!weakened) result.favors = otherParty(result.favors, parties);
    return result;
  }

  // 2) negation flip
  const no = negCount(oldText), nn = negCount(newText);
  if ((no === 0) !== (nn === 0)) {
    result.meaning_changed = true; result.category = 'negation'; result.severity = 'high';
    result.evidence = nn > no ? 'added negation' : 'removed negation';
    result.explanation = 'A negation was ' + (nn > no ? 'introduced' : 'removed') + ', reversing the clause.';
    result.favors = inferDutyHolder(oldText, parties) || 'neutral';
    return result;
  }

  // 3) quantity/number change
  const qo = numbers(oldText), qn = numbers(newText);
  if (qo.join('|') !== qn.join('|') && (qo.length || qn.length)) {
    result.meaning_changed = true; result.category = 'quantity'; result.severity = 'medium';
    result.evidence = `${qo.join(', ') || '∅'} → ${qn.join(', ') || '∅'}`;
    result.explanation = 'A numeric term changed.';
    result.favors = 'neutral';
    return result;
  }

  // 4) party swap (both parties present, order/role swapped)
  if (parties.length === 2) {
    const [A, B] = parties.map((p) => p.toLowerCase());
    const oA = oldText.toLowerCase().indexOf(A), oB = oldText.toLowerCase().indexOf(B);
    const nA = newText.toLowerCase().indexOf(A), nB = newText.toLowerCase().indexOf(B);
    if (oA >= 0 && oB >= 0 && nA >= 0 && nB >= 0 && (oA < oB) !== (nA < nB)) {
      result.meaning_changed = true; result.category = 'party'; result.severity = 'high';
      result.evidence = 'party order/role swapped';
      result.explanation = 'The two parties\' roles appear to have been swapped.';
      result.favors = 'neutral';
      return result;
    }
  }

  // 5) lexical-only change -> reworded (no meaning change)
  const sim = lexicalSim(oldText, newText);
  if (sim > 0.6) return result; // cosmetic / synonym
  // substantial rewrite the rules couldn't categorize -> flag for review (fail-closed)
  result.meaning_changed = true; result.category = 'unknown'; result.severity = 'low';
  result.evidence = `lexical sim ${sim.toFixed(2)}`;
  result.explanation = 'Substantial rewrite not matched by any rule — review recommended.';
  result.favors = 'neutral';
  return result;
}

function inferDutyHolder(text, parties) {
  // the party named earliest / as the subject is treated as the duty holder
  if (parties.length !== 2) return null;
  const t = text.toLowerCase();
  const i0 = t.indexOf(parties[0].toLowerCase());
  const i1 = t.indexOf(parties[1].toLowerCase());
  if (i0 < 0 && i1 < 0) return null;
  if (i0 < 0) return parties[1];
  if (i1 < 0) return parties[0];
  return i0 <= i1 ? parties[0] : parties[1];
}
function otherParty(p, parties) {
  if (parties.length !== 2 || !p || p === 'neutral') return 'neutral';
  return parties[0].toLowerCase() === p.toLowerCase() ? parties[1] : parties[0];
}
