// Classify each aligned pair. Two-tier:
//   Tier 1 (free): identical-after-normalize  -> IDENTICAL, no LLM.
//   Tier 2 (LLM):  any aligned-but-different pair -> judge (because cosine
//                  cannot separate synonym 0.99 from modal-flip 0.95).
// Severity rule-override: legal-critical categories are floored to a minimum
// severity so the judge can never under-rate a negation/modal flip.
import { judge } from './ollama.js';
import { heuristicJudge } from './heuristic.js';
import { withinClassModalSynonym } from './selective.js';
import { tribunalVerdict } from './tribunal.js';

// auto: LLM, fall back to heuristic on failure. heuristic: rules only. llm: LLM only.
// consensus: rule+LLM agree=high / disagree=REVIEW. tribunal: proof-tier + adversarial
// dual-judge consensus that ABSTAINS on disagreement (selective, near-zero silent error).
let ENGINE = process.env.MEANINGDIFF_ENGINE || 'auto';
const ENGINE_PINNED = !!process.env.MEANINGDIFF_ENGINE; // explicit user choice wins
// Auto-detection (capabilities.js) calls this; it won't override an explicit env choice.
export function setEngine(mode, { force = false } = {}) { if (mode && (force || !ENGINE_PINNED)) ENGINE = mode; }
export function currentEngine() { return ENGINE; }

const JUDGE_SYS =
  'You are a precise legal/technical semantic comparator. Compare OLD vs NEW. ' +
  'Reply ONLY with JSON: ' +
  '{"meaning_changed":boolean,"category":"modal_shift|negation|quantity|scope|definition|party|synonym|typo|reorder|none",' +
  '"severity":"none|low|medium|high","evidence":"<exact words that changed, verbatim from the texts>",' +
  '"explanation":"<one factual sentence>",' +
  '"favors":"<which named party this edit benefits, chosen from the PARTIES list; or \'neutral\' if it does not shift the balance toward either side>"}. ' +
  'Rules: be extractive — quote exact words in evidence, never invent text. ' +
  'meaning_changed=false ONLY for pure typos, casing, whitespace, reordering with identical meaning, or exact synonyms. ' +
  'A change of modal verb (shall/must/may/should), negation (can/cannot), number/quantity/date, ' +
  'party, scope, or defined term IS a meaning change. ' +
  'For "favors": determine who BENEFITS, using this exact rule — ' +
  'A party is FAVORED when (1) its OWN obligation/duty is reduced or removed, OR ' +
  '(2) its OWN right/protection/time/discretion is increased, OR ' +
  '(3) the OTHER party gains a new burden. ' +
  'CRITICAL: the favored party is the one whose position IMPROVES, which is often the SUBJECT whose duty shrank — ' +
  'NOT the counterparty. Examples: "Provider must deliver in 7 days"->"30 days" favors PROVIDER (its own deadline relaxed). ' +
  '"Provider shall encrypt"->"may encrypt" favors PROVIDER (its own duty became optional). ' +
  '"warranty covers"->"does not cover" favors the PROVIDER/warrantor (escapes its duty). ' +
  '"Client may terminate anytime"->"only for cause" favors PROVIDER (Client lost a right). ' +
  '"penalty 2%"->"10%" favors the party who RECEIVES the penalty. ' +
  'Removing a liability cap favors the party who SUFFERS damages (can now recover more), not the liable party. ' +
  'If meaning_changed=false, favors MUST be "neutral". If genuinely unsure about direction, set favors="neutral".';

const SEVERITY_FLOOR = {
  negation: 'high',
  modal_shift: 'high',
  party: 'high',
  quantity: 'medium',
  scope: 'medium',
  definition: 'medium',
};
const SEV_RANK = { none: 0, low: 1, medium: 2, high: 3 };

function normalize(s) {
  return s.toLowerCase().replace(/[\s.,;:!?"'()\[\]]+/g, ' ').trim();
}
function floorSeverity(category, sev) {
  const floor = SEVERITY_FLOOR[category];
  if (!floor) return sev;
  return SEV_RANK[floor] > SEV_RANK[sev] ? floor : sev;
}

// pair: { oldText, newText, sim }  ·  parties: string[] (e.g. ["Provider","Client"])
export async function classifyPair(pair, parties = []) {
  if (normalize(pair.oldText) === normalize(pair.newText)) {
    return {
      verdict: 'IDENTICAL', meaning_changed: false, category: 'none',
      severity: 'none', evidence: '', explanation: 'No textual change after normalization.',
      favors: 'neutral', sim: pair.sim, judged: false,
    };
  }
  // Deterministic guard: only difference is a within-class modal synonym → no change.
  const synClass = withinClassModalSynonym(pair.oldText, pair.newText);
  if (synClass) {
    return {
      verdict: 'REWORDED', meaning_changed: false, category: 'synonym', severity: 'none',
      evidence: `same-class modal (${synClass}) — obligation strength unchanged`,
      explanation: 'Only difference is a within-class modal synonym; obligation strength is unchanged.',
      favors: 'neutral', sim: pair.sim, judged: false, deterministic: true,
    };
  }

  // TRIBUNAL: proof-tier + adversarial dual-judge consensus; abstains (REVIEW) on doubt.
  if (ENGINE === 'tribunal') {
    const v = await tribunalVerdict(pair.oldText, pair.newText, parties);
    if (v.abstain) return {
      verdict: 'REVIEW', meaning_changed: true, category: 'review', severity: 'medium',
      evidence: '', explanation: v.reason, favors: 'neutral',
      sim: pair.sim, judged: true, abstained: true, confidence: 'abstain',
    };
    return {
      verdict: v.meaning_changed ? 'MEANING_CHANGED' : 'REWORDED', meaning_changed: v.meaning_changed,
      category: v.meaning_changed ? (v.category || 'none') : 'none',
      severity: v.meaning_changed ? floorSeverity(v.category, 'medium') : 'none',
      evidence: v.evidence || v.signals?.rule || '', explanation: v.reason, favors: 'neutral',
      sim: pair.sim, judged: v.tier === 'LLM', confidence: v.confidence, deterministic: v.tier === 'PROOF',
    };
  }

  // TIER-3 fallback: rules-only engine (no model, no key, no network)
  if (ENGINE === 'heuristic') {
    const h = heuristicJudge(pair.oldText, pair.newText, parties);
    return { verdict: h.meaning_changed ? 'MEANING_CHANGED' : 'REWORDED', ...h, sim: pair.sim, judged: true };
  }

  // CONSENSUS mode: run rule-engine + LLM. If they AGREE on meaning_changed →
  // high-confidence. If they DISAGREE → REVIEW (never silently guess). This is
  // the "100% no-silent-error" mode for high-stakes use.
  if (ENGINE === 'consensus') {
    const rule = heuristicJudge(pair.oldText, pair.newText, parties);
    let llm = null;
    try {
      const partyLine = parties.length ? `PARTIES: ${parties.join(', ')}\n` : '';
      llm = await judge(JUDGE_SYS, `${partyLine}OLD: ${pair.oldText}\nNEW: ${pair.newText}`);
    } catch (e) { /* LLM down → rely on rule below */ }
    if (llm && typeof llm.meaning_changed === 'boolean') {
      if (llm.meaning_changed === rule.meaning_changed) {
        // agreement → trust the LLM's richer detail, mark high confidence
        const category = llm.category || rule.category || 'none';
        let severity = llm.meaning_changed ? floorSeverity(category, llm.severity || 'low') : 'none';
        return {
          verdict: llm.meaning_changed ? 'MEANING_CHANGED' : 'REWORDED',
          meaning_changed: llm.meaning_changed, category, severity,
          evidence: llm.evidence || rule.evidence || '', explanation: llm.explanation || '',
          favors: llm.meaning_changed ? (llm.favors || rule.favors || 'neutral') : 'neutral',
          confidence: 'high', consensus: 'agree', sim: pair.sim, judged: true,
        };
      }
      // disagreement → REVIEW (human decides). Fail-closed: treat as changed.
      return {
        verdict: 'REVIEW', meaning_changed: true,
        category: 'disputed', severity: 'medium',
        evidence: `rule:${rule.meaning_changed ? 'changed' : 'same'}(${rule.category}) vs LLM:${llm.meaning_changed ? 'changed' : 'same'}(${llm.category})`,
        explanation: 'Rule-engine and LLM disagree — flagged for human review (not auto-decided).',
        favors: 'neutral', confidence: 'low', consensus: 'disagree', sim: pair.sim, judged: true,
      };
    }
    // LLM unavailable → fall back to rule alone
    return { verdict: rule.meaning_changed ? 'MEANING_CHANGED' : 'REWORDED', ...rule, confidence: 'low', consensus: 'rule-only', sim: pair.sim, judged: true };
  }

  const partyLine = parties.length
    ? `PARTIES: ${parties.join(', ')}\n`
    : 'PARTIES: (infer the two opposing parties from the text)\n';
  let res = null;
  try {
    res = await judge(JUDGE_SYS, `${partyLine}OLD: ${pair.oldText}\nNEW: ${pair.newText}`);
  } catch (e) {
    // LLM unreachable -> auto fall back to heuristic (degraded but never crashes)
    if (ENGINE === 'auto') {
      const h = heuristicJudge(pair.oldText, pair.newText, parties);
      return { verdict: h.meaning_changed ? 'MEANING_CHANGED' : 'REWORDED', ...h, sim: pair.sim, judged: true, degraded: true };
    }
    throw e;
  }
  if (!res || typeof res.meaning_changed !== 'boolean') {
    // Fail-CLOSED: if the judge is unparseable, flag for human review rather than
    // silently passing (anti-hallucination: never claim "no change" on uncertainty).
    return {
      verdict: 'REVIEW', meaning_changed: true, category: 'unknown',
      severity: 'medium', evidence: '(judge returned no parseable verdict)',
      explanation: 'Automatic comparison was inconclusive — human review required.',
      sim: pair.sim, judged: true, parseFail: true,
    };
  }
  const category = res.category || 'none';
  let severity = res.severity || (res.meaning_changed ? 'low' : 'none');
  if (res.meaning_changed) severity = floorSeverity(category, severity);
  else severity = 'none';
  return {
    verdict: res.meaning_changed ? 'MEANING_CHANGED' : 'REWORDED',
    meaning_changed: res.meaning_changed,
    category,
    severity,
    evidence: res.evidence || '',
    explanation: res.explanation || '',
    favors: res.meaning_changed ? (res.favors || 'neutral') : 'neutral',
    sim: pair.sim,
    judged: true,
  };
}
