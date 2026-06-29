// MEANING-BLAME — "git blame at the meaning level".
// Given a chain of contract versions [v1..vN], for each clause in the FINAL
// version it tells you which negotiation STEP its current wording arrived at:
// was it in the original, or slipped in at round 3? Deterministic: alignment by
// lexical similarity + meaning-equality (no model). Answers "when did this risk
// enter, and was it the round everyone waved through?"
import { chunk } from './chunk.js';
import { eq } from './pcr.js';
import { lexicalSim } from './heuristic.js';

const MATCH = 0.45; // an ancestor clause must be at least this similar to be "the same clause"

// best matching clause (index) of `target` within `arr`, or -1
function bestMatch(target, arr) {
  let best = -1, bestSim = MATCH;
  for (let i = 0; i < arr.length; i++) {
    const s = lexicalSim(arr[i], target);
    if (s >= bestSim) { bestSim = s; best = i; }
  }
  return best;
}

export function blame(versions = []) {
  if (versions.length < 2) return { error: 'blame needs at least 2 versions' };
  const V = versions.map(chunk);
  const final = V[V.length - 1];
  const N = V.length;
  const rows = [];

  for (const f of final) {
    // walk each earlier version; find the matching ancestor clause
    let introducedStep = 1;     // 1 = present (in current form) since v1
    let origin = 'original (v1)';
    // find earliest version that already had this clause in its CURRENT meaning
    let firstEqual = -1;
    for (let v = 0; v < N; v++) {
      const m = bestMatch(f, V[v]);
      if (m >= 0 && eq(V[v][m], f)) { firstEqual = v; break; }
    }
    if (firstEqual === 0) {
      origin = 'original (v1)'; introducedStep = 1;
    } else if (firstEqual > 0) {
      // it existed earlier but in a DIFFERENT form? check if an ancestor (non-equal) existed before
      const hadAncestor = bestMatch(f, V[firstEqual - 1]) >= 0;
      origin = hadAncestor ? `changed at v${firstEqual} → v${firstEqual + 1}` : `added at v${firstEqual + 1}`;
      introducedStep = firstEqual + 1;
    } else {
      // never exactly equal anywhere (shouldn't happen since final∈final) — fallback
      origin = `current (v${N})`; introducedStep = N;
    }
    rows.push({ clause: f, origin, step: introducedStep });
  }

  const changedLate = rows.filter((r) => r.step >= N).length; // entered only at the last round
  return {
    summary: {
      versions: N, final_clauses: final.length,
      from_original: rows.filter((r) => r.step === 1).length,
      changed_or_added_later: rows.filter((r) => r.step > 1).length,
      entered_last_round: changedLate,
    },
    rows,
  };
}
