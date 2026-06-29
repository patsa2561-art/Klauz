// Objective evaluator: run the classifier on the labeled corpus, compare the
// predicted meaning_changed vs the ground-truth label, print a confusion matrix
// + precision / recall / F1 / accuracy. Every number here comes from a real run.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { embedBatch, cosine, ping, MODELS } from '../src/ollama.js';
import { classifyPair } from '../src/classify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus.json'), 'utf8'));

(async () => {
  const p = await ping();
  if (!p.ok) { console.error('✗ Ollama not reachable'); process.exit(1); }
  console.log(`meaningdiff evaluation · embed=${MODELS.EMBED_MODEL} judge=${MODELS.JUDGE_MODEL}`);
  console.log(`corpus: ${corpus.pairs.length} labeled pairs\n`);

  let tp = 0, tn = 0, fp = 0, fn = 0;
  const errors = [];
  const t0 = Date.now();

  for (const pair of corpus.pairs) {
    // embed the two sentences so classifyPair gets a real sim (mirrors prod path).
    // Degrade gracefully if embeddings are unavailable (Ollama down/busy) instead
    // of crashing the whole eval — the classifier still runs, sim is just 0.
    let sim = 0;
    try {
      const [vo, vn] = await embedBatch([pair.old, pair.new]);
      sim = cosine(vo, vn);
    } catch (e) {
      process.stdout.write(`  (embed unavailable for ${pair.id}: ${e.message.slice(0, 50)} — sim=0)\n`);
    }
    const cls = await classifyPair({ oldText: pair.old, newText: pair.new, sim });
    const pred = cls.meaning_changed;
    const truth = pair.meaning_changed;
    if (pred && truth) tp++;
    else if (!pred && !truth) tn++;
    else if (pred && !truth) { fp++; errors.push({ ...pair, pred, cls }); }
    else { fn++; errors.push({ ...pair, pred, cls }); }
    const mark = pred === truth ? '✓' : '✗';
    process.stdout.write(`${mark} ${pair.id.padEnd(9)} truth=${truth ? 'CHG' : 'same'} pred=${pred ? 'CHG' : 'same'} ${cls.category}/${cls.severity} sim=${sim.toFixed(3)}\n`);
  }

  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  const f1 = (2 * precision * recall) / (precision + recall || 1);
  const accuracy = (tp + tn) / corpus.pairs.length;

  console.log(`\n=== CONFUSION MATRIX (positive = meaning_changed) ===`);
  console.log(`  TP=${tp}  FP=${fp}`);
  console.log(`  FN=${fn}  TN=${tn}`);
  console.log(`\n=== METRICS (real, from this run) ===`);
  console.log(`  accuracy : ${(accuracy * 100).toFixed(1)}%  (${tp + tn}/${corpus.pairs.length})`);
  console.log(`  precision: ${(precision * 100).toFixed(1)}%  (of flagged changes, how many real)`);
  console.log(`  recall   : ${(recall * 100).toFixed(1)}%  (of real changes, how many caught)`);
  console.log(`  F1       : ${(f1 * 100).toFixed(1)}%`);
  console.log(`  elapsed  : ${((Date.now() - t0) / 1000).toFixed(1)}s  (${((Date.now() - t0) / corpus.pairs.length).toFixed(0)}ms/pair)`);

  if (errors.length) {
    console.log(`\n=== MISCLASSIFIED (${errors.length}) — honest error list ===`);
    for (const e of errors) {
      console.log(`  [${e.pred && !e.meaning_changed ? 'FALSE-POSITIVE' : 'FALSE-NEGATIVE'}] ${e.id} (${e.note})`);
      console.log(`     old: ${e.old}`);
      console.log(`     new: ${e.new}`);
      console.log(`     engine said: ${e.cls.category}/${e.cls.severity} — ${e.cls.explanation}`);
    }
  } else {
    console.log(`\n  no misclassifications.`);
  }

  // FN on meaning changes is the dangerous error class for legal use.
  const dangerousFN = errors.filter(e => e.meaning_changed && !e.pred).length;
  console.log(`\n  dangerous false-negatives (missed real meaning change): ${dangerousFN}`);
  process.exit(0);
})().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
