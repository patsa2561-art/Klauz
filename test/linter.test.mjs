// Contract Linter — prove it catches real structural defects AND produces no
// false positives on a clean document. Pure deterministic, no model.
import { lint } from '../src/linter.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  \x1b[92m✓\x1b[0m ${n}`); } else { fail++; console.log(`  \x1b[91m✗ ${n}\x1b[0m`); } };
const has = (res, code) => res.findings.some((f) => f.code === code);
const section = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

section('1. Dangling cross-reference (sound: only when doc is numbered)');
{
  const doc = 'Section 1. Definitions\n"Provider" means Acme. The Provider operates.\nSection 2. Payment\nThe Client shall pay per Section 2.\nThe Client shall comply with Section 9.';
  const res = lint(doc);
  ok('reference to non-existent Section 9 → DANGLING_REF', has(res, 'DANGLING_REF'));
  ok('reference to existing Section 2 is NOT flagged',
    !res.findings.some((f) => f.code === 'DANGLING_REF' && /Section 2\b/.test(f.evidence)));
}

section('2. Unfilled blanks & placeholders');
{
  const r1 = lint('The rent is .......... baht per month.');
  ok('row of dots → UNFILLED_BLANK', has(r1, 'UNFILLED_BLANK'));
  const r2 = lint('Delivery date: [TBD].\nThe price is XXX.');
  ok('[TBD] / XXX → PLACEHOLDER', has(r2, 'PLACEHOLDER'));
}

section('3. Defined-term defects');
{
  const dup = lint('"Provider" means Acme.\nLater, "Provider" means Beta Corp.\nThe Provider acts.');
  ok('term defined twice → DUPLICATE_DEF', has(dup, 'DUPLICATE_DEF'));
  const unused = lint('Section 1. Terms\n"Indemnity Cap" means 1,000,000 baht.\nThe parties agree to the schedule.');
  ok('defined but never used → UNUSED_DEF', has(unused, 'UNUSED_DEF'));
}

section('4. NO false positives on a clean document');
{
  const clean = 'Section 1. Term\nThis Agreement starts on the effective date.\nSection 2. Payment\nFees are due per Section 1, with no exceptions.';
  const res = lint(clean);
  ok('clean doc → verdict CLEAN', res.summary.verdict === 'CLEAN');
  ok('clean doc → zero findings', res.findings.length === 0);
}

section('5. Thai structural reference');
{
  const th = 'ข้อ 1 คำนิยาม\nผู้ให้บริการหมายถึงบริษัท\nข้อ 2 การชำระเงิน\nให้ชำระตามข้อ 5';
  const res = lint(th);
  ok('TH อ้างถึง ข้อ 5 ที่ไม่มีอยู่ → DANGLING_REF', has(res, 'DANGLING_REF'));
}

console.log(`\n\x1b[1mRESULT:\x1b[0m ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
