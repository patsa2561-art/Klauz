# ⚖ Klauz

**git เทียบตัวอักษร — Klauz เทียบ "ความหมาย"**

แก้สัญญา 1 คำ `shall → may` = git บอก "เปลี่ยน 1 คำ" แต่จริงๆ **ภาระผูกพันพลิกจาก "บังคับ" เป็น "ทางเลือก"** — Klauz จับสิ่งนี้ และทำงาน **100% ในเครื่องคุณ** (เอกสารไม่ออกไปไหน)

> **Klauz** is the product brand. The CLI binary, file paths, and internal API stay as `meaningdiff` (code name — like Claude/Anthropic).

---

## ใช้ยังไง (ง่ายสุด ไม่ต้องเปิด terminal)

**ทางที่ง่ายที่สุด — ไม่ต้องลงอะไรเลย (Windows) / Zero-install:**
1. แตกไฟล์ **`meaningdiff-portable-win-x64.zip`** ที่ไหนก็ได้ / *unzip it anywhere*
2. ดับเบิลคลิก **`meaningdiff.bat`** → เบราว์เซอร์เปิดเอง / *double-click → browser opens automatically*
3. ลากไฟล์เข้าไป → กดปุ่ม → อ่านผล / *drop a file → click a button → read the result*

> 📦 zip นี้มี Node ในตัว — **ไม่ต้องติดตั้ง Node / ไม่ต้องต่อเน็ต** · เอกสารไม่ออกจากเครื่อง
> *(bundles Node — no install, no internet, documents stay on your machine)*
> สร้าง zip เอง: `powershell -File build-portable.ps1`

**ถ้ามี Node อยู่แล้ว (dev):** ดับเบิลคลิก `meaningdiff.bat` / `meaningdiff.command` ได้เลย
> โหมดฉลาด (ออปชัน): [Ollama](https://ollama.com) → `ollama pull gemma3:12b` · ไม่มีก็ยังได้ผลแบบพิสูจน์ได้ครบ

---

## ติดตั้งจาก git (สำหรับ dev) · Install from git

```bash
# 1) ลง Node.js (LTS) ครั้งเดียวจาก https://nodejs.org  (install Node.js LTS once)
git clone <repo-url> meaningdiff
cd meaningdiff
npm ci                      # ติดตั้ง dependencies (ตรงตาม lockfile)
node bin/meaningdiff.js serve
# เปิด http://127.0.0.1:7700  (หรือดับเบิลคลิก meaningdiff.bat / .command)
```

> ✅ Certify / Lint / Merge / Compare พื้นฐาน ใช้ได้ทันทีหลัง `npm ci` — ไม่ต้องมี AI
> 🧠 อยากได้โหมดฉลาด: ลง [Ollama](https://ollama.com) → `ollama pull gemma3:12b`
> 📦 อยากแจกคนที่ไม่มี Node: `powershell -File build-portable.ps1` → ได้ zip ดับเบิลคลิกใช้ได้

---

## ทำอะไรได้บ้าง (ตารางเดียวจบ — อ่าน 30 วิ)

| ฟังก์ชัน | ทำอะไร (สั้นๆ) | เข้าถึง |
|---|---|---|
| **Compare** | แก้แล้ว "ความหมาย" เปลี่ยนไหม (ไม่ใช่แค่คำ) + เสี่ยงแค่ไหน | เว็บปุ่ม Compare · `meaningdiff a b` |
| **⚖ Power-Shift** | redline เอียงเข้าข้างใคร กี่ % | ใส่ Parties แล้ว Compare · `--parties "A,B"` |
| **🔍 Audit** | ตรวจสัญญา **ฉบับเดียว** ทีละข้อ หาข้อเสี่ยง (ไม่ต้องมี 2 ฉบับ) | เว็บปุ่ม Audit |
| **🔏 Certify (PCR)** | ออก "ใบเสร็จเซ็นลายเซ็น" ที่ **ใครก็ตรวจซ้ำเองได้** ว่าเปลี่ยนอะไร + ไม่มีข้อถูกซ่อน | เว็บปุ่ม Certify · `meaningdiff certify a b` |
| **🧹 Lint** | เช็คโครงสร้าง: อ้างอิงค้าง · ช่องว่างไม่กรอก · TBD ตกค้าง · นิยามซ้ำ/ไม่ใช้ (กฎล้วน ไม่มั่ว) | เว็บปุ่ม Lint · `meaningdiff lint a` |
| **🔀 Merge3** | รวม redline 2 ฝ่าย จับ "ข้อที่แก้ชนกัน" เหมือน git merge | `meaningdiff merge3 base left right` |
| **📜 Covenant** | เขียน rule ครั้งเดียว บังคับทุก edit · ละเมิด = block (exit 2) | `meaningdiff covenant a b --rules x` |
| **📈 Drift** | หลาย version จับ "ความหมายค่อยๆ พลิก" ที่ไม่มี diff ไหนดูน่ากลัว | `meaningdiff drift v1 v2 v3` |
| **⚖ Reversibility** | "ถ้าข้อนี้เล็งมาที่คุณ จะเซ็นไหม?" สลับคู่สัญญา หาข้อที่ **ไม่มี mirror = เอียงข้างเดียว** (กฎล้วน) | `meaningdiff reverse a --parties "A,B"` |
| **🧬 Risk scan** | "Shazam ข้อสัญญา" — จับข้อโหดที่รู้จัก (รับผิดไม่จำกัด, เลิกฝ่ายเดียว ฯลฯ) | `meaningdiff scan a` |
| **⏳ Blame** | "git blame ระดับความหมาย" — ความเสี่ยงข้อนี้ถูกใส่รอบเจรจาไหน | `meaningdiff blame v1 v2 v3` |
| **🔒 Intent-Freeze** | ตรึงเจตนาข้อสำคัญด้วยลายเซ็น · แก้จนความหมายเพี้ยน = ลายเซ็นแตก | `meaningdiff freeze a --intent "…"` |
| **🥊 Adversary** | สร้าง redline ที่ "อีกฝ่าย" จะขอ เพื่อกันล่วงหน้า | `meaningdiff adversary a --parties "A,B" --you "B"` |

```bash
# ตัวอย่างที่ใช้บ่อย
node bin/meaningdiff.js a.txt b.txt --parties "Provider,Client"   # Compare + Power-Shift
node bin/meaningdiff.js certify a.txt b.txt -o deal.pcr           # ออกใบรับรอง
node bin/meaningdiff.js verify deal.pcr a.txt b.txt               # ตรวจซ้ำ → VALID / TAMPERED
node bin/meaningdiff.js lint contract.txt                          # หาจุดบกพร่องโครงสร้าง
node bin/meaningdiff.js merge3 base.txt partyA.txt partyB.txt      # จับ conflict 2 ฝ่าย
```

> **🔏 PCR แยก 2 ชั้นชัดเจน — นี่คือความหมายของ "แม่น 100%"**
> ① **พิสูจน์ได้ (deterministic):** ไม่มีข้อถูกซ่อน + การเปลี่ยนตัวเลข/modal/ปฏิเสธ/ช่องว่าง → ตรวจซ้ำได้เองโดยไม่ต้องใช้ AI
> ② **โมเดลอ้าง (model-asserted):** การจัดประเภทข้อที่เขียนใหม่ → **ติดป้ายไว้ ไม่ปลอมเป็นของพิสูจน์**

---

## อ่านผลให้เป็น + สิ่งที่ควรรู้  ·  Reading the results + things to know

**🧹 ผล Lint / Lint results**
- **✗ = ควรแก้ (to fix)** · **⚠ = ควรเช็คดู (worth a look)**
- **ฟอร์มเปล่าที่มีช่องว่าง (……) เป็นเรื่องปกติ ไม่ใช่ error** — ระบบจะรวมเป็นคำเตือนเดียวว่า "ยังไม่กรอก X จุด" / *A blank template is normal, not an error — blanks are grouped into one "not filled yet" note.*
- Lint ใช้กฎล้วน ไม่มี AI → **ไม่มีทางมั่ว** / *pure rules, no AI — it never makes things up.*

**🤖 เรื่อง AI / About AI**
- **Certify · Lint · Merge3 · Compare พื้นฐาน = ไม่ต้องมี AI และไม่ต้องต่อเน็ต** / *work with no AI and no internet.*
- โหมดฉลาด (อ่านข้อที่เขียนใหม่ลึกขึ้น) ใช้โมเดลเล็กในเครื่องผ่าน Ollama — **ออปชัน ไม่บังคับ ไม่ต้องใช้ LLM เทพ** / *optional small local model via Ollama; no powerful LLM needed.*
  - เปิดโหมดฉลาด: ลง [Ollama](https://ollama.com) → `ollama pull gemma3:12b`
- 🔒 **เอกสารไม่เคยออกจากเครื่องคุณ** / *your documents never leave your machine.*

---

## รองรับไฟล์อะไร

`.txt` `.md` · **`.docx`** · **`.pdf`** · **`.xlsx/.csv`** · **รูป/สแกน** (`.png .jpg` → gemma3 vision อ่านให้)

ใส่ไฟล์ format ไหนก็ได้ — ระบบ extract เป็นข้อความให้เอง

---

## แม่นแค่ไหน (วัดจริง ไม่โม้)

| | ผล |
|---|---|
| จับ meaning-change (F1) | **94.7%** · recall **100%** (ไม่พลาดสักอัน) |
| Power-Shift ทิศทาง | **91.7%** |
| อ่าน .docx / .xlsx | round-trip **100%** |
| vision อ่านรูป (clean) | **10/10 clauses, 5/5 table cells** |

> ข้อจำกัดจริง: gemma3:12b เล็ก — สแกนกระดาษจริง/ลายมือ/เอกสารเอียงจะแม่นน้อยลง · โหมด `consensus` (rule+LLM เห็นต่าง = flag ให้คนดู) ลด silent error

---

## ต่างกับ ChatGPT ยังไง

ChatGPT อ่านสัญญาแล้วบอกว่าเอียงได้ (เก่งกว่าด้วย) — แต่ meaningdiff คือ **infrastructure ไม่ใช่ chat**: ① local ไม่รั่ว ② **block อัตโนมัติ (exit 2)** ③ **policy-as-code** (เขียน rule บังคับใช้ทุก edit) ④ reproducible ⑤ scale + audit ได้

**เทียบ:** ChatGPT = "ถามผู้เชี่ยวชาญ 1 ครั้ง" · meaningdiff = "smoke detector ติดผนัง — ทำงานทุกครั้ง ไม่ลืม block ได้"

---

## License
MIT · เอกสารไม่เคยออกจากเครื่องคุณ
