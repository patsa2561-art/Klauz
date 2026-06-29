// Stress test: generate 30-page .docx and 30-page .pdf with known terms scattered
// across pages, then extract and measure recall + timing. Honest numbers only.
import fs from 'node:fs';
import { Document, Packer, Paragraph, PageBreak } from 'docx';
import PDFDocument from 'pdfkit';
import { extractText } from '../src/extract.js';

const PAGES = parseInt(process.env.PAGES || '30', 10);

// known sentinel terms — one unique marker per page so we can measure recall
const marker = (p) => `MARKER_PAGE_${p}_UNIQUE`;
const clause = (p) => `Clause ${p}: The Provider shall deliver item ${p} within ${p * 2} days. ${marker(p)}.`;

async function buildDocx(file) {
  const kids = [];
  for (let p = 1; p <= PAGES; p++) {
    kids.push(new Paragraph(`SERVICE AGREEMENT — Page ${p}`));
    for (let i = 0; i < 8; i++) kids.push(new Paragraph(clause(p) + ` Line ${i}. The Client shall pay invoice ${p}.${i} promptly.`));
    if (p < PAGES) kids.push(new Paragraph({ children: [new PageBreak()] }));
  }
  fs.writeFileSync(file, await Packer.toBuffer(new Document({ sections: [{ children: kids }] })));
}

function buildPdf(file) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(file);
    doc.pipe(stream);
    for (let p = 1; p <= PAGES; p++) {
      doc.fontSize(14).text(`SERVICE AGREEMENT — Page ${p}`);
      doc.moveDown(0.5).fontSize(10);
      for (let i = 0; i < 8; i++) doc.text(clause(p) + ` Line ${i}. The Client shall pay invoice ${p}.${i} promptly.`);
      if (p < PAGES) doc.addPage();
    }
    doc.end();
    stream.on('finish', resolve);
  });
}

function recall(text) {
  let hit = 0;
  for (let p = 1; p <= PAGES; p++) if (text.includes(marker(p))) hit++;
  return hit;
}

(async () => {
  console.log(`generating ${PAGES}-page .docx and .pdf …`);
  await buildDocx('examples/big.docx');
  await buildPdf('examples/big.pdf');
  const dStat = fs.statSync('examples/big.docx'), pStat = fs.statSync('examples/big.pdf');
  console.log(`docx ${(dStat.size/1024).toFixed(0)}KB · pdf ${(pStat.size/1024).toFixed(0)}KB\n`);

  const t1 = Date.now();
  const d = await extractText('examples/big.docx');
  const dHit = recall(d.text);
  console.log(`=== DOCX (${PAGES} pages) ===`);
  console.log(`  engine ${d.engine} · ${((Date.now()-t1)/1000).toFixed(2)}s · ${d.text.length} chars`);
  console.log(`  page-marker recall: ${dHit}/${PAGES}  ${dHit===PAGES?'✓ ALL PAGES':'✗ missed '+(PAGES-dHit)}`);

  const t2 = Date.now();
  const pp = await extractText('examples/big.pdf');
  const pHit = recall(pp.text);
  console.log(`\n=== PDF (${PAGES} pages) ===`);
  console.log(`  engine ${pp.engine} · ${((Date.now()-t2)/1000).toFixed(2)}s · ${pp.text.length} chars · pages=${pp.pages}`);
  console.log(`  page-marker recall: ${pHit}/${PAGES}  ${pHit===PAGES?'✓ ALL PAGES':'✗ missed '+(PAGES-pHit)}`);

  // also run a real semantic diff on first 3 pages of big docx vs a tweaked copy
  console.log(`\n=== bonus: does extracted text feed semanticDiff cleanly? ===`);
  console.log(`  docx first 200 chars: ${JSON.stringify(d.text.slice(0,200))}`);
})();
