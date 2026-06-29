// NEGOTIATION ADVERSARY — "attack your own contract before they do".
// Given a contract and which side is YOU, it generates the predictable
// counter-redline the OTHER party would request: every clause that currently
// favors you is a clause they will push back on. Rule-based + deterministic
// (no model needed) — it mirrors each one-sided clause back onto you, so you
// can pre-empt the asks. (An LLM could phrase these more naturally; the rule
// engine here is the honest, always-available core.)
import { chunk } from './chunk.js';
import { hasObligation, obligor, MODALS } from './reversibility.js';

const PERM = ['may', 'อาจ', 'สามารถ'];
const MAND = ['shall', 'must', 'will', 'ต้อง', 'จะต้อง', 'is required to', 'agrees to'];
const NUM = /\d+(?:[.,]\d+)*\s?(?:%|percent|days?|hours?|weeks?|months?|years?|usd|dollars?|บาท|วัน|เดือน|ปี|\$)/i;
const CAP = /(cap(?:ped)?|limited to|not exceed|จำกัด(?:ความรับผิด)?)/i;

const modalClass = (c) => { const t = ' ' + c.toLowerCase() + ' '; if (MAND.some((m) => t.includes(m))) return 'mandatory'; if (PERM.some((m) => t.includes(m))) return 'permissive'; return null; };

export function adversary(text, parties = [], you) {
  const [A, B] = parties;
  if (!A || !B) return { error: 'adversary needs two parties (e.g. "Provider, Client")' };
  you = you || A;
  const them = you.toLowerCase() === A.toLowerCase() ? B : A;
  const clauses = chunk(text);
  const asks = [];

  for (const c of clauses) {
    if (!hasObligation(c)) continue;
    const who = obligor(c, A, B);
    if (!who) continue;
    // a duty on THEM (or a right for YOU) favors you → they will attack it
    const favorsYou = who.toLowerCase() === them.toLowerCase();
    if (!favorsYou) continue;

    const mc = modalClass(c);
    if (mc === 'mandatory') {
      asks.push(mk(c, 'weaken-duty',
        `They will ask to soften ${them}'s duty here ("shall" → "may" / add "commercially reasonable efforts").`,
        `${them} จะขอให้ลดภาระตรงนี้ ("ต้อง" → "อาจ" หรือเพิ่ม "เท่าที่ทำได้ตามสมควร")`));
    }
    if (NUM.test(c)) {
      asks.push(mk(c, 'shift-number',
        `They will push the number in their favor (e.g. longer deadline for ${them}, or a smaller amount/penalty owed by ${them}).`,
        `${them} จะขอขยับตัวเลขให้ตัวเองได้เปรียบ (เช่น ยืดกำหนดเวลาของ ${them} หรือลดจำนวน/ค่าปรับที่ ${them} ต้องจ่าย)`));
    }
    if (CAP.test(c)) {
      asks.push(mk(c, 'attack-cap',
        `They will try to remove or raise the liability cap that currently protects ${you}.`,
        `${them} จะพยายามถอด/เพิ่มเพดานความรับผิดที่ตอนนี้คุ้มครอง ${you}`));
    }
    // generic mutuality ask
    asks.push(mk(c, 'demand-mutuality',
      `They will demand this obligation be made mutual (also binding on ${you}).`,
      `${them} จะขอให้ภาระนี้เป็นแบบสองทาง (ผูกพัน ${you} ด้วย)`));
  }

  // de-dup identical (clause,type)
  const seen = new Set();
  const unique = asks.filter((a) => { const k = a.type + '|' + a.clause; if (seen.has(k)) return false; seen.add(k); return true; });

  return {
    summary: { parties: [A, B], you, them, clauses: clauses.length, counter_asks: unique.length },
    asks: unique,
  };
}

function mk(clause, type, en, th) { return { clause: clause.trim().slice(0, 160), type, ask_en: en, ask_th: th }; }
