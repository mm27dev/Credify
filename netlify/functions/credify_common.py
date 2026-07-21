"""
Shared logic for Credify's Netlify Functions. Every function file in this
directory (check.py, crosscheck.py, class_post.py, class_get.py) imports
from here — Netlify bundles the whole netlify/functions/ directory together
for Python, so sibling imports like `from credify_common import ...` work.

API keys: set these as real Environment Variables in the Netlify dashboard
(Site configuration -> Environment variables) named exactly OPENAI_API_KEY,
ANTHROPIC_API_KEY, GEMINI_API_KEY. Nothing to install or configure locally —
Netlify injects them into the function at request time. The placeholder
strings below are only a fallback so the functions don't crash if a key
hasn't been added yet; they'll just return a clear per-model error instead.
"""

import difflib
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlsplit

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "YOUR_OPENAI_API_KEY_HERE")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "YOUR_ANTHROPIC_API_KEY_HERE")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY_HERE")

OPENAI_MODEL, OPENAI_MODEL_DEEP = "gpt-4o-mini", "gpt-4o"
CLAUDE_MODEL, CLAUDE_MODEL_DEEP = "claude-3-5-haiku-latest", "claude-3-5-sonnet-latest"
GEMINI_MODEL, GEMINI_MODEL_DEEP = "gemini-1.5-flash", "gemini-1.5-pro"

REQUEST_TIMEOUT = 25
LINK_FETCH_TIMEOUT = 8
LINK_MAX_CHARS = 6000

# Class-mode citation codes are stored durably via Netlify Blobs, which has
# no first-party Python client — so instead of talking to Blobs directly,
# these helpers call the internal blob_store.js function (same site, reached
# over HTTPS at /internal/class-store) that owns the actual store.
BLOB_STORE_TIMEOUT = 8


def json_response(status, payload):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(payload),
    }


def parse_body(event):
    raw = event.get("body") or "{}"
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


def _placeholder(key):
    return not key or key.startswith("YOUR_")


# ---------------------------------------------------------------- providers
def call_claude(prompt, deep=False):
    if _placeholder(ANTHROPIC_API_KEY):
        raise RuntimeError("Claude API key not set — add ANTHROPIC_API_KEY in Netlify's Environment variables.")
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY, timeout=REQUEST_TIMEOUT)
    resp = client.messages.create(
        model=CLAUDE_MODEL_DEEP if deep else CLAUDE_MODEL,
        max_tokens=700,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(
        block.text for block in resp.content if getattr(block, "type", "") == "text"
    ).strip()


def call_chatgpt(prompt, deep=False):
    if _placeholder(OPENAI_API_KEY):
        raise RuntimeError("ChatGPT API key not set — add OPENAI_API_KEY in Netlify's Environment variables.")
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY, timeout=REQUEST_TIMEOUT)
    resp = client.chat.completions.create(
        model=OPENAI_MODEL_DEEP if deep else OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=700,
    )
    return (resp.choices[0].message.content or "").strip()


def call_gemini(prompt, deep=False):
    if _placeholder(GEMINI_API_KEY):
        raise RuntimeError("Gemini API key not set — add GEMINI_API_KEY in Netlify's Environment variables.")
    import google.generativeai as genai
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(GEMINI_MODEL_DEEP if deep else GEMINI_MODEL)
    resp = model.generate_content(prompt, request_options={"timeout": REQUEST_TIMEOUT})
    return (resp.text or "").strip()


PROVIDERS = {"claude": call_claude, "chatgpt": call_chatgpt, "gemini": call_gemini}


def call_all(prompt, deep):
    texts, errors = {}, {}
    with ThreadPoolExecutor(max_workers=len(PROVIDERS)) as pool:
        futures = {pool.submit(fn, prompt, deep): name for name, fn in PROVIDERS.items()}
        for fut in as_completed(futures):
            name = futures[fut]
            try:
                texts[name] = fut.result()
            except Exception as exc:
                errors[name] = str(exc)
    return texts, errors


# ------------------------------------------------------------------ prompts
def fetch_article_text(url):
    import requests
    from bs4 import BeautifulSoup

    resp = requests.get(url, timeout=LINK_FETCH_TIMEOUT, headers={"User-Agent": "Credify/0.1"})
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = " ".join(soup.get_text(" ").split())
    if not text:
        raise RuntimeError("that page has no readable text")
    return text[:LINK_MAX_CHARS]


def build_prompt(question, mode):
    if mode == "paste":
        return (
            "Fact-check the following text. Go claim by claim, note which "
            "claims are true, disputed, or unverifiable, then give your "
            "overall verdict in a few sentences.\n\nTEXT:\n" + question
        )
    if mode == "link":
        article = fetch_article_text(question)
        return (
            "Fact-check the claims made in the following article text. Note "
            "which claims are true, disputed, or unverifiable, then give "
            "your overall verdict in a few sentences.\n\nARTICLE TEXT:\n" + article
        )
    return (
        "Answer the following question directly and accurately in 3-5 "
        "sentences.\n\nQUESTION:\n" + question
    )


# ------------------------------------------------------------------- scoring
def score_word(score):
    if score >= 85:
        return "High agreement"
    if score >= 70:
        return "Mostly agree"
    return "Conflicting"


def _parse_json_block(raw):
    match = re.search(r"\{.*\}", raw, re.S)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _clean_sources(items):
    out = []
    if not isinstance(items, list):
        return out
    for item in items[:3]:
        if isinstance(item, dict) and item.get("url"):
            out.append({"title": str(item.get("title") or item["url"]), "url": str(item["url"])})
    return out


def judge(question, texts):
    if len(texts) < 2:
        return None

    judge_prompt = (
        "Below are answers from different AI models to the same question or "
        "fact-check. Rate how much they agree on a 0-100 scale (100 = fully "
        "agree), write one plain-language sentence that best represents the "
        "consensus (or explains the disagreement if they conflict), and list "
        "2-3 credible, real, working source URLs that support the "
        "consensus. Respond with ONLY a JSON object shaped like:\n"
        '{"score": 82, "bottom": "...", "sources": '
        '[{"title": "...", "url": "https://..."}]}'
        "\n\nQUESTION/TEXT:\n" + question + "\n\nANSWERS:\n"
        + "\n\n".join(f"{name.upper()}: {text}" for name, text in texts.items())
    )

    for name in ("claude", "chatgpt", "gemini"):
        if name not in texts:
            continue
        try:
            raw = PROVIDERS[name](judge_prompt, False)
            data = _parse_json_block(raw)
            if data:
                score = max(0, min(100, int(data.get("score", 0))))
                return {
                    "score": score,
                    "word": score_word(score),
                    "bottom": (str(data.get("bottom", "")).strip() or None),
                    "sources": _clean_sources(data.get("sources", [])),
                }
        except Exception:
            continue

    pairs = list(texts.values())
    ratios = [
        difflib.SequenceMatcher(None, a, b).ratio()
        for i, a in enumerate(pairs)
        for b in pairs[i + 1:]
    ]
    score = round((sum(ratios) / len(ratios)) * 100) if ratios else 0
    return {"score": score, "word": score_word(score), "bottom": None, "sources": []}


def run_check_core(question, mode, deep):
    try:
        prompt = build_prompt(question, mode)
    except Exception as exc:
        return {"error": f"Couldn't read that link — {exc}"}

    texts, errors = call_all(prompt, deep)
    result = {
        "claude": texts.get("claude"),
        "chatgpt": texts.get("chatgpt"),
        "gemini": texts.get("gemini"),
        "claude_error": errors.get("claude"),
        "chatgpt_error": errors.get("chatgpt"),
        "gemini_error": errors.get("gemini"),
    }

    verdict = judge(question, texts)
    if verdict:
        result["agreement"] = {
            "score": verdict["score"],
            "word": verdict["word"],
            "bottom": verdict["bottom"],
        }
        result["sources"] = verdict["sources"]
    else:
        result["agreement"] = None
        result["sources"] = []
    return result


# --------------------------------------------------------------------- store
def _site_base_url(event):
    """Reconstruct this site's own base URL from the incoming event, so a
    Python function can call the sibling blob_store.js function over HTTPS."""
    raw_url = event.get("rawUrl")
    if raw_url:
        parts = urlsplit(raw_url)
        return f"{parts.scheme}://{parts.netloc}"
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    host = headers.get("host")
    if not host:
        raise RuntimeError("Could not determine site host for internal Blobs call.")
    scheme = "http" if host.startswith("localhost") or host.startswith("127.0.0.1") else "https"
    return f"{scheme}://{host}"


def blob_set(event, code, entry):
    import requests
    base = _site_base_url(event)
    resp = requests.post(
        f"{base}/internal/class-store",
        json={"code": code, "entry": entry},
        timeout=BLOB_STORE_TIMEOUT,
    )
    resp.raise_for_status()


def blob_get(event, code):
    import requests
    base = _site_base_url(event)
    resp = requests.get(
        f"{base}/internal/class-store",
        params={"code": code},
        timeout=BLOB_STORE_TIMEOUT,
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()
