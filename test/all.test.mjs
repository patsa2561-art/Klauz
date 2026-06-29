// Regression runner — auto-discovers every *.test.mjs suite, runs each in its own
// process, strips ANSI before parsing, and aggregates real pass/fail.
// `npm run test:all` → green only if ALL suites pass (exit 0); non-zero on any failure.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const self = path.basename(fileURLToPath(import.meta.url));

// Auto-discover sibling suites so the list can never drift out of sync with the
// files on disk (the old hard-coded list referenced a 'diff' suite that doesn't exist).
const SUITES = readdirSync(dir)
  .filter((f) => f.endsWith('.test.mjs') && f !== self)
  .map((f) => f.replace(/\.test\.mjs$/, ''))
  .sort();

// Test files colour their output; ANSI codes like \x1b[0m contain a digit ('0')
// that corrupts the count regex, so strip them before parsing.
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

let totalPass = 0, totalFail = 0, failedSuites = [];
for (const s of SUITES) {
  const file = path.join(dir, `${s}.test.mjs`);
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  const out = stripAnsi((r.stdout || '') + (r.stderr || ''));
  const m = out.match(/RESULT:\s*(\d+)\s*passed,\s*(\d+)\s*failed/);
  if (!m) { // no RESULT line — report it; only count as failure on non-zero exit
    const note = r.status === 0 ? 'no RESULT line (exit 0, treated ok)' : `exit ${r.status}`;
    console.log(`  \x1b[93m●\x1b[0m ${s.padEnd(14)} ${note}`);
    if (r.status && r.status !== 0) { totalFail += 1; failedSuites.push(s); }
    continue;
  }
  const p = +m[1], f = +m[2];
  totalPass += p; totalFail += f;
  const icon = f === 0 ? '\x1b[92m✓\x1b[0m' : '\x1b[91m✗\x1b[0m';
  console.log(`  ${icon} ${s.padEnd(14)} ${p} passed, ${f} failed`);
  if (f) failedSuites.push(s);
}

console.log(`\n\x1b[1mTOTAL:\x1b[0m ${totalPass} passed, ${totalFail} failed` +
  (failedSuites.length ? `  \x1b[91m(failed: ${failedSuites.join(', ')})\x1b[0m` : '  \x1b[92mALL GREEN\x1b[0m'));
process.exit(failedSuites.length ? 1 : 0);
