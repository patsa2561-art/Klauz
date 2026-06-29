// Tripwire pattern unit tests — positive + negative for every pattern.
// Positive: a sentence that SHOULD fire the rule (a real clause of that type).
// Negative: a sentence that should NOT fire (avoid false positives).
import { scanTripwire, PERSONAS, CATEGORIES } from '../src/tripwire.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  \x1b[92m✓\x1b[0m ${name}`); } else { fail++; console.log(`  \x1b[91m✗ ${name}\x1b[0m`); } };
const S = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

// helper: does scan flag pattern `id`?
const fired = (text, id, persona = 'sme') => scanTripwire(text, persona).findings.some((f) => f.id === id);

S('1. POSITIVE cases — every pattern must fire on its representative clause');
const POSITIVES = [
  // lockin
  ['auto_renewal',           'This Agreement shall auto-renew for successive 1-year periods.'],
  ['auto_renewal',           'สัญญานี้ต่ออายุอัตโนมัติทุก 12 เดือน'],
  ['minimum_term',           'Initial term of 24 months minimum commitment applies.'],
  ['minimum_term',           'ระยะผูกพันขั้นต่ำ 12 เดือน'],
  ['early_termination_fee',  'An early termination fee of 3 months applies.'],
  ['early_termination_fee',  'ค่าปรับยกเลิกก่อนกำหนดเท่ากับ 3 เดือน'],
  // termination
  ['unilateral_termination', 'The Provider may terminate this agreement at any time at its sole discretion.'],
  ['unilateral_termination', 'บริษัทบอกเลิกสัญญาฝ่ายเดียวได้ทุกเมื่อ'],
  ['no_cure_period',         'We may terminate immediately upon any breach.'],
  ['no_cure_period',         'เลิกทันทีหากผิดสัญญา'],
  // dispute
  ['mandatory_arbitration',  'All disputes shall be resolved by binding arbitration.'],
  ['mandatory_arbitration',  'ข้อพิพาทระงับโดยอนุญาโตตุลาการบังคับ'],
  ['class_action_waiver',    'You waive any right to bring or participate in any class action.'],
  ['class_action_waiver',    'คุณสละสิทธิ์ฟ้องรวมกลุ่ม'],
  ['foreign_jurisdiction',   'This agreement is governed by the laws of Delaware.'],
  ['foreign_jurisdiction',   'อยู่ภายใต้ใช้กฎหมายของสิงคโปร์'],
  ['fee_shifting',           'The prevailing party shall be entitled to attorneys\' fees.'],
  ['fee_shifting',           'ผู้แพ้คดีต้องชำระค่าทนายของฝ่ายตรงข้าม'],
  // employment / IP
  ['non_compete',            'Employee shall not compete with the Company for 2 years after termination.'],
  ['non_compete',            'ห้ามแข่งขันกับบริษัทเป็นเวลา 1 ปี'],
  ['non_solicit',            'You shall not solicit our employees or customers for 12 months.'],
  ['non_solicit',            'ห้ามชักจูงพนักงานของบริษัทเป็นเวลา 12 เดือน'],
  ['always_on_availability', 'Contractor must be available 24/7 to respond to requests.'],
  ['always_on_availability', 'ต้องพร้อมตลอด 24 ชั่วโมงทุกวัน'],
  ['broad_ip_assignment',    'All work product shall be deemed work made for hire and assigned to the Company.'],
  ['broad_ip_assignment',    'มอบทรัพย์สินทางปัญญาทั้งหมดให้บริษัท'],
  ['ip_future_works',        'All future inventions are hereby assigned to the Company.'],
  ['ip_future_works',        'งานในอนาคตทั้งหมดเป็นของบริษัท'],
  ['moral_rights_waiver',    'Author hereby waives all moral rights in the work.'],
  ['moral_rights_waiver',    'สละสิทธิทางศีลธรรมในผลงาน'],
  // liability
  ['unlimited_liability',    'Contractor liability is unlimited under this Agreement.'],
  ['unlimited_liability',    'ความรับผิดของผู้รับเหมาไม่จำกัด'],
  ['one_way_indemnity',      'You agree to indemnify the Company against all third-party claims.'],
  ['one_way_indemnity',      'ท่านตกลงชดใช้บริษัทกรณีถูกฟ้อง'],
  ['warranty_disclaimer',    'Services are provided "as is" with no warranties of any kind.'],
  ['warranty_disclaimer',    'บริการขายตามสภาพ ไม่มีการรับประกัน'],
  ['force_majeure_broad',    'Force majeure includes any economic conditions or business reasons.'],
  ['force_majeure_broad',    'เหตุสุดวิสัยรวมถึงสภาพเศรษฐกิจหรือเหตุใดๆ'],
  // amendment
  ['unilateral_amendment',   'We may modify these terms at any time at our sole discretion.'],
  ['unilateral_amendment',   'บริษัทแก้สัญญาฝ่ายเดียวได้ทุกเมื่อ'],
  ['deemed_acceptance',      'Continued use of the service constitutes acceptance of the new terms.'],
  ['deemed_acceptance',      'หากไม่ทักท้วงถือว่ายอมรับ'],
  ['change_of_control',      'This agreement may be assigned upon a change of control without consent.'],
  ['change_of_control',      'อาจโอนสิทธิเมื่อมีการเปลี่ยนแปลงผู้ถือหุ้นได้'],
  // data
  ['data_ownership',         'We own all rights, title and interest in any user-submitted content.'],
  ['pdpa_consent_broad',     'You consent to processing of your data for any purpose we determine.'],
  ['pdpa_consent_broad',     'ท่านยินยอมให้ใช้ข้อมูลเพื่อทุกวัตถุประสงค์'],
  ['data_retention_indefinite', 'We may retain your data indefinitely as we deem necessary.'],
  ['data_retention_indefinite', 'บริษัทเก็บข้อมูลตลอดไป'],
  ['cross_border_transfer',  'We may transfer your data outside Thailand to our affiliates abroad.'],
  ['cross_border_transfer',  'ส่งข้อมูลไปต่างประเทศ'],
  ['third_party_sharing_broad', 'We may share your data with affiliates and partners for marketing.'],
  ['third_party_sharing_broad', 'แชร์ข้อมูลกับบริษัทในเครือเพื่อโฆษณา'],
  ['no_data_breach_notification', 'We are not obligated to notify users of any data breach.'],
  ['no_data_breach_notification', 'ไม่แจ้งกรณีข้อมูลรั่ว'],
  // consumer
  ['no_refund',              'No refunds under any circumstances. All sales are final.'],
  ['no_refund',              'ไม่คืนเงินทุกกรณี'],
  ['unilateral_price_change','We may change prices at any time without notice.'],
  ['unilateral_price_change','ปรับราคาฝ่ายเดียวเมื่อใดก็ได้'],
  ['automatic_rebill',       'We will automatically charge your stored card each month.'],
  ['automatic_rebill',       'เรียกเก็บอัตโนมัติทุกเดือน'],
  // e-commerce
  ['stock_not_guaranteed',   'Stock is subject to availability even after payment.'],
  ['stock_not_guaranteed',   'สินค้าหมดได้แม้ชำระแล้ว'],
  ['delivery_delay_no_comp', 'We accept no liability for any delay in delivery.'],
  ['delivery_delay_no_comp', 'ไม่ชดเชยกรณีจัดส่งล่าช้า'],
  ['account_closure_no_refund', 'We may close your account at any time; no refund of unused balance will be made.'],
  ['account_closure_no_refund', 'ปิดบัญชีแล้วไม่คืนยอดคงเหลือ'],
  // confidentiality
  ['broad_confidentiality',  'You shall keep all information confidential indefinitely.'],
  ['perpetual_nda',          'These confidentiality obligations shall survive in perpetuity.'],
  ['perpetual_nda',          'รักษาความลับตลอดไป'],
  // fees
  ['penalty_clause',         'A penalty of $500 per breach applies.'],
  ['penalty_clause',         'ค่าปรับครั้งละ 5,000 บาท'],
  ['late_fee',               'Late payments incur a late fee of 2% per month.'],
  ['late_fee',               'ดอกเบี้ยผิดนัด 7.5%'],
  ['fx_risk_on_you',         'Foreign exchange risk and loss is borne by the customer.'],
  ['fx_risk_on_you',         'ความเสี่ยงอัตราแลกเปลี่ยนตกที่ลูกค้า'],
  // audit / exclusivity / lease
  ['audit_right',            'We reserve the right to audit your records on request.'],
  ['audit_right',            'มีสิทธิตรวจสอบบัญชีของท่าน'],
  ['exclusivity',            'Provider shall be the sole supplier for all software needs.'],
  ['exclusivity',            'ห้ามทำงานกับบุคคลที่สามรายอื่น'],
  ['deposit_forfeit',        'Security deposit shall be forfeit in full upon breach.'],
  ['deposit_forfeit',        'ริบเงินมัดจำเต็มจำนวน'],
  ['mid_term_rent_increase', 'Landlord may increase rent during the term upon 30 days notice.'],
  ['mid_term_rent_increase', 'ผู้ให้เช่าขึ้นค่าเช่าระหว่างสัญญาได้'],
];
for (const [id, txt] of POSITIVES) ok(`fires "${id}" on ~"${txt.slice(0, 38)}…"`, fired(txt, id));

S('2. NEGATIVE cases — patterns must NOT fire on innocent text');
const NEGATIVES = [
  ['auto_renewal',           'This agreement begins on January 1 and ends on December 31.'],
  ['unilateral_termination', 'Either party may terminate for material breach with 30 days written notice.'],
  ['mandatory_arbitration',  'Disputes are subject to the jurisdiction of the courts of Thailand.'],
  ['non_compete',            'Both parties shall cooperate in good faith.'],
  ['unlimited_liability',    'Liability is capped at the fees paid in the preceding 12 months.'],
  ['no_refund',              'Refunds may be issued within 30 days of purchase.'],
  ['pdpa_consent_broad',     'We collect your name and email solely to process your order.'],
  ['mandatory_arbitration',  'The seller shall deliver the goods within 30 days.'],
  ['ip_future_works',        'Provider owns the IP it creates; Client receives a license.'],
  ['late_fee',               'Payment is due within 30 days of invoice.'],
  ['exclusivity',            'Provider may engage other clients as it sees fit.'],
];
for (const [id, txt] of NEGATIVES) ok(`does NOT fire "${id}" on "${txt.slice(0, 50)}…"`, !fired(txt, id));

S('3. STRUCTURAL invariants');
{
  const r = scanTripwire('This contract shall auto-renew. You shall not compete. Liability is unlimited.', 'freelancer');
  ok('returns summary + findings array', !!(r.summary && Array.isArray(r.findings)));
  ok('summary has persona, total, high/med/low counts', r.summary.persona === 'freelancer' && typeof r.summary.total === 'number' && typeof r.summary.high === 'number');
  ok('summary.total === findings.length', r.summary.total === r.findings.length);
  ok('every finding has id + label + risk + category', r.findings.every((f) => f.id && f.label && f.risk && f.category));
  ok('finding.risk is high/medium/low', r.findings.every((f) => ['high','medium','low'].includes(f.risk)));
  ok('finding has all_risks for every persona', r.findings.every((f) => PERSONAS.every((p) => f.all_risks[p])));
  ok('findings sorted by risk_rank desc', r.findings.every((f, i, a) => i === 0 || a[i-1].risk_rank >= f.risk_rank));
  ok('invalid persona defaults to sme', scanTripwire('shall not compete', 'invalid').summary.persona === 'sme');
}

S('4. Persona weighting — same clause, different verdict');
{
  const t = 'Employee shall not compete with the Company for 2 years.';
  const a = scanTripwire(t, 'enterprise').findings.find((f) => f.id === 'non_compete');
  const b = scanTripwire(t, 'employee').findings.find((f) => f.id === 'non_compete');
  ok('non_compete is LOW for enterprise',  a && a.risk === 'low');
  ok('non_compete is HIGH for employee',   b && b.risk === 'high');
}
{
  const t = 'This agreement shall auto-renew for successive 1-year periods.';
  const c = scanTripwire(t, 'consumer').findings.find((f) => f.id === 'auto_renewal');
  const e = scanTripwire(t, 'employee').findings.find((f) => f.id === 'auto_renewal');
  ok('auto_renewal is HIGH for consumer', c && c.risk === 'high');
  ok('auto_renewal is LOW  for employee', e && e.risk === 'low');
}

S('5. Legal citations exist on Thai-statute patterns');
{
  const r = scanTripwire('You consent to processing for any purpose. We may retain your data indefinitely. No refunds under any circumstances.', 'consumer');
  const consent = r.findings.find((f) => f.id === 'pdpa_consent_broad');
  const retain = r.findings.find((f) => f.id === 'data_retention_indefinite');
  const refund = r.findings.find((f) => f.id === 'no_refund');
  ok('pdpa_consent_broad has cite.th = PDPA §22', consent && consent.cite && /PDPA/i.test(consent.cite.th));
  ok('data_retention_indefinite has cite.th = PDPA §37', retain && retain.cite && /PDPA/i.test(retain.cite.th));
  ok('no_refund has cite.th = Consumer Protection Act',  refund && refund.cite && /คุ้มครองผู้บริโภค|Consumer/i.test(refund.cite.th));
}

S('6. Categories cover all expected groups');
{
  const cats = Object.keys(CATEGORIES);
  const expected = ['lockin','termination','dispute','employment','ip','liability','amendment','data','consumer','ecommerce','confid','fees','audit','exclusivity','lease'];
  ok(`has ${expected.length} expected categories`, expected.every((c) => cats.includes(c)));
}

console.log(`\n\x1b[1mRESULT:\x1b[0m ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
