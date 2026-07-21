import { runCheckCore } from "./lib/providers.js";

const json = (status, payload) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  let data;
  try {
    data = await req.json();
  } catch {
    data = {};
  }
  const question = (data.question || "").trim();
  const mode = data.mode || "ask";
  const deep = Boolean(data.deep);
  if (!question) return json(400, { error: "No question provided." });

  const result = await runCheckCore(question, mode, deep);
  return json(200, result);
};

export const config = { path: "/api/check" };
