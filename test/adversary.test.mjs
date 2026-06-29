// Negotiation Adversary — predict the counter-redline the other side will ask for.
import { adversary } from '../src/adversary.js';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  \x1b[92m✓\x1b[0m ${n}`); } else { fail++; console.log(`  \x1b[91m✗ ${n}\x1b[0m`); } };
const S = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

S('1. Counter-asks target clauses that favor YOU');
{
  const t = 'The Provider shall indemnify the Client for all losses.\nThe Provider shall maintain insurance for 12 months.\nThe Client shall pay within 30 days.';
  // you = Client → them = Provider; clauses where Provider is bound favor you
  const r = adversary(t, ['Provider', 'Client'], 'Client');
  ok('them = Provider', r.summary.them === 'Provider');
  ok('produces counter-asks', r.summary.counter_asks >= 3);
  ok('asks to weaken Provider duty', r.asks.some((a) => a.type === 'weaken-duty'));
  ok('asks to shift the 12-month number', r.asks.some((a) => a.type === 'shift-number'));
  ok('asks for mutuality', r.asks.some((a) => a.type === 'demand-mutuality'));
  ok('does NOT attack the Client-payment clause (already favors Provider)',
    !r.asks.some((a) => /pay within 30/.test(a.clause)));
}

S('2. Needs two parties');
ok('error without 2 parties', !!adversary('x', ['Provider']).error);

console.log(`\n\x1b[1mRESULT:\x1b[0m ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
