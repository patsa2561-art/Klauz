// SMART IMPORT PARSER for the /journey page.
//
// Why this exists:
//   v1 of /journey rejected any file that wasn't a top-level array with a
//   terse error "not an array". Users had no way to know what file format
//   was even expected. This module makes Import accept every file Klauz
//   itself ever produces, plus the obvious user-friendly variations.
//
// Accepted shapes (in priority order):
//   1. Journey export   — Array<entry>                                (legacy + current Export JSON)
//   2. Chain export     — { version: 'klauz-chain-v1', chain: [...] } (current Export chain)
//   3. Combined export  — { journey: [...], chain: { version, chain: [...] } }
//   4. Single entry     — { id, ts, ... }   (someone grabbed one row)
//
// Return shape:
//   { kind: 'journey'|'chain'|'combined'|'invalid',
//     journey: entry[] | null,
//     chain:   chainObject | null,
//     reason:  string  (only when kind === 'invalid') }
//
// THIS FILE IS DUPLICATED INLINE INSIDE public/journey.html so the browser
// can run it without an extra HTTP request. Keep the two copies in sync —
// the test suite below pins the contract for both.

export const CHAIN_VERSION = 'klauz-chain-v1';

function isJourneyEntry(e) {
  // a journey entry must at minimum be an object with an id or ts AND some
  // descriptor field (type/kind/summary). We're lenient so old exports load.
  if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
  if (!e.id && !e.ts) return false;
  return ('type' in e) || ('kind' in e) || ('summary' in e) || ('title' in e) || ('chain_link' in e);
}

function looksLikeChain(c) {
  return c && typeof c === 'object' && c.version === CHAIN_VERSION && Array.isArray(c.chain);
}

export function detectFormat(parsed) {
  if (parsed == null) return { kind: 'invalid', journey: null, chain: null, reason: 'empty_or_null' };

  // 1) Pure array → journey
  if (Array.isArray(parsed)) {
    // an empty array IS valid (a wiped journey export). a non-empty array
    // is valid only if every element looks like a journey entry — partial
    // arrays of garbage are rejected so we don't silently inject junk.
    if (parsed.length === 0) return { kind: 'journey', journey: [], chain: null };
    if (parsed.every(isJourneyEntry)) return { kind: 'journey', journey: parsed, chain: null };
    return { kind: 'invalid', journey: null, chain: null, reason: 'array_contains_non_entries' };
  }

  if (typeof parsed !== 'object') {
    return { kind: 'invalid', journey: null, chain: null, reason: 'not_object_or_array' };
  }

  // 2) Pure chain at top level
  if (looksLikeChain(parsed)) {
    return { kind: 'chain', journey: null, chain: parsed };
  }

  // 3) Combined { journey, chain }
  const hasJ = Array.isArray(parsed.journey);
  const hasC = looksLikeChain(parsed.chain);
  if (hasJ && hasC) return { kind: 'combined', journey: parsed.journey, chain: parsed.chain };
  if (hasJ)        return { kind: 'journey',  journey: parsed.journey, chain: null };
  if (hasC)        return { kind: 'chain',    journey: null,           chain: parsed.chain };

  // 4) A single entry — wrap in array
  if (isJourneyEntry(parsed)) {
    return { kind: 'journey', journey: [parsed], chain: null };
  }

  return { kind: 'invalid', journey: null, chain: null, reason: 'unrecognized_klauz_format' };
}

// Build the bytes for the "download example file" button on /journey.
// We hand-craft this rather than serializing a real-but-fake entry so the
// example is small, readable, and clearly labelled as an example.
export function exampleCombinedFile() {
  return {
    _note: 'Example Klauz import file — combined journey + chain. Generated for documentation.',
    journey: [
      {
        id: 'k_example_001',
        ts: '2026-06-29T10:00:00.000Z',
        type: 'tripwire',
        title: 'Tripwire scan (example)',
        summary: {
          persona: 'consumer',
          parties: ['Acme Co.', 'You'],
          findings: [
            { id: 'auto_renewal', label: 'Auto-renewal', category: 'lockin', risk: 'high' },
          ],
          high_risk: 1,
          medium_risk: 0,
          total: 1,
        },
      },
    ],
    chain: {
      version: CHAIN_VERSION,
      chain: [],   // empty; real chains are produced by Save-to-Journey on the main page
    },
  };
}

// Plain-language reason text for a failed detection. The /journey UI maps these
// to a short user-facing message in EN + TH. Keeping the catalog here so the
// browser and Node tests agree on every code.
export const REASON_MESSAGES = Object.freeze({
  empty_or_null:                { en: 'The file was empty.',                                                       th: 'ไฟล์ว่าง' },
  not_object_or_array:          { en: 'The file is JSON but not in any shape Klauz recognizes.',                   th: 'JSON ใช่ แต่ไม่ใช่รูปแบบ Klauz' },
  array_contains_non_entries:   { en: 'The file is an array but the items inside are not Klauz journey entries.',  th: 'เป็น array แต่ของข้างในไม่ใช่ entry ของ Klauz' },
  unrecognized_klauz_format:    { en: 'Not a Klauz file. Did you mean to upload a contract instead?',              th: 'ไม่ใช่ไฟล์ Klauz — อยากอัปโหลดสัญญาไปที่หน้าแรกแทนหรือเปล่า?' },
});
