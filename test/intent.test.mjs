// Intent-Freeze — sign a clause's meaning; detect substantive (not cosmetic) drift.
import { freezeIntent, checkIntent } from '../src/intent.js';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  \x1b[92m✓\x1b[0m ${n}`); } else { fail++; console.log(`  \x1b[91m✗ ${n}\x1b[0m`); } };
const S = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const P = ['Provider', 'Client'];

const clause = 'The Provider shall encrypt all customer data.';
const anchor = freezeIntent(clause, 'Provider must always encrypt customer data', P);

S('1. Anchor is signed');
ok('has ed25519 signature', !!anchor.signature && anchor.alg === 'ed25519');

S('2. Cosmetic edit → INTACT');
ok('case/punctuation change stays INTACT',
  checkIntent(anchor, 'the provider shall encrypt all customer data', P).status === 'INTACT');

S('3. Substantive edit → BROKEN');
ok('shall→may, all→some → BROKEN',
  checkIntent(anchor, 'The Provider may encrypt some customer data.', P).status === 'BROKEN');

S('4. Clause removed → CLAUSE_GONE');
ok('unrelated doc → CLAUSE_GONE',
  checkIntent(anchor, 'The Client shall pay all invoices promptly.', P).status === 'CLAUSE_GONE');

S('5. Tampered anchor → INVALID');
{
  const forged = { ...anchor, intent: 'Provider may skip encryption' };
  ok('mutated intent breaks signature → INVALID',
    checkIntent(forged, clause, P).status === 'INVALID');
}

console.log(`\n\x1b[1mRESULT:\x1b[0m ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
