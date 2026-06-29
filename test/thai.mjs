// Test Thai-language support across docx / xlsx / pdf + semantic diff in Thai.
import fs from 'node:fs';
import { Document, Packer, Paragraph } from 'docx';
import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { extractText } from '../src/extract.js';
import { semanticDiff } from '../src/diff.js';

const TH = 'ผู้ให้บริการต้องเข้ารหัสข้อมูลลูกค้าทั้งหมด และต้องแจ้งลูกค้าภายใน 24 ชั่วโมง';
const TH2 = 'ผู้ให้บริการอาจเข้ารหัสข้อมูลลูกค้า และอาจแจ้งลูกค้าตามดุลพินิจ';

// docx
const doc = new Document({ sections: [{ children: [new Paragraph(TH)] }] });
fs.writeFileSync('examples/thai.docx', await Packer.toBuffer(doc));
// xlsx
const ws = XLSX.utils.aoa_to_sheet([['ข้อ', 'เงื่อนไข'], ['การชำระเงิน', 'ภายใน 30 วัน'], ['ความรับผิด', 'จำกัดที่ค่าบริการ']]);
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'เงื่อนไข');
XLSX.writeFile(wb, 'examples/thai.xlsx');
// pdf (needs a Thai-capable font)
const fontCandidates = ['C:/Windows/Fonts/tahoma.ttf', 'C:/Windows/Fonts/Leelawui.ttf', 'C:/Windows/Fonts/leelawui.ttf', 'C:/Windows/Fonts/cordia.ttf'];
const thaiFont = fontCandidates.find((f) => fs.existsSync(f));
await new Promise((resolve) => {
  const d = new PDFDocument();
  const s = fs.createWriteStream('examples/thai.pdf');
  d.pipe(s);
  if (thaiFont) d.font(thaiFont);
  d.fontSize(16).text(TH);
  d.end(); s.on('finish', resolve);
});

async function show(label, file, needle) {
  try {
    const r = await extractText(file);
    const ok = r.text.includes(needle);
    console.log(`${ok ? '✓' : '✗'} ${label} (${r.engine}): ${ok ? 'Thai OK' : 'Thai BROKEN'}`);
    console.log(`   read: ${JSON.stringify(r.text.replace(/\s+/g, ' ').trim().slice(0, 120))}`);
  } catch (e) { console.log(`✗ ${label}: ${e.message.slice(0, 80)}`); }
}

console.log(`(pdf font: ${thaiFont || 'NONE — pdf Thai will likely break'})\n`);
await show('DOCX', 'examples/thai.docx', 'เข้ารหัส');
await show('XLSX', 'examples/thai.xlsx', 'ชำระเงิน');
await show('PDF', 'examples/thai.pdf', 'เข้ารหัส');

console.log('\n=== Thai semantic diff: ต้อง→อาจ (modal shift) ===');
const rep = await semanticDiff(TH, TH2, { parties: ['ผู้ให้บริการ', 'ลูกค้า'] });
console.log('verdict:', rep.summary.verdict, '· changes:', rep.summary.meaningChanges, '· high:', rep.summary.highRisk);
for (const c of rep.changes.slice(0, 3)) console.log(`  [${c.severity}] ${c.category} — ${c.evidence || ''} — ${c.explanation || ''}`);
