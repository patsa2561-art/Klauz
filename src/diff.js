// Orchestrator: text in -> semantic diff report out.
import { embedBatch, cosine } from './ollama.js';
import { chunk } from './chunk.js';
import { align } from './align.js';
import { alignLexical } from './align.js';
import { classifyPair } from './classify.js';

const SEV_RANK = { none: 0, low: 1, medium: 2, high: 3 };

// Alignment mode:
//   'lexical' (default) — trigram Jaccard, NO embedding model → no VRAM thrash,
//                         keeps only the judge model resident = fast + stable.
//   'embed'             — Ollama embeddings for alignment (better on heavy
//                         paraphrase, but loads a 2nd model). Opt in via
//                         MEANINGDIFF_ALIGN=embed.
const ALIGN_MODE = process.env.MEANINGDIFF_ALIGN || 'lexical';

export async function semanticDiff(oldText, newText, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const oldChunks = chunk(oldText);
  const newChunks = chunk(newText);

  // Non-Latin scripts (Thai, CJK, Arabic…) have no spaces, so trigram alignment
  // needs a LOWER threshold to still pair sentences. We keep lexical (NOT embed)
  // to avoid loading a 2nd model alongside the judge (VRAM thrash → timeouts).
  // For heavy multilingual paraphrase, opt into embed via MEANINGDIFF_ALIGN=embed.
  const nonLatin = /[฀-๿一-鿿぀-ヿ؀-ۿ가-힯]/.test(oldText + newText);
  const minSim = opts.minSim ?? (nonLatin ? 0.12 : 0.3);

  let aligned;
  if (ALIGN_MODE === 'embed') {
    onProgress(`embedding ${oldChunks.length} old + ${newChunks.length} new chunks…`);
    const [oldVecs, newVecs] = await Promise.all([
      oldChunks.length ? embedBatch(oldChunks) : Promise.resolve([]),
      newChunks.length ? embedBatch(newChunks) : Promise.resolve([]),
    ]);
    aligned = align(oldVecs, newVecs, opts.minSim ?? 0.55);
  } else {
    onProgress(`aligning ${oldChunks.length} old + ${newChunks.length} new chunks (lexical)…`);
    aligned = alignLexical(oldChunks, newChunks, minSim);
  }
  const { pairs, removed, added } = aligned;

  const changes = [];
  // classify aligned pairs (judge only the ones that differ)
  let judged = 0;
  for (let k = 0; k < pairs.length; k++) {
    const p = pairs[k];
    const cls = await classifyPair({
      oldText: oldChunks[p.oldIdx],
      newText: newChunks[p.newIdx],
      sim: p.sim,
    }, opts.parties || []);
    if (cls.judged) judged++;
    onProgress(`classified pair ${k + 1}/${pairs.length}`);
    if (cls.verdict === 'IDENTICAL') continue;
    changes.push({
      type: cls.verdict, // MEANING_CHANGED | REWORDED | REVIEW
      ...cls,
      favors: cls.favors || 'neutral',
      old: oldChunks[p.oldIdx],
      new: newChunks[p.newIdx],
    });
  }
  for (const i of removed)
    changes.push({
      type: 'REMOVED', meaning_changed: true, category: 'removal',
      severity: 'high', evidence: oldChunks[i], explanation: 'Sentence removed.',
      old: oldChunks[i], new: null, sim: 0, judged: false,
    });
  for (const j of added)
    changes.push({
      type: 'ADDED', meaning_changed: true, category: 'addition',
      severity: 'medium', evidence: newChunks[j], explanation: 'Sentence added.',
      old: null, new: newChunks[j], sim: 0, judged: false,
    });

  // Semantic Change Index: weighted by severity, normalized by document size.
  const weight = { none: 0, low: 1, medium: 4, high: 10 };
  const totalWeight = changes.reduce((a, c) => a + (weight[c.severity] || 0), 0);
  const denom = Math.max(oldChunks.length, newChunks.length, 1);
  const sci = Math.min(100, Math.round((totalWeight / denom) * 20));

  const meaningChanges = changes.filter((c) => c.meaning_changed);
  const highRisk = changes.filter((c) => c.severity === 'high');

  // POWER-SHIFT METER: aggregate which party each meaning-change favors,
  // weighted by severity, into a balance-of-power tilt.
  const favorWeight = {};
  for (const c of meaningChanges) {
    const party = (c.favors || 'neutral').trim();
    if (!party || /^neutral$/i.test(party)) continue;
    favorWeight[party] = (favorWeight[party] || 0) + (weight[c.severity] || 1);
  }
  const parties = Object.entries(favorWeight).sort((a, b) => b[1] - a[1]);
  const totalFavor = parties.reduce((a, [, w]) => a + w, 0);
  const powerShift = {
    byParty: parties.map(([party, w]) => ({
      party, weight: w, percent: totalFavor ? Math.round((w / totalFavor) * 100) : 0,
    })),
    tilt: parties.length
      ? (totalFavor === 0 ? 'balanced'
        : `${parties[0][0]} +${Math.round((parties[0][1] / totalFavor) * 100)}%`)
      : 'no directional shift',
    oneSided: parties.length > 0 && totalFavor > 0 &&
      Math.round((parties[0][1] / totalFavor) * 100) >= 70,
  };

  return {
    summary: {
      oldChunks: oldChunks.length,
      newChunks: newChunks.length,
      aligned: pairs.length,
      judged,
      added: added.length,
      removed: removed.length,
      meaningChanges: meaningChanges.length,
      highRisk: highRisk.length,
      semanticChangeIndex: sci,
      powerShift,
      verdict: highRisk.length ? 'MEANING-CHANGED (high-risk)' :
               meaningChanges.length ? 'MEANING-CHANGED' :
               changes.length ? 'COSMETIC-ONLY' : 'NO-CHANGE',
    },
    changes: changes.sort((a, b) => (SEV_RANK[b.severity] || 0) - (SEV_RANK[a.severity] || 0)),
  };
}
