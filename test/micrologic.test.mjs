// Micro-logic prover unit tests (EN + TH).
import { canonicalize, logicallyEqual } from '../src/micrologic.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  \x1b[92m✓\x1b[0m ${n}`); } else { fail++; console.log(`  \x1b[91m✗ ${n}\x1b[0m ${c}`); } };
const S = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

S('1. Double-negative collapse (EN)');
ok('shall not fail to notify ≡ shall notify',
  logicallyEqual('The Provider shall not fail to notify the Client.', 'The Provider shall notify the Client.'));
ok('must not refuse to deliver ≡ must deliver',
  logicallyEqual('Vendor must not refuse to deliver the goods.', 'Vendor must deliver the goods.'));
ok('cannot fail to comply ≡ must comply',
  logicallyEqual('Party cannot fail to comply with the rules.', 'Party must comply with the rules.'));

S('2. Modal-class normalization (EN)');
ok('shall ≡ must',  logicallyEqual('The Provider shall encrypt data.',  'The Provider must encrypt data.'));
ok('shall ≡ will',  logicallyEqual('The Provider shall pay invoices.',  'The Provider will pay invoices.'));
ok('may ≡ can',     logicallyEqual('Either party may terminate.',        'Either party can terminate.'));
ok('shall ≠ may',  !logicallyEqual('The Provider shall encrypt data.',  'The Provider may encrypt data.'));

S('3. Verb / adverb synonym clustering (EN)');
ok('notify ≡ inform',     logicallyEqual('Supplier shall notify the Client immediately.', 'Supplier shall inform the Client immediately.'));
ok('promptly ≡ quickly',  logicallyEqual('Deliver the goods promptly.',                    'Deliver the goods quickly.'));
ok('deliver ≡ provide',   logicallyEqual('Vendor shall deliver the report.',               'Vendor shall provide the report.'));
ok('execute ≡ sign',      logicallyEqual('Parties shall execute this Agreement.',          'Parties shall sign this agreement.'));

S('4. Filler collapse');
ok('hereby removed',           logicallyEqual('The parties hereby agree that the Provider shall pay.', 'The Provider shall pay.'));
ok('"it is agreed that" removed', logicallyEqual('It is agreed that the Client shall comply.', 'The Client shall comply.'));

S('5. NOT collapsed: scope idioms stay (would be unsound to strip)');
ok('"without limitation" stays a difference',
  !logicallyEqual('Damages include direct losses.', 'Damages include, without limitation, direct losses.'));
ok('"without prejudice" stays a difference',
  !logicallyEqual('All rights reserved.', 'All rights reserved without prejudice.'));

S('6. Thai legal-phrase synonyms');
ok('หนังสือบอกกล่าว ≡ แจ้งเป็นลายลักษณ์อักษร',
  logicallyEqual('ฝ่ายซื้อต้องส่งหนังสือบอกกล่าวภายใน 30 วัน', 'ฝ่ายซื้อต้องแจ้งเป็นลายลักษณ์อักษรภายใน 30 วัน'));
ok('ฝ่าฝืน ≡ ละเมิด',
  logicallyEqual('หากฝ่ายใดฝ่าฝืนข้อสัญญานี้', 'หากฝ่ายใดละเมิดข้อสัญญานี้'));
ok('เลิกสัญญา ≡ ยกเลิกสัญญา',
  logicallyEqual('คู่สัญญาเลิกสัญญาได้', 'คู่สัญญายกเลิกสัญญาได้'));
ok('โดยเร็ว ≡ โดยพลัน',
  logicallyEqual('ผู้ขายจะต้องส่งมอบโดยเร็ว', 'ผู้ขายจะต้องส่งมอบโดยพลัน'));
ok('ต้อง ≡ จะต้อง',
  logicallyEqual('ผู้ให้บริการต้องเข้ารหัสข้อมูล', 'ผู้ให้บริการจะต้องเข้ารหัสข้อมูล'));

S('7. Thai double-negation');
ok('ไม่ปฏิเสธที่จะ X ≡ X',
  logicallyEqual('คู่สัญญาไม่ปฏิเสธที่จะปฏิบัติตาม', 'คู่สัญญาปฏิบัติตาม'));
ok('ไม่ละเว้นการ X ≡ X',
  logicallyEqual('ผู้รับจ้างไม่ละเว้นการแจ้งเป็นลายลักษณ์อักษร', 'ผู้รับจ้างแจ้งเป็นลายลักษณ์อักษร'));

S('8. Genuine meaning differences must NOT collapse');
ok('30 days ≠ 60 days',
  !logicallyEqual('Pay within 30 days.', 'Pay within 60 days.'));
ok('shall ≠ shall not',
  !logicallyEqual('Warranty covers defects.', 'Warranty does not cover defects.'));
ok('All employees ≠ All full-time employees',
  !logicallyEqual('All employees must sign the NDA.', 'All full-time employees must sign the NDA.'));
ok('buyer indemnifies seller ≠ seller indemnifies buyer',
  !logicallyEqual('The buyer shall indemnify the seller.', 'The seller shall indemnify the buyer.'));

S('9. canonicalize() shape');
{
  const c = canonicalize('The parties hereby agree that the Provider shall notify the Client promptly.');
  ok('canonicalize returns a string', typeof c === 'string');
  ok('canonical has no "hereby"', !c.includes('hereby'));
  ok('canonical has M_HIGH for shall', /M_HIGH/i.test(c));
  ok('canonical has NOTIFY token',     /NOTIFY/i.test(c));
  ok('canonical has PROMPTLY token',   /PROMPTLY/i.test(c));
}

console.log(`\n\x1b[1mRESULT:\x1b[0m ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
