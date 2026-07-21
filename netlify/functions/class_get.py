from credify_common import blob_get, json_response


def handler(event, context):
    params = event.get("queryStringParameters") or {}
    code = (params.get("code") or "").strip().upper()
    if not code:
        return json_response(400, {"error": "No code provided."})
    entry = blob_get(event, code)
    if not entry:
        return json_response(404, {"error": "No verified check found for that code."})
    return json_response(200, entry)
