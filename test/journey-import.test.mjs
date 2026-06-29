// Pins the import-format contract for the /journey page. Browser version
// of this parser is inlined in public/journey.html and MUST stay byte-for-byte
// behaviorally equivalent to src/journey-import.js (this is the source of
// truth + test surface).
import { detectFormat, REASON_MESSAGES, CHAIN_VERSION, exampleCombinedFile } from '../src/journey-import.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  \x1b[92m✓\x1b[0m ${n}`); } else { fail++; console.log(`  \x1b[91m✗ ${n}\x1b[0m`); } };
const S = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

// Helpers
const ENTRY = (over = {}) => ({
  id: 'k_001', ts: '2026-06-29T10:00:00Z', type: 'tripwire',
  title: 'scan', summary: { findings: [], parties: ['A', 'B'] }, ...over,
});
const CHAIN = (entries = []) => ({ version: CHAIN_VERSION, chain: entries });

S('1. Journey array — happy path');
ok('empty array → journey kind, empty journey',
  detectFormat([]).kind === 'journey' && detectFormat([]).journey.length === 0);
ok('array of valid entries → journey',
  detectFormat([ENTRY(), ENTRY({ id: 'k_002' })]).kind === 'journey');
ok('journey result carries through entries',
  detectFormat([ENTRY(), ENTRY({ id: 'k_002' })]).journey.length === 2);

S('2. Chain object — happy path');
{
  const c = CHAIN([{ seq: 0, link: 'a'.repeat(64) }]);
  const r = detectFormat(c);
  ok('top-level chain detected',     r.kind === 'chain');
  ok('chain reference preserved',    r.chain === c);
  ok('journey is null on pure chain', r.journey === null);
}
ok('empty chain (version + [] chain) still detected',
  detectFormat(CHAIN([])).kind === 'chain');

S('3. Combined export — both journey and chain');
{
  const file = { journey: [ENTRY()], chain: CHAIN([{ seq: 0, link: 'b'.repeat(64) }]) };
  const r = detectFormat(file);
  ok('combined kind',                r.kind === 'combined');
  ok('journey extracted',            Array.isArray(r.journey) && r.journey.length === 1);
  ok('chain extracted',              r.chain && Array.isArray(r.chain.chain));
}

S('4. Wrapped journey only / wrapped chain only');
ok('{ journey: [...] } → journey',
  detectFormat({ journey: [ENTRY()] }).kind === 'journey');
ok('{ chain: {...} } → chain',
  detectFormat({ chain: CHAIN([]) }).kind === 'chain');

S('5. Single-entry shorthand — wrap in array');
{
  const r = detectFormat(ENTRY());
  ok('single entry → journey kind',  r.kind === 'journey');
  ok('wrapped in 1-element array',   r.journey.length === 1 && r.journey[0].id === 'k_001');
}
ok('single entry with chain_link still detected',
  detectFormat({ id: 'k_99', ts: '2026-01-01T00:00:00Z', chain_link: 'c'.repeat(64) }).kind === 'journey');

S('6. Rejected garbage — every "invalid" path');
ok('null → invalid (empty_or_null)',
  detectFormat(null).kind === 'invalid' && detectFormat(null).reason === 'empty_or_null');
ok('undefined → invalid',
  detectFormat(undefined).kind === 'invalid' && detectFormat(undefined).reason === 'empty_or_null');
ok('number → invalid',
  detectFormat(42).kind === 'invalid' && detectFormat(42).reason === 'not_object_or_array');
ok('string → invalid',
  detectFormat('hello').kind === 'invalid' && detectFormat('hello').reason === 'not_object_or_array');
ok('array of numbers → invalid (array_contains_non_entries)',
  detectFormat([1, 2, 3]).reason === 'array_contains_non_entries');
ok('array containing one bad entry → invalid (no silent partial accept)',
  detectFormat([ENTRY(), 'oops', ENTRY({ id: 'k_002' })]).reason === 'array_contains_non_entries');
ok('object with no journey/chain keys → invalid (unrecognized)',
  detectFormat({ foo: 'bar', baz: 1 }).reason === 'unrecognized_klauz_format');
ok('chain with wrong version rejected',
  detectFormat({ version: 'klauz-chain-v999', chain: [] }).kind === 'invalid');
ok('chain without array rejected',
  detectFormat({ version: CHAIN_VERSION, chain: 'not array' }).kind === 'invalid');

S('7. Cross-contamination — combined with one half malformed falls back gracefully');
{
  // journey valid + chain wrong version → returns journey only, not combined.
  const r = detectFormat({ journey: [ENTRY()], chain: { version: 'bad', chain: [] } });
  ok('partial-bad combined: kind=journey',  r.kind === 'journey');
  ok('partial-bad combined: journey kept',  r.journey.length === 1);
  ok('partial-bad combined: chain dropped', r.chain === null);
}
{
  const r = detectFormat({ journey: 'not an array', chain: CHAIN([]) });
  ok('journey malformed + chain ok → chain kind', r.kind === 'chain');
}

S('8. REASON_MESSAGES catalog completeness');
{
  const codes = new Set(['empty_or_null','not_object_or_array','array_contains_non_entries','unrecognized_klauz_format']);
  let allCovered = true;
  for (const c of codes) {
    if (!REASON_MESSAGES[c] || !REASON_MESSAGES[c].en || !REASON_MESSAGES[c].th) allCovered = false;
  }
  ok('every reason code has EN + TH message', allCovered);
}

S('9. exampleCombinedFile — usable as Import input');
{
  const ex = exampleCombinedFile();
  const r = detectFormat(ex);
  ok('exampleCombinedFile is itself a valid combined file', r.kind === 'combined');
  ok('exampleCombinedFile has _note (so user knows it is an example)', typeof ex._note === 'string' && /example/i.test(ex._note));
  ok('exampleCombinedFile journey has one entry', ex.journey.length === 1);
}

S('10. Defense: prototype-polluted input does not crash detector');
{
  // simulated polluted object
  const evil = JSON.parse('{"__proto__":{"polluted":true},"journey":[{"id":"x","ts":"2026-01-01T00:00:00Z","type":"tripwire"}]}');
  let crashed = false;
  let r;
  try { r = detectFormat(evil); } catch { crashed = true; }
  ok('does not throw on polluted input', !crashed);
  ok('still extracts journey correctly', r && r.kind === 'journey' && r.journey.length === 1);
  ok('prototype pollution did not stick on plain {}', !({}).polluted);
}

console.log(`\n\x1b[1mRESULT:\x1b[0m ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
