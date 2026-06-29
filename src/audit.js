// SINGLE-DOCUMENT AUDIT — read ONE contract and report, per clause:
//   • who it favors  • risk level  • the obligation/risk in plain words
// This is the "I just have one contract, is it fair to me?" mode (no before/after).
// Built on the same gemma3 judge; extractive (quotes the clause), abstains when unsure.
import { judge } from './ollama.js';
import { chunk } from './chunk.js';

const AUDIT_SYS =
  'You are a business-document risk auditor. Works on ANY document type — contracts, ' +
  'employment/lease/service agreements, purchase orders (PO), invoices, quotations, NDAs, ' +
  'terms of service — in any language (Thai, English, etc.). For the GIVEN single line/clause, reply ONLY JSON: ' +
  '{"is_material":boolean,"category":"payment|pricing|delivery|quantity|liability|termination|obligation|ip|confidentiality|penalty|warranty|tax|other",' +
  '"risk":"none|low|medium|high","favors":"<which party benefits, from the PARTIES list, or \'balanced\'>",' +
  '"issue":"<the exact text/phrase that matters, verbatim>","why":"<one factual sentence on the risk/impact>"}. ' +
  'Rules: be extractive (quote real words, same language as the document). is_material=false for headers, ' +
  'addresses, logos, definitions, and pure boilerplate. ' +
  'risk=high for: unlimited liability, one-sided indemnity, unilateral termination, auto-renewal traps, large/% penalties, ' +
  'IP assignment away from the weaker party, waiver of rights, unusual payment terms (very long/short due dates, prepayment), ' +
  'price/quantity mismatches, hidden fees. If a clause clearly favors one named party, say which. ' +
  'Answer in the document\'s language for "why". If genuinely unsure, set risk=low and favors=balanced.';

const SEV_RANK = { none: 0, low: 1, medium: 2, high: 3 };

export async function auditDocument(text, opts = {}) {
  const parties = opts.parties || [];
  const onProgress = opts.onProgress || (() => {});
  const clauses = chunk(text);
  const findings = [];
  const partyLine = parties.length ? `PARTIES: ${parties.join(', ')}\n` : '';

  for (let i = 0; i < clauses.length; i++) {
    onProgress(`auditing clause ${i + 1}/${clauses.length}`);
    let r = null;
    try { r = await judge(AUDIT_SYS, `${partyLine}CLAUSE: ${clauses[i]}`); } catch (e) { /* skip on failure */ }
    if (!r || !r.is_material) continue;
    findings.push({
      clause: clauses[i],
      category: r.category || 'other',
      risk: r.risk || 'low',
      favors: r.favors || 'balanced',
      issue: r.issue || '',
      why: r.why || '',
    });
  }

  // aggregate power balance across material clauses, weighted by risk
  const weight = { none: 0, low: 1, medium: 4, high: 10 };
  const favorWeight = {};
  for (const f of findings) {
    const p = (f.favors || 'balanced').trim();
    if (!p || /^balanced$/i.test(p)) continue;
    favorWeight[p] = (favorWeight[p] || 0) + (weight[f.risk] || 1);
  }
  const ranked = Object.entries(favorWeight).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((a, [, w]) => a + w, 0);
  const balance = {
    byParty: ranked.map(([party, w]) => ({ party, percent: total ? Math.round((w / total) * 100) : 0 })),
    tilt: ranked.length ? (total === 0 ? 'balanced' : `${ranked[0][0]} +${Math.round((ranked[0][1] / total) * 100)}%`) : 'balanced',
    oneSided: ranked.length > 0 && total > 0 && Math.round((ranked[0][1] / total) * 100) >= 70,
  };
  const high = findings.filter((f) => f.risk === 'high');

  return {
    summary: {
      clauses: clauses.length,
      material: findings.length,
      highRisk: high.length,
      balance,
      verdict: high.length ? 'HIGH-RISK CLAUSES FOUND' : findings.length ? 'REVIEW RECOMMENDED' : 'NO MATERIAL ISSUES',
    },
    findings: findings.sort((a, b) => (SEV_RANK[b.risk] || 0) - (SEV_RANK[a.risk] || 0)),
  };
}
