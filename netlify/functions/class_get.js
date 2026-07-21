import { getStore } from "@netlify/blobs";

const json = (status, payload) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "Method not allowed." });

  const url = new URL(req.url);
  const code = (url.searchParams.get("code") || "").trim().toUpperCase();
  if (!code) return json(400, { error: "No code provided." });

  const store = getStore("credify-class-codes");
  const entry = await store.get(code, { type: "json" });
  if (!entry) return json(404, { error: "No verified check found for that code." });
  return json(200, entry);
};

export const config = { path: "/api/class/get" };
