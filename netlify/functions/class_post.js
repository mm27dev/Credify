import { getStore } from "@netlify/blobs";
import { runCheckCore } from "./lib/providers.js";

const json = (status, payload) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

function randomCode() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
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
  if (!question) return json(400, { error: "No question provided." });

  const result = await runCheckCore(question, "ask", deep);
  result.deep = deep;
  if (result.error) return json(200, result);

  const store = getStore("credify-class-codes");
  let code = null;
  for (let i = 0; i < 50; i++) {
    const candidate = randomCode();
    // eslint-disable-next-line no-await-in-loop
    const existing = await store.get(candidate, { type: "json" });
    if (!existing) {
      code = candidate;
      break;
    }
  }
  if (!code) return json(500, { error: "Could not generate a unique class code." });

  await store.setJSON(code, { question, mode: "ask", result });
  return json(200, { code, question });
};

export const config = { path: "/api/class/post" };
