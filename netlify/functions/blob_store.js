// Internal-only helper function: owns the durable key/value store for
// class-mode citation codes, using Netlify Blobs (the officially supported
// way to get persistent storage in a Netlify Function — Python has no
// first-party Blobs client, so class_post.py / class_get.py call this
// function over HTTPS instead of talking to Blobs directly).
//
// Not part of the public API surface the frontend calls — it's reached at
// /internal/class-store, used only by the Python functions.
import { getStore } from "@netlify/blobs";

const json = (status, payload) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default async (req) => {
  const store = getStore("credify-class-codes");

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body." });
    }
    const { code, entry } = body || {};
    if (!code || !entry) {
      return json(400, { error: "code and entry are required." });
    }
    await store.setJSON(String(code).toUpperCase(), entry);
    return json(200, { ok: true });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = (url.searchParams.get("code") || "").toUpperCase();
    if (!code) return json(400, { error: "No code provided." });
    const entry = await store.get(code, { type: "json" });
    if (!entry) return json(404, { error: "No verified check found for that code." });
    return json(200, entry);
  }

  return json(405, { error: "Method not allowed." });
};

export const config = {
  path: "/internal/class-store",
};
