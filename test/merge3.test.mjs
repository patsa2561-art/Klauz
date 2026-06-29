// Semantic 3-way merge — prove it flags genuine conflicts and auto-merges the
// rest, including conflicts whose text edits do NOT overlap.
import { merge3 } from '../src/merge3.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  \x1b[92m✓\x1b[0m ${n}`); } else { fail++; console.log(`  \x1b[91m✗ ${n}\x1b[0m`); } };
const section = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

const BASE = 'The Provider shall pay within 30 days.\nLiability is capped at the fees paid.\nThe notice period is 60 days.';

section('1. Both sides edit the SAME clause differently → CONFLICT');
{
  const left = 'The Provider shall pay within 45 days.\nLiability is capped at the fees paid.\nThe notice period is 60 days.';
  const right = 'The Provider shall pay within 90 days.\nLiability is capped at the fees paid.\nThe notice period is 60 days.';
  const res = merge3(BASE, left, right);
  ok('exactly 1 conflict on the payment clause', res.summary.conflicts === 1);
  ok('conflict is kind both-modified', res.conflicts[0]?.kind === 'both-modified');
  ok('not auto-mergeable', res.summary.auto_mergeable === false);
}

section('2. Sides edit DIFFERENT clauses → CLEAN auto-merge (no text overlap needed)');
{
  const left = 'The Provider shall pay within 45 days.\nLiability is capped at the fees paid.\nThe notice period is 60 days.';
  const right = 'The Provider shall pay within 30 days.\nLiability is unlimited.\nThe notice period is 60 days.';
  const res = merge3(BASE, left, right);
  ok('zero conflicts', res.summary.conflicts === 0);
  ok('two clean merges (one per side)', res.summary.clean_merges === 2);
  ok('auto-mergeable', res.summary.auto_mergeable === true);
}

section('3. Both make the SAME edit → agree, no conflict');
{
  const same = 'The Provider shall pay within 45 days.\nLiability is capped at the fees paid.\nThe notice period is 60 days.';
  const res = merge3(BASE, same, same);
  ok('both-same → 0 conflicts', res.summary.conflicts === 0);
  ok('resolution is take EITHER', res.clean.some((c) => c.kind === 'both-same'));
}

section('4. One deletes, the other modifies → modify/delete CONFLICT');
{
  const leftDel = 'Liability is capped at the fees paid.\nThe notice period is 60 days.'; // payment clause removed
  const rightMod = 'The Provider shall pay within 90 days.\nLiability is capped at the fees paid.\nThe notice period is 60 days.';
  const res = merge3(BASE, leftDel, rightMod);
  ok('modify/delete → 1 conflict', res.summary.conflicts === 1);
  ok('conflict kind is modify/delete', res.conflicts[0]?.kind === 'modify/delete');
}

console.log(`\n\x1b[1mRESULT:\x1b[0m ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
