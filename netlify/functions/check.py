from credify_common import json_response, parse_body, run_check_core


def handler(event, context):
    data = parse_body(event)
    question = (data.get("question") or "").strip()
    mode = data.get("mode") or "ask"
    deep = bool(data.get("deep"))
    if not question:
        return json_response(400, {"error": "No question provided."})
    return json_response(200, run_check_core(question, mode, deep))
