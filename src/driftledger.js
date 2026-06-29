// DRIFTLEDGER — SUPER FUSION of:
//   • meaningdiff   (per-step semantic change + Power-Shift direction)
//   • mneme chronosheaf  (Čech H¹ cohomology — global obstruction local diffs miss)
//   • mneme HMAC audit pattern (tamper-evident drift ledger)
//
// Detects "silent cumulative reversal": a clause whose meaning flips across many
// versions where NO single diff looks alarming, but the accumulated power-shift
// reverses intent — and certifies it formally via H¹ > 0.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { semanticDiff } from './diff.js';

const execFileP = promisify(execFile);
const SEV_W = { none: 0, low: 1, medium: 4, high: 10 };

// Resolve the mneme bin once so we can call it via `node <bin>` with shell:false
// — this bypasses Windows cmd double-quote stripping that corrupts --json args.
let MNEME_BIN = null;
function mnemeBin() {
  if (MNEME_BIN !== null) return MNEME_BIN;
  try {
    const gRoot = execSync('npm root -g').toString().trim();
    const bin = path.join(gRoot, 'mneme-ai', 'bin', 'mneme.js');
    MNEME_BIN = fs.existsSync(bin) ? bin : '';
  } catch (e) { MNEME_BIN = ''; }
  return MNEME_BIN;
}

// Call the REAL mneme chronosheaf H¹ tool. Returns { h1, hasObstruction, obstructions } or null.
async function chronosheafH1(cover) {
  const bin = mnemeBin();
  if (!bin) return { error: 'mneme bin not found' };
  try {
    const { stdout } = await execFileP(
      'node',
      [bin, 'chronosheaf', 'first_cohomology', '--json', JSON.stringify({ cover })],
      { shell: false, timeout: 30000, maxBuffer: 1 << 20 }
    );
    const j = JSON.parse(stdout);
    return j.data || null;
  } catch (e) {
    return { error: (e.stderr || e.message || '').slice(0, 200) };
  }
}

// net favor across a sequence of per-step reports, weighted by severity
function cumulativeFavor(steps) {
  const tally = {};
  for (const s of steps) {
    for (const c of s.report.changes) {
      if (!c.meaning_changed) continue;
      const p = (c.favors || 'neutral').trim();
      if (!p || /^neutral$/i.test(p)) continue;
      tally[p] = (tally[p] || 0) + (SEV_W[c.severity] || 1);
    }
  }
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((a, [, w]) => a + w, 0);
  return {
    byParty: ranked.map(([party, w]) => ({ party, weight: w, percent: total ? Math.round((w / total) * 100) : 0 })),
    total,
  };
}

export async function driftLedger(versionFiles, opts = {}) {
  const parties = opts.parties || [];
  const onProgress = opts.onProgress || (() => {});
  const texts = versionFiles.map((f) => fs.readFileSync(f, 'utf8'));
  const n = texts.length;
  if (n < 2) throw new Error('need at least 2 versions');

  // 1) consecutive per-step semantic diffs
  const steps = [];
  for (let i = 0; i < n - 1; i++) {
    onProgress(`diffing v${i + 1} → v${i + 2}…`);
    const report = await semanticDiff(texts[i], texts[i + 1], { parties });
    const stepMax = report.changes.reduce((m, c) => Math.max(m, SEV_W[c.severity] || 0), 0);
    steps.push({ from: i + 1, to: i + 2, report, maxSeverityWeight: stepMax });
  }

  // 2) endpoint diff v1 vs vN (the "did the whole thing reverse?" check)
  onProgress(`diffing endpoints v1 → v${n}…`);
  const endpoint = await semanticDiff(texts[0], texts[n - 1], { parties });

  // 3) cumulative power-shift across all steps
  const cumulative = cumulativeFavor(steps);

  // 4) chronosheaf cover: sites = versions; overlap[i,i+1] when that step is
  //    "innocent" (no HIGH-severity change). Plus the closing edge (v1,vN)
  //    asserting "this clause is supposed to be end-to-end stable". If every
  //    consecutive step is innocent but the endpoint reversed, the cycle has no
  //    valid filling triple → H¹ ≥ 1 = formal proof of silent cumulative reversal.
  const sites = texts.map((_, i) => `v${i + 1}`);
  const overlaps = [];
  for (let i = 0; i < n - 1; i++) {
    if (steps[i].maxSeverityWeight < SEV_W.high) overlaps.push([`v${i + 1}`, `v${i + 2}`]);
  }
  // The closing edge encodes the assumption "this clause should be end-to-end
  // stable". A triple only fills the cycle when the endpoints are GENUINELY
  // consistent (zero meaning change v1↔vN). If consecutive steps each look
  // compatible (overlap) yet the endpoints actually differ, we withhold the
  // triple → the cycle stays open → H¹ ≥ 1 = a certified "local-ok, global-broken".
  const endpointConsistent = endpoint.summary.meaningChanges === 0;
  overlaps.push([`v1`, `v${n}`]);
  const triples = [];
  if (n >= 3 && endpointConsistent) {
    for (let i = 0; i < n - 2; i++) triples.push([`v${i + 1}`, `v${i + 2}`, `v${i + 3}`]);
  }
  const cover = { sites, overlaps, ...(triples.length ? { triples } : {}) };
  onProgress('computing chronosheaf H¹…');
  const h1 = await chronosheafH1(cover);

  // 5) HMAC-signed ledger line (tamper-evident, mneme audit pattern)
  const secret = process.env.DRIFTLEDGER_SECRET || 'driftledger-v1';
  const body = {
    versions: versionFiles,
    perStep: steps.map((s) => ({
      step: `v${s.from}→v${s.to}`,
      meaningChanges: s.report.summary.meaningChanges,
      highRisk: s.report.summary.highRisk,
      tilt: s.report.summary.powerShift?.tilt || 'none',
    })),
    endpoint: {
      verdict: endpoint.summary.verdict,
      meaningChanges: endpoint.summary.meaningChanges,
      tilt: endpoint.summary.powerShift?.tilt || 'none',
    },
    cumulativePowerShift: cumulative,
    cohomology: h1,
    ts: new Date().toISOString(),
  };
  const sig = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');

  // 6) verdict — SILENT cumulative reversal = no single step looked alarming
  //    (every step below HIGH), yet the accumulated power-shift is heavily
  //    one-sided (≥70% toward a single party across ≥2 steps).
  const everyStepInnocent = steps.every((s) => s.maxSeverityWeight < SEV_W.high);
  const topShift = cumulative.byParty[0]?.percent || 0;
  const oneSidedDrift = topShift >= 70 && steps.length >= 2 && cumulative.total > 0;
  const silentReversal = everyStepInnocent && oneSidedDrift;
  const formalObstruction = !!(h1 && h1.hasObstruction);

  return {
    ...body,
    sig,
    flags: {
      silentCumulativeReversal: silentReversal,
      formalObstruction,
      everyStepInnocent,
      oneSidedDrift,
    },
  };
}
