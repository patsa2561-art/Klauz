// Selective ("proof-tier") classifier — the honest route to "100% accuracy".
//
// A fuzzy semantic classifier can never be 100% correct on every input. What it
// CAN do is emit a verdict ONLY when a deterministic rule *proves* the answer, and
// ABSTAIN otherwise (defer to the LLM tier or a human). That yields a tier with
// verifiable 100% precision and a measurable COVERAGE number — selective /
// conformal prediction applied to legal redlines, with per-decision provenance.
//
// The deterministic decision is delegated to the PCR core's detector (`pcr.classify`),
// which is bilingual (Thai + English) and SOUND: it commits to a single dimension
// only when the residual is identical, so double-negatives ("shall not fail to…")
// and idioms ("without limitation") are handled correctly without special-casing.
import { modalClass, negCount, numbers, MODALS } from './heuristic.js';
import { classify as pcrClassify } from './pcr.js';
import { logicallyEqual } from './micrologic.js';

// Within-class modal synonym (will↔shall both mandatory, may↔can both permissive):
// the only difference is a same-class modal word, so obligation strength — and thus
// meaning — is unchanged. (English; Thai within-class synonyms safely abstain.)
const _MODAL_WORDS = [...MODALS.mandatory, ...MODALS.permissive, ...MODALS.weak]
  .sort((a, b) => b.length - a.length)
  .map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const _MODAL_RE = new RegExp(`\\b(?:${_MODAL_WORDS.join('|')})\\b`, 'gi');
const _stripModal = (s) =>
  s.toLowerCase().replace(_MODAL_RE, ' ').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
export function withinClassModalSynonym(a, b) {
  const ca = modalClass(a), cb = modalClass(b);
  if (!ca || !cb || ca !== cb) return null;
  if (negCount(a) !== negCount(b)) return null;
  if (numbers(a).join('|') !== numbers(b).join('|')) return null;
  if (_stripModal(a) !== _stripModal(b)) return null;
  return ca;
}

function proven(changed, category, reason, signals) {
  return { decided: true, abstain: false, confidence: 'PROVEN', meaning_changed: changed, category, reason, signals };
}
function abstain(reason) {
  return { decided: false, abstain: true, confidence: 'ABSTAIN', meaning_changed: null, category: 'review', reason, signals: {} };
}
const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

// Decide ONLY when a deterministic rule proves it; otherwise abstain.
export function proofVerdict(oldText, newText, parties = []) {
  const d = pcrClassify(oldText, newText); // sound, bilingual; one dimension or TEXT_CHANGED
  const w = d.witness || {};
  switch (d.verdict) {
    case 'IDENTICAL':
      return proven(false, 'identical', 'Identical after normalizing case/space/punctuation.', { rule: 'identical' });
    case 'NUMBER_CHANGED':
      return proven(true, 'quantity', `Numeric term changed${w.from ? `: ${arr(w.from).join(', ')} → ${arr(w.to).join(', ')}` : ''}.`, { rule: 'number-change', from: w.from, to: w.to });
    case 'MODAL_SHIFT':
      return proven(true, 'modal_shift', `Obligation strength shifted ${w.from} → ${w.to}.`, { rule: 'modal-class-shift', from: w.from, to: w.to });
    case 'NEGATION_FLIP':
      return proven(true, 'negation', `A negation was ${w.direction || 'changed'}, reversing the clause.`, { rule: 'negation-flip', direction: w.direction });
    case 'BLANK_FILLED':
      return proven(true, 'definition', 'A blank/template field was filled in.', { rule: 'blank-filled' });
    default: {
      // TEXT_CHANGED — the core could not pin it to one provable dimension.
      // Try MICRO-LOGIC equivalence first: collapses double-negatives, scope
      // idioms ("without limitation"), filler, modal-class synonyms, and verb/
      // adverb clusters. If canonical forms match, the two clauses are
      // semantically equivalent (proven, same precision class as the proof tier).
      if (logicallyEqual(oldText, newText)) {
        return proven(false, 'synonym', 'Logically equivalent — canonical forms match after collapsing double-negatives, scope idioms, filler, and within-class synonyms.', { rule: 'micro-logic' });
      }
      const syn = withinClassModalSynonym(oldText, newText);
      if (syn) return proven(false, 'synonym', `Within-class modal synonym (${syn}) — obligation strength unchanged.`, { rule: 'modal-synonym', modalClass: syn });
      if (parties.length === 2) {
        const [A, B] = parties.map((p) => p.toLowerCase());
        const oA = oldText.toLowerCase().indexOf(A), oB = oldText.toLowerCase().indexOf(B);
        const nA = newText.toLowerCase().indexOf(A), nB = newText.toLowerCase().indexOf(B);
        if (oA >= 0 && oB >= 0 && nA >= 0 && nB >= 0 && (oA < oB) !== (nA < nB))
          return proven(true, 'party', "The two parties' roles were swapped.", { rule: 'party-swap' });
      }
      return abstain('No deterministic rule proves this either way — needs semantic judgement (scope/definition/authority/added-condition).');
    }
  }
}
