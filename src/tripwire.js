// CONTEXT-AWARE LEGAL TRIPWIRE — v2 (43 patterns, EN + TH, with citations)
//
// Many "risky" clauses are only risky for some readers. A non-compete kills a
// freelancer; an enterprise legal team negotiates it out. A consent-to-all-
// processing clause violates PDPA §22 for a Thai consumer; an enterprise
// merely shrugs. Same clause, different verdict.
//
// Pure rules, no AI. Every match is sound (we show the exact snippet, the rule
// that fired, and — where applicable — the legal citation that backs it).
// Bilingual: detects English AND Thai surface forms.

export const PERSONAS = ['freelancer', 'sme', 'consumer', 'employee', 'enterprise'];

export const CATEGORIES = {
  lockin:     { en: 'Lock-in & duration',          th: 'ผูกระยะเวลา' },
  termination:{ en: 'Termination',                 th: 'การบอกเลิก' },
  dispute:    { en: 'Dispute resolution',          th: 'การระงับข้อพิพาท' },
  employment: { en: 'Employment & non-compete',    th: 'การจ้างงาน / ห้ามแข่ง' },
  liability:  { en: 'Liability & risk',            th: 'ความรับผิด' },
  ip:         { en: 'Intellectual property',       th: 'ทรัพย์สินทางปัญญา' },
  amendment:  { en: 'Amendment & control',         th: 'การแก้ไข / ควบคุม' },
  data:       { en: 'Data & privacy',              th: 'ข้อมูลส่วนบุคคล' },
  consumer:   { en: 'Consumer protection',         th: 'คุ้มครองผู้บริโภค' },
  ecommerce:  { en: 'E-commerce',                  th: 'พาณิชย์อิเล็กทรอนิกส์' },
  confid:     { en: 'Confidentiality',             th: 'การรักษาความลับ' },
  fees:       { en: 'Fees & penalties',            th: 'ค่าธรรมเนียม / ค่าปรับ' },
  audit:      { en: 'Audit & inspection',          th: 'การตรวจสอบ' },
  exclusivity:{ en: 'Exclusivity',                 th: 'การให้สิทธิเด็ดขาด' },
  lease:      { en: 'Lease & property',            th: 'เช่า / ทรัพย์สิน' },
};

const SEV_RANK = { high: 3, medium: 2, low: 1, none: 0 };

// === PATTERNS ==============================================================
// Each entry: { id, label{en,th}, category, match, why{en,th}, risk{p→sev}, cite? }
const PATTERNS = [
  // ── 1. LOCK-IN / DURATION ──────────────────────────────────────────────
  {
    id: 'auto_renewal', category: 'lockin',
    label: { en: 'Auto-renewal', th: 'ต่ออายุอัตโนมัติ' },
    match: /\b(auto[-\s]?renew\w*|automatic(ally)?\s+(extend|renew)\w*|renews?\s+automatically)\b|ต่ออายุอัตโนมัติ|ต่อสัญญาอัตโนมัติ/i,
    why: { en: 'Locks you in past the term unless you actively cancel — easy to forget, hard to escape.',
           th: 'ผูกสัญญาต่อเองถ้าไม่ยกเลิก — ลืมง่าย ค้างจ่ายไม่รู้ตัว' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'high', employee: 'low', enterprise: 'medium' },
  },
  {
    id: 'minimum_term', category: 'lockin',
    label: { en: 'Minimum lock-in term', th: 'ระยะผูกขั้นต่ำ' },
    match: /\b(minimum\s+(commitment|term|contract|period)|initial\s+term\s+of\s+\d+\s+(year|month)|locked?[-\s]?in\s+(period|term))\b|ระยะผูกพันขั้นต่ำ|สัญญาขั้นต่ำ\s*\d+\s*(ปี|เดือน)/i,
    why: { en: 'You cannot exit before the minimum term — exit fees usually apply.',
           th: 'ออกก่อนระยะขั้นต่ำไม่ได้ — มีค่าปรับ' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'medium', employee: 'low', enterprise: 'low' },
  },
  {
    id: 'early_termination_fee', category: 'lockin',
    label: { en: 'Early termination fee', th: 'ค่าปรับยกเลิกก่อนกำหนด' },
    match: /\b(early\s+termination\s+fee|exit\s+fee|cancellation\s+fee\s+of\s+.{0,20}\d)\b|ค่าปรับ.{0,15}(ยกเลิก|เลิกก่อน|ก่อนกำหนด)/i,
    why: { en: 'Specific penalty if you cancel before the term ends.',
           th: 'มีค่าปรับชัดเจนถ้ายกเลิกก่อนสัญญาหมด' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'high', employee: 'low', enterprise: 'low' },
  },

  // ── 2. TERMINATION ─────────────────────────────────────────────────────
  {
    id: 'unilateral_termination', category: 'termination',
    label: { en: 'Unilateral termination at will', th: 'บอกเลิกฝ่ายเดียว' },
    match: /\b(may|right\s+to|can)\s+terminat\w+.{0,60}(any\s*time|at\s*will|sole\s*discretion|without\s*cause|for\s*convenience|with(out|\s*no)\s*notice)\b|บอกเลิก.{0,30}(ฝ่ายเดียว|ตามดุลพินิจ|ทุกเมื่อ|ไม่ต้องมีเหตุ)/i,
    why: { en: 'The other side can end the deal at any time without cause. You have no security of duration.',
           th: 'อีกฝ่ายเลิกสัญญาได้ทุกเมื่อโดยไม่ต้องมีเหตุ คุณไม่มีความมั่นคงเรื่องระยะเวลา' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'medium', employee: 'medium', enterprise: 'low' },
  },
  {
    id: 'no_cure_period', category: 'termination',
    label: { en: 'No cure period before termination', th: 'ไม่มีระยะให้แก้ไขก่อนเลิก' },
    match: /\bterminate\s+immediately\s+(upon|on)\s+(any|the\s+first)\s+breach\b|\bno\s+(cure|grace)\s+period\b|เลิกทันที.{0,30}(ผิดสัญญา|ฝ่าฝืน)/i,
    why: { en: 'Any tiny breach ends the contract instantly — no chance to fix it.',
           th: 'ผิดเล็กน้อยก็เลิกได้ทันที — ไม่มีโอกาสแก้' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'medium', employee: 'medium', enterprise: 'low' },
  },

  // ── 3. DISPUTE RESOLUTION ──────────────────────────────────────────────
  {
    id: 'mandatory_arbitration', category: 'dispute',
    label: { en: 'Mandatory arbitration', th: 'อนุญาโตตุลาการบังคับ' },
    match: /\b(binding|mandatory|exclusive)\s+arbitration\b|\bdisputes?\s+.{0,40}(resolved\s+by|through)\s+arbitration\b|waiv\w+\s+.{0,20}(jury|trial)\b|อนุญาโตตุลาการ.{0,20}(บังคับ|เท่านั้น)|สละสิทธิ์.{0,20}(ศาล|คณะลูกขุน)/i,
    why: { en: 'Forces disputes into private arbitration (often pro-company) and waives your right to court / jury.',
           th: 'บังคับให้ฟ้องผ่านอนุญาโตฯ เท่านั้น (มักเข้าข้างบริษัท) สละสิทธิ์ขึ้นศาล' },
    risk: { freelancer: 'medium', sme: 'medium', consumer: 'high', employee: 'high', enterprise: 'low' },
  },
  {
    id: 'class_action_waiver', category: 'dispute',
    label: { en: 'Class-action waiver', th: 'สละสิทธิ์ฟ้องรวมกลุ่ม' },
    match: /\b(class[-\s]action\s+waiver|no\s+class\s+actions?|individually\s+.{0,40}arbitrat\w+|waiv\w+\s+.{0,60}class\s+actions?)\b|สละ.{0,20}(สิทธิ์|การ).{0,10}ฟ้อง.{0,15}(รวมกลุ่ม|กลุ่ม)/i,
    why: { en: 'You give up the right to join others in a class action — even if everyone was harmed the same way.',
           th: 'สละสิทธิ์ฟ้องเป็นกลุ่ม — ถ้าโดนแบบเดียวกันหลายคน คุณก็ต้องสู้คนเดียว' },
    risk: { freelancer: 'low', sme: 'medium', consumer: 'high', employee: 'medium', enterprise: 'low' },
  },
  {
    id: 'foreign_jurisdiction', category: 'dispute',
    label: { en: 'Foreign jurisdiction / venue', th: 'ใช้กฎหมาย / ศาลต่างประเทศ' },
    match: /\bgoverned\s+by\s+.{0,30}laws?\s+of\s+(delaware|california|new\s+york|england|wales|singapore|hong\s+kong|cayman)\b|\bexclusive\s+jurisdiction\s+.{0,30}(delaware|california|new\s+york|singapore|hong\s+kong)\b|ใช้กฎหมาย.{0,30}(สิงคโปร์|อังกฤษ|อเมริกา|ฮ่องกง|เดลาแวร์)/i,
    why: { en: "You'd need to sue in their home jurisdiction — usually impractical for individuals/small firms.",
           th: 'ต้องฟ้องในประเทศของพวกเขา — ค่าใช้จ่าย/เวลามหาศาล ในทางปฏิบัติทำไม่ได้' },
    risk: { freelancer: 'medium', sme: 'medium', consumer: 'medium', employee: 'low', enterprise: 'low' },
  },
  {
    id: 'fee_shifting', category: 'dispute',
    label: { en: 'Fee-shifting against you', th: 'ค่าทนาย/ค่าธรรมเนียมตกฝั่งผู้แพ้' },
    match: /\b(prevailing\s+party\s+.{0,40}(attorneys?'?\s+)?fees?|loser\s+pays?|legal\s+(costs?|fees?)\s+.{0,30}(borne\s+by|paid\s+by)\s+(the\s+)?(losing|user|customer|client))\b|ผู้แพ้.{0,25}(ชำระ|รับภาระ|ต้องชำระ|ต้องจ่าย).{0,15}(ค่าทนาย|ค่าธรรมเนียม)/i,
    why: { en: "If you lose, you also pay their legal fees — magnifies the cost of being wrong.",
           th: 'แพ้คดีแล้วต้องจ่ายค่าทนายฝั่งตรงข้ามด้วย — เสียหลายเท่า' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'high', employee: 'medium', enterprise: 'low' },
  },

  // ── 4. EMPLOYMENT / IP ─────────────────────────────────────────────────
  {
    id: 'non_compete', category: 'employment',
    label: { en: 'Non-compete', th: 'ห้ามแข่ง / ห้ามทำงานคู่แข่ง' },
    match: /\bnon[-\s]?compet\w+\b|\bshall\s+not\s+.{0,30}compet\w+\b|\brestrictive\s+covenant\b|\bnot\s+work\s+for\s+.{0,30}competitor\b|ห้ามแข่งขัน|ห้าม.{0,20}(ทำงาน|รับงาน).{0,20}คู่แข่ง/i,
    why: { en: 'Limits where you can work after the contract — devastating for freelancers and employees.',
           th: 'จำกัดการทำงานหลังจบสัญญา — กระทบหนักสำหรับฟรีแลนซ์/ลูกจ้าง' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'low', employee: 'high', enterprise: 'low' },
  },
  {
    id: 'non_solicit', category: 'employment',
    label: { en: 'Non-solicitation of clients/staff', th: 'ห้ามชักจูงลูกค้า/พนักงาน' },
    match: /\bnon[-\s]?solicit\w+\b|\bshall\s+not\s+(solicit|approach|hire|poach)\s+.{0,40}(employees?|clients?|customers?)\b|ห้าม.{0,15}(ชักจูง|ติดต่อ|รับ).{0,20}(พนักงาน|ลูกค้า)/i,
    why: { en: 'You cannot approach their clients or hire their staff after — even people you originally introduced.',
           th: 'ห้ามติดต่อลูกค้า/รับพนักงานของอีกฝ่ายภายหลัง — แม้คนที่คุณแนะนำเองตอนแรก' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'low', employee: 'medium', enterprise: 'low' },
  },
  {
    id: 'always_on_availability', category: 'employment',
    label: { en: '24/7 availability requirement', th: 'ต้องพร้อมตลอด 24/7' },
    match: /\bavailable\s+(24\/7|twenty[-\s]four\s+hours|around\s+the\s+clock)\b|\bon[-\s]?call\s+(at\s+all\s+times|24\/7)\b|ต้องพร้อม.{0,15}(ตลอดเวลา|24\s*ชั่วโมง|ทุกเวลา)/i,
    why: { en: 'No real personal time — work bleeds into nights and weekends with no extra pay.',
           th: 'ไม่มีเวลาส่วนตัวจริง — งานล้นเข้าตอนกลางคืน/วันหยุดโดยไม่ได้ค่าตอบแทนเพิ่ม' },
    risk: { freelancer: 'high', sme: 'low', consumer: 'low', employee: 'high', enterprise: 'low' },
  },
  {
    id: 'broad_ip_assignment', category: 'ip',
    label: { en: 'Broad IP assignment', th: 'มอบทรัพย์สินทางปัญญาแบบกว้าง' },
    match: /\b(assigns?\s+all\s+.{0,40}(intellectual\s+property|inventions|work\s+product)|all\s+rights.{0,30}(assigned|transferred)|work\s+made\s+for\s+hire)\b|มอบ.{0,30}ทรัพย์สินทางปัญญา|โอนสิทธิ.{0,30}(ทั้งหมด|งานที่สร้าง)/i,
    why: { en: 'You hand over IP rights — sometimes wider than the actual project scope.',
           th: 'ส่งมอบทรัพย์สินทางปัญญา — บางครั้งกว้างเกิน ครอบคลุมงานนอกขอบเขต' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'low', employee: 'high', enterprise: 'low' },
  },
  {
    id: 'ip_future_works', category: 'ip',
    label: { en: 'IP grab of future works', th: 'อ้างสิทธิงานในอนาคต' },
    match: /\b(future|all)\s+(inventions?|works?|creations?)\s+.{0,30}(assigned|belong|owned)\b|งาน(ในอนาคต|ที่จะสร้าง).{0,30}(เป็นของ|มอบให้)/i,
    why: { en: 'Captures IP you create AFTER the contract too — usually unenforceable but intimidating.',
           th: 'รวมถึงงานที่คุณสร้างหลังจบสัญญา — ส่วนใหญ่บังคับไม่ได้แต่ใช้ข่มขู่' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'low', employee: 'high', enterprise: 'low' },
  },
  {
    id: 'moral_rights_waiver', category: 'ip',
    label: { en: 'Moral rights waiver', th: 'สละสิทธิทางศีลธรรม' },
    match: /\b(waiv\w*|waiver\s+of)\s+.{0,30}moral\s+rights?\b|สละ.{0,15}สิทธิทางศีลธรรม/i,
    why: { en: 'You give up the right to be credited or to object to distortions of your work.',
           th: 'สละสิทธิที่จะถูกระบุชื่อ หรือคัดค้านการแก้ผลงานของคุณ' },
    risk: { freelancer: 'high', sme: 'low', consumer: 'low', employee: 'medium', enterprise: 'low' },
  },

  // ── 5. LIABILITY & RISK ────────────────────────────────────────────────
  {
    id: 'unlimited_liability', category: 'liability',
    label: { en: 'Unlimited liability', th: 'ความรับผิดไม่จำกัด' },
    match: /\b(unlimited\s+liability|liability\s+is\s+unlimited|no\s+(limit|cap|limitation)\s+on\s+(damages|liability))\b|รับผิด.{0,5}ไม่จำกัด|ความรับผิด.{0,30}ไม่จำกัด/i,
    why: { en: 'Your potential losses are uncapped. One incident could be financially catastrophic.',
           th: 'ขาดทุนได้ไม่จำกัด — เกิดเหตุครั้งเดียวอาจเสียหายมหาศาล' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'low', employee: 'low', enterprise: 'medium' },
  },
  {
    id: 'one_way_indemnity', category: 'liability',
    label: { en: 'One-way indemnification', th: 'ชดใช้ฝ่ายเดียว' },
    match: /\byou\s+(shall|will|agree\s+to|must)\s+.{0,20}indemnif\w+\b|\bindemnif\w+\s+.{0,40}(the\s+company|provider|client|us)\b|ท่านตกลงชดใช้|ลูกค้า.{0,20}ชดใช้.{0,20}บริษัท/i,
    why: { en: "You shoulder all third-party legal costs — but they don't reciprocate.",
           th: 'คุณรับผิดต่อค่าใช้จ่ายทางกฎหมายจากบุคคลที่สาม — แต่อีกฝ่ายไม่ต้องรับคืน' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'medium', employee: 'medium', enterprise: 'low' },
  },
  {
    id: 'warranty_disclaimer', category: 'liability',
    label: { en: 'As-is / no warranties', th: 'ไม่รับประกันคุณภาพ' },
    match: /\b(as\s+is|as[-\s]available|no\s+warrant(y|ies)|disclaim(s|er)?\s+all\s+warrant(y|ies))\b|ขายตามสภาพ|ไม่มีการรับประกัน|ปฏิเสธ.{0,15}การรับประกัน/i,
    why: { en: 'They sell without any quality guarantee. If it breaks, that\'s your problem.',
           th: 'ขายโดยไม่รับประกันคุณภาพใดๆ พังก็เรื่องของคุณ' },
    risk: { freelancer: 'medium', sme: 'high', consumer: 'high', employee: 'low', enterprise: 'medium' },
  },
  {
    id: 'force_majeure_broad', category: 'liability',
    label: { en: 'Overly broad force majeure', th: 'เหตุสุดวิสัยกว้างเกิน' },
    match: /\bforce\s+majeure\s+.{0,40}(economic\s+conditions?|market\s+changes?|business\s+reasons?|any\s+cause)\b|เหตุสุดวิสัย.{0,20}(สภาพเศรษฐกิจ|เหตุใดๆ|ปัจจัยทางธุรกิจ)/i,
    why: { en: 'They can dodge obligations on vague grounds (e.g., "economic conditions") — not real force majeure.',
           th: 'หลบหน้าที่ได้ด้วยเหตุกว้างๆ เช่น "สภาพเศรษฐกิจ" — ไม่ใช่เหตุสุดวิสัยจริง' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'medium', employee: 'low', enterprise: 'low' },
  },

  // ── 6. AMENDMENT / CONTROL ─────────────────────────────────────────────
  {
    id: 'unilateral_amendment', category: 'amendment',
    label: { en: 'Unilateral amendment', th: 'แก้สัญญาฝ่ายเดียว' },
    match: /\b(may|reserve\s+the\s+right\s+to)\s+(amend|modify|change|update)\s+.{0,40}(any\s*time|sole\s*discretion|without\s*notice)\b|update\s+these\s+.{0,30}(any\s*time)|(แก้ไข|แก้สัญญา|แก้ข้อตกลง|แก้ข้อสัญญา).{0,30}(ฝ่ายเดียว|ทุกเมื่อ|ตามดุลพินิจ|เมื่อใดก็ได้)/i,
    why: { en: "They can rewrite the rules whenever — today's agreement may be different tomorrow.",
           th: 'อีกฝ่ายแก้สัญญาเมื่อไรก็ได้ — ที่ตกลงวันนี้พรุ่งนี้อาจไม่เหมือนเดิม' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'high', employee: 'medium', enterprise: 'low' },
  },
  {
    id: 'deemed_acceptance', category: 'amendment',
    label: { en: 'Deemed acceptance / silence = yes', th: 'ถือว่ายอมรับเงียบๆ' },
    match: /\b(continued\s+use\s+.{0,30}(constitutes|means|signifies|will\s+be\s+deemed)\s+acceptance|deemed\s+to\s+(have\s+)?accept|silence\s+(constitutes|means)\s+(acceptance|consent))\b|ถือว่ายอมรับ.{0,30}(หากไม่|โดยไม่|หาก.{0,15}ไม่ทักท้วง)|(หากไม่|ถ้าไม่|โดยไม่)\s*ทักท้วง.{0,15}ถือว่า(ยอมรับ)?|ใช้บริการต่อ.{0,15}ถือว่า/i,
    why: { en: 'If you don\'t object (e.g. just keep using the service), you\'re deemed to accept new terms.',
           th: 'ถ้าไม่ทักท้วง (หรือใช้บริการต่อ) ถือว่ายอมรับข้อใหม่อัตโนมัติ' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'high', employee: 'medium', enterprise: 'low' },
  },
  {
    id: 'change_of_control', category: 'amendment',
    label: { en: 'Assigns on change of control', th: 'โอนสิทธิตอนเปลี่ยนเจ้าของ' },
    match: /\bassign\w*\s+.{0,40}(change\s+of\s+control|acquisition|merger)\s*(.{0,30}without\s+(consent|notice))?\b|เปลี่ยนแปลง.{0,15}ผู้ถือหุ้น|โอนสิทธิ.{0,30}(เปลี่ยนแปลง|ผู้ถือหุ้น|ควบรวม)|ควบรวม.{0,30}โอนสิทธิ/i,
    why: { en: "If they get acquired, your contract goes with them — possibly to a competitor or worse counterparty.",
           th: 'ถ้าอีกฝ่ายถูกซื้อกิจการ สัญญาของคุณก็โอนไปด้วย — อาจไปอยู่กับคู่แข่งหรือฝ่ายแย่กว่า' },
    risk: { freelancer: 'medium', sme: 'high', consumer: 'medium', employee: 'medium', enterprise: 'medium' },
  },

  // ── 7. DATA & PRIVACY (PDPA / GDPR) ────────────────────────────────────
  {
    id: 'data_ownership', category: 'data',
    label: { en: 'They own your data / content', th: 'เจ้าของข้อมูล/เนื้อหาคือบริษัท' },
    match: /\bwe\s+(own|retain)\s+.{0,30}(rights?|data|content)\b|\ball\s+.{0,30}data\s+.{0,20}(our|company)\s+(property|sole)\b|\bperpetual\s+.{0,40}license\s+to\s+.{0,40}(your|user)\b/i,
    why: { en: 'They claim ownership of data/content you provide — sometimes even after you leave.',
           th: 'บริษัทอ้างเป็นเจ้าของข้อมูล/เนื้อหาที่คุณให้ — บางครั้งครอบคลุมถึงหลังเลิกใช้บริการ' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'high', employee: 'low', enterprise: 'medium' },
  },
  {
    id: 'pdpa_consent_broad', category: 'data',
    label: { en: 'Blanket consent to processing', th: 'ยินยอมข้อมูลแบบครอบจักรวาล' },
    match: /\bconsent\s+to\s+.{0,40}(processing|collection|use)\s+.{0,40}(any\s+purpose|all\s+purposes|marketing\s+and|third\s+part)|ยินยอม.{0,30}(ใช้|ประมวลผล|เก็บ).{0,30}(ทุกวัตถุประสงค์|วัตถุประสงค์ใดๆ|ทุกประเภท)/i,
    why: { en: 'A blanket consent to "any purpose" is not specific enough — and violates PDPA §22 (Thailand) / GDPR Art. 7 which require purpose-specific consent.',
           th: 'การยินยอมแบบครอบจักรวาล "ทุกวัตถุประสงค์" ไม่เฉพาะเจาะจงพอ — ขัด พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล มาตรา 22 ที่ต้องระบุวัตถุประสงค์ชัด' },
    risk: { freelancer: 'medium', sme: 'medium', consumer: 'high', employee: 'medium', enterprise: 'low' },
    cite: { th: 'PDPA §22', global: 'GDPR Art. 7' },
  },
  {
    id: 'data_retention_indefinite', category: 'data',
    label: { en: 'Indefinite data retention', th: 'เก็บข้อมูลไม่มีกำหนด' },
    match: /\bretain\s+.{0,30}(indefinitely|permanently|as\s+long\s+as\s+necessary|forever)\b|เก็บข้อมูล.{0,20}(ตลอดไป|ไม่มีกำหนด|ถาวร)/i,
    why: { en: 'Data kept forever — directly conflicts with PDPA §37 / GDPR storage-limitation principle.',
           th: 'เก็บข้อมูลตลอดไป — ขัดหลักการจำกัดการจัดเก็บใน พ.ร.บ. คุ้มครองข้อมูลฯ มาตรา 37' },
    risk: { freelancer: 'medium', sme: 'medium', consumer: 'high', employee: 'medium', enterprise: 'low' },
    cite: { th: 'PDPA §37', global: 'GDPR Art. 5(1)(e)' },
  },
  {
    id: 'cross_border_transfer', category: 'data',
    label: { en: 'Cross-border data transfer', th: 'ส่งข้อมูลข้ามประเทศ' },
    match: /\btransfer\s+.{0,30}(data|information)\s+.{0,30}(outside|abroad|to\s+(another|other)\s+countr(y|ies)|overseas)\b|ส่ง.{0,15}ข้อมูล.{0,15}(ไปต่างประเทศ|นอกประเทศ|ข้ามชาติ)/i,
    why: { en: 'Sending personal data outside Thailand requires adequacy or safeguards (PDPA §28).',
           th: 'ส่งข้อมูลส่วนบุคคลออกนอกประเทศต้องมีมาตรการคุ้มครอง (PDPA มาตรา 28)' },
    risk: { freelancer: 'low', sme: 'medium', consumer: 'high', employee: 'medium', enterprise: 'medium' },
    cite: { th: 'PDPA §28', global: 'GDPR Ch. V' },
  },
  {
    id: 'third_party_sharing_broad', category: 'data',
    label: { en: 'Broad third-party sharing', th: 'แชร์ข้อมูลให้บุคคลที่สามแบบกว้าง' },
    match: /\bshare\s+.{0,30}(with\s+)?(affiliates?|partners?|third\s+part(y|ies))\b.{0,80}(marketing|advertis|for\s+any\s+purpose)|แชร์.{0,15}(ข้อมูล|ลูกค้า).{0,30}(บริษัทในเครือ|พาร์ทเนอร์|บุคคลที่สาม)/i,
    why: { en: 'Your data leaks to a broad list of "affiliates" — usually undisclosed and uncontrollable.',
           th: 'ข้อมูลคุณรั่วไปยัง "บริษัทในเครือ"/พาร์ทเนอร์ — มักไม่บอกชัดว่าใครและคุมไม่ได้' },
    risk: { freelancer: 'medium', sme: 'medium', consumer: 'high', employee: 'medium', enterprise: 'low' },
    cite: { th: 'PDPA §22', global: 'GDPR Art. 6' },
  },
  {
    id: 'no_data_breach_notification', category: 'data',
    label: { en: 'No data-breach notification commitment', th: 'ไม่รับปากแจ้งเหตุข้อมูลรั่ว' },
    match: /\b(we\s+(are\s+)?(not\s+)?(obligated|required)\s+to\s+notify|no\s+(obligation|duty)\s+to\s+(inform|notify)\s+.{0,20}(breach|incident))\b|ไม่.{0,20}(แจ้ง|รายงาน).{0,15}(ข้อมูล.{0,5}รั่ว|การละเมิด)/i,
    why: { en: 'They refuse to commit to telling you when your data leaks — PDPA §37 / GDPR Art. 34 require breach notification.',
           th: 'ปฏิเสธไม่รับปากแจ้งเมื่อข้อมูลรั่ว — PDPA มาตรา 37 / GDPR ม. 34 บังคับให้แจ้ง' },
    risk: { freelancer: 'medium', sme: 'medium', consumer: 'high', employee: 'medium', enterprise: 'low' },
    cite: { th: 'PDPA §37(4)', global: 'GDPR Art. 33-34' },
  },

  // ── 8. CONSUMER PROTECTION (Thai พ.ร.บ. คุ้มครองผู้บริโภค + global) ─────
  {
    id: 'no_refund', category: 'consumer',
    label: { en: 'No-refund policy', th: 'ไม่คืนเงินทุกกรณี' },
    match: /\bno\s+refund\w*\s+.{0,30}(any\s+circumstances?|are\s+(available|allowed|provided)|whatsoever)|all\s+sales\s+(are\s+)?final\b|ไม่คืนเงิน(ทุกกรณี|ในทุกกรณี|ไม่ว่ากรณีใด)?|ขายขาด.{0,5}ไม่รับคืน/i,
    why: { en: 'Absolute no-refund clauses are often unenforceable against consumers (Thailand Consumer Protection Act §35 bis; EU Distance Selling).',
           th: 'ข้อ "ไม่คืนเงินทุกกรณี" มักบังคับใช้กับผู้บริโภคไม่ได้ (พ.ร.บ. คุ้มครองผู้บริโภค §35 ทวิ)' },
    risk: { freelancer: 'medium', sme: 'medium', consumer: 'high', employee: 'low', enterprise: 'low' },
    cite: { th: 'พ.ร.บ. คุ้มครองผู้บริโภค §35 ทวิ', global: 'EU CCD Art. 9' },
  },
  {
    id: 'unilateral_price_change', category: 'consumer',
    label: { en: 'Unilateral price change', th: 'ปรับราคาฝ่ายเดียว' },
    match: /\b(may|reserve\s+the\s+right\s+to)\s+(change|increase|adjust|modify)\s+(the\s+)?(prices?|fees?|charges?|rates?)\s+.{0,40}(any\s*time|sole\s*discretion|without\s+notice)\b|ปรับราคา.{0,30}(เมื่อใดก็ได้|ฝ่ายเดียว|ตามดุลพินิจ)/i,
    why: { en: 'They can raise prices anytime — your budget is at their mercy.',
           th: 'ขึ้นราคาได้ทุกเมื่อ — งบของคุณอยู่ที่อีกฝ่ายตัดสิน' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'high', employee: 'low', enterprise: 'medium' },
  },
  {
    id: 'automatic_rebill', category: 'consumer',
    label: { en: 'Automatic re-billing on stored card', th: 'เรียกเก็บอัตโนมัติบนบัตรที่เก็บไว้' },
    match: /\b(automatically\s+charge|recurring\s+charge|continuous\s+payment\s+authority|store\s+your\s+(payment|card))\b.{0,40}(without\s+further\s+notice|each\s+(month|period))?|เรียกเก็บอัตโนมัติ|ตัดบัตร.{0,15}อัตโนมัติ/i,
    why: { en: 'Card gets auto-charged each cycle — combined with no-refund + auto-renewal this is a classic trap.',
           th: 'บัตรถูกตัดทุกรอบ — ถ้ารวมกับไม่คืนเงิน + ต่ออายุอัตโนมัติ = หลุมคลาสสิก' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'high', employee: 'low', enterprise: 'low' },
  },

  // ── 9. E-COMMERCE ──────────────────────────────────────────────────────
  {
    id: 'stock_not_guaranteed', category: 'ecommerce',
    label: { en: 'Stock not guaranteed after payment', th: 'ไม่รับประกันสต็อกหลังจ่ายเงิน' },
    match: /\bstock\s+.{0,20}(subject\s+to\s+availability|not\s+guaranteed|may\s+be\s+(out|unavailable))\b.{0,40}(after\s+payment|even\s+if\s+paid)?|สินค้า.{0,15}(หมด|ไม่พร้อม).{0,15}(หลัง.{0,5}ชำระ|แม้ชำระแล้ว)/i,
    why: { en: "They take your money first, then may say 'oops, out of stock' — leverage entirely on their side.",
           th: 'เก็บเงินก่อน แล้วค่อยบอก "สินค้าหมด" — อำนาจอยู่ฝั่งเขา' },
    risk: { freelancer: 'low', sme: 'high', consumer: 'high', employee: 'low', enterprise: 'low' },
  },
  {
    id: 'delivery_delay_no_comp', category: 'ecommerce',
    label: { en: 'No compensation for delivery delay', th: 'ไม่ชดเชยกรณีจัดส่งล่าช้า' },
    match: /\bno\s+(liability|compensation|refund)\s+.{0,30}delay\b|delivery\s+(time|date)\s+.{0,30}(estimate\s+only|not\s+guaranteed)\b|ไม่.{0,15}(ชดเชย|รับผิด).{0,15}(จัดส่งล่าช้า|ล่าช้า)/i,
    why: { en: 'Delays cause no compensation — even if a delayed shipment cost you a deal.',
           th: 'ล่าช้าก็ไม่ชดเชย — แม้สินค้าช้าทำให้คุณเสียดีลก็ตาม' },
    risk: { freelancer: 'medium', sme: 'high', consumer: 'high', employee: 'low', enterprise: 'low' },
  },
  {
    id: 'account_closure_no_refund', category: 'ecommerce',
    label: { en: 'Account closure with unused balance', th: 'ปิดบัญชีพร้อมยอดคงเหลือ' },
    match: /\b(may|right\s+to)\s+(close|suspend|terminate)\s+.{0,30}(account|service)\s+.{0,40}(no\s+refund|forfeit\w*\s+.{0,15}(balance|credit))\b|ปิดบัญชี.{0,30}ไม่คืน.{0,15}(ยอด|เครดิต)/i,
    why: { en: 'They close your account at will and keep whatever unused balance/credits you had.',
           th: 'ปิดบัญชีตามใจ — เครดิตคงเหลือถูกริบ' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'high', employee: 'low', enterprise: 'low' },
  },

  // ── 10. CONFIDENTIALITY ────────────────────────────────────────────────
  {
    id: 'broad_confidentiality', category: 'confid',
    label: { en: 'One-way confidentiality', th: 'รักษาความลับฝ่ายเดียว' },
    match: /\byou\s+(shall|will|agree)\s+.{0,20}(keep\s+.{0,40}confidential|not\s+disclose|maintain\s+.{0,30}confidential|hold\s+.{0,30}confidential)\b|\brecipient\s+shall\s+.{0,30}confidentialit\w+\b/i,
    why: { en: "You have confidentiality duties — but the other side doesn't reciprocate.",
           th: 'คุณต้องรักษาความลับ — แต่อีกฝ่ายไม่มีหน้าที่กลับ' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'low', employee: 'low', enterprise: 'low' },
  },
  {
    id: 'perpetual_nda', category: 'confid',
    label: { en: 'Perpetual confidentiality', th: 'NDA ตลอดไป' },
    match: /\bconfidentialit\w+\s+(obligations?\s+)?(shall\s+)?(survive|continue)\s+.{0,40}(indefinitely|perpetually|in\s+perpetuity|forever)\b|รักษาความลับ.{0,15}(ตลอดไป|ไม่มีกำหนด|นิรันดร์)/i,
    why: { en: 'You must keep secrets forever — even info that has become public years later.',
           th: 'ต้องรักษาความลับตลอดไป — แม้ข้อมูลจะกลายเป็นสาธารณะแล้ว' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'low', employee: 'medium', enterprise: 'low' },
  },

  // ── 11. FEES / PENALTIES ───────────────────────────────────────────────
  {
    id: 'penalty_clause', category: 'fees',
    label: { en: 'Liquidated damages / penalty', th: 'ค่าปรับล่วงหน้า' },
    match: /\bliquidated\s+damages?\b|\bpenalty\s+of\s+.{0,20}\$?\d|ค่าปรับ.{0,20}(วันละ|ครั้งละ|ฉบับละ|จำนวน)/i,
    why: { en: 'A fixed penalty applies regardless of actual damage caused.',
           th: 'ค่าปรับเป็นจำนวนตายตัว ไม่ขึ้นกับความเสียหายจริง' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'medium', employee: 'low', enterprise: 'medium' },
  },
  {
    id: 'late_fee', category: 'fees',
    label: { en: 'Late fees / interest on overdue', th: 'ค่าปรับล่าช้า / ดอกเบี้ยผิดนัด' },
    match: /\blate\s+(fee|charge|payment\s+fee)\b|\binterest\s+(at|of)\s+.{0,15}(\d+(\.\d+)?)\s*%|(ค่าปรับ|ดอกเบี้ย).{0,20}(ล่าช้า|ผิดนัด)/i,
    why: { en: 'Pay late and fees / interest pile up — sometimes at high rates.',
           th: 'จ่ายช้าค่าปรับ/ดอกเบี้ยพอกพูนเร็ว บางครั้งอัตราสูง' },
    risk: { freelancer: 'low', sme: 'medium', consumer: 'high', employee: 'low', enterprise: 'low' },
  },
  {
    id: 'fx_risk_on_you', category: 'fees',
    label: { en: 'Foreign-exchange risk on you', th: 'ความเสี่ยงอัตราแลกเปลี่ยนตกที่คุณ' },
    match: /\b(foreign|currency)\s+exchange\s+.{0,30}(risk|loss|fluctuation)\s+.{0,30}(borne\s+by|at\s+(the\s+)?(customer|buyer|client))\b|ความเสี่ยง.{0,20}(อัตราแลกเปลี่ยน|ค่าเงิน).{0,15}(ผู้ซื้อ|ลูกค้า)/i,
    why: { en: "Currency moves and you pay more — they're hedged but you're not.",
           th: 'ค่าเงินขยับขึ้น คุณจ่ายแพงขึ้น — เขามีประกันแต่คุณไม่มี' },
    risk: { freelancer: 'high', sme: 'high', consumer: 'medium', employee: 'low', enterprise: 'low' },
  },

  // ── 12. AUDIT / EXCLUSIVITY ────────────────────────────────────────────
  {
    id: 'audit_right', category: 'audit',
    label: { en: 'Audit / inspection of your books', th: 'สิทธิตรวจบัญชี/ระบบของคุณ' },
    match: /\b(audit\s+.{0,30}records|right\s+to\s+(inspect|audit)|may\s+.{0,20}audit\s+.{0,30}(you|customer|client|user)|examine\s+.{0,30}(books|records))\b|ตรวจสอบ.{0,30}(บัญชี|เอกสาร|ระบบ).{0,30}(ของท่าน|ของคุณ|ลูกค้า)/i,
    why: { en: 'They can inspect your books/systems — significant burden for small operations.',
           th: 'อีกฝ่ายเข้าตรวจบัญชี/ระบบของคุณได้ — เป็นภาระสำหรับรายเล็ก' },
    risk: { freelancer: 'medium', sme: 'high', consumer: 'low', employee: 'low', enterprise: 'medium' },
  },
  {
    id: 'exclusivity', category: 'exclusivity',
    label: { en: 'Exclusivity', th: 'ผูกขาดให้ฝ่ายเดียว' },
    match: /\b(exclusive(ly)?\s+(provide|engage|supply|partner)|sole\s+(provider|supplier)|shall\s+not\s+.{0,30}(engage|work\s+with)\s+.{0,30}(other|third\s+part))\b|ห้าม.{0,20}(ทำงาน|รับงาน|ขาย).{0,20}(บุคคลที่สาม|ผู้อื่น|รายอื่น)/i,
    why: { en: "Can't work with anyone else — risky when your income depends on multiple clients.",
           th: 'ห้ามทำงานกับลูกค้ารายอื่น — เสี่ยงถ้ารายได้พึ่งหลายราย' },
    risk: { freelancer: 'high', sme: 'medium', consumer: 'low', employee: 'medium', enterprise: 'low' },
  },

  // ── 13. LEASE / PROPERTY ───────────────────────────────────────────────
  {
    id: 'deposit_forfeit', category: 'lease',
    label: { en: 'Deposit forfeiture in full', th: 'ริบเงินมัดจำเต็มจำนวน' },
    match: /\b(deposit|security\s+deposit)\s+.{0,30}(forfeit\w*|non[-\s]?refundable)\b|ริบ.{0,15}(เงินมัดจำ|เงินประกัน).{0,15}(เต็มจำนวน|ทั้งหมด)/i,
    why: { en: 'They keep your full deposit even for minor issues — should be limited to actual damages.',
           th: 'ริบเงินมัดจำเต็มแม้ความเสียหายเล็กน้อย — ตามกฎหมายควรหักเฉพาะเสียหายจริง' },
    risk: { freelancer: 'low', sme: 'medium', consumer: 'high', employee: 'low', enterprise: 'low' },
  },
  {
    id: 'mid_term_rent_increase', category: 'lease',
    label: { en: 'Rent increase mid-term', th: 'ขึ้นค่าเช่าระหว่างสัญญา' },
    match: /\blandlord\s+(may|reserves?\s+the\s+right\s+to)\s+(increase|adjust|raise)\s+.{0,15}rent\b.{0,40}(during|within)\s+the\s+term|ขึ้น.{0,5}ค่าเช่า.{0,20}(ระหว่าง.{0,10}สัญญา|กลางทาง)/i,
    why: { en: 'Rent can go up mid-lease — kills budget predictability.',
           th: 'ขึ้นค่าเช่าได้ระหว่างสัญญา — งบเกินคุมไม่ได้' },
    risk: { freelancer: 'low', sme: 'high', consumer: 'high', employee: 'low', enterprise: 'low' },
  },
];

// === COMPILED ENTRIES ======================================================
const COMPILED = PATTERNS.map((p) => ({
  ...p,
  _re: p.match instanceof RegExp ? p.match : new RegExp(p.match, 'i'),
}));

export function listPatterns() {
  return PATTERNS.map(({ id, label, category, cite }) => ({ id, label, category, cite: cite || null }));
}

export function scanTripwire(text, persona = 'sme') {
  if (!PERSONAS.includes(persona)) persona = 'sme';
  const findings = [];
  for (const p of COMPILED) {
    // global match so we find every occurrence
    const re = new RegExp(p._re.source, (p._re.flags || 'i').replace('g', '') + 'g');
    let m;
    const seen = new Set();
    while ((m = re.exec(text)) !== null) {
      const key = p.id + '|' + m.index;
      if (seen.has(key)) break;
      seen.add(key);
      const sev = p.risk[persona] || 'low';
      findings.push({
        id: p.id,
        category: p.category,
        label: p.label,
        evidence: m[0],
        snippet: extractSnippet(text, m.index, m[0].length),
        why: p.why,
        risk: sev,
        risk_rank: SEV_RANK[sev],
        all_risks: p.risk,
        cite: p.cite || null,
      });
      if (re.lastIndex === m.index) re.lastIndex++;
    }
  }
  findings.sort((a, b) => b.risk_rank - a.risk_rank);
  const byCategory = {};
  for (const f of findings) byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  const summary = {
    persona,
    total: findings.length,
    high: findings.filter((f) => f.risk === 'high').length,
    medium: findings.filter((f) => f.risk === 'medium').length,
    low: findings.filter((f) => f.risk === 'low').length,
    by_category: byCategory,
    total_patterns: PATTERNS.length,
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
