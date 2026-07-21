// Shared logic for Credify's Netlify Functions. Lives in netlify/functions/lib/
// (not directly in netlify/functions/) so Netlify's function discovery
// doesn't try to treat this file as its own endpoint — only files directly
// inside netlify/functions/ become routes; files imported from a
// subdirectory are just regular bundled modules.
//
// API keys: set these as real Environment Variables in the Netlify dashboard
// (Site configuration -> Environment variables) named exactly GROQ_API_KEY,
// ANTHROPIC_API_KEY, GEMINI_API_KEY.
//
// The "ChatGPT" slot is served by Groq's free gpt-oss-120b model (Groq's
// OpenAI-compatible chat completions endpoint) — the frontend/UI label
// wasn't changed, only which model actually answers.
//
// All provider calls use the platform's built-in fetch — no SDK
// dependencies, so there's nothing extra to install beyond @netlify/blobs
// (only needed by the class-mode functions).

const REQUEST_TIMEOUT_MS = 25000;
const LINK_FETCH_TIMEOUT_MS = 8000;
const LINK_MAX_CHARS = 6000;

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const GROQ_MODEL = "openai/gpt-oss-120b"; // only free model in play, used for both normal and deep checks
const CLAUDE_MODEL = "claude-3-5-haiku-latest";
const CLAUDE_MODEL_DEEP = "claude-3-5-sonnet-latest";
// gemini-1.5-* were shut down, and pinned gemini-2.5-flash/pro turned out
// unavailable to newer API keys too — use Google's official self-updating
// aliases instead so this doesn't go stale again as models get retired.
const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_MODEL_DEEP = "gemini-pro-latest";

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

async function callClaude(prompt, deep) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Claude API key not set — add ANTHROPIC_API_KEY in Netlify's Environment variables.");
  }
  const { signal, cleanup } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: deep ? CLAUDE_MODEL_DEEP : CLAUDE_MODEL,
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
      }),
      signal,
    });
    if (!resp.ok) {
      throw new Error(`Claude API error ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    }
    const data = await resp.json();
    return (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
  } finally {
    cleanup();
  }
}

async function callGroq(prompt) {
  if (!GROQ_API_KEY) {
    throw new Error("Groq API key not set — add GROQ_API_KEY in Netlify's Environment variables.");
  }
  const { signal, cleanup } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 700,
      }),
      signal,
    });
    if (!resp.ok) {
      throw new Error(`Groq API error ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    }
    const data = await resp.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  } finally {
    cleanup();
  }
}

async function callGemini(prompt, deep) {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key not set — add GEMINI_API_KEY in Netlify's Environment variables.");
  }
  const model = deep ? GEMINI_MODEL_DEEP : GEMINI_MODEL;
  const { signal, cleanup } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal,
      }
    );
    if (!resp.ok) {
      throw new Error(`Gemini API error ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    }
    const data = await resp.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    return parts.map((p) => p.text || "").join("").trim();
  } finally {
    cleanup();
  }
}

export const PROVIDERS = { claude: callClaude, chatgpt: callGroq, gemini: callGemini };

async function callAll(prompt, deep) {
  const entries = Object.entries(PROVIDERS);
  const settled = await Promise.allSettled(entries.map(([, fn]) => fn(prompt, deep)));
  const texts = {};
  const errors = {};
  settled.forEach((res, i) => {
    const [name] = entries[i];
    if (res.status === "fulfilled") texts[name] = res.value;
    else errors[name] = String(res.reason?.message || res.reason);
  });
  return { texts, errors };
}

// ------------------------------------------------------------------ prompts
async function fetchArticleText(url) {
  const { signal, cleanup } = withTimeout(LINK_FETCH_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(url, { headers: { "user-agent": "Credify/0.1" }, signal });
  } finally {
    cleanup();
  }
  if (!resp.ok) throw new Error(`fetching that page failed (${resp.status})`);
  const html = await resp.text();
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) throw new Error("that page has no readable text");
  return stripped.slice(0, LINK_MAX_CHARS);
}

async function buildPrompt(question, mode) {
  if (mode === "paste") {
    return (
      "Fact-check the following text. Go claim by claim, note which " +
      "claims are true, disputed, or unverifiable, then give your " +
      "overall verdict in a few sentences.\n\nTEXT:\n" + question
    );
  }
  if (mode === "link") {
    const article = await fetchArticleText(question);
    return (
      "Fact-check the claims made in the following article text. Note " +
      "which claims are true, disputed, or unverifiable, then give " +
      "your overall verdict in a few sentences.\n\nARTICLE TEXT:\n" + article
    );
  }
  return (
    "Answer the following question directly and accurately in 3-5 " +
    "sentences.\n\nQUESTION:\n" + question
  );
}

// ------------------------------------------------------------------- scoring
function scoreWord(score) {
  if (score >= 85) return "High agreement";
  if (score >= 70) return "Mostly agree";
  return "Conflicting";
}

function parseJsonBlock(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function cleanSources(items) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 3)
    .filter((item) => item && typeof item === "object" && item.url)
    .map((item) => ({ title: String(item.title || item.url), url: String(item.url) }));
}

function wordOverlapRatio(a, b) {
  const wordsA = new Set((a.toLowerCase().match(/[a-z0-9]+/g)) || []);
  const wordsB = new Set((b.toLowerCase().match(/[a-z0-9]+/g)) || []);
  if (!wordsA.size || !wordsB.size) return 0;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared++;
  return shared / Math.max(wordsA.size, wordsB.size);
}

export async function judge(question, texts) {
  const names = Object.keys(texts);
  if (names.length < 2) return null;

  const judgePrompt =
    "Below are answers from different AI models to the same question or " +
    "fact-check. Rate how much they agree on a 0-100 scale (100 = fully " +
    "agree), write one plain-language sentence that best represents the " +
    "consensus (or explains the disagreement if they conflict), and list " +
    "2-3 credible, real, working source URLs that support the " +
    "consensus. Respond with ONLY a JSON object shaped like:\n" +
    '{"score": 82, "bottom": "...", "sources": [{"title": "...", "url": "https://..."}]}' +
    "\n\nQUESTION/TEXT:\n" + question + "\n\nANSWERS:\n" +
    names.map((n) => `${n.toUpperCase()}: ${texts[n]}`).join("\n\n");

  for (const name of ["claude", "chatgpt", "gemini"]) {
    if (!(name in texts)) continue;
    try {
      const raw = await PROVIDERS[name](judgePrompt, false);
      const data = parseJsonBlock(raw);
      if (data) {
        const score = Math.max(0, Math.min(100, Math.round(Number(data.score) || 0)));
        return {
          score,
          word: scoreWord(score),
          bottom: String(data.bottom || "").trim() || null,
          sources: cleanSources(data.sources),
        };
      }
    } catch {
      continue;
    }
  }

  const values = Object.values(texts);
  const ratios = [];
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      ratios.push(wordOverlapRatio(values[i], values[j]));
    }
  }
  const score = ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) : 0;
  return { score, word: scoreWord(score), bottom: null, sources: [] };
}

export async function runCheckCore(question, mode, deep) {
  let prompt;
  try {
    prompt = await buildPrompt(question, mode);
  } catch (exc) {
    return { error: `Couldn't read that link — ${exc.message || exc}` };
  }

  const { texts, errors } = await callAll(prompt, deep);
  const result = {
    claude: texts.claude || null,
    chatgpt: texts.chatgpt || null,
    gemini: texts.gemini || null,
    claude_error: errors.claude || null,
    chatgpt_error: errors.chatgpt || null,
    gemini_error: errors.gemini || null,
  };

  const verdict = await judge(question, texts);
  if (verdict) {
    result.agreement = { score: verdict.score, word: verdict.word, bottom: verdict.bottom };
    result.sources = verdict.sources;
  } else {
    result.agreement = null;
    result.sources = [];
  }
  return result;
}
