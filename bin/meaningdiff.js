#!/usr/bin/env node
// meaningdiff CLI — semantic diff for prose. Exit code 2 if high-risk meaning
// change found (so it works as a CI gate).
import fs from 'node:fs';
import { semanticDiff } from '../src/diff.js';
import { driftLedger } from '../src/driftledger.js';
import { ping, MODELS } from '../src/ollama.js';

const args = process.argv.slice(2);
const flags = { json: false, quiet: false, gate: false, parties: [] };
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json') flags.json = true;
  else if (a === '--quiet' || a === '-q') flags.quiet = true;
  else if (a === '--gate') flags.gate = true; // exit 2 on any meaning change (not just high)
  else if (a === '--parties') flags.parties = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--you') flags.you = args[++i];
  else if (a === '--intent') flags.intent = args[++i];
  else if (a === '-h' || a === '--help') { help(); process.exit(0); }
  else files.push(a);
}

function help() {
  console.log(`meaningdiff — semantic diff for prose (tracks meaning, not characters)

USAGE:
  meaningdiff <old> <new> [--parties "A,B"] [--json] [--quiet] [--gate]
  meaningdiff serve [port]                       local web UI
  meaningdiff certify <old> <new> [-o cert.pcr]  signed re-checkable diff
  meaningdiff verify <cert.pcr> <old> <new>      re-check a certificate
  meaningdiff lint <file>                         structural defects (no AI)
  meaningdiff merge3 <base> <left> <right>        3-way semantic merge
  meaningdiff reverse <file> --parties "A,B"      party-swap fairness test
  meaningdiff scan <file>                         known risky-clause scan
  meaningdiff blame <v1> <v2> ...                 which round introduced a clause
  meaningdiff freeze <clause> --intent "…"        sign a clause's intent
  meaningdiff intent-check <anchor.json> <doc>    check a frozen intent
  meaningdiff adversary <file> --parties "A,B" --you "B"   predict counter-redline
  meaningdiff covenant <old> <new> --rules x      policy-as-code gate
  meaningdiff drift <v1> <v2> ...                 cumulative meaning drift

FLAGS:
  --parties "A,B"  the two contract parties (for power/fairness direction)
  --json    machine-readable output
  --quiet   suppress progress
  --gate    exit 2 on ANY meaning change (default: exit 2 only on HIGH risk)

EXIT CODES:
  0  no meaning change (or cosmetic only)
  2  meaning change detected (CI gate fails)
  1  error

ENV: MEANINGDIFF_OLLAMA, MEANINGDIFF_EMBED (default bge-m3), MEANINGDIFF_JUDGE (default gemma3:12b)`);
}

const SEV_COLOR = { high: '\x1b[41m\x1b[97m', medium: '\x1b[43m\x1b[30m', low: '\x1b[100m\x1b[97m', none: '' };
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

// === doctor / status: show auto-detected capabilities (LLM or deterministic) ===
if (files[0] === 'doctor' || files[0] === 'status' || files[0] === 'capabilities') {
  (async () => {
    const { detectCapabilities } = await import('../src/capabilities.js');
    const cap = await detectCapabilities();
    console.log(`\n${BOLD}🩺 meaningdiff doctor${RESET}`);
    console.log(`  local AI (Ollama): ${cap.ollama ? '\x1b[92mrunning\x1b[0m' : '\x1b[93mnot detected\x1b[0m'}`);
    if (cap.llm) {
      console.log(`  mode: \x1b[92m${BOLD}SMART${RESET}\x1b[0m  ${DIM}(LLM auto-connected — no API key, free, on this machine)${RESET}`);
      console.log(`  judge: ${BOLD}${cap.judge}${RESET}${cap.embed ? `   ${DIM}embed: ${cap.embed}${RESET}` : ''}`);
      console.log(`  installed models: ${DIM}${cap.models.join(', ')}${RESET}`);
    } else {
      console.log(`  mode: \x1b[93m${BOLD}DETERMINISTIC${RESET}\x1b[0m  ${DIM}(no AI required — certify / verify / lint / merge3 / scan + provable changes all work)${RESET}`);
      console.log(`  ${DIM}${cap.advice}${RESET}`);
    }
    console.log();
    process.exit(0);
  })();
} else
// === covenant subcommand: meaningdiff covenant old new --rules x.covenant ===
if (files[0] === 'covenant') {
  const ruleIdx = args.indexOf('--rules');
  const rulesFile = ruleIdx >= 0 ? args[ruleIdx + 1] : null;
  const fileArgs = files.slice(1).filter((f) => f !== rulesFile && f !== '--rules');
  (async () => {
    const p = await ping();
    if (!p.ok) { console.error('✗ Ollama not reachable'); process.exit(1); }
    if (fileArgs.length !== 2 || !rulesFile) { console.error('usage: meaningdiff covenant <old> <new> --rules <file.covenant> [--parties "A,B"]'); process.exit(1); }
    const { extractText } = await import('../src/extract.js');
    const { parseInvariants, checkCovenant } = await import('../src/covenant.js');
    const [a, b] = await Promise.all([extractText(fileArgs[0]), extractText(fileArgs[1])]);
    const invariants = parseInvariants(fs.readFileSync(rulesFile, 'utf8'));
    const res = await checkCovenant(a.text, b.text, invariants, { parties: flags.parties });
    if (flags.json) { console.log(JSON.stringify(res, null, 2)); process.exit(res.violations ? 2 : 0); }
    const vc = res.violations ? '\x1b[91m' : '\x1b[92m';
    console.log(`\n${BOLD}📜 Semantic Covenant${RESET}  ${fileArgs[0]} → ${fileArgs[1]}`);
    console.log(`  verdict: ${vc}${BOLD}${res.verdict}${RESET}  ·  ${res.violations} violation(s) of ${res.results.length} invariant(s)\n`);
    for (const r of res.results) {
      const icon = r.violated ? '\x1b[91m✗ VIOLATED\x1b[0m' : '\x1b[92m✓ ok\x1b[0m';
      console.log(`  ${icon}  ${BOLD}${r.name}${RESET} ${DIM}(${r.raw})${RESET}`);
      console.log(`     ${DIM}↳ ${r.detail}${RESET}`);
    }
    console.log();
    process.exit(res.violations ? 2 : 0);
  })().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
} else
// === serve subcommand: meaningdiff serve [port] → local web UI ===
if (files[0] === 'serve') {
  const port = parseInt(files[1] || process.env.MEANINGDIFF_PORT || '7700', 10);
  const { serve } = await import('../src/server.js');
  serve(port);
  // keep the process alive explicitly; never let an unhandled rejection kill the server
  process.on('uncaughtException', (e) => console.error('server error (handled):', e.message));
  process.on('unhandledRejection', (e) => console.error('server rejection (handled):', e?.message || e));
  // (browser is NOT auto-opened — the launcher script opens it; avoids killing the server)
} else
// === drift subcommand: meaningdiff drift v1 v2 v3 ... ===
if (files[0] === 'drift') {
  const versions = files.slice(1);
  (async () => {
    const p = await ping();
    if (!p.ok) { console.error(`✗ Ollama not reachable`); process.exit(1); }
    if (versions.length < 2) { console.error('drift needs ≥2 version files'); process.exit(1); }
    const t0 = Date.now();
    const led = await driftLedger(versions, {
      parties: flags.parties,
      onProgress: flags.quiet || flags.json ? undefined : (m) => process.stderr.write(`\r\x1b[2m${m}\x1b[0m\x1b[K`),
    });
    if (!flags.quiet && !flags.json) process.stderr.write('\r\x1b[K');
    if (flags.json) { console.log(JSON.stringify(led, null, 2)); process.exit(led.flags.silentCumulativeReversal ? 2 : 0); }

    console.log(`\n${BOLD}meaningdiff drift${RESET}  ${versions.length} versions  ${DIM}${((Date.now()-t0)/1000).toFixed(1)}s${RESET}`);
    console.log(`${DIM}per-step (each looked innocent?):${RESET}`);
    for (const s of led.perStep) {
      const flag = s.highRisk ? '\x1b[91mHIGH\x1b[0m' : 'ok';
      console.log(`   ${s.step}  changes=${s.meaningChanges} high=${s.highRisk} [${flag}]  tilt: ${s.tilt}`);
    }
    console.log(`\n${BOLD}endpoint v1 → v${versions.length}:${RESET} ${led.endpoint.verdict}  ·  net tilt: ${led.endpoint.tilt}`);
    if (led.cumulativePowerShift.byParty.length) {
      console.log(`\n${BOLD}⚖  cumulative power-shift across history:${RESET}`);
      for (const pp of led.cumulativePowerShift.byParty) {
        const bl = Math.round(pp.percent / 5);
        console.log(`     ${pp.party.padEnd(12)} ${'█'.repeat(bl)}${'░'.repeat(20-bl)} ${pp.percent}%`);
      }
    }
    const c = led.cohomology || {};
    console.log(`\n${BOLD}🌌 chronosheaf H¹:${RESET} ${c.h1 ?? '?'}  ·  obstruction: ${c.hasObstruction ? '\x1b[91mYES\x1b[0m' : 'no'}`);
    if (led.flags.silentCumulativeReversal) {
      console.log(`\n\x1b[41m\x1b[97m  SILENT CUMULATIVE REVERSAL DETECTED  ${RESET}`);
      console.log(`${DIM}  every step looked innocent, but the clause's intent reversed end-to-end.${RESET}`);
    } else {
      console.log(`\n  ${DIM}no silent reversal (either a step was already high-risk, or intent held)${RESET}`);
    }
    console.log(`${DIM}  HMAC sig: ${led.sig.slice(0, 32)}…${RESET}\n`);
    process.exit(led.flags.silentCumulativeReversal ? 2 : 0);
  })().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
} else
// === certify subcommand: meaningdiff certify <old> <new> [-o cert.pcr] ===
if (files[0] === 'certify') {
  const outIdx = args.indexOf('-o');
  const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
  const fileArgs = files.slice(1).filter((f) => f !== outFile && f !== '-o');
  (async () => {
    if (fileArgs.length !== 2) { console.error('usage: meaningdiff certify <old> <new> [-o cert.pcr]'); process.exit(1); }
    const { extractText } = await import('../src/extract.js');
    const { certify, describe } = await import('../src/pcr.js');
    const { autoConfigure } = await import('../src/capabilities.js');
    const [a, b] = await Promise.all([extractText(fileArgs[0]), extractText(fileArgs[1])]);
    // AUTO: if a local LLM is present, classify reworded clauses via the tribunal
    // (records PROVEN/CONSENSUS/ABSTAIN tier per clause INTO the signed cert);
    // otherwise certify deterministically (provable changes only).
    const cap = await autoConfigure();
    let annotate;
    if (cap.llm) { const { tribunalAnnotator } = await import('../src/tribunal.js'); annotate = tribunalAnnotator(flags.parties); }
    if (!flags.json) console.error(`${DIM}${cap.llm ? `meaning tier: tribunal · judge ${cap.judge}` : 'deterministic only (no local AI) — only provable changes are classified'}${RESET}`);
    const cert = await certify(a.text, b.text, { annotate });
    const dest = outFile || (fileArgs[1].replace(/\.[^.]+$/, '') + '.pcr');
    fs.writeFileSync(dest, JSON.stringify(cert, null, 2));
    if (flags.json) { console.log(JSON.stringify(cert, null, 2)); process.exit(0); }
    const s = cert.summary;
    console.log(`\n${BOLD}🔏 Proof-Carrying Redline${RESET}  ${fileArgs[0]} → ${fileArgs[1]}`);
    console.log(`  ${DIM}coverage:${RESET} ${s.coverage_complete ? '\x1b[92mCOMPLETE\x1b[0m (no clause hidden)' : '\x1b[91mINCOMPLETE\x1b[0m'}  ·  ${s.clauses_before}→${s.clauses_after} clauses`);
    console.log(`  ${DIM}changes:${RESET} ${s.changes}  ·  ${BOLD}proven (deterministic):${RESET} ${s.deterministic_changes}  ·  model-asserted: ${s.model_asserted}`);
    for (const e of cert.entries) {
      if (e.verdict === 'IDENTICAL') continue;
      const provN = e.verdict === 'TEXT_CHANGED' ? '\x1b[2m?\x1b[0m' : '\x1b[92m✓\x1b[0m';
      let tier = '';
      if (e.meaning && e.meaning.tier) {
        const t = e.meaning.tier;
        const col = t === 'PROVEN' ? '\x1b[92m' : t === 'CONSENSUS' ? '\x1b[96m' : '\x1b[93m';
        tier = ` ${col}[${t}]${RESET}`;
      }
      console.log(`   ${provN} ${describe(e)}${tier}`);
    }
    console.log(`\n  ${DIM}sig: ${cert.alg} ${cert.signature.slice(0, 24)}…  ·  merkle: ${cert.merkleRoot.slice(0, 16)}…${RESET}`);
    console.log(`  ${DIM}saved → ${dest}  ·  verify with:${RESET} meaningdiff verify ${dest} ${fileArgs[0]} ${fileArgs[1]}\n`);
    process.exit(0);
  })().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
} else
// === verify subcommand: meaningdiff verify <cert.pcr> <old> <new> ===
if (files[0] === 'verify') {
  const fileArgs = files.slice(1);
  (async () => {
    if (fileArgs.length !== 3) { console.error('usage: meaningdiff verify <cert.pcr> <old> <new>'); process.exit(1); }
    const { extractText } = await import('../src/extract.js');
    const { verify } = await import('../src/pcr.js');
    const cert = JSON.parse(fs.readFileSync(fileArgs[0], 'utf8'));
    const [a, b] = await Promise.all([extractText(fileArgs[1]), extractText(fileArgs[2])]);
    const res = verify(cert, a.text, b.text);
    if (flags.json) { console.log(JSON.stringify(res, null, 2)); process.exit(res.status === 'TAMPERED' ? 2 : 0); }
    const col = res.status === 'VALID' ? '\x1b[92m' : res.status === 'PARTIAL' ? '\x1b[93m' : '\x1b[91m';
    console.log(`\n${BOLD}🔎 PCR verify${RESET}  ${fileArgs[0]}`);
    console.log(`  status: ${col}${BOLD}${res.status}${RESET}`);
    for (const [k, v] of Object.entries(res.checks)) {
      if (typeof v === 'boolean') console.log(`   ${v ? '\x1b[92m✓\x1b[0m' : '\x1b[91m✗\x1b[0m'} ${k}`);
    }
    if (res.checks.model_asserted_claims) console.log(`   ${DIM}↳ ${res.checks.model_asserted_claims} meaning-claim(s) are model-asserted (not independently provable)${RESET}`);
    for (const p of res.problems) console.log(`   \x1b[91m· ${p}\x1b[0m`);
    console.log();
    process.exit(res.status === 'TAMPERED' ? 2 : 0);
  })().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
} else
// === reverse subcommand: meaningdiff reverse <file> --parties "A,B" ===
if (files[0] === 'reverse' || files[0] === 'fairness') {
  (async () => {
    if (files.length !== 2) { console.error('usage: meaningdiff reverse <file> --parties "A,B"'); process.exit(1); }
    const { extractText } = await import('../src/extract.js');
    const { reversibility } = await import('../src/reversibility.js');
    const doc = await extractText(files[1]);
    const r = reversibility(doc.text, flags.parties);
    if (r.error) { console.error('✗ ' + r.error); process.exit(1); }
    if (flags.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.summary.asymmetric ? 2 : 0); }
    const s = r.summary, vc = s.symmetry_score === 100 ? '\x1b[92m' : s.symmetry_score >= 60 ? '\x1b[93m' : '\x1b[91m';
    console.log(`\n${BOLD}⚖ Reversibility Test${RESET}  ${files[1]}  ${DIM}(would you sign it if it were aimed at you?)${RESET}`);
    console.log(`  verdict: ${vc}${BOLD}${s.verdict}${RESET}  ·  symmetry ${s.symmetry_score}/100  ·  ${s.asymmetric}/${s.obligations} one-sided  ·  ${s.tilt}\n`);
    for (const f of r.findings) console.log(`  \x1b[91m✗\x1b[0m ${DIM}favors ${f.favors}:${RESET} ${f.clause}`);
    if (!r.findings.length) console.log(`  ${DIM}(every obligation has a mirror — balanced)${RESET}`);
    console.log();
    process.exit(s.asymmetric ? 2 : 0);
  })().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
} else
// === scan subcommand: meaningdiff scan <file>  (risk-pattern fingerprint scan) ===
if (files[0] === 'scan') {
  (async () => {
    if (files.length !== 2) { console.error('usage: meaningdiff scan <file> [--parties "A,B"]'); process.exit(1); }
    const { extractText } = await import('../src/extract.js');
    const { scanRisky } = await import('../src/fingerprint.js');
    const doc = await extractText(files[1]);
    const r = scanRisky(doc.text, flags.parties);
    if (flags.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.summary.flagged ? 2 : 0); }
    console.log(`\n${BOLD}🧬 Clause risk scan${RESET}  ${files[1]}  ${DIM}(${r.summary.flagged}/${r.summary.clauses} flagged)${RESET}\n`);
    for (const f of r.findings) console.log(`  \x1b[93m▲\x1b[0m ${BOLD}${f.pattern}${RESET} ${DIM}[${f.fp}]${RESET}\n     ${f.clause}`);
    if (!r.findings.length) console.log(`  ${DIM}(no known risky patterns matched)${RESET}`);
    console.log();
    process.exit(r.summary.flagged ? 2 : 0);
  })().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
} else
// === blame subcommand: meaningdiff blame v1 v2 v3 ... ===
if (files[0] === 'blame') {
  (async () => {
    const vs = files.slice(1);
    if (vs.length < 2) { console.error('usage: meaningdiff blame <v1> <v2> [v3 ...]'); process.exit(1); }
    const { extractText } = await import('../src/extract.js');
    const { blame } = await import('../src/blame.js');
    const texts = await Promise.all(vs.map((f) => extractText(f)));
    const r = blame(texts.map((t) => t.text));
    if (r.error) { console.error('✗ ' + r.error); process.exit(1); }
    if (flags.json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
    console.log(`\n${BOLD}⏳ Meaning-Blame${RESET}  ${vs.length} versions  ${DIM}(when did each clause's wording arrive?)${RESET}\n`);
    for (const row of r.rows) console.log(`  ${DIM}${row.origin.padEnd(22)}${RESET} ${row.clause}`);
    console.log(`\n  ${DIM}from original: ${r.summary.from_original} · later: ${r.summary.changed_or_added_later} · entered last round: ${r.summary.entered_last_round}${RESET}\n`);
    process.exit(0);
  })().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
} else
// === adversary subcommand: meaningdiff adversary <file> --parties "A,B" --you "B" ===
if (files[0] === 'adversary') {
  (async () => {
    if (files.length !== 2) { console.error('usage: meaningdiff adversary <file> --parties "A,B" --you "B"'); process.exit(1); }
    const { extractText } = await import('../src/extract.js');
    const { adversary } = await import('../src/adversary.js');
    const doc = await extractText(files[1]);
    const r = adversary(doc.text, flags.parties, flags.you);
    if (r.error) { console.error('✗ ' + r.error); process.exit(1); }
    if (flags.json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
    console.log(`\n${BOLD}🥊 Negotiation Adversary${RESET}  ${files[1]}  ${DIM}(you=${r.summary.you} · predicting ${r.summary.them}'s asks)${RESET}\n`);
    for (const a of r.asks) console.log(`  \x1b[95m→\x1b[0m ${BOLD}${a.type}${RESET}: ${a.ask_en}\n     ${DIM}${a.clause}${RESET}`);
    if (!r.asks.length) console.log(`  ${DIM}(no clauses currently favor you — nothing obvious to pre-empt)${RESET}`);
    console.log(`\n  ${DIM}${r.summary.counter_asks} predicted counter-ask(s)${RESET}\n`);
    process.exit(0);
  })().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
} else
// === freeze subcommand: meaningdiff freeze <clauseFile> --intent "..." -o anchor.json ===
if (files[0] === 'freeze') {
  const outIdx = args.indexOf('-o');
  const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
  const fileArgs = files.slice(1).filter((f) => f !== outFile && f !== '-o');
  (async () => {
    if (fileArgs.length !== 1 || !flags.intent) { console.error('usage: meaningdiff freeze <clauseFile> --intent "what it must mean" [-o anchor.json] [--parties "A,B"]'); process.exit(1); }
    const { extractText } = await import('../src/extract.js');
    const { freezeIntent } = await import('../src/intent.js');
    const doc = await extractText(fileArgs[0]);
    const anchor = freezeIntent(doc.text.trim(), flags.intent, flags.parties);
    const dest = outFile || (fileArgs[0].replace(/\.[^.]+$/, '') + '.intent.json');
    fs.writeFileSync(dest, JSON.stringify(anchor, null, 2));
    console.log(`\n${BOLD}🔒 Intent frozen${RESET}  → ${dest}`);
    console.log(`  ${DIM}intent:${RESET} ${anchor.intent}\n  ${DIM}fp: ${anchor.skeleton_fp} · sig: ${anchor.signature.slice(0, 24)}…${RESET}`);
    console.log(`  ${DIM}check later:${RESET} meaningdiff intent-check ${dest} <newDoc>\n`);
    process.exit(0);
  })().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
} else
// === intent-check subcommand: meaningdiff intent-check <anchor.json> <newDoc> ===
if (files[0] === 'intent-check') {
  const fileArgs = files.slice(1);
  (async () => {
    if (fileArgs.length !== 2) { console.error('usage: meaningdiff intent-check <anchor.json> <newDoc> [--parties "A,B"]'); process.exit(1); }
    const { extractText } = await import('../src/extract.js');
    const { checkIntent } = await import('../src/intent.js');
    const anchor = JSON.parse(fs.readFileSync(fileArgs[0], 'utf8'));
    const doc = await extractText(fileArgs[1]);
    const r = checkIntent(anchor, doc.text, flags.parties);
    if (flags.json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.intact ? 0 : 2); }
    const col = r.status === 'INTACT' ? '\x1b[92m' : '\x1b[91m';
    console.log(`\n${BOLD}🔒 Intent check${RESET}  ${fileArgs[0]}`);
    console.log(`  intent: ${DIM}${r.intent}${RESET}`);
    console.log(`  status: ${col}${BOLD}${r.status}${RESET}  ${DIM}— ${r.detail_en}${RESET}\n`);
    process.exit(r.intact ? 0 : 2);
  })().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
} else
// === lint subcommand: meaningdiff lint <file> ===
if (files[0] === 'lint') {
  const fileArgs = files.slice(1);
  (async () => {
    if (fileArgs.length !== 1) { console.error('usage: meaningdiff lint <file>'); process.exit(1); }
    const { extractText } = await import('../src/extract.js');
    const { lint } = await import('../src/linter.js');
    const doc = await extractText(fileArgs[0]);
    const res = lint(doc.text);
    if (flags.json) { console.log(JSON.stringify(res, null, 2)); process.exit(res.summary.errors ? 2 : 0); }
    const s = res.summary;
    const vc = s.errors ? '\x1b[91m' : s.warnings ? '\x1b[93m' : '\x1b[92m';
    console.log(`\n${BOLD}🧹 Contract Linter${RESET}  ${fileArgs[0]}`);
    console.log(`  verdict: ${vc}${BOLD}${s.verdict}${RESET}  ·  ${s.errors} error(s) · ${s.warnings} warning(s)  ${DIM}(${s.sections} sections · ${s.defined_terms} defined terms)${RESET}\n`);
    for (const f of res.findings) {
      const ic = f.severity === 'error' ? '\x1b[91m✗\x1b[0m' : '\x1b[93m⚠\x1b[0m';
      console.log(`  ${ic} ${DIM}L${f.line}${RESET}  ${f.en}`);
    }
    if (!res.findings.length) console.log(`  ${DIM}(no structural defects)${RESET}`);
    console.log();
    process.exit(s.errors ? 2 : 0);
  })().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
} else
// === merge3 subcommand: meaningdiff merge3 <base> <left> <right> ===
if (files[0] === 'merge3') {
  const fileArgs = files.slice(1);
  (async () => {
    if (fileArgs.length !== 3) { console.error('usage: meaningdiff merge3 <base> <left> <right>'); process.exit(1); }
    const { extractText } = await import('../src/extract.js');
    const { merge3 } = await import('../src/merge3.js');
    const [b, l, r] = await Promise.all(fileArgs.map((f) => extractText(f)));
    const res = merge3(b.text, l.text, r.text);
    if (flags.json) { console.log(JSON.stringify(res, null, 2)); process.exit(res.summary.conflicts ? 2 : 0); }
    const s = res.summary;
    const vc = s.conflicts ? '\x1b[91m' : '\x1b[92m';
    console.log(`\n${BOLD}🔀 Semantic 3-way merge${RESET}  base=${fileArgs[0]}  ←LEFT ${fileArgs[1]}  RIGHT→ ${fileArgs[2]}`);
    console.log(`  verdict: ${vc}${BOLD}${s.verdict}${RESET}  ·  ${s.conflicts} conflict(s) · ${s.clean_merges} clean\n`);
    for (const c of res.conflicts) {
      console.log(`  \x1b[91m✗ CONFLICT\x1b[0m (${c.kind})`);
      console.log(`     ${DIM}base :${RESET} ${c.base}`);
      console.log(`     ${DIM}LEFT :${RESET} ${c.left}${c.left_change ? DIM + '  [' + c.left_change + ']' + RESET : ''}`);
      console.log(`     ${DIM}RIGHT:${RESET} ${c.right}${c.right_change ? DIM + '  [' + c.right_change + ']' + RESET : ''}`);
    }
    if (!res.conflicts.length) console.log(`  ${DIM}(no conflicts — the two redlines can be merged automatically)${RESET}`);
    console.log();
    process.exit(s.conflicts ? 2 : 0);
  })().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
} else
(async () => {
  if (files.length !== 2) { help(); process.exit(1); }
  // AUTO: detect a local LLM and wire it (smart mode); otherwise fall back to
  // deterministic mode automatically — never hard-fail just because there's no AI.
  const { autoConfigure, describeCapabilities } = await import('../src/capabilities.js');
  const cap = await autoConfigure();
  if (!flags.quiet && !flags.json) console.error(`${DIM}${describeCapabilities(cap)}${RESET}`);

  let oldText, newText;
  try {
    const { extractText } = await import('../src/extract.js');
    const [a, b] = await Promise.all([extractText(files[0]), extractText(files[1])]);
    oldText = a.text; newText = b.text;
    if (!flags.quiet && !flags.json && (a.engine !== 'raw' || b.engine !== 'raw'))
      console.error(`${DIM}extracted: ${files[0]} (${a.engine}) · ${files[1]} (${b.engine})${RESET}`);
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }

  const t0 = Date.now();
  const report = await semanticDiff(oldText, newText, {
    parties: flags.parties,
    onProgress: flags.quiet || flags.json ? undefined : (m) => process.stderr.write(`\r\x1b[2m${m}\x1b[0m\x1b[K`),
  });
  if (!flags.quiet && !flags.json) process.stderr.write('\r\x1b[K');

  if (flags.json) {
    console.log(JSON.stringify({ ...report, elapsedMs: Date.now() - t0 }, null, 2));
  } else {
    const s = report.summary;
    console.log(`\n${BOLD}meaningdiff${RESET}  ${files[0]} → ${files[1]}`);
    console.log(`${DIM}${s.oldChunks} old · ${s.newChunks} new · ${s.aligned} aligned · ${s.judged} judged · ${((Date.now()-t0)/1000).toFixed(1)}s${RESET}`);
    const vColor = s.highRisk ? '\x1b[91m' : s.meaningChanges ? '\x1b[93m' : '\x1b[92m';
    console.log(`\n  verdict: ${vColor}${BOLD}${s.verdict}${RESET}`);
    console.log(`  semantic-change-index: ${BOLD}${s.semanticChangeIndex}/100${RESET}  ·  meaning-changes: ${s.meaningChanges}  ·  high-risk: ${s.highRisk}`);

    // POWER-SHIFT METER
    if (s.powerShift && s.powerShift.byParty.length) {
      const ps = s.powerShift;
      const tiltCol = ps.oneSided ? '\x1b[91m' : '\x1b[93m';
      console.log(`\n  ${BOLD}⚖  power-shift:${RESET} ${tiltCol}${BOLD}${ps.tilt}${RESET}${ps.oneSided ? '  \x1b[91m(ONE-SIDED)\x1b[0m' : ''}`);
      for (const p of ps.byParty) {
        const barLen = Math.round(p.percent / 5);
        const bar = '█'.repeat(barLen) + '░'.repeat(20 - barLen);
        console.log(`     ${p.party.padEnd(14)} ${bar} ${p.percent}%`);
      }
    }
    console.log();

    for (const c of report.changes) {
      const tag = ` ${c.severity.toUpperCase()} `;
      const col = SEV_COLOR[c.severity] || '';
      console.log(`${col}${tag}${RESET} ${BOLD}${c.type}${RESET} ${DIM}(${c.category}${c.sim ? ', sim=' + c.sim.toFixed(2) : ''})${RESET}`);
      if (c.old) console.log(`   ${DIM}-${RESET} ${c.old}`);
      if (c.new) console.log(`   ${DIM}+${RESET} ${c.new}`);
      if (c.evidence && c.type !== 'ADDED' && c.type !== 'REMOVED') console.log(`   ${DIM}↳ ${c.evidence} — ${c.explanation}${RESET}`);
      console.log();
    }
    if (!report.changes.length) console.log(`  ${DIM}(no changes detected)${RESET}\n`);
  }

  const fail = flags.gate ? report.summary.meaningChanges > 0 : report.summary.highRisk > 0;
  process.exit(fail ? 2 : 0);
})().catch((e) => { console.error(`✗ ${e.stack || e.message}`); process.exit(1); });
