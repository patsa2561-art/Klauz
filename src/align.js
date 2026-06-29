// Align OLD chunks <-> NEW chunks by semantic similarity.
// Greedy mutual-best-match on the cosine matrix. Unmatched OLD => REMOVED,
// unmatched NEW => ADDED. Returns aligned pairs + orphans with their scores.
import { cosine } from './ollama.js';
import { lexicalSim } from './heuristic.js';

// Lexical alignment — no embedding model needed (trigram Jaccard). Same greedy
// mutual-best-match shape as align(), but works on raw strings.
export function alignLexical(oldChunks, newChunks, minSim = 0.3) {
  const O = oldChunks.length, N = newChunks.length;
  const cand = [];
  for (let i = 0; i < O; i++)
    for (let j = 0; j < N; j++) {
      const s = lexicalSim(oldChunks[i], newChunks[j]);
      if (s >= minSim) cand.push([s, i, j]);
    }
  cand.sort((a, b) => b[0] - a[0]);
  const usedO = new Set(), usedN = new Set(), pairs = [];
  for (const [s, i, j] of cand) {
    if (usedO.has(i) || usedN.has(j)) continue;
    usedO.add(i); usedN.add(j);
    pairs.push({ oldIdx: i, newIdx: j, sim: s });
  }
  pairs.sort((a, b) => a.oldIdx - b.oldIdx);
  const removed = [], added = [];
  for (let i = 0; i < O; i++) if (!usedO.has(i)) removed.push(i);
  for (let j = 0; j < N; j++) if (!usedN.has(j)) added.push(j);
  return { pairs, removed, added };
}

// embeddings: { old: vec[], new: vec[] }
// minSim: pairs below this are NOT aligned (treated as add/remove)
export function align(oldVecs, newVecs, minSim = 0.55) {
  const O = oldVecs.length, N = newVecs.length;
  const sim = Array.from({ length: O }, () => new Float64Array(N));
  for (let i = 0; i < O; i++)
    for (let j = 0; j < N; j++)
      sim[i][j] = cosine(oldVecs[i], newVecs[j]);

  // Build candidate pairs sorted by similarity desc, take mutually until exhausted.
  const cand = [];
  for (let i = 0; i < O; i++)
    for (let j = 0; j < N; j++)
      if (sim[i][j] >= minSim) cand.push([sim[i][j], i, j]);
  cand.sort((a, b) => b[0] - a[0]);

  const usedO = new Set(), usedN = new Set();
  const pairs = [];
  for (const [s, i, j] of cand) {
    if (usedO.has(i) || usedN.has(j)) continue;
    usedO.add(i); usedN.add(j);
    pairs.push({ oldIdx: i, newIdx: j, sim: s });
  }
  pairs.sort((a, b) => a.oldIdx - b.oldIdx);

  const removed = [];
  for (let i = 0; i < O; i++) if (!usedO.has(i)) removed.push(i);
  const added = [];
  for (let j = 0; j < N; j++) if (!usedN.has(j)) added.push(j);

  return { pairs, removed, added };
}
