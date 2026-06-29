// Reversibility Test — deterministic party-swap fairness probe.
import { reversibility } from '../src/reversibility.js';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  \x1b[92m✓\x1b[0m ${n}`); } else { fail++; console.log(`  \x1b[91m✗ ${n}\x1b[0m`); } };
const S = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

S('1. One-sided contract → asymmetric obligations flagged');
{
  const t = 'The Provider shall indemnify the Client for all losses.\nThe Client shall pay within 30 days.\nThe Provider shall maintain insurance at all times.';
  const r = reversibility(t, ['Provider', 'Client']);
  ok('3 obligations detected', r.summary.obligations === 3);
  ok('all 3 are asymmetric (no mirrors)', r.summary.asymmetric === 3);
  ok('verdict ONE-SIDED', r.summary.verdict === 'ONE-SIDED');
  ok('symmetry score 0', r.summary.symmetry_score === 0);
}

S('2. Mutual clauses → balanced (mirror found, nothing flagged)');
{
  const t = 'The Provider shall keep all information confidential.\nThe Client shall keep all information confidential.';
  const r = reversibility(t, ['Provider', 'Client']);
  ok('0 asymmetric', r.summary.asymmetric === 0);
  ok('verdict BALANCED', r.summary.verdict === 'BALANCED');
  ok('symmetry score 100', r.summary.symmetry_score === 100);
}

S('3. Direction: who the imbalance favors');
{
  const t = 'The Provider shall indemnify the Client for all losses.\nThe Provider shall maintain insurance.\nThe Client shall give 30 days notice.';
  const r = reversibility(t, ['Provider', 'Client']);
  ok('tilt names Client (2 one-sided duties on Provider)', /Client/.test(r.summary.tilt));
}

S('4. Needs two parties');
ok('error without 2 parties', !!reversibility('x', ['Provider']).error);

console.log(`\n\x1b[1mRESULT:\x1b[0m ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
