// meaningdiff — FULL LOOP end-to-end system test (cross-platform: Win/Mac/Linux).
//   npm run fullloop      (or: node test/fullloop.mjs)
// Exercises every layer — deterministic mode (no AI) → smart mode (local LLM, if
// present) → web server → eval suites — and prints a consolidated PASS/FAIL tally.
// Smart-mode checks auto-skip when no local LLM is found. Exit code = #failures.
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const node = process.execPath;
const tmp = os.tmpdir();
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
let pass = 0, fail = 0, skip = 0;
const log = [];
const chk = (name, cond, detail = '') => { if (cond) { pass++; log.push(`  [PASS] ${name}`); } else { fail++; log.push(`  [FAIL] ${name}  ${detail}`); } };
const skipped = (name, why) => { skip++; log.push(`  [SKIP] ${name} — ${why}`); };
const cli = (args, env = {}) => {
  const r = spawnSync(node, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 24 });
  return stripAnsi((r.stdout || '') + (r.stderr || ''));
};

async function main() {
  console.log('===== meaningdiff FULL LOOP (cross-platform) =====');

  // ---- PHASE 1: deterministic mode (force "no LLM") ----
  const noLLM = { MEANINGDIFF_OLLAMA: 'http://127.0.0.1:1' };
  const pcr = path.join(tmp, 'fl.pcr');
  chk('P1 doctor=DETERMINISTIC', cli(['bin/meaningdiff.js', 'doctor'], noLLM).includes('DETERMINISTIC'));
  cli(['bin/meaningdiff.js', 'certify', 'examples/contract.before.txt', 'examples/contract.after.txt', '-o', pcr, '-q'], noLLM);
  chk('P1 verify genuine=VALID', cli(['bin/meaningdiff.js', 'verify', pcr, 'examples/contract.before.txt', 'examples/contract.after.txt'], noLLM).includes('VALID'));
  chk('P1 verify tampered=TAMPERED', cli(['bin/meaningdiff.js', 'verify', pcr, 'examples/contract.before.txt', 'examples/clause.v1.txt'], noLLM).includes('TAMPERED'));
  chk('P1 lint runs', cli(['bin/meaningdiff.js', 'lint', 'examples/contract.before.txt'], noLLM).includes('Linter'));
  chk('P1 merge3 detects conflict', /CONFLICT|merge/.test(cli(['bin/meaningdiff.js', 'merge3', 'examples/clause.v1.txt', 'examples/clause.v2.txt', 'examples/clause.v3.txt'], noLLM)));
  chk('P1 scan runs', cli(['bin/meaningdiff.js', 'scan', 'examples/contract.after.txt'], noLLM).includes('risk scan'));
  chk('P1 reverse runs', cli(['bin/meaningdiff.js', 'reverse', 'examples/contract.after.txt', '--parties', 'Provider,Client'], noLLM).includes('Reversibility'));
  chk('P1 selective proof-tier 100%/0-err (EN)', cli(['test/eval-selective.mjs']).includes('accuracy on proven : 100.0%'));
  chk('P1 selective proof-tier 100%/0-err (TH)', cli(['test/eval-selective.mjs', 'thai-corpus.json']).includes('accuracy on proven : 100.0%'));

  // ---- detect whether this machine actually has a local LLM ----
  const smart = cli(['bin/meaningdiff.js', 'doctor']).includes('SMART');

  // ---- PHASE 2: smart mode ----
  if (smart) {
    const cmp = cli(['bin/meaningdiff.js', 'examples/contract.before.txt', 'examples/contract.after.txt', '--parties', 'Provider,Client']);
    chk('P2 compare verdict', cmp.includes('verdict'));
    chk('P2 compare power-shift', cmp.includes('power-shift'));
    chk('P2 certify tags a tier', /PROVEN|CONSENSUS|ABSTAIN/.test(cli(['bin/meaningdiff.js', 'certify', 'examples/contract.before.txt', 'examples/contract.after.txt', '-o', path.join(tmp, 'fl2.pcr'), '--parties', 'Provider,Client'])));
  } else { skipped('P2 smart-mode', 'no local LLM detected'); }

  // ---- PHASE 3: web server ----
  const srv = spawn(node, ['bin/meaningdiff.js', 'serve', '7767'], { cwd: root, stdio: 'ignore' });
  await sleep(3000);
  try {
    const j = async (p, opt) => (await fetch(`http://127.0.0.1:7767${p}`, opt)).text();
    chk('P3 /capabilities responds', /"mode"/.test(await j('/capabilities')));
    chk('P3 /health ok', (await j('/health')).includes('"ok":true'));
    const post = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    chk('P3 /diff verdict', (await j('/diff', post({ old: 'Pay within 30 days.', new: 'Pay within 60 days.', parties: 'Provider,Client' }))).includes('verdict'));
    chk('P3 /certify rows', /rows|PROVEN|CONSENSUS|ABSTAIN/.test(await j('/certify', post({ old: 'A shall pay.', new: 'A may pay.', parties: 'A,B' }))));
  } catch (e) { chk('P3 web server', false, e.message); }
  finally { srv.kill(); }

  // ---- PHASE 4: eval suites ----
  chk('P4 regression 80/0', cli(['test/all.test.mjs']).includes('TOTAL: 80 passed, 0 failed'));
  if (smart) {
    chk('P4 tribunal 0 silent-errors (EN)', cli(['test/eval-tribunal.mjs']).includes('silent-errors 0'));
    chk('P4 favor power-shift >= 90%', /\((9[0-9]|100)\.\d%\)/.test(cli(['test/evaluate-favor.js'])));
  } else { skipped('P4 LLM evals', 'no local LLM detected'); }

  console.log('\n' + log.join('\n'));
  console.log(`\n===== FULL LOOP: ${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''} =====`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FULL LOOP crashed:', e); process.exit(1); });
