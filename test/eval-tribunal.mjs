// Tribunal evaluation — measures the two-tier selective pipeline (proof +
// adversarial LLM consensus) on the labeled corpus, and reports the
// accuracy-vs-coverage trade-off per tier. The honest target: keep accuracy on
// COMMITTED decisions as close to 100% as possible while pushing coverage up,
// and ABSTAIN (never silently guess) on the rest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tribunalVerdict } from '../src/tribunal.js';
import { ping } from '../src/ollama.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(fs.readFileSync(path.join(dir, process.argv[2] || 'corpus.json'), 'utf8'));
const G = '\x1b[92m', R = '\x1b[91m', Y = '\x1b[93m', D = '\x1b[2m', B = '\x1b[1m', X = '\x1b[0m';

(async () => {
  const p = await ping();
  if (!p.ok) { console.error('✗ Ollama not reachable'); process.exit(1); }
  const N = corpus.pairs.length;
  const tier = { PROOF: { dec: 0, ok: 0, wrong: [] }, CONSENSUS: { dec: 0, ok: 0, wrong: [] } };
  const abstained = [];
  const t0 = Date.now();

  for (const pair of corpus.pairs) {
    const v = await tribunalVerdict(pair.old, pair.new);
    if (v.abstain) {
      abstained.push(pair.id);
      console.log(`  ${Y}● ABSTAIN${X}  ${pair.id.padEnd(11)} ${D}truth=${pair.meaning_changed ? 'CHG' : 'same'} · ${v.tier} · ${v.reason}${X}`);
      continue;
    }
    const t = tier[v.tier === 'PROOF' ? 'PROOF' : 'CONSENSUS'];
    t.dec++;
    const correct = v.meaning_changed === pair.meaning_changed;
    if (correct) t.ok++; else t.wrong.push(pair.id);
    const icon = correct ? `${G}✓${X}` : `${R}✗${X}`;
    console.log(`  ${icon} ${(v.confidence).padEnd(9)} ${pair.id.padEnd(11)} pred=${v.meaning_changed ? 'CHG' : 'same'} truth=${pair.meaning_changed ? 'CHG' : 'same'} ${D}${v.tier}${X}`);
  }

  const decided = tier.PROOF.dec + tier.CONSENSUS.dec;
  const ok = tier.PROOF.ok + tier.CONSENSUS.ok;
  const wrong = [...tier.PROOF.wrong, ...tier.CONSENSUS.wrong];
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '100.0') + '%';

  console.log(`\n${B}=== TRIBUNAL: accuracy vs coverage (${N} pairs, ${((Date.now() - t0) / 1000).toFixed(0)}s) ===${X}`);
  console.log(`  ${B}PROOF tier${X}     decided ${tier.PROOF.dec}/${N} (cov ${pct(tier.PROOF.dec, N)})  accuracy ${pct(tier.PROOF.ok, tier.PROOF.dec)}  errors ${tier.PROOF.wrong.length}`);
  console.log(`  ${B}+CONSENSUS${X}     added  ${tier.CONSENSUS.dec}     accuracy ${pct(tier.CONSENSUS.ok, tier.CONSENSUS.dec)}  errors ${tier.CONSENSUS.wrong.length} ${tier.CONSENSUS.wrong.length ? R + '(' + tier.CONSENSUS.wrong.join(',') + ')' + X : ''}`);
  console.log(`  ${B}COMMITTED${X}      ${decided}/${N}  coverage ${pct(decided, N)}  ${B}accuracy ${pct(ok, decided)}${X}  silent-errors ${wrong.length}`);
  console.log(`  ${B}ABSTAINED${X}      ${abstained.length}/${N}  ${D}${abstained.join(', ')}${X}`);
  console.log(`\n  ${D}Honest read: of the cases the system COMMITS to, ${pct(ok, decided)} are correct;`);
  console.log(`  the ${abstained.length} abstentions are deferred to a human rather than guessed.${X}`);

  console.log(`\n${B}RESULT:${X} ${ok} passed, ${wrong.length} failed`);
  process.exit(wrong.length ? 1 : 0);
})().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
