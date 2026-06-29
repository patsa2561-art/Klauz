// SEMANTIC COVENANT — author-declared meaning-invariants enforced at edit time.
// A document carries rules (in a .covenant file or @invariant lines). Every edit
// is run through meaningdiff; if it violates a meaning-level invariant, the edit
// is REJECTED (exit 2) or routed to approval. "Unit tests, but for the meaning
// of prose." Verified novel (no prior tool enforces author meaning-invariants
// on edits). Built on existing primitives: semanticDiff + Power-Shift.
import { semanticDiff } from './diff.js';

// Invariant grammar (one per line; '#' comments allowed):
//   @invariant <name>: power <Party> <= <N>%        — no party may end up favored > N%
//   @invariant <name>: no-weaken                    — no obligation may weaken (modal_shift mandatory->permissive)
//   @invariant <name>: no-negation-flip             — no clause may be negated/un-negated
//   @invariant <name>: freeze "<phrase>"            — any meaning change touching <phrase> is forbidden
//   @invariant <name>: max-risk <none|low|medium>   — disallow changes above this severity
//   @invariant <name>: require-approvals <N>         — meaning changes need N sign-offs (advisory flag)
export function parseInvariants(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^@invariant\s+(\S+)\s*:\s*(.+)$/i);
    if (!m) continue;
    const name = m[1];
    const rule = m[2].trim();
    let mm;
    if ((mm = rule.match(/^power\s+(.+?)\s*<=\s*(\d+)\s*%$/i)))
      out.push({ name, type: 'power', party: mm[1].trim(), max: +mm[2], raw: rule });
    else if (/^no-weaken$/i.test(rule)) out.push({ name, type: 'no-weaken', raw: rule });
    else if (/^no-negation-flip$/i.test(rule)) out.push({ name, type: 'no-negation', raw: rule });
    else if ((mm = rule.match(/^freeze\s+"(.+)"$/i))) out.push({ name, type: 'freeze', phrase: mm[1], raw: rule });
    else if ((mm = rule.match(/^max-risk\s+(none|low|medium|high)$/i))) out.push({ name, type: 'max-risk', level: mm[1].toLowerCase(), raw: rule });
    else if ((mm = rule.match(/^require-approvals\s+(\d+)$/i))) out.push({ name, type: 'approvals', n: +mm[1], raw: rule });
    else out.push({ name, type: 'unknown', raw: rule });
  }
  return out;
}

const SEV_RANK = { none: 0, low: 1, medium: 2, high: 3 };

export async function checkCovenant(oldText, newText, invariants, opts = {}) {
  const parties = opts.parties || [];
  const report = await semanticDiff(oldText, newText, { parties });
  const changes = report.changes.filter((c) => c.meaning_changed);
  const ps = report.summary.powerShift || { byParty: [] };
  const results = [];

  for (const inv of invariants) {
    let violated = false, detail = '';
    switch (inv.type) {
      case 'power': {
        const p = ps.byParty.find((x) => x.party.toLowerCase() === inv.party.toLowerCase());
        const pct = p ? p.percent : 0;
        violated = pct > inv.max;
        detail = `${inv.party} favored ${pct}% (limit ${inv.max}%)`;
        break;
      }
      case 'no-weaken': {
        const w = changes.filter((c) => c.category === 'modal_shift');
        violated = w.length > 0;
        detail = violated ? `obligation weakened: ${w.map((c) => c.evidence).join('; ')}` : 'no obligation weakening';
        break;
      }
      case 'no-negation': {
        const n = changes.filter((c) => c.category === 'negation');
        violated = n.length > 0;
        detail = violated ? `negation flip: ${n.map((c) => c.evidence).join('; ')}` : 'no negation flip';
        break;
      }
      case 'freeze': {
        const hit = changes.filter((c) =>
          (c.old && c.old.toLowerCase().includes(inv.phrase.toLowerCase())) ||
          (c.new && c.new.toLowerCase().includes(inv.phrase.toLowerCase())) ||
          (c.evidence && c.evidence.toLowerCase().includes(inv.phrase.toLowerCase())));
        violated = hit.length > 0;
        detail = violated ? `frozen phrase "${inv.phrase}" changed: ${hit.map((c) => c.category).join(', ')}` : `"${inv.phrase}" unchanged`;
        break;
      }
      case 'max-risk': {
        const worst = changes.reduce((m, c) => Math.max(m, SEV_RANK[c.severity] || 0), 0);
        violated = worst > SEV_RANK[inv.level];
        detail = `worst change severity = ${Object.keys(SEV_RANK)[worst]} (allowed ≤ ${inv.level})`;
        break;
      }
      case 'approvals': {
        // advisory: flag how many sign-offs are required if any meaning change occurred
        violated = false;
        detail = changes.length ? `⚑ requires ${inv.n} approval(s): ${changes.length} meaning change(s)` : 'no change, no approval needed';
        break;
      }
      default:
        detail = `unknown rule: ${inv.raw}`;
    }
    results.push({ ...inv, violated, detail });
  }

  const violations = results.filter((r) => r.violated);
  return {
    verdict: violations.length ? 'COVENANT-VIOLATED' : 'COVENANT-OK',
    violations: violations.length,
    results,
    diff: report.summary,
  };
}
