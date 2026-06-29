// Clause Fingerprint — semantic content-addressing (deterministic).
import { fingerprint, skeleton, recurring, scanRisky } from '../src/fingerprint.js';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  \x1b[92m✓\x1b[0m ${n}`); } else { fail++; console.log(`  \x1b[91m✗ ${n}\x1b[0m`); } };
const S = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const P = ['Provider', 'Client'];

S('1. Same substance, different numbers/names → SAME fingerprint');
{
  ok('30 vs 60 days → same fp',
    fingerprint('The Provider shall pay within 30 days.', P) === fingerprint('The Provider shall pay within 60 days.', P));
  ok('different substance → different fp',
    fingerprint('The Provider shall pay fees.', P) !== fingerprint('The Provider shall encrypt data.', P));
}

S('2. Recurring clause across documents');
{
  const docA = 'The Provider shall pay within 30 days.\nLiability is unlimited.';
  const docB = 'The Provider shall pay within 90 days.\nThe Client owns the data.';
  const rec = recurring([docA, docB], P);
  ok('the payment clause recurs across both docs', rec.some((e) => e.skeleton.includes('pay')));
}

S('3. Risk library scan (known one-sided patterns)');
{
  const r = scanRisky('Liability is unlimited.\nThe Provider may terminate at any time.\nFees are due monthly.', P);
  ok('flags unlimited liability', r.findings.some((f) => f.pattern === 'unlimited liability'));
  ok('flags unilateral termination', r.findings.some((f) => f.pattern === 'unilateral termination'));
  ok('does NOT flag the benign fees clause', !r.findings.some((f) => /Fees are due/.test(f.clause)));
}

S('4. Thai risk pattern');
ok('TH เลิกจ้างเมื่อใดก็ได้ → flagged',
  scanRisky('นายจ้างอาจเลิกจ้างเมื่อใดก็ได้').findings.some((f) => f.pattern === 'unilateral termination'));

console.log(`\n\x1b[1mRESULT:\x1b[0m ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
