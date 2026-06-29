// KLAUZ CHAIN — browser-side implementation. Mirrors src/chain.js exactly so
// the same chain can be built in the browser and verified in Node (or vice
// versa). Uses Web Crypto SubtleCrypto.digest('SHA-256') — no libraries.
//
// Stays self-contained: a sealed legal-tech artifact that anyone can audit.
// This file is loaded by journey.html.

(function () {
  'use strict';

  const GENESIS_PREV = '0'.repeat(64);
  const CHAIN_VERSION = 'klauz-chain-v1';
  const KIND_WHITELIST = new Set(['tripwire', 'templates', 'certify', 'diff', 'audit', 'lint']);

  async function sha256Hex(s) {
    const data = typeof s === 'string' ? new TextEncoder().encode(s) : s;
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function preimage(entry) {
    const parts = [
      String(entry.prev || ''),
      String(entry.ts || ''),
      String(entry.engine_hash || ''),
      String(entry.kind || ''),
      String(entry.input_hash || ''),
      String(entry.output_hash || ''),
    ];
    return parts.map((p) => p.length + ':' + p).join('|');
  }

  async function computeLink(entry) { return sha256Hex(preimage(entry)); }

  // Canonical JSON (deterministic key order) — mirrors stableJSON in src/chain.js.
  function stableJSON(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stableJSON).join(',') + ']';
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableJSON(v[k])).join(',') + '}';
  }

  async function hashInput(text)     { return sha256Hex(String(text || '')); }
  async function hashOutput(verdict) { return sha256Hex(stableJSON(verdict)); }

  // Append: { prev, ts, engine_hash, kind, input_hash, output_hash, [summary] }
  async function makeEntry(p) {
    if (!KIND_WHITELIST.has(p.kind)) throw new Error('unknown kind: ' + p.kind);
    if (!/^[0-9a-f]{64}$/.test(p.prev || ''))         throw new Error('prev must be 64-hex');
    if (!/^[0-9a-f]{64}$/.test(p.engine_hash || '')) throw new Error('engine_hash must be 64-hex');
    if (!/^[0-9a-f]{64}$/.test(p.input_hash  || '')) throw new Error('input_hash must be 64-hex');
    if (!/^[0-9a-f]{64}$/.test(p.output_hash || '')) throw new Error('output_hash must be 64-hex');
    if (!/^\d{4}-\d{2}-\d{2}T/.test(p.ts))            throw new Error('ts must be ISO-8601');
    const e = {
      seq: p.seq, prev: p.prev, ts: p.ts, engine_hash: p.engine_hash,
      kind: p.kind, input_hash: p.input_hash, output_hash: p.output_hash,
    };
    e.link = await computeLink(e);
    if (p.summary !== undefined) e.summary = p.summary;
    return e;
  }

  async function verifyChain(chain) {
    if (!chain || typeof chain !== 'object') return { ok: false, reason: 'not_object' };
    if (chain.version !== CHAIN_VERSION) return { ok: false, reason: 'wrong_version' };
    const entries = chain.chain;
    if (!Array.isArray(entries)) return { ok: false, reason: 'no_chain_array' };
    if (entries.length === 0) return { ok: true, length: 0, lastLink: GENESIS_PREV };

    let expectedPrev = GENESIS_PREV;
    const required = ['seq', 'prev', 'ts', 'engine_hash', 'kind', 'input_hash', 'output_hash', 'link'];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      for (const f of required) {
        if (!(f in e)) return { ok: false, brokenAt: i, reason: 'missing_' + f, lastValidIndex: i - 1 };
      }
      if (e.seq !== i) return { ok: false, brokenAt: i, reason: 'seq_mismatch', lastValidIndex: i - 1 };
      if (e.prev !== expectedPrev) return { ok: false, brokenAt: i, reason: 'prev_mismatch', lastValidIndex: i - 1 };
      const recomputed = await computeLink(e);
      if (recomputed !== e.link) return { ok: false, brokenAt: i, reason: 'link_mismatch', lastValidIndex: i - 1 };
      expectedPrev = e.link;
    }
    return { ok: true, length: entries.length, lastLink: expectedPrev };
  }

  // High-level helpers used by journey.html.
  async function loadChain() {
    try {
      const raw = localStorage.getItem('klauz_chain_v1');
      if (!raw) return { version: CHAIN_VERSION, chain: [] };
      const c = JSON.parse(raw);
      if (c && c.version === CHAIN_VERSION && Array.isArray(c.chain)) return c;
    } catch (_) {}
    return { version: CHAIN_VERSION, chain: [] };
  }
  function saveChain(c) { localStorage.setItem('klauz_chain_v1', JSON.stringify(c)); }

  async function appendReview({ kind, input_text, verdict, engine_hash, summary, ts }) {
    const c = await loadChain();
    const prev = c.chain.length ? c.chain[c.chain.length - 1].link : GENESIS_PREV;
    const e = await makeEntry({
      seq: c.chain.length,
      prev,
      ts: ts || new Date().toISOString(),
      engine_hash,
      kind,
      input_hash:  await hashInput(input_text || ''),
      output_hash: await hashOutput(verdict || {}),
      summary,
    });
    c.chain.push(e);
    saveChain(c);
    return e;
  }

  // Export to a portable JSON file the user can email / archive / attach to court filing.
  function exportChain() {
    const c = JSON.parse(localStorage.getItem('klauz_chain_v1') || '{}');
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'klauz-chain-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ⚠ Permanent — wipes the chain. Used in tests / by user-initiated reset.
  function resetChain() { localStorage.removeItem('klauz_chain_v1'); }

  window.KlauzChain = {
    GENESIS_PREV, CHAIN_VERSION,
    sha256Hex, computeLink, makeEntry, verifyChain,
    hashInput, hashOutput, stableJSON,
    loadChain, saveChain, appendReview, exportChain, resetChain,
  };
})();
