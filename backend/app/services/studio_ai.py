"""Creative Studio assistance. Design changes (sizes, spacing, colours, layout) are made by deterministic rules;
wording changes use the customer's own connected AI provider and keep meaning, facts, offers and prices.
Every action returns a PROPOSED document; the editor shows a preview and the customer chooses Apply or not."""
from __future__ import annotations

import copy
import re

from sqlalchemy.orm import Session

from . import ai, email_doc as E

RULE_ACTIONS = {"professional", "premium", "readability", "mobile", "cta_style", "brand"}
AI_ACTIONS = {"shorten", "headline", "cta_copy", "wording", "custom"}


def _rule(doc: dict, action: str, brand: dict | None) -> tuple[dict, list[str]]:
    d = copy.deepcopy(E.normalise(doc))
    notes: list[str] = []
    if action == "professional":
        d = E.apply_preset(d, "corporate")
        notes.append("Applied the Corporate style: clean sans-serif type, blue accents, square buttons.")
    elif action == "premium":
        d["settings"].update(background="#F6F4EF", contentBackground="#FFFFFF", fontFamily="Georgia", textColor="#1A1A1A", linkColor="#8B6B3D", radius=0)
        for sec in d["sections"]:
            sec["style"]["padding"] = {k: max(v, 40 if k in ("top", "bottom") else 44) for k, v in sec["style"]["padding"].items()}
        for _, _, el, _ in E.iter_elements(d):
            if el["type"] == "heading":
                el["style"].update(fontWeight=400, letterSpacing=0.5, lineHeight=1.2)
            if el["type"] == "text":
                el["style"].update(lineHeight=1.7)
            if el["type"] == "button":
                el["style"].update(background="#1A1A1A", gradient=None, color="#FFFFFF", radius=0, paddingX=36, paddingY=16, fontWeight=500)
        notes.append("More whitespace, serif headings, calmer colours and a refined button.")
    elif action == "readability":
        for _, _, el, _ in E.iter_elements(d):
            if el["type"] == "text":
                el["style"]["fontSize"] = max(el["style"]["fontSize"], 16)
                el["style"]["lineHeight"] = max(el["style"]["lineHeight"], 1.6)
                el["style"]["color"] = None
            if el["type"] == "heading":
                el["style"]["lineHeight"] = min(max(el["style"]["lineHeight"], 1.15), 1.3)
        notes.append("Body text at least 16px with 1.6 line spacing, in your main text colour.")
    elif action == "mobile":
        for sec in d["sections"]:
            sec["style"]["stackOnMobile"] = True
        for _, _, el, _ in E.iter_elements(d):
            if el["type"] == "heading":
                el["style"]["mobileFontSize"] = min(el["style"]["fontSize"], 28)
            if el["type"] == "text":
                el["style"]["mobileFontSize"] = max(el["style"]["fontSize"], 15)
            if el["type"] == "button":
                el["style"].update(paddingY=max(el["style"]["paddingY"], 14), fullWidth=True)
        notes.append("Columns stack on phones, headings shrink to 28px, buttons are full-width and easy to tap.")
    elif action == "cta_style":
        for _, _, el, _ in E.iter_elements(d):
            if el["type"] == "button":
                el["style"].update(fontSize=max(el["style"]["fontSize"], 17), paddingY=max(el["style"]["paddingY"], 16), paddingX=max(el["style"]["paddingX"], 34), fontWeight=700)
        notes.append("Buttons are larger and bolder.")
    elif action == "brand":
        d, changed = E.apply_brand(d, brand or {})
        notes += changed or ["Your Brand Kit has nothing to apply yet. Add a logo or colours first."]
    return E.normalise(d), notes


def _text_targets(doc: dict, element_id: str | None, action: str) -> list[dict]:
    els = [e for _, _, e, _ in E.iter_elements(doc) if not e.get("locked")]
    if element_id:
        els = [e for e in els if e["id"] == element_id]
    if action == "headline":
        els = [e for e in els if e["type"] == "heading"][:1]
    elif action == "cta_copy":
        els = [e for e in els if e["type"] == "button"]
    else:
        els = [e for e in els if e["type"] in ("heading", "text", "button")]
    # Paragraphs containing links are left alone: rewording them would flatten the link into plain text.
    return [e for e in els if "<a " not in e.get("content", "")][:20]


async def assist(db: Session, owner: str, doc: dict, action: str, *, element_id: str | None = None, instruction: str = "", brand: dict | None = None) -> dict:
    if action in RULE_ACTIONS:
        new, notes = _rule(doc, action, brand)
        return {"doc": new, "notes": notes, "by": "rules"}
    if action not in AI_ACTIONS:
        raise ValueError("Unknown action")
    d = copy.deepcopy(E.normalise(doc))
    targets = _text_targets(d, element_id, action)
    if not targets:
        return {"doc": d, "notes": ["There's no unlocked text to change."], "by": "rules"}
    goal = {"shorten": "Make each text shorter and tighter.", "headline": "Make the headline clearer and more compelling.",
            "cta_copy": "Make the button wording a stronger, specific call to action (2-5 words).", "wording": "Improve the wording without changing the meaning.",
            "custom": instruction[:500]}[action]
    items = [{"id": e["id"], "type": e["type"], "text": e.get("label") if e["type"] == "button" else E.rich_to_text(e["content"])} for e in targets]
    import json
    res = await ai.run_task(db, owner, "email_writing",
                            f"Instruction: {goal}\nKeep every {{{{variable}}}} exactly as written. Keep facts, numbers, prices, offers and legal wording unchanged.\n"
                            f"Items: {json.dumps(items)}\nReturn JSON: {{\"items\": [{{\"id\": ..., \"text\": ...}}], \"note\": one sentence on what changed}}",
                            max_tokens=900, timeout=40)
    data = ai.extract_json(res.text)
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        return {"doc": d, "notes": ["The AI reply couldn't be read, so nothing was changed."], "by": "ai"}
    by_id = {e["id"]: e for e in targets}
    changed = 0
    for it in data["items"]:
        e = by_id.get(str(it.get("id")))
        new = str(it.get("text") or "").strip()
        if not e or not new:
            continue
        old_vars = set(E.VAR_RE.findall(e.get("label") or e.get("content") or ""))
        if not old_vars.issubset(set(E.VAR_RE.findall(new))):
            continue  # the AI dropped a personalisation field: reject that change
        old_nums = set(re.findall(r"[£$€]?\d[\d,.]*%?", E.rich_to_text(e.get("content", "")) if e["type"] != "button" else e["label"]))
        if not old_nums.issubset(set(re.findall(r"[£$€]?\d[\d,.]*%?", new))):
            continue  # numbers/prices must survive unchanged
        if e["type"] == "button":
            e["label"] = new[:120]
        else:
            e["content"] = E.sanitise_rich(re.sub(r"\n", "<br>", new.replace("<", "&lt;")))
        changed += 1
    note = str(data.get("note") or "")[:300]
    return {"doc": E.normalise(d), "notes": ([note] if note else []) + [f"{changed} item(s) reworded."] , "by": "ai"}
