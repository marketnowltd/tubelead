"""Tiny OpenAI-compatible fake for end-to-end tests:  uvicorn tests.fake_ai_server:app --port 8766
Accepts the API key "good-key"; anything else gets a 401 like a real provider."""
import json

from fastapi import FastAPI, Header, HTTPException, Request

app = FastAPI()


def _auth(authorization: str | None):
    if authorization != "Bearer good-key":
        raise HTTPException(401, detail={"error": {"message": "Incorrect API key provided"}})


@app.get("/v1/models")
def models(authorization: str | None = Header(default=None)):
    _auth(authorization)
    return {"data": [{"id": "fake-small"}, {"id": "fake-large"}]}


@app.post("/v1/chat/completions")
async def chat(req: Request, authorization: str | None = Header(default=None)):
    _auth(authorization)
    body = await req.json()
    user = body["messages"][-1]["content"]
    if "Request:" in user:
        txt = json.dumps({"keywords": ["tech review"], "countries": ["GB"], "min_subscribers": 1000, "require_email": True})
    elif "JSON array" in user:
        txt = json.dumps(["gadget reviews", "budget tech", "smart home"])
    elif "summary" in user.lower():
        txt = "Discovery is healthy: all counts above come from your stored results."
    else:
        txt = "OK"
    return {"model": body.get("model", "fake-small"), "choices": [{"message": {"content": txt}}], "usage": {"prompt_tokens": 30, "completion_tokens": 12}}
