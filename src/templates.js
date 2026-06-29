// TEMPLATE FINGERPRINT — recognize well-known contracts/ToS by their signature
// phrases, then surface known issues specific to that template.
//
// Each template entry:
//   - signature: array of 3-5 phrases unique enough to identify the template
//                (we require ≥ 2 hits to declare a match — avoids false fire)
//   - issues:    array of known-issue notes specific to that template
//
// We DON'T claim that any template is "bad" — only that, since these are
// widely-used templates, the public has documented predictable gotchas. Klauz
// surfaces them so users know what to look for.

const TEMPLATES = [
  // ── Spotify ─────────────────────────────────────────────────────────
  {
    id: 'spotify',
    name: 'Spotify Terms of Service',
    signature: [
      /\bspotify\s+(ab|technology)\b/i,
      /\bspotify\s+(account|service|community|content)\b/i,
      /\bpremium\s+(family|duo|individual)\b/i,
      /\bspotify\.com\b/i,
    ],
    issues: [
      { id: 'family_same_household', severity: 'medium',
        en: 'Family plan requires all members to live at the same address — Spotify periodically verifies via IP/location.',
        th: 'Family plan ต้องอยู่บ้านเดียวกัน — Spotify ตรวจสอบเป็นระยะผ่าน IP/ตำแหน่ง' },
      { id: 'recurring_until_cancel', severity: 'high',
        en: 'Auto-renews until you cancel; no refunds for partial periods.',
        th: 'ต่ออายุอัตโนมัติจนกว่าจะยกเลิก ไม่คืนเงินบางส่วน' },
      { id: 'us_jurisdiction', severity: 'medium',
        en: 'Governed by Swedish or US law depending on region — disputes via private arbitration in many regions.',
        th: 'ใช้กฎหมายสวีเดน/สหรัฐฯ ขึ้นกับภูมิภาค — ฟ้องผ่านอนุญาโตฯ' },
    ],
  },

  // ── Lazada ──────────────────────────────────────────────────────────
  {
    id: 'lazada',
    name: 'Lazada Marketplace Terms (TH)',
    signature: [
      /\blazada\b/i,
      /\bmarketplace\s+(seller|terms?)\b/i,
      /\bservice\s+commission\b/i,
      /lazada\.co\.th|lazada\.com/i,
    ],
    issues: [
      { id: 'platform_commission_change', severity: 'high',
        en: 'Lazada can change commission rates with limited notice; sellers absorb the impact.',
        th: 'Lazada เปลี่ยนเปอร์เซ็นต์ค่าคอมฯ ได้โดยแจ้งล่วงหน้าระยะสั้น ผู้ขายรับภาระ' },
      { id: 'voucher_burden_seller', severity: 'high',
        en: 'Some vouchers/discounts are partially or fully borne by the seller, not by Lazada.',
        th: 'คูปอง/ส่วนลดบางอย่าง ผู้ขายต้องรับภาระเอง ไม่ใช่ Lazada' },
      { id: 'account_suspension_at_will', severity: 'high',
        en: 'Account can be suspended at Lazada\'s discretion for "policy violations" — limited appeal.',
        th: 'บัญชีถูกระงับตามดุลพินิจ Lazada ฐาน "ละเมิดนโยบาย" — สิทธิอุทธรณ์จำกัด' },
      { id: 'data_to_affiliates', severity: 'medium',
        en: 'Seller and order data may be shared with Lazada affiliates regionally.',
        th: 'ข้อมูลผู้ขาย/ออเดอร์อาจถูกแชร์กับบริษัทในเครือ Lazada ในภูมิภาค' },
    ],
  },

  // ── Shopee ──────────────────────────────────────────────────────────
  {
    id: 'shopee',
    name: 'Shopee Marketplace Terms (TH)',
    signature: [
      /\bshopee\b/i,
      /\b(shopee\s+(seller|mall|live|pay))\b/i,
      /shopee\.co\.th|shopee\.com/i,
    ],
    issues: [
      { id: 'commission_change', severity: 'high',
        en: 'Commission and shipping subsidies change unilaterally with short notice.',
        th: 'ค่าคอมฯ และเงินสนับสนุนค่าส่งเปลี่ยนฝ่ายเดียวโดยแจ้งล่วงหน้าระยะสั้น' },
      { id: 'auto_dispute_to_buyer', severity: 'medium',
        en: 'In many seller-vs-buyer disputes, Shopee resolves in favor of the buyer when evidence is split.',
        th: 'กรณีผู้ซื้อ-ผู้ขายขัดแย้ง หลักฐานกึ่งๆ Shopee มักตัดสินเข้าข้างผู้ซื้อ' },
      { id: 'shopeepay_hold', severity: 'high',
        en: 'Payouts can be held in ShopeePay wallet for additional verification.',
        th: 'เงินอาจถูกแขวนใน ShopeePay เพื่อยืนยันตัวตน' },
    ],
  },

  // ── AWS ─────────────────────────────────────────────────────────────
  {
    id: 'aws',
    name: 'AWS Service Terms / Customer Agreement',
    signature: [
      /\b(aws|amazon\s+web\s+services)\b/i,
      /\bservice\s+terms\b/i,
      /\b(customer\s+agreement|enterprise\s+agreement)\b/i,
      /\baws\.amazon\.com\b/i,
    ],
    issues: [
      { id: 'service_credits_only', severity: 'medium',
        en: 'SLA breaches are usually remedied in service credits — not cash refunds.',
        th: 'การละเมิด SLA ชดเชยเป็น service credit เท่านั้น ไม่ใช่เงินคืน' },
      { id: 'data_processing_regions', severity: 'medium',
        en: 'Default data-processing regions matter for PDPA/GDPR — check region selection.',
        th: 'ภูมิภาคประมวลผลข้อมูล default มีผลต่อ PDPA/GDPR — ต้องเลือก region ให้ถูก' },
      { id: 'aup_broad', severity: 'medium',
        en: 'Acceptable-Use Policy is broad and AWS can suspend on alleged violation without prior warning.',
        th: 'นโยบายการใช้งาน (AUP) กว้าง AWS ระงับบริการตามที่กล่าวอ้างละเมิดได้โดยไม่แจ้งล่วงหน้า' },
    ],
  },

  // ── Stripe ──────────────────────────────────────────────────────────
  {
    id: 'stripe',
    name: 'Stripe Services Agreement',
    signature: [
      /\bstripe\b/i,
      /\b(stripe\s+(connect|atlas|checkout|payments))\b/i,
      /\b(merchant|services)\s+agreement\b/i,
      /stripe\.com/i,
    ],
    issues: [
      { id: 'reserve_holds', severity: 'high',
        en: 'Stripe may impose reserves or hold funds for risk reasons with limited notice — cash-flow impact.',
        th: 'Stripe อาจตั้ง reserve หรือถือเงินไว้ตามดุลพินิจความเสี่ยง — กระทบ cash flow' },
      { id: 'instant_termination_high_risk', severity: 'high',
        en: 'Accounts in "high-risk" categories can be terminated quickly; payout hold periods extend on termination.',
        th: 'บัญชี "ความเสี่ยงสูง" ถูกเลิกได้เร็ว และระยะถือเงินยืดออกไปหลังเลิก' },
      { id: 'chargeback_burden', severity: 'high',
        en: 'Chargebacks + chargeback fees are borne entirely by the merchant.',
        th: 'Chargeback และค่าธรรมเนียม chargeback ผู้ขายรับเต็ม' },
    ],
  },
];

// Identify a template by counting signature hits — need at least 2 to claim a match.
export function identifyTemplates(text) {
  if (!text || text.length < 50) return [];
  const matches = [];
  for (const t of TEMPLATES) {
    let hits = 0;
    const fired = [];
    for (const sig of t.signature) {
      if (sig.test(text)) { hits++; fired.push(sig.source); }
    }
    if (hits >= 2) {
      matches.push({
        id: t.id,
        name: t.name,
        confidence: hits / t.signature.length,
        hits,
        of: t.signature.length,
        issues: t.issues,
      });
    }
  }
  // strongest match first
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}

export function listTemplates() {
  return TEMPLATES.map(({ id, name, signature, issues }) => ({ id, name, signature_count: signature.length, issue_count: issues.length }));
}
