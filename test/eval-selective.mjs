// Selective-prediction evaluation: measure the deterministic proof-tier's
// accuracy-vs-coverage on the labeled corpus. No model, no network — instant and
// reproducible. The point of "100%": 100% accuracy on PROVEN decisions, with an
// honest coverage number for how many cases that tier can commit to.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { proofVerdict } from '../src/selective.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(fs.readFileSync(path.join(dir, process.argv[2] || 'corpus.json'), 'utf8'));

const G = '\x1b[92m', R = '\x1b[91m', Y = '\x1b[93m', D = '\x1b[2m', B = '\x1b[1m', X = '\x1b[0m';
let proven = 0, abstained = 0, correct = 0;
const wrong = [], abstainList = [];

console.log(`\n${B}Selective proof-tier evaluation${X}  ${corpus.pairs.length} labeled pairs  ${D}(deterministic, no model)${X}\n`);
for (const p of corpus.pairs) {
  const v = proofVerdict(p.old, p.new);                 // no parties passed → conservative
  if (v.abstain) {
    abstained++; abstainList.push(p.id);
    console.log(`  ${Y}● ABSTAIN${X}  ${p.id.padEnd(9)} ${D}truth=${p.meaning_changed ? 'CHG' : 'same'} → deferred (${v.category})${X}`);
    continue;
  }
  proven++;
  const ok = v.meaning_changed === p.meaning_changed;
  if (ok) correct++; else wrong.push(p.id);
  const icon = ok ? `${G}✓${X}` : `${R}✗${X}`;
  console.log(`  ${icon} PROVEN   ${p.id.padEnd(9)} pred=${v.meaning_changed ? 'CHG' : 'same'} truth=${p.meaning_changed ? 'CHG' : 'same'}  ${D}${v.signals.rule}${X}`);
}

const N = corpus.pairs.length;
const coverage = proven / N;
const provenAcc = proven ? correct / proven : 1;
console.log(`\n${B}=== SELECTIVE METRICS ===${X}`);
console.log(`  proven (committed) : ${proven}/${N}   coverage ${(coverage * 100).toFixed(1)}%`);
console.log(`  accuracy on proven : ${(provenAcc * 100).toFixed(1)}%   ${wrong.length === 0 ? G + '(ZERO errors on committed decisions)' + X : R + 'errors: ' + wrong.join(', ') + X}`);
console.log(`  abstained (deferred): ${abstained}/${N}   ${D}→ ${abstainList.join(', ')}${X}`);
console.log(`\n  ${D}Read: on ${(coverage * 100).toFixed(0)}% of cases the engine is provably certain and never wrong;`);
console.log(`  the remaining ${(100 - coverage * 100).toFixed(0)}% are deferred to the LLM/consensus tier or a human.${X}`);

// RESULT line for the regression aggregator (proven-tier must have ZERO errors).
console.log(`\n${B}RESULT:${X} ${correct} passed, ${wrong.length} failed`);
process.exit(wrong.length ? 1 : 0);
