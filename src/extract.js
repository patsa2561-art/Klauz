// Universal document text extractor. file path/buffer -> plain text.
// Supports: .txt .md  ·  .docx (mammoth)  ·  .pdf (pdf-parse)  ·  .xlsx/.xls (xlsx)
//           images .png/.jpg/.jpeg/.webp (gemma3 vision — reads layout+figures+text)
// Honest limits are reported per-format below.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const HOST = process.env.MEANINGDIFF_OLLAMA || 'http://127.0.0.1:11434';
const VISION_MODEL = process.env.MEANINGDIFF_VISION || 'gemma3:12b';

// --- gemma3 vision: read an image (scanned page / figure) into text ---
function visionRead(base64png) {
  const prompt =
    'You are an OCR + document-understanding engine. Transcribe ALL text in this image faithfully, ' +
    'preserving clause numbers, tables (as text), and reading order. Do not summarize, do not add commentary. ' +
    'Output only the transcribed text.';
  const body = JSON.stringify({
    model: VISION_MODEL,
    prompt,
    images: [base64png],
    stream: false,
    options: { temperature: 0 },
  });
  return new Promise((resolve, reject) => {
    const u = new URL(HOST);
    const req = http.request({ hostname: u.hostname, port: u.port, path: '/api/generate', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d).response || ''); } catch (e) { reject(new Error('vision parse fail')); } });
    });
    req.on('error', reject);
    req.setTimeout(180000, () => { req.destroy(); reject(new Error('vision timeout')); });
    req.write(body); req.end();
  });
}

export async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);

  if (ext === '.txt' || ext === '.md' || ext === '.text' || ext === '') {
    return { text: buf.toString('utf8'), format: ext || 'txt', engine: 'raw' };
  }
  if (ext === '.docx') {
    const mammoth = (await import('mammoth')).default;
    const r = await mammoth.extractRawText({ buffer: buf });
    return { text: r.value, format: 'docx', engine: 'mammoth', warnings: (r.messages || []).length };
  }
  if (ext === '.pdf') {
    const { PDFParse } = await import('pdf-parse');
    const { looksCorrupted } = await import('./heuristic.js');
    const parser = new PDFParse({ data: buf });
    const r = await parser.getText();
    const text = (r.text || '').trim();
    // strip pdf-parse page markers ("-- N of M --") to judge real content length
    const realText = text.replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '').trim();
    const corrupt = realText.length < 25
      ? { corrupted: true, ratio: 1, reason: `only ${realText.length} chars of text — likely scanned/image PDF` }
      : looksCorrupted(realText);
    // TRIANGULATED EXTRACTION: if the text layer looks corrupted or empty
    // (classic Thai/non-Latin PDF font bug, or scanned page), render each page
    // and re-read it with the vision model — vision reads the visual glyphs the
    // text layer mangled. This is the verified-novel wedge.
    if (corrupt.corrupted) {
      try {
        const shots = await parser.getScreenshot();
        const pages = shots.pages || [];
        const visionParts = [];
        for (const pg of pages) {
          const b64 = pg.data ? Buffer.from(pg.data).toString('base64')
            : (pg.dataUrl || '').replace(/^data:image\/\w+;base64,/, '');
          if (b64) visionParts.push(await visionRead(b64));
        }
        const visionText = visionParts.join('\n').trim();
        if (visionText.length > text.length) {
          return { text: visionText, format: 'pdf', engine: `pdf-parse→vision(${VISION_MODEL})`, pages: r.total,
            note: `text layer flagged (${corrupt.reason}) → re-read ${pages.length} page(s) with vision` };
        }
      } catch (e) { /* vision unavailable → return text-layer result below with warning */ }
      return { text, format: 'pdf', engine: 'pdf-parse', pages: r.total,
        note: `⚠ text layer may be corrupted (${corrupt.reason}); vision fallback unavailable` };
    }
    return { text, format: 'pdf', engine: 'pdf-parse', pages: r.total };
  }
  if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'buffer' });
    const parts = [];
    for (const name of wb.SheetNames) {
      parts.push(`# Sheet: ${name}`);
      parts.push(XLSX.utils.sheet_to_csv(wb.Sheets[name]));
    }
    return { text: parts.join('\n'), format: 'xlsx', engine: 'xlsx', sheets: wb.SheetNames.length };
  }
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) {
    const text = await visionRead(buf.toString('base64'));
    return { text, format: ext.slice(1), engine: `vision:${VISION_MODEL}` };
  }
  throw new Error(`unsupported file type: ${ext} (supported: .txt .md .docx .pdf .xlsx .csv + images)`);
}
