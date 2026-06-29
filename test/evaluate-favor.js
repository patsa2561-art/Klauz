// Honest evaluator for Power-Shift DIRECTION. Runs the real classifier on the
// favor-corpus and checks whether the predicted favored party matches the
// ground-truth party. Every number here is from a real run.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { embedBatch, cosine, ping, MODELS } from '../src/ollama.js';
import { classifyPair } from '../src/classify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'favor-corpus.json'), 'utf8'));

(async () => {
  const p = await ping();
  if (!p.ok) { console.error('✗ Ollama not reachable'); process.exit(1); }
  console.log(`Power-Shift direction evaluation · judge=${MODELS.JUDGE_MODEL}`);
  console.log(`parties: ${corpus.parties.join(' vs ')} · ${corpus.pairs.length} pairs\n`);

  let correct = 0, wrong = 0, neutral = 0;
  const errors = [];
  for (const pair of corpus.pairs) {
    let sim = 0;
    try { const [vo, vn] = await embedBatch([pair.old, pair.new]); sim = cosine(vo, vn); }
    catch (e) { process.stdout.write(`  (embed unavailable for ${pair.id}: ${e.message.slice(0, 45)} — sim=0)\n`); }
    const cls = await classifyPair({ oldText: pair.old, newText: pair.new, sim }, corpus.parties);
    const pred = (cls.favors || 'neutral').trim();
    const truth = pair.favors;
    const hit = pred.toLowerCase() === truth.toLowerCase();
    if (hit) correct++;
    else if (/^neutral$/i.test(pred)) { neutral++; errors.push({ ...pair, pred }); }
    else { wrong++; errors.push({ ...pair, pred }); }
    console.log(`${hit ? '✓' : '✗'} ${pair.id.padEnd(4)} truth=${truth.padEnd(9)} pred=${pred.padEnd(9)} ${cls.category}/${cls.severity}`);
  }

  const acc = correct / corpus.pairs.length;
  console.log(`\n=== POWER-SHIFT DIRECTION (real run) ===`);
  console.log(`  correct        : ${correct}/${corpus.pairs.length}  (${(acc * 100).toFixed(1)}%)`);
  console.log(`  wrong-direction: ${wrong}  (flagged the WRONG party — dangerous)`);
  console.log(`  abstained      : ${neutral}  (said neutral when a side was favored)`);
  if (errors.length) {
    console.log(`\n=== ERRORS (honest) ===`);
    for (const e of errors) {
      console.log(`  ${e.id}: truth=${e.favors} pred=${e.pred} — ${e.note}`);
      console.log(`     old: ${e.old}`);
      console.log(`     new: ${e.new}`);
    }
  }
  process.exit(0);
})().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
