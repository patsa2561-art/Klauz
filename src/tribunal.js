// TRIBUNAL — selective classification that maximizes coverage while keeping a
// near-zero silent-error rate. Two tiers, both of which can ABSTAIN:
//
//   Tier 1  PROOF      deterministic rules (selective.js). 100% precision, instant.
//   Tier 2  CONSENSUS  on the cases Tier 1 can't prove, ask the LLM TWICE in
//                      adversarial roles — a "prosecutor" (looks for any change)
//                      and a "defender" (argues equivalence). They AGREE → commit
//                      that verdict; they DISAGREE → ABSTAIN (defer to a human).
//
// The disagreement signal is the point: when a single judge is internally
// uncertain, the two roles split — and we refuse to guess instead of being
// confidently wrong. Output records which tier/role decided, so accuracy is
// auditable point-by-point.
import { judge } from './ollama.js';
import { proofVerdict } from './selective.js';

const JSON_SHAPE =
  'Reply ONLY with JSON: {"meaning_changed":boolean,"category":"modal_shift|negation|quantity|scope|definition|party|synonym|typo|reorder|none","evidence":"<exact words that changed, verbatim>"}.';

const PROSECUTOR_SYS =
  'You are a STRICT legal-change auditor. Assume the edit is suspicious and hunt for any shift in legal effect: ' +
  'obligation strength (shall/may/should), negation, numbers/dates, parties, scope, defined terms, or added/removed conditions. ' +
  'meaning_changed=true if ANY such shift exists; only false for pure typo/casing/whitespace/reordering/exact-synonym. ' + JSON_SHAPE;

const DEFENDER_SYS =
  'You are DEFENSE COUNSEL arguing the two clauses are legally equivalent. ' +
  'Set meaning_changed=false unless you genuinely CANNOT defend equivalence — treat synonyms, reordering, casing, and stylistic rewrites as no change. ' +
  'Only concede meaning_changed=true when the legal effect provably differs. ' + JSON_SHAPE;

const okBool = (x) => x && typeof x.meaning_changed === 'boolean';

export async function tribunalVerdict(oldText, newText, parties = []) {
  // Tier 1 — deterministic proof.
  const proof = proofVerdict(oldText, newText, parties);
  if (proof.decided) return { ...proof, tier: 'PROOF' };

  // Tier 2 — adversarial dual-judge consensus.
  const user = `OLD: ${oldText}\nNEW: ${newText}`;
  const [pro, def] = await Promise.all([
    judge(PROSECUTOR_SYS, user).catch(() => null),
    judge(DEFENDER_SYS, user).catch(() => null),
  ]);

  if (!okBool(pro) || !okBool(def))
    return { decided: false, abstain: true, confidence: 'ABSTAIN', tier: 'LLM',
      meaning_changed: null, category: 'review',
      reason: 'LLM unavailable/unparseable — deferred.', signals: { pro, def } };

  if (pro.meaning_changed === def.meaning_changed) {
    const changed = pro.meaning_changed;
    return { decided: true, abstain: false, confidence: 'CONSENSUS', tier: 'LLM',
      meaning_changed: changed,
      category: (changed ? (pro.category || def.category) : 'none') || 'none',
      evidence: pro.evidence || def.evidence || '',
      reason: `prosecutor & defender agree: ${changed ? 'CHANGED' : 'unchanged'}.`,
      signals: { pro, def } };
  }

  // Roles split → the model is internally uncertain → abstain rather than guess.
  return { decided: false, abstain: true, confidence: 'ABSTAIN', tier: 'LLM',
    meaning_changed: null, category: 'review',
    reason: `prosecutor=${pro.meaning_changed} vs defender=${def.meaning_changed} — split, needs human review.`,
    signals: { pro, def } };
}

// Annotator for the PCR `certify(a, b, { annotate })` hook. The deterministic core
// already proves MODAL/NUMBER/NEGATION inline, so this runs only on TEXT_CHANGED
// clauses — recording, per clause, which tier decided and at what confidence. The
// result is folded into the signed certificate, so the tier/confidence is itself
// tamper-evident. (certify tags it deterministic:false, since it's not a proof.)
export function tribunalAnnotator(parties = []) {
  return async (aText, bText) => {
    const v = await tribunalVerdict(aText, bText, parties);
    const tier = v.tier === 'PROOF' ? 'PROVEN' : (v.abstain ? 'ABSTAIN' : 'CONSENSUS');
    return {
      tier, confidence: v.confidence,
      meaning_changed: v.abstain ? null : v.meaning_changed,
      category: v.category, note: v.reason,
    };
  };
}
