import { PROVIDERS, judge } from "./lib/providers.js";

const json = (status, payload) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

async function review(name, prompt, deep) {
  try {
    return await PROVIDERS[name](prompt, deep);
  } catch {
    return null;
  }
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  let data;
  try {
    data = await req.json();
  } catch {
    data = {};
  }
  const question = (data.question || "").trim();
  const deep = Boolean(data.deep);
  const answers = data.answers || {};
  const claudeAnswer = answers.claude;
  const chatgptAnswer = answers.chatgpt;
  if (!question || !claudeAnswer || !chatgptAnswer) {
    return json(400, { error: "Need both models' answers before cross-checking." });
  }

  const claudePrompt =
    `Question/text: ${question}\n\nYour previous answer: ${claudeAnswer}\n\n` +
    `Another AI (ChatGPT) answered: ${chatgptAnswer}\n\n` +
    "Review both answers. If ChatGPT caught something you missed, or you " +
    "spot an error in either answer, correct it. Give your refined final " +
    "answer only, no preamble.";
  const chatgptPrompt =
    `Question/text: ${question}\n\nYour previous answer: ${chatgptAnswer}\n\n` +
    `Another AI (Claude) answered: ${claudeAnswer}\n\n` +
    "Review both answers. If Claude caught something you missed, or you " +
    "spot an error in either answer, correct it. Give your refined final " +
    "answer only, no preamble.";

  const [refinedClaude, refinedChatgpt] = await Promise.all([
    review("claude", claudePrompt, deep),
    review("chatgpt", chatgptPrompt, deep),
  ]);

  const finalClaude = refinedClaude || claudeAnswer;
  const finalChatgpt = refinedChatgpt || chatgptAnswer;
  const verdict = await judge(question, { claude: finalClaude, chatgpt: finalChatgpt });

  const resp = {
    claude: refinedClaude,
    chatgpt: refinedChatgpt,
    note: "each model reviewed the other's answer and gave its final version above.",
  };
  if (verdict) {
    resp.agreement = { score: verdict.score, word: verdict.word, bottom: verdict.bottom };
  }
  return json(200, resp);
};

export const config = { path: "/api/crosscheck" };
