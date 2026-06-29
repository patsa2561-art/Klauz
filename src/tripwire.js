// CONTEXT-AWARE LEGAL TRIPWIRE
//
// Many "risky" clauses are only risky for some readers. A non-compete kills a
// freelancer; an enterprise legal team negotiates it out. A class-action waiver
// barely matters to an enterprise; a consumer loses a real lever. Klauz lets the
// user declare WHO THEY ARE and re-ranks the same clause library against that
// context — same pattern, different verdict.
//
// Pure rules, no AI. Every match is sound (we show the exact snippet and the
// rule that fired). EN + TH detection.

export const PERSONAS = ['freelancer', 'sme', 'consumer', 'employee', 'enterprise'];

const SEV_RANK = { high: 3, medium: 2, low: 1, none: 0 };

// One pattern = one named tripwire. `risk` is the per-persona severity.
const PATTERNS = [
  {
    id: 'auto_renewal',
    label: { en: 'Auto-renewal', th: 'ต่ออายุอัตโนมัติ' },
    match: /\b(auto[-\s]?renew\w*|automatic(ally)?\s+(extend|renew)\w*|renews?\s+automatically)\b|ต่ออายุอัตโนมัติ|ต่อสัญญาอัตโนมัติ/i,
    why: { en: 'Locks you in past the term unless you actively cancel — easy to forget, hard to escape.', th: 'ผูกสัญญาต่อเองถ้าไม่ยกเลิก — ลืมง่าย ค้างจ่ายไม่รู้ตัว' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'high', employee: 'low', enterprise: 'medium' },
  },
  {
    id: 'unilateral_termination',
    label: { en: 'Unilateral termination "at will"', th: 'บอกเลิกฝ่ายเดียว' },
    match: /\b(may|right to|can)\s+terminat\w+.{0,60}(any\s*time|at\s*will|sole\s*discretion|without\s*cause|for\s*convenience|with(out|\s*no)\s*notice)\b|บอกเลิก.{0,30}(ฝ่ายเดียว|ตามดุลพินิจ|ทุกเมื่อ|ไม่ต้องมีเหตุ)/i,
    why: { en: 'The other side can end the deal at any time without cause. You have no security of duration.', th: 'อีกฝ่ายเลิกสัญญาได้ทุกเมื่อโดยไม่ต้องมีเหตุ คุณไม่มีความมั่นคงเรื่องระยะเวลา' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'medium', employee: 'medium', enterprise: 'low' },
  },
  {
    id: 'mandatory_arbitration',
    label: { en: 'Mandatory arbitration', th: 'อนุญาโตตุลาการบังคับ' },
    match: /\b(binding|mandatory|exclusive)\s+arbitration\b|\bdisputes?\s+.{0,40}(resolved\s+by|through)\s+arbitration\b|waiv\w+\s+.{0,20}(jury|trial)\b|อนุญาโตตุลาการ.{0,20}(บังคับ|เท่านั้น)|สละสิทธิ์.{0,20}(ศาล|คณะลูกขุน)/i,
    why: { en: 'Forces disputes into private arbitration (often pro-company) and waives your right to court / jury.', th: 'บังคับให้ฟ้องผ่านอนุญาโตฯ เท่านั้น (มักเข้าข้างบริษัท) สละสิทธิ์ขึ้นศาล' },
    risk: { freelancer: 'medium', sme: 'medium', consumer: 'high', employee: 'high', enterprise: 'low' },
  },
  {
    id: 'class_action_waiver',
    label: { en: 'Class-action waiver', th: 'สละสิทธิ์ฟ้องรวมกลุ่ม' },
    match: /\b(class[-\s]action\s+waiver|no\s+class\s+actions?|individually\s+.{0,40}arbitrat\w+|waiv\w+\s+.{0,20}class)\b|สละ.{0,20}(สิทธิ์|การ).{0,10}ฟ้อง.{0,10}(รวมกลุ่ม|กลุ่ม)/i,
    why: { en: 'You give up the right to join others in a class action — even if everyone was harmed the same way.', th: 'สละสิทธิ์ฟ้องเป็นกลุ่ม — ถ้าโดนแบบเดียวกันหลายคน คุณก็ต้องสู้คนเดียว' },
    risk: { freelancer: 'low', sme: 'medium', consumer: 'high', employee: 'medium', enterprise: 'low' },
  },
  {
    id: 'non_compete',
    label: { en: 'Non-compete', th: 'ห้ามแข่งขัน / ห้ามทำงานคู่แข่ง' },
    match: /\bnon[-\s]?compet\w+\b|\bshall\s+not\s+.{0,30}compet\w+\b|\brestrictive\s+covenant\b|\bnot\s+work\s+for\s+.{0,30}competitor\b|ห้ามแข่งขัน|ห้าม.{0,20}(ทำงาน|รับงาน).{0,20}คู่แข่ง/i,
    why: { en: 'Limits where you can work after the contract — devastating for freelancers and employees.', th: 'จำกัดการทำงานหลังจบสัญญา — กระทบหนักสำหรับฟรีแลนซ์/ลูกจ้าง' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'low', employee: 'high', enterprise: 'low' },
  },
  {
    id: 'unlimited_liability',
    label: { en: 'Unlimited liability', th: 'ความรับผิดไม่จำกัด' },
    match: /\b(unlimited\s+liability|liability\s+is\s+unlimited|no\s+(limit|cap|limitation)\s+on\s+(damages|liability))\b|รับผิด.{0,5}ไม่จำกัด|ความรับผิด.{0,10}ไม่จำกัด/i,
    why: { en: 'Your potential losses are uncapped. One incident could be financially catastrophic.', th: 'ขาดทุนได้ไม่จำกัด — เกิดเหตุครั้งเดียวอาจเสียหายมหาศาล' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'low', employee: 'low', enterprise: 'medium' },
  },
  {
    id: 'broad_ip_assignment',
    label: { en: 'Broad IP assignment', th: 'มอบทรัพย์สินทางปัญญาแบบกว้าง' },
    match: /\b(assigns?\s+all\s+.{0,40}(intellectual\s+property|inventions|work\s+product)|all\s+rights.{0,30}(assigned|transferred)|work\s+made\s+for\s+hire)\b|มอบ.{0,30}ทรัพย์สินทางปัญญา|โอนสิทธิ.{0,30}(ทั้งหมด|งานที่สร้าง)/i,
    why: { en: 'You hand over IP rights — sometimes wider than the actual project scope.', th: 'ส่งมอบทรัพย์สินทางปัญญา — บางครั้งกว้างเกิน ครอบคลุมงานนอกขอบเขต' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'low', employee: 'high', enterprise: 'low' },
  },
  {
    id: 'one_way_indemnity',
    label: { en: 'One-way indemnification', th: 'ชดใช้ฝ่ายเดียว' },
    match: /\byou\s+(shall|will|agree\s+to|must)\s+.{0,20}indemnif\w+\b|\bindemnif\w+\s+.{0,40}(the\s+company|provider|client|us)\b|ท่านตกลงชดใช้|ลูกค้า.{0,20}ชดใช้.{0,20}บริษัท/i,
    why: { en: 'You shoulder all third-party legal costs — but they don\'t reciprocate.', th: 'คุณรับผิดต่อค่าใช้จ่ายทางกฎหมายจากบุคคลที่สาม — แต่อีกฝ่ายไม่ต้องรับคืน' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'medium', employee: 'medium', enterprise: 'low' },
  },
  {
    id: 'unilateral_amendment',
    label: { en: 'Unilateral amendment', th: 'แก้สัญญาฝ่ายเดียว' },
    match: /\b(may|reserve\s+the\s+right\s+to)\s+(amend|modify|change|update)\s+.{0,40}(any\s*time|sole\s*discretion|without\s*notice)\b|update\s+these\s+.{0,30}(any\s*time)/i,
    why: { en: 'They can rewrite the rules whenever — today\'s agreement may be different tomorrow.', th: 'อีกฝ่ายแก้สัญญาเมื่อไรก็ได้ — ที่ตกลงวันนี้พรุ่งนี้อาจไม่เหมือนเดิม' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'high', employee: 'medium', enterprise: 'low' },
  },
  {
    id: 'data_ownership',
    label: { en: 'They own your data / content', th: 'เจ้าของข้อมูล/เนื้อหาคือบริษัท' },
    match: /\bwe\s+(own|retain)\s+.{0,30}(rights?|data|content)\b|\ball\s+.{0,30}data\s+.{0,20}(our|company)\s+(property|sole)\b|\bperpetual\s+.{0,40}license\s+to\s+.{0,40}(your|user)\b/i,
    why: { en: 'They claim ownership of data/content you provide — sometimes even after you leave.', th: 'บริษัทอ้างเป็นเจ้าของข้อมูล/เนื้อหาที่คุณให้ — บางครั้งครอบคลุมถึงหลังเลิกใช้บริการ' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'high', employee: 'low', enterprise: 'medium' },
  },
  {
    id: 'foreign_jurisdiction',
    label: { en: 'Foreign jurisdiction / venue', th: 'ใช้กฎหมาย/ศาลต่างประเทศ' },
    match: /\bgoverned\s+by\s+.{0,30}laws?\s+of\s+(delaware|california|new\s+york|england|wales|singapore|hong\s+kong|cayman)\b|\bexclusive\s+jurisdiction\s+.{0,30}(delaware|california|new\s+york|singapore|hong\s+kong)\b|ใช้กฎหมาย.{0,30}(สิงคโปร์|อังกฤษ|อเมริกา|ฮ่องกง|เดลาแวร์)/i,
    why: { en: 'You\'d need to sue in their home jurisdiction — usually impractical for individuals/small firms.', th: 'ต้องฟ้องในประเทศของพวกเขา — ค่าใช้จ่าย/เวลามหาศาล ในทางปฏิบัติทำไม่ได้' },
    risk: { freelancer: 'medium', sme: 'medium', consumer: 'medium', employee: 'low', enterprise: 'low' },
  },
  {
    id: 'penalty_clause',
    label: { en: 'Liquidated damages / penalty', th: 'ค่าปรับล่วงหน้า' },
    match: /\bliquidated\s+damages?\b|\bpenalty\s+of\s+.{0,20}\$?\d/i.source + '|' + /ค่าปรับ.{0,20}(วันละ|ครั้งละ|ฉบับละ|จำนวน)/i.source,
    matchFlags: 'i',
    why: { en: 'A fixed penalty applies regardless of actual damage caused.', th: 'ค่าปรับเป็นจำนวนตายตัว ไม่ขึ้นกับความเสียหายจริง' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'medium', employee: 'low', enterprise: 'medium' },
  },
  {
    id: 'exclusivity',
    label: { en: 'Exclusivity', th: 'ผูกขาดให้ฝ่ายเดียว' },
    match: /\b(exclusive(ly)?\s+(provide|engage|supply|partner)|sole\s+(provider|supplier)|shall\s+not\s+.{0,30}(engage|work\s+with)\s+.{0,30}(other|third\s+part))\b|ห้าม.{0,20}(ทำงาน|รับงาน|ขาย).{0,20}(บุคคลที่สาม|ผู้อื่น|รายอื่น)/i,
    why: { en: "Can't work with anyone else — risky when your income depends on multiple clients.", th: 'ห้ามทำงานกับลูกค้ารายอื่น — เสี่ยงถ้ารายได้พึ่งหลายราย' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'low', employee: 'medium', enterprise: 'low' },
  },
  {
    id: 'audit_right',
    label: { en: 'Audit / inspection of your books', th: 'สิทธิตรวจบัญชี/ระบบของคุณ' },
    match: /\b(audit\s+.{0,30}records|right\s+to\s+(inspect|audit)|may\s+.{0,20}audit\s+.{0,30}(you|customer|client|user)|examine\s+.{0,30}(books|records))\b|ตรวจสอบ.{0,30}(บัญชี|เอกสาร|ระบบ).{0,30}(ของท่าน|ของคุณ|ลูกค้า)/i,
    why: { en: 'They can inspect your books/systems — significant burden for small operations.', th: 'อีกฝ่ายเข้าตรวจบัญชี/ระบบของคุณได้ — เป็นภาระสำหรับรายเล็ก' },
    risk: { freelancer: 'medium', sme: 'high', consumer: 'low', employee: 'low', enterprise: 'medium' },
  },
  {
    id: 'late_fee',
    label: { en: 'Late fees / interest on overdue', th: 'ค่าปรับล่าช้า / ดอกเบี้ยผิดนัด' },
    match: /\blate\s+(fee|charge|payment\s+fee)\b|\binterest\s+(at|of)\s+.{0,15}(\d+(\.\d+)?)\s*%/i.source + '|' + /(ค่าปรับ|ดอกเบี้ย).{0,20}(ล่าช้า|ผิดนัด)/i.source,
    matchFlags: 'i',
    why: { en: 'Pay late and fees / interest pile up — sometimes at high rates.', th: 'จ่ายช้าค่าปรับ/ดอกเบี้ยพอกพูนเร็ว บางครั้งอัตราสูง' },
    risk: { freelancer: 'low', sme: 'medium', consumer: 'high', employee: 'low', enterprise: 'low' },
  },
  {
    id: 'broad_confidentiality',
    label: { en: 'One-way confidentiality', th: 'รักษาความลับฝ่ายเดียว' },
    match: /\byou\s+(shall|will|agree)\s+.{0,20}(keep\s+confidential|not\s+disclose)\b|\brecipient\s+shall\s+.{0,30}confidentialit\w+\b/i,
    why: { en: 'You have confidentiality duties — but the other side doesn\'t reciprocate.', th: 'คุณต้องรักษาความลับ — แต่อีกฝ่ายไม่มีหน้าที่กลับ' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'low', employee: 'low', enterprise: 'low' },
  },
];

// Build compiled RegExps once (some patterns use string concatenation above).
const COMPILED = PATTERNS.map((p) => ({
  ...p,
  _re: p.match instanceof RegExp ? p.match : new RegExp(p.match, p.matchFlags || 'i'),
}));

export function scanTripwire(text, persona = 'sme') {
  if (!PERSONAS.includes(persona)) persona = 'sme';
  const findings = [];
  for (const p of COMPILED) {
    // global match so we find every occurrence, not just the first
    const re = new RegExp(p._re.source, (p._re.flags || 'i') + (p._re.global ? '' : 'g'));
    let m;
    const seen = new Set();
    while ((m = re.exec(text)) !== null) {
      const key = p.id + '|' + m.index;
      if (seen.has(key)) break;
      seen.add(key);
      const sev = p.risk[persona] || 'low';
      findings.push({
        id: p.id,
        label: p.label,
        evidence: m[0],
        snippet: extractSnippet(text, m.index, m[0].length),
        why: p.why,
        risk: sev,
        risk_rank: SEV_RANK[sev],
        all_risks: p.risk,
      });
      if (re.lastIndex === m.index) re.lastIndex++; // avoid infinite loop on zero-width
    }
  }
  findings.sort((a, b) => b.risk_rank - a.risk_rank);
  const summary = {
    persona,
    total: findings.length,
    high: findings.filter((f) => f.risk === 'high').length,
    medium: findings.filter((f) => f.risk === 'medium').length,
    low: findings.filter((f) => f.risk === 'low').length,
  };
  return { summary, findings };
}

function extractSnippet(text, idx, len) {
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + len + 80);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).trim().replace(/\s+/g, ' ') + suffix;
}
