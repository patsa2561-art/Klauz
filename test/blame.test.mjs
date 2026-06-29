// Meaning-Blame — which negotiation step introduced each final clause.
import { blame } from '../src/blame.js';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  \x1b[92m✓\x1b[0m ${n}`); } else { fail++; console.log(`  \x1b[91m✗ ${n}\x1b[0m`); } };
const S = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

S('1. Trace origin of each final clause across 3 rounds');
{
  const v1 = 'The Provider shall pay within 30 days.\nLiability is capped at the fees paid.';
  const v2 = 'The Provider shall pay within 30 days.\nLiability is capped at the fees paid.\nThe Provider may terminate at any time.';
  const v3 = 'The Provider shall pay within 60 days.\nLiability is capped at the fees paid.\nThe Provider may terminate at any time.';
  const r = blame([v1, v2, v3]);
  const pay = r.rows.find((x) => /pay within 60/.test(x.clause));
  const liab = r.rows.find((x) => /capped/.test(x.clause));
  const term = r.rows.find((x) => /terminate/.test(x.clause));
  ok('3 final clauses', r.summary.final_clauses === 3);
  ok('liability clause is from original (v1)', liab.step === 1);
  ok('termination clause was added at v2', term.step === 2);
  ok('payment clause changed at the last round (v3)', pay.step === 3);
  ok('summary: 1 from original', r.summary.from_original === 1);
}

S('2. Needs ≥2 versions');
ok('error with one version', !!blame(['only one']).error);

console.log(`\n\x1b[1mRESULT:\x1b[0m ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
