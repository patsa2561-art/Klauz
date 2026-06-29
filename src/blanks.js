// BLANK-FIELD ENGINE — the verified-novel wedge. Real forms/contracts (esp. Thai)
// are full of fillable blanks: ".......", "____", "…", "( )". Generic parsers
// treat each run of dots as content, so two copies of the same template (with
// slightly different dot counts) look totally different, and a blank template vs
// a filled instance look unrelated. We model a blank as ONE canonical field token
// so: (a) template==template, (b) template-vs-filled = "field completed with X".

const BLANK_RE = /(\.{3,}|·{3,}|…+|_{3,}|—{3,}|…+|(?:\.\s?){4,}|\(\s{2,}\)|\[\s*\])/g;
const FIELD = '⟨BLANK⟩';

// Canonicalize blanks → one token, so dot-count differences don't create fake diffs.
export function normalizeBlanks(text) {
  return text.replace(BLANK_RE, ' ' + FIELD + ' ').replace(/[ \t]+/g, ' ');
}

export function countBlanks(text) {
  return (text.match(BLANK_RE) || []).length;
}

// Compare a TEMPLATE (has blanks) against a FILLED instance line-by-line.
// Returns which fields got filled and with what. Heuristic + alignment-free:
// works per matching line where the template has ⟨BLANK⟩ and the filled line has
// content in that position.
export function extractFieldCompletions(templateText, filledText) {
  const tLines = templateText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fLines = filledText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const completions = [];
  for (const tl of tLines) {
    if (!BLANK_RE.test(tl)) { BLANK_RE.lastIndex = 0; continue; }
    BLANK_RE.lastIndex = 0;
    // label = text before the first blank on the template line
    const label = tl.split(BLANK_RE)[0].trim().replace(/[:：]$/, '');
    BLANK_RE.lastIndex = 0;
    if (!label) continue;
    // find the filled line that starts with the same label
    const match = fLines.find((fl) => fl.startsWith(label) || (label.length > 4 && fl.includes(label)));
    if (match) {
      const filledRest = match.slice(match.indexOf(label) + label.length).replace(/^[\s:：]+/, '').trim();
      const stillBlank = !filledRest || BLANK_RE.test(filledRest);
      BLANK_RE.lastIndex = 0;
      completions.push({ field: label, value: stillBlank ? null : filledRest, filled: !stillBlank });
    }
  }
  return completions;
}

export { FIELD, BLANK_RE };
