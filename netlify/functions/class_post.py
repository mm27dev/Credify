import random
import string

from credify_common import blob_get, blob_set, json_response, parse_body, run_check_core


def _new_unique_code(event):
    for _ in range(50):
        code = "".join(random.choice(string.ascii_uppercase) for _ in range(4))
        if blob_get(event, code) is None:
            return code
    raise RuntimeError("Could not generate a unique class code.")


def handler(event, context):
    data = parse_body(event)
    question = (data.get("question") or "").strip()
    deep = bool(data.get("deep"))
    if not question:
        return json_response(400, {"error": "No question provided."})

    result = run_check_core(question, "ask", deep)
    result["deep"] = deep
    if result.get("error"):
        return json_response(200, result)

    code = _new_unique_code(event)
    blob_set(event, code, {"question": question, "mode": "ask", "result": result})
    return json_response(200, {"code": code, "question": question})
