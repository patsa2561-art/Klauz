// Sentence/clause chunker. Keeps it deterministic + dependency-free.
// Splits on sentence terminators while protecting common abbreviations and
// enumerated legal clauses (e.g. "Section 1.2", "(a)", "No. 5").
import { normalizeBlanks } from './blanks.js';

const ABBREV = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'inc', 'ltd', 'llc', 'co',
  'corp', 'vs', 'etc', 'e.g', 'i.e', 'no', 'art', 'sec', 'fig', 'al',
]);

export function chunk(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/ /g, ' ');
  // Legal/Thai docs put one clause PER LINE (often with no period), so split on
  // EVERY newline — not just blank lines. Then split each line into sentences so
  // English paragraphs that pack several sentences on one line still separate.
  const normalized2 = normalizeBlanks(normalized);
  const lines = normalized2.split(/\n+/);
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = /[.!?;]/.test(trimmed) ? splitSentences(trimmed) : [trimmed];
    for (const s of parts) {
      const clean = s.trim().replace(/\s+/g, ' ');
      if (clean) out.push(clean);
    }
  }
  return out;
}

function splitSentences(para) {
  const sentences = [];
  let buf = '';
  const tokens = para.split(/(\s+)/);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    buf += tok;
    const m = tok.match(/([.!?;])["')\]]?$/);
    if (m) {
      // check previous word isn't a protected abbreviation
      const prevWord = tok.replace(/[.!?;"')\]]+$/, '').toLowerCase();
      if (ABBREV.has(prevWord)) continue;
      // don't split "1." or "(a)." style enumerators that begin a line
      if (/^\d+$|^[a-z]$|^[ivx]+$/i.test(prevWord) && buf.trim().length < 6) continue;
      sentences.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) sentences.push(buf);
  return sentences;
}
