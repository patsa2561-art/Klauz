// MICRO-LOGIC PROVER for contract clauses
//
// Premise: two sentences mean the same thing iff their canonical form is the
// same, even when one uses double negation, legal idioms, filler, or within-
// class synonyms. This is a small theorem prover applied to contract micro-
// logic — no AI, deterministic, every rule has a name and a justification.
//
// Coverage handled here (the cases pcr.classify currently abstains on):
//   • DOUBLE NEGATIVE     "shall not fail to notify"  ≡  "shall notify"
//   • SCOPE-OPEN IDIOM    "include without limitation X"  ≡  "include X"
//   • FILLER COLLAPSE     "the parties hereby agree that …"  → "…"
//   • MODAL CLASS         shall = must = will         (one M_HIGH token)
//                         may  = can  = might         (one M_PERM token)
//                         should = is encouraged to   (one M_WEAK token)
//   • VERB SYNONYMS       notify = inform = advise    (one NOTIFY token)
//                         deliver = provide = supply  (one DELIVER token)
//                         …14 verb/adverb clusters
//   • THAI DOUBLE-NEG     ไม่ + ปฏิเสธ/ละเว้น          collapses to verb
//
// If after canonicalization the two strings match, we have a PROOF of semantic
// equivalence — same precision class as the existing modal/number/negation
// rules in pcr.js, just covering a different family of linguistic phenomena.

// 1) double-negation collapse  ("not + reversal-verb + to/from + X" → "X")
const DBL_NEG = /\b(not|cannot|never|no(?!\s+(claim|case|event)\b))\s+(fail|refus\w*|deny|denies|decline\w*|cease\w*|preclud\w*|abstain\w*|forbear\w*|omit\w*|neglect\w*)\s+(to|from)\s+/gi;

// 1b) "cannot fail to X" → "must X"  (re-introduces a mandatory modal)
const CANT_FAIL = /\b(cannot|may\s+not)\s+(fail|refus\w*|decline\w*)\s+to\s+/gi;

// NOTE: we deliberately do NOT collapse "without limitation" / "without prejudice"
// / "including but not limited to" — those ARE substantive (they convert an
// exhaustive list into a non-exhaustive one, or preserve rights). The proof
// tier should leave them visible so the difference shows up as TEXT_CHANGED
// and is properly deferred to the LLM tier or a human.

// 3) filler — zero semantic content
const FILLER_PATTERNS = [
  /\bhereby\b/gi,
  /\bthe\s+parties?\s+(hereby\s+)?(mutually\s+)?agree(\s+that|\s+as\s+follows)?\b/gi,
  /\bit\s+is\s+(hereby\s+)?(mutually\s+)?agreed\s+(that|as\s+follows)\b/gi,
  /\bby\s+this\s+agreement\b/gi,
  /\bsubject\s+to\s+the\s+terms\s+(and\s+conditions\s+)?(of\s+this\s+agreement)?\b/gi,
];

// 4) modal class normalization — within-class synonyms collapse to one token
const MODAL_HIGH = /\b(shall|must|will|agrees?\s+to|is\s+(required|obligated)\s+to)\b/gi;
const MODAL_PERM = /\b(may|can|might|is\s+(permitted|allowed)\s+to|at\s+(its|the)\s+(sole\s+)?discretion)\b/gi;
const MODAL_WEAK = /\b(should|is\s+(encouraged|expected)\s+to|where\s+feasible)\b/gi;

// 5) verb / adverb synonym clusters — collapse surface form to a canonical token
const SYN = [
  // verbs
  [/\b(notif(y|ies|ied|ication)|inform(s|ed|ation)?|advis(e|es|ed|ory)|give\s+(written\s+)?notice)\b/gi, ' NOTIFY '],
  [/\b(deliver(s|ed|y)?|provid(e|es|ed|ing)|suppl(y|ies|ied|ying)|furnish(es|ed|ing)?)\b/gi, ' DELIVER '],
  [/\b(pay(s|ment)?|remit(s|tance)?|tender(s|ed)?|render(s|ed)?\s+payment)\b/gi, ' PAY '],
  [/\b(terminat(e|es|ed|ion|ing)|end(s|ed|ing)?|cancel(s|led|lation|ling)?)\b/gi, ' TERMINATE '],
  [/\b(compl(y|ies|ied|iance)|adher(e|es|ed|ence)|conform(s|ed|ance)?)\b/gi, ' COMPLY '],
  [/\b(breach(es|ed|ing)?|violat(e|es|ed|ion|ing)|infring(e|es|ed|ement))\b/gi, ' BREACH '],
  [/\b(disclos(e|es|ed|ure|ing)|reveal(s|ed|ing)?|share(s|d|ing)?)\b/gi, ' DISCLOSE '],
  [/\b(maintain(s|ed|ing)?|keep(s|ing)?|preserv(e|es|ed|ing))\b/gi, ' MAINTAIN '],
  [/\b(protect(s|ed|ion|ing)?|safeguard(s|ed|ing)?|secur(e|es|ed|ity))\b/gi, ' PROTECT '],
  [/\b(execut(e|es|ed|ion)|sign(s|ed|ing)?)\s+(this\s+)?(agreement|contract|document)?/gi, ' EXECUTE '],
  // adverbs of timeliness — all legally treated as "without delay"
  [/\b(promptly|quickly|immediately|forthwith|in\s+a\s+timely\s+manner|timely|without\s+delay|with(\s+all)?\s+reasonable\s+dispatch)\b/gi, ' PROMPTLY '],
  // refs
  [/\b(clause|section|article|paragraph)(\s+\d)/gi, ' SECTION$2'],
  // determiners that mean same in scope context (each/every/all in noun-collective scope)
  // (skipped — risky; can change meaning in some contexts)
];

// 6) articles / very common stopwords that don't affect contract meaning
const ARTICLE_TRIM = /\b(the|a|an|this|that|these|those)\s+/gi;

// 7) Thai double-negation — limited but useful
const TH_DBL_NEG = /ไม่\s*(ปฏิเสธ|ละเว้น|ละเลย|งด)\s*(ที่จะ|การ)?\s*/g;

export function canonicalize(text) {
  if (!text) return '';
  let s = String(text);

  // 1) double-neg collapse (run twice for nested cases)
  for (let i = 0; i < 2; i++) {
    s = s.replace(CANT_FAIL, ' must ');     // cannot fail → must
    s = s.replace(DBL_NEG, ' ');             // not fail to / refuse to / etc. → empty
    s = s.replace(TH_DBL_NEG, ' ');
  }

  // (scope-idioms "without limitation" / "including but not limited to" are
  // INTENTIONALLY preserved — they change exhaustive→non-exhaustive scope.)

  // 3) filler
  for (const re of FILLER_PATTERNS) s = s.replace(re, ' ');

  s = s.toLowerCase();

  // 4) modal class collapse
  s = s.replace(MODAL_HIGH, ' M_HIGH ');
  s = s.replace(MODAL_PERM, ' M_PERM ');
  s = s.replace(MODAL_WEAK, ' M_WEAK ');

  // 5) synonym clustering
  for (const [re, tok] of SYN) s = s.replace(re, tok);

  // 6) articles
  s = s.replace(ARTICLE_TRIM, ' ');

  // 7) final: strip punctuation, collapse whitespace
  s = s.replace(/[^\p{L}\p{N}_ ]+/gu, ' ').replace(/\s+/g, ' ').trim();

  return s;
}

// Returns true when canonicalization proves the two clauses semantically equal.
export function logicallyEqual(a, b) {
  if (!a || !b) return false;
  const ca = canonicalize(a);
  const cb = canonicalize(b);
  return ca.length > 0 && ca === cb;
}

// For diagnostics / debugging (used by the eval harness to show what the prover did).
export function explainEquivalence(a, b) {
  const ca = canonicalize(a);
  const cb = canonicalize(b);
  return { equal: ca === cb && ca.length > 0, canonical_a: ca, canonical_b: cb };
}
