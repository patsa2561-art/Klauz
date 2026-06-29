// AUTO-CAPABILITY DETECTION — zero-config "it just works".
//
// On startup we probe the local machine for an LLM (Ollama) and, if found, wire
// meaningdiff to whatever model the user actually has — gemma, qwen, llama, etc.
// — automatically. No API key, no manual config. If nothing is found we stay in
// deterministic mode (fully usable, no AI) and tell the user how to enable smart
// mode. The user never has to choose a model or edit a config file.
import { ping, setModels } from './ollama.js';
import { setEngine } from './classify.js';

// Ranked chat-model preferences (best general judges first). Any non-embed model
// is accepted as a fallback so "gemma OR others" all work.
const JUDGE_PREF = [
  'gemma3:12b', 'gemma3:27b', 'gemma3', 'qwen2.5:32b', 'qwen2.5-coder:32b', 'qwen2.5:14b',
  'llama3.3:70b', 'llama3.3', 'llama3.2', 'qwen2.5:7b', 'qwen2.5', 'mistral', 'phi3', 'llama3',
];
const EMBED_PREF = ['bge-m3', 'nomic-embed-text', 'mxbai-embed-large', 'snowflake-arctic-embed', 'all-minilm'];
const isEmbed = (m) => /embed|bge|minilm|arctic/i.test(m);
const tooWeak = (m) => /:0\.\d+b|:1\.5b|:1b\b|-base\b/i.test(m); // skip tiny / base models as the judge

function startsWithAny(name, prefs) { const n = name.toLowerCase(); return prefs.find((p) => n.startsWith(p)); }
function pickJudge(models) {
  for (const p of JUDGE_PREF) { const hit = models.find((m) => m.toLowerCase().startsWith(p)); if (hit) return hit; }
  return models.find((m) => !isEmbed(m) && !tooWeak(m)) || models.find((m) => !isEmbed(m)) || null;
}
function pickEmbed(models) {
  for (const p of EMBED_PREF) { const hit = models.find((m) => m.toLowerCase().startsWith(p)); if (hit) return hit; }
  return models.find(isEmbed) || null;
}

const ADVICE_NO_OLLAMA =
  'No local AI detected (Ollama not running). Deterministic mode is ON and fully usable — ' +
  'certify / verify / lint / merge3 / scan and provable changes all work with no AI. ' +
  'To turn on smart mode (deeper meaning analysis): install Ollama from https://ollama.com, then run: ollama pull gemma3:12b';
const ADVICE_NO_MODEL =
  'Ollama is running but no chat model is installed. Run:  ollama pull gemma3:12b  to enable smart mode. ' +
  'Deterministic mode works right now without it.';
const ADVICE_TH_NO_OLLAMA =
  'ไม่พบ AI ในเครื่อง (ยังไม่ได้เปิด Ollama) — ใช้โหมด deterministic ได้เต็มที่ (certify/verify/lint/merge3/scan + การเปลี่ยนที่พิสูจน์ได้ ทำงานหมดโดยไม่ต้องมี AI) ' +
  'อยากเปิดโหมดฉลาด: ลง Ollama จาก https://ollama.com แล้วรัน  ollama pull gemma3:12b';

export async function detectCapabilities() {
  const p = await ping();
  if (!p.ok) return { ollama: false, llm: false, mode: 'deterministic', judge: null, embed: null, models: [], advice: ADVICE_NO_OLLAMA, advice_th: ADVICE_TH_NO_OLLAMA };
  const models = p.models || [];
  const judge = pickJudge(models);
  const embed = pickEmbed(models);
  if (!judge) return { ollama: true, llm: false, mode: 'deterministic', judge: null, embed, models, advice: ADVICE_NO_MODEL };
  return { ollama: true, llm: true, mode: 'smart', judge, embed: embed || null, models, advice: null };
}

// Detect, then wire models + engine AUTOMATICALLY. Honors an explicit
// MEANINGDIFF_ENGINE (setEngine no-ops if the user pinned one). Returns the
// capability snapshot so callers can show status / an install prompt.
//   prefer: which LLM engine to use when an LLM is present ('auto' keeps power-shift
//           direction; 'tribunal' is the abstaining max-assurance mode).
export async function autoConfigure({ prefer = 'auto' } = {}) {
  const cap = await detectCapabilities();
  if (cap.llm) { setModels({ judge: cap.judge, embed: cap.embed || undefined }); setEngine(prefer); }
  else { setEngine('heuristic'); } // deterministic rules-only — never needs AI or network
  return cap;
}

export function describeCapabilities(cap) {
  if (cap.llm) return `smart mode ON — auto-detected local AI: judge=${cap.judge}${cap.embed ? `, embed=${cap.embed}` : ''} (free, runs on this machine, no API key)`;
  return `deterministic mode (no AI) — ${cap.advice}`;
}
