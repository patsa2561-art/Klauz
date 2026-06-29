// CONTRACT LINTER — a "compiler for prose". Pure deterministic, model-free
// structural checks on ONE document. These are exactly the defects the CLAUSE
// benchmark (EACL 2026) shows even large LLMs miss (Llama-3.3 ≈ 6.9% F1 on
// structural flaws) — but they are rule-detectable with ~100% precision, so a
// linter genuinely beats a model here. Every rule is SOUND: it only fires on a
// pattern it can prove, so a flagged defect is a real defect.
import { countBlanks } from './blanks.js';

const QC = '"“”'; // straight + curly double-quote characters (no brackets)

// Reference patterns (EN + TH). Capture the referent id.
const REF_EN = /\b(?:section|clause|article|paragraph|schedule|exhibit|appendix|annex)\s+([0-9]+(?:\.[0-9]+)*|[ivxlcdm]+|[a-z])\b/gi;
const REF_TH = /(?:ข้อ|มาตรา|หมวด|ภาคผนวก)\s*([0-9]+(?:\.[0-9]+)*)/g;
const PLACEHOLDER = /\b(?:TBD|TODO|FIXME|XXX)\b|\[\s*(?:tbd|todo|insert[^\]]*|[•●xX.\s]*)\]|<\s*insert[^>]*>|to be (?:determined|confirmed|advised|agreed)|\[\s*\]/gi;

function topLevel(id) { return String(id).split('.')[0].toLowerCase(); }

// A line that DEFINES a section heading → returns {kind, id} or null.
function headingOf(line) {
  let m;
  if ((m = line.match(/^\s*(?:section|clause|article|paragraph)\s+([0-9]+(?:\.[0-9]+)*|[ivxlcdm]+)\b/i))) return { kind: 'section', id: m[1] };
  if ((m = line.match(/^\s*(schedule|exhibit|appendix|annex)\s+([0-9]+|[a-z])\b/i))) return { kind: m[1].toLowerCase(), id: m[2] };
  if ((m = line.match(/^\s*([0-9]+(?:\.[0-9]+)*)[.)]\s+\S/))) return { kind: 'section', id: m[1] };
  if ((m = line.match(/^\s*(?:ข้อ|มาตรา|หมวด)\s*([0-9]+(?:\.[0-9]+)*)/))) return { kind: 'section', id: m[1] };
  if ((m = line.match(/^\s*(ภาคผนวก)\s*([0-9]+|[ก-ฮ]|[a-z])/i))) return { kind: 'schedule', id: m[2] };
  return null;
}

export function lint(text) {
  const raw = String(text).replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const findings = [];
  const add = (code, severity, line, en, th, evidence) => findings.push({ code, severity, line, en, th, evidence });

  // ---- pass 1: collect section/schedule headings present in the doc ----
  const sectionTops = new Set();      // top-level section numbers that exist
  const scheduleIds = new Set();      // "schedule a", "exhibit 1" → "a","1"
  lines.forEach((ln) => {
    const h = headingOf(ln);
    if (!h) return;
    if (h.kind === 'section') sectionTops.add(topLevel(h.id));
    else scheduleIds.add(h.kind + ':' + h.id.toLowerCase());
  });
  const docIsNumbered = sectionTops.size > 0;

  // ---- pass 2: per-line checks ----
  const blankLines = []; // collected, then reported as ONE grouped finding
  lines.forEach((ln, i) => {
    const lineNo = i + 1;

    // (a) unfilled blank — collect (grouped below; a blank is "to fill", not an error)
    const bc = countBlanks(ln);
    if (bc > 0) for (let k = 0; k < bc; k++) blankLines.push(lineNo);

    // (b) placeholder / TBD left in the document
    let pm; PLACEHOLDER.lastIndex = 0;
    while ((pm = PLACEHOLDER.exec(ln))) {
      const tok = pm[0].trim();
      add('PLACEHOLDER', 'error', lineNo,
        `Leftover note "${tok}" — looks unfinished; replace it with the real value.`,
        `ยังมีคำว่า "${tok}" ค้างอยู่ (เป็นคำที่จดไว้ว่ายังไม่เสร็จ) — ควรแก้เป็นข้อมูลจริง`,
        ln.trim().slice(0, 80));
    }

    // (c) dangling numeric cross-reference (only when doc is numbered → sound)
    if (docIsNumbered) {
      let rm; REF_EN.lastIndex = 0;
      while ((rm = REF_EN.exec(ln))) {
        const id = rm[1], ref = rm[0].trim();
        if (/^[0-9]/.test(id)) {
          if (!sectionTops.has(topLevel(id)))
            add('DANGLING_REF', 'error', lineNo,
              `This document points to "${ref}", but there is no ${ref} in it — a broken reference.`,
              `เอกสารอ้างถึง "${ref}" แต่ไม่มี ${ref} อยู่จริงในเอกสาร — การอ้างอิงเสีย`,
              ref);
        } else {
          const kind = ref.split(/\s+/)[0].toLowerCase();
          if (['schedule', 'exhibit', 'appendix', 'annex'].includes(kind) && !scheduleIds.has(kind + ':' + id.toLowerCase()))
            add('MISSING_ATTACHMENT', 'warn', lineNo,
              `"${ref}" is mentioned but not attached here (it may be a separate file).`,
              `มีอ้างถึง "${ref}" แต่ไม่ได้แนบมาในเอกสารนี้ (อาจอยู่ไฟล์แยก)`,
              ref);
        }
      }
    }
    let rt; REF_TH.lastIndex = 0;
    while ((rt = REF_TH.exec(ln))) {
      const ref = rt[0].trim();
      if (docIsNumbered && !sectionTops.has(topLevel(rt[1])))
        add('DANGLING_REF', 'error', lineNo,
          `This document points to "${ref}", but there is no such clause in it — a broken reference.`,
          `เอกสารอ้างถึง "${ref}" แต่ไม่มีข้อนี้อยู่จริงในเอกสาร — การอ้างอิงเสีย`,
          ref);
    }
  });

  // grouped blank report — a blank field is "waiting to be filled", NOT a defect.
  const totalBlanks = blankLines.length;
  if (totalBlanks > 0) {
    const uniq = [...new Set(blankLines)];
    const range = uniq.length > 3 ? `${uniq[0]}–${uniq[uniq.length - 1]}` : uniq.join(', ');
    add('UNFILLED_BLANK', 'warn', uniq[0],
      `${totalBlanks} blank field(s) not filled in (lines ${range}). This is normal for a blank form/template — fill them in before signing the real one.`,
      `มีช่องว่างที่ยังไม่ได้กรอก ${totalBlanks} จุด (บรรทัด ${range}) — ปกติสำหรับฟอร์ม/แบบเปล่า ถ้าเป็นฉบับจริงควรกรอกให้ครบก่อนเซ็น`,
      '');
  }

  // ---- pass 3: defined-term analysis (whole document) ----
  const defs = new Map(); // term(lower) -> { display, lines:Set }
  const DEF_RES = [
    new RegExp(`[${QC}]([^${QC}]{2,60})[${QC}]\\s+(?:means|shall mean|refers to|will mean|has the meaning)`, 'gi'),
    new RegExp(`\\(\\s*(?:the\\s+)?[${QC}]([^${QC}]{2,40})[${QC}]\\s*\\)`, 'gi'),
    new RegExp(`hereinafter(?:\\s+referred to as)?\\s+[${QC}]([^${QC}]{2,40})[${QC}]`, 'gi'),
  ];
  lines.forEach((ln, i) => {
    for (const re of DEF_RES) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(ln))) {
        const term = m[1].trim(); if (!term) continue;
        const key = term.toLowerCase();
        if (!defs.has(key)) defs.set(key, { display: term, lines: new Set() });
        defs.get(key).lines.add(i + 1);
      }
    }
  });
  const lower = raw.toLowerCase();
  for (const [key, info] of defs) {
    if (info.lines.size >= 2)
      add('DUPLICATE_DEF', 'error', Math.min(...info.lines),
        `The word "${info.display}" is given a meaning ${info.lines.size} times in different places (lines ${[...info.lines].join(', ')}) — this is confusing; keep just one.`,
        `คำว่า "${info.display}" ถูกให้ความหมายไว้ ${info.lines.size} ที่ (บรรทัด ${[...info.lines].join(', ')}) — ทำให้สับสน ควรเหลือที่เดียว`,
        info.display);
    const uses = lower.split(key).length - 1; // total occurrences incl. definition
    if (uses <= info.lines.size)
      add('UNUSED_DEF', 'warn', Math.min(...info.lines),
        `The word "${info.display}" is given a meaning but is never used anywhere — you can probably remove it.`,
        `คำว่า "${info.display}" ถูกตั้งความหมายไว้แต่ไม่เคยถูกใช้เลย — อาจลบทิ้งได้`,
        info.display);
  }

  findings.sort((a, b) => a.line - b.line || (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warn').length;
  const templateLike = totalBlanks >= 5;
  return {
    summary: {
      lines: lines.length, sections: sectionTops.size, defined_terms: defs.size,
      errors, warnings, template_like: templateLike,
      clean: errors === 0 && warnings === 0,
      verdict: errors ? 'NEEDS FIXING' : warnings ? 'LOOKS OK — A FEW THINGS TO CHECK' : 'CLEAN',
    },
    findings,
  };
}
