from concurrent.futures import ThreadPoolExecutor

from credify_common import PROVIDERS, json_response, judge, parse_body


def _review(name, prompt, deep):
    try:
        return PROVIDERS[name](prompt, deep)
    except Exception:
        return None


def handler(event, context):
    data = parse_body(event)
    question = (data.get("question") or "").strip()
    deep = bool(data.get("deep"))
    answers = data.get("answers") or {}
    claude_answer, chatgpt_answer = answers.get("claude"), answers.get("chatgpt")
    if not question or not claude_answer or not chatgpt_answer:
        return json_response(400, {"error": "Need both models' answers before cross-checking."})

    claude_prompt = (
        f"Question/text: {question}\n\nYour previous answer: {claude_answer}\n\n"
        f"Another AI (ChatGPT) answered: {chatgpt_answer}\n\n"
        "Review both answers. If ChatGPT caught something you missed, or you "
        "spot an error in either answer, correct it. Give your refined final "
        "answer only, no preamble."
    )
    chatgpt_prompt = (
        f"Question/text: {question}\n\nYour previous answer: {chatgpt_answer}\n\n"
        f"Another AI (Claude) answered: {claude_answer}\n\n"
        "Review both answers. If Claude caught something you missed, or you "
        "spot an error in either answer, correct it. Give your refined final "
        "answer only, no preamble."
    )

    with ThreadPoolExecutor(max_workers=2) as pool:
        f_claude = pool.submit(_review, "claude", claude_prompt, deep)
        f_chatgpt = pool.submit(_review, "chatgpt", chatgpt_prompt, deep)
        refined_claude = f_claude.result()
        refined_chatgpt = f_chatgpt.result()

    final_claude = refined_claude or claude_answer
    final_chatgpt = refined_chatgpt or chatgpt_answer
    verdict = judge(question, {"claude": final_claude, "chatgpt": final_chatgpt})

    resp = {
        "claude": refined_claude,
        "chatgpt": refined_chatgpt,
        "note": "each model reviewed the other's answer and gave its final version above.",
    }
    if verdict:
        resp["agreement"] = {
            "score": verdict["score"],
            "word": verdict["word"],
            "bottom": verdict["bottom"],
        }
    return json_response(200, resp)
