"""Creative Studio email document model and the email HTML renderer.

The editors (Easy and Pro) edit ONE JSON document. This module:
- normalises and validates it (unknown keys dropped, numbers clamped, colours/URLs checked, rich text sanitised);
- renders it to email-client HTML: table layout, inline CSS, a small responsive <style> block, email-safe font
  stacks, hosted images with alt text, no scripts; plus a plain-text alternative;
- fills personalisation variables with recipient values or the document's fallbacks (never invented data).

Layout is flow-based (sections > columns > elements) because email clients do not support absolute positioning."""
from __future__ import annotations

import copy
import html as H
import re
import uuid
from html.parser import HTMLParser

MAX_SECTIONS = 60
MAX_ELEMENTS = 400
WIDTHS = (480, 760)
VARIABLES = ("first_name", "last_name", "company_name", "website", "industry", "business_location", "campaign_name")
VAR_RE = re.compile(r"\{\{\s*([a-zA-Z_]+)\s*\}\}")
COLOR_RE = re.compile(r"^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$")
FONTS = {
    "Helvetica": "Helvetica, Arial, sans-serif",
    "Arial": "Arial, Helvetica, sans-serif",
    "Georgia": "Georgia, 'Times New Roman', serif",
    "Times": "'Times New Roman', Times, serif",
    "Verdana": "Verdana, Geneva, sans-serif",
    "Trebuchet": "'Trebuchet MS', Helvetica, sans-serif",
    "Tahoma": "Tahoma, Verdana, sans-serif",
    "Courier": "'Courier New', Courier, monospace",
}
ELEMENT_TYPES = ("heading", "text", "image", "button", "divider", "spacer", "shape", "group")


def new_id() -> str:
    return uuid.uuid4().hex[:10]


# ---------------------------------------------------------------- sanitising
_ALLOWED_TAGS = {"b", "strong", "i", "em", "u", "s", "br", "a", "span", "p", "div"}


class _Sanitiser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.stack: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag not in _ALLOWED_TAGS:
            return
        if tag in ("p", "div"):  # paragraphs from contentEditable become line breaks
            if self.out and not self.out[-1].endswith("<br>"):
                self.out.append("<br>")
            return
        if tag == "br":
            self.out.append("<br>")
            return
        a = dict(attrs)
        if tag == "a":
            href = safe_url(a.get("href") or "")
            self.out.append(f'<a href="{H.escape(href)}">' if href else "<a>")
        elif tag == "span":
            color = a.get("style", "")
            m = re.search(r"color:\s*([^;]+)", color)
            c = m.group(1).strip() if m else ""
            self.out.append(f'<span style="color:{c}">' if COLOR_RE.match(c) else "<span>")
        else:
            self.out.append(f"<{tag}>")
        self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.stack:
            while self.stack:
                t = self.stack.pop()
                self.out.append(f"</{t}>")
                if t == tag:
                    break

    def handle_data(self, data):
        self.out.append(H.escape(data, quote=False))


def sanitise_rich(text: str) -> str:
    p = _Sanitiser()
    p.feed(str(text or "")[:20000])
    p.close()
    out = "".join(p.out) + "".join(f"</{t}>" for t in reversed(p.stack))
    return re.sub(r"^(<br>)+|(<br>)+$", "", out)


def rich_to_text(rich: str) -> str:
    t = re.sub(r"<br\s*/?>", "\n", rich or "")
    t = re.sub(r"<a [^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>", lambda m: m.group(2) if m.group(2) == m.group(1) else f"{m.group(2)} ({m.group(1)})", t)
    return H.unescape(re.sub(r"<[^>]+>", "", t)).strip()


def safe_url(url: str) -> str:
    """http(s), mailto and tel links, or a personalisation variable. Anything else (javascript:, data:) is dropped."""
    u = str(url or "").strip()
    if not u:
        return ""
    if VAR_RE.fullmatch(u):
        return u
    if re.match(r"^(https?://|mailto:|tel:)", u, re.I) and not re.search(r"[\s<>\"]", u):
        return u[:2000]
    if re.match(r"^[\w.-]+\.[a-z]{2,}(/\S*)?$", u, re.I):  # bare domain -> https
        return "https://" + u
    return ""


# ---------------------------------------------------------------- normalising
def _num(v, lo, hi, default):
    try:
        return max(lo, min(hi, int(round(float(v)))))
    except (TypeError, ValueError):
        return default


def _float(v, lo, hi, default):
    try:
        return max(lo, min(hi, float(v)))
    except (TypeError, ValueError):
        return default


def _color(v, default=None):
    v = str(v or "").strip()
    return v if COLOR_RE.match(v) else default


def _font(v, default="Helvetica"):
    return v if v in FONTS else default


def _pad(p, default=(0, 0, 0, 0)):
    if isinstance(p, dict):
        return {k: _num(p.get(k), 0, 120, d) for k, d in zip(("top", "right", "bottom", "left"), default)}
    return dict(zip(("top", "right", "bottom", "left"), default))


def _gradient(g):
    if not isinstance(g, dict):
        return None
    a, b = _color(g.get("from")), _color(g.get("to"))
    if not a or not b:
        return None
    return {"from": a, "to": b, "angle": _num(g.get("angle"), 0, 360, 180)}


def _common(el: dict, raw: dict, default_name: str) -> dict:
    el["id"] = str(raw.get("id") or new_id())[:24]
    el["name"] = str(raw.get("name") or default_name)[:80]
    el["hidden"] = bool(raw.get("hidden"))
    el["locked"] = bool(raw.get("locked"))
    return el


def _text_style(s: dict, *, size: int, weight: int) -> dict:
    s = s if isinstance(s, dict) else {}
    return {
        "fontFamily": _font(s.get("fontFamily"), None) if s.get("fontFamily") else None,
        "fontSize": _num(s.get("fontSize"), 8, 96, size),
        "mobileFontSize": _num(s.get("mobileFontSize"), 8, 96, 0) or None,
        "fontWeight": _num(s.get("fontWeight"), 100, 900, weight),
        "color": _color(s.get("color")),
        "align": s.get("align") if s.get("align") in ("left", "center", "right", "justify") else "left",
        "lineHeight": _float(s.get("lineHeight"), 0.8, 3, 1.5),
        "letterSpacing": _float(s.get("letterSpacing"), -5, 20, 0),
        "decoration": s.get("decoration") if s.get("decoration") in ("none", "underline", "line-through") else "none",
        "transform": s.get("transform") if s.get("transform") in ("none", "uppercase", "lowercase", "capitalize") else "none",
        "italic": bool(s.get("italic")),
        "paragraphSpacing": _num(s.get("paragraphSpacing"), 0, 80, 0),
        "padding": _pad(s.get("padding"), (0, 0, 12, 0)),
        "background": _color(s.get("background")),
    }


def normalise_element(raw: dict, depth: int = 0) -> dict | None:
    if not isinstance(raw, dict) or raw.get("type") not in ELEMENT_TYPES:
        return None
    t = raw["type"]
    s = raw.get("style") if isinstance(raw.get("style"), dict) else {}
    el: dict = {"type": t}
    if t in ("heading", "text"):
        _common(el, raw, "Headline" if t == "heading" else "Paragraph")
        el["content"] = sanitise_rich(raw.get("content", ""))
        el["style"] = _text_style(s, size=28 if t == "heading" else 16, weight=700 if t == "heading" else 400)
    elif t == "image":
        _common(el, raw, "Image")
        el["src"] = safe_url(raw.get("src", "")) if not str(raw.get("src", "")).startswith("/api/assets/") else str(raw["src"])[:200]
        el["alt"] = str(raw.get("alt", ""))[:300]
        el["href"] = safe_url(raw.get("href", ""))
        el["naturalWidth"] = _num(raw.get("naturalWidth"), 0, 10000, 0) or None
        el["naturalHeight"] = _num(raw.get("naturalHeight"), 0, 10000, 0) or None
        el["style"] = {"width": _num(s.get("width"), 10, 100, 100), "align": s.get("align") if s.get("align") in ("left", "center", "right") else "center",
                       "padding": _pad(s.get("padding"), (0, 0, 12, 0)), "radius": _num(s.get("radius"), 0, 200, 0),
                       "borderWidth": _num(s.get("borderWidth"), 0, 20, 0), "borderColor": _color(s.get("borderColor"), "#e5e0f0")}
    elif t == "button":
        _common(el, raw, "Button")
        el["label"] = str(raw.get("label") or "Learn more")[:120]
        el["href"] = safe_url(raw.get("href", ""))
        el["style"] = {"background": _color(s.get("background"), "#7B3FF2"), "gradient": _gradient(s.get("gradient")), "color": _color(s.get("color"), "#ffffff"),
                       "fontSize": _num(s.get("fontSize"), 10, 40, 16), "fontWeight": _num(s.get("fontWeight"), 100, 900, 700),
                       "fontFamily": _font(s.get("fontFamily"), None) if s.get("fontFamily") else None,
                       "radius": _num(s.get("radius"), 0, 60, 8), "paddingX": _num(s.get("paddingX"), 4, 80, 28), "paddingY": _num(s.get("paddingY"), 4, 40, 14),
                       "align": s.get("align") if s.get("align") in ("left", "center", "right") else "center", "fullWidth": bool(s.get("fullWidth")),
                       "borderWidth": _num(s.get("borderWidth"), 0, 10, 0), "borderColor": _color(s.get("borderColor"), "#7B3FF2"),
                       "padding": _pad(s.get("padding"), (8, 0, 16, 0))}
    elif t == "divider":
        _common(el, raw, "Divider")
        el["style"] = {"color": _color(s.get("color"), "#e5e0f0"), "thickness": _num(s.get("thickness"), 1, 12, 1), "width": _num(s.get("width"), 10, 100, 100),
                       "padding": _pad(s.get("padding"), (12, 0, 12, 0))}
    elif t == "spacer":
        _common(el, raw, "Spacer")
        el["style"] = {"height": _num(s.get("height"), 4, 200, 24)}
    elif t == "shape":
        _common(el, raw, "Shape")
        el["style"] = {"background": _color(s.get("background"), "#EFE8FF"), "gradient": _gradient(s.get("gradient")), "height": _num(s.get("height"), 2, 400, 80),
                       "width": _num(s.get("width"), 5, 100, 100), "radius": _num(s.get("radius"), 0, 200, 12), "align": s.get("align") if s.get("align") in ("left", "center", "right") else "center",
                       "padding": _pad(s.get("padding"), (0, 0, 12, 0))}
    elif t == "group":
        if depth >= 2:
            return None
        _common(el, raw, "Group")
        el["children"] = [c for c in (normalise_element(x, depth + 1) for x in (raw.get("children") or [])[:60]) if c]
        el["style"] = {"background": _color(s.get("background")), "gradient": _gradient(s.get("gradient")), "padding": _pad(s.get("padding"), (16, 16, 16, 16)),
                       "radius": _num(s.get("radius"), 0, 60, 0), "borderWidth": _num(s.get("borderWidth"), 0, 10, 0), "borderColor": _color(s.get("borderColor"), "#e5e0f0")}
    return el


def normalise(doc: dict | None) -> dict:
    doc = doc if isinstance(doc, dict) else {}
    st = doc.get("settings") if isinstance(doc.get("settings"), dict) else {}
    fallbacks = st.get("fallbacks") if isinstance(st.get("fallbacks"), dict) else {}
    out = {
        "version": 1,
        "settings": {
            "width": _num(st.get("width"), WIDTHS[0], WIDTHS[1], 600),
            "background": _color(st.get("background"), "#F4F1FB"),
            "contentBackground": _color(st.get("contentBackground"), "#FFFFFF"),
            "fontFamily": _font(st.get("fontFamily")),
            "textColor": _color(st.get("textColor"), "#1B1433"),
            "linkColor": _color(st.get("linkColor"), "#7B3FF2"),
            "radius": _num(st.get("radius"), 0, 40, 12),
            "preset": str(st.get("preset") or "modern")[:20],
            "footer": str(st.get("footer") if st.get("footer") is not None else
                          "You're receiving this because we thought it could be useful to your business. Reply \"unsubscribe\" and we won't contact you again.")[:600],
            "fallbacks": {k: str(fallbacks.get(k, ""))[:80] for k in VARIABLES},
        },
        "sections": [],
    }
    count = 0
    for raw in (doc.get("sections") or [])[:MAX_SECTIONS]:
        if not isinstance(raw, dict):
            continue
        s = raw.get("style") if isinstance(raw.get("style"), dict) else {}
        cols = []
        for c in (raw.get("columns") or [])[:3]:
            if not isinstance(c, dict):
                continue
            els = []
            for e in (c.get("elements") or []):
                if count >= MAX_ELEMENTS:
                    break
                n = normalise_element(e)
                if n:
                    els.append(n)
                    count += 1 + len(n.get("children", []))
            cols.append({"id": str(c.get("id") or new_id())[:24], "width": _num(c.get("width"), 10, 100, 100), "elements": els,
                         "verticalAlign": c.get("verticalAlign") if c.get("verticalAlign") in ("top", "middle", "bottom") else "top"})
        if not cols:
            cols = [{"id": new_id(), "width": 100, "elements": [], "verticalAlign": "top"}]
        total = sum(c["width"] for c in cols) or 100
        for c in cols:
            c["width"] = round(c["width"] * 100 / total)
        out["sections"].append({
            "id": str(raw.get("id") or new_id())[:24], "name": str(raw.get("name") or "Section")[:80],
            "kind": raw.get("kind") if raw.get("kind") in ("header", "content", "footer", "hero") else "content",
            "hidden": bool(raw.get("hidden")), "locked": bool(raw.get("locked")), "columns": cols,
            "style": {"background": _color(s.get("background")), "gradient": _gradient(s.get("gradient")),
                      "backgroundImage": safe_url(s.get("backgroundImage", "")) or (str(s["backgroundImage"])[:200] if str(s.get("backgroundImage", "")).startswith("/api/assets/") else None),
                      "padding": _pad(s.get("padding"), (24, 32, 24, 32)), "stackOnMobile": s.get("stackOnMobile", True) is not False},
        })
    return out


def iter_elements(doc: dict):
    """Yield (section, column, element, parent_group) for every element, including group children."""
    for sec in doc.get("sections", []):
        for col in sec.get("columns", []):
            for el in col.get("elements", []):
                yield sec, col, el, None
                for ch in el.get("children", []) if el.get("type") == "group" else []:
                    yield sec, col, ch, el


# ---------------------------------------------------------------- personalisation
def fill(text: str, values: dict | None, fallbacks: dict, *, escape: bool) -> str:
    def rep(m):
        k = m.group(1)
        if k not in VARIABLES:
            return m.group(0)  # unknown variables are left visible so Email Check can flag them
        v = (values or {}).get(k) or fallbacks.get(k) or ""
        return H.escape(str(v)) if escape else str(v)
    return VAR_RE.sub(rep, text or "")


# ---------------------------------------------------------------- rendering
def _bg(color, gradient) -> str:
    css = f"background-color:{color};" if color else ""
    if gradient:
        css = f"background-color:{gradient['from']};background-image:linear-gradient({gradient['angle']}deg,{gradient['from']},{gradient['to']});"
    return css


def _padcss(p: dict) -> str:
    return f"padding:{p['top']}px {p['right']}px {p['bottom']}px {p['left']}px;"


def _asset_url(src: str, base_url: str) -> str:
    return (base_url.rstrip("/") + src) if src.startswith("/api/assets/") else src


class Renderer:
    def __init__(self, doc: dict, *, values: dict | None = None, base_url: str = "", subject: str = "", preheader: str = "", include_footer: bool = True):
        self.doc = normalise(doc)
        self.st = self.doc["settings"]
        self.values = values
        self.base = base_url
        self.subject = subject
        self.preheader = preheader
        self.include_footer = include_footer
        self.mobile_rules: list[str] = []

    def t(self, s: str, escape=True) -> str:
        return fill(s, self.values, self.st["fallbacks"], escape=escape)

    def font(self, name: str | None) -> str:
        return FONTS[name or self.st["fontFamily"]]

    def element(self, el: dict, inner_width: int) -> str:
        if el.get("hidden"):
            return ""
        t, s = el["type"], el.get("style", {})
        cls = f"tl-e-{el['id']}"
        if t in ("heading", "text"):
            if s.get("mobileFontSize"):
                self.mobile_rules.append(f".{cls}{{font-size:{s['mobileFontSize']}px !important;line-height:{s['lineHeight']} !important}}")
            content = self.t(el["content"], escape=True)  # recipient values are HTML-escaped inside rich text
            content = content.replace("<a href=", f'<a style="color:{self.st["linkColor"]};text-decoration:underline" href=')
            if s.get("paragraphSpacing"):
                content = content.replace("<br><br>", f'<br><span style="display:block;height:{s["paragraphSpacing"]}px;line-height:{s["paragraphSpacing"]}px">&nbsp;</span>')
            tag = "h1" if t == "heading" else "div"
            css = (f"margin:0;font-family:{self.font(s.get('fontFamily'))};font-size:{s['fontSize']}px;font-weight:{s['fontWeight']};"
                   f"line-height:{s['lineHeight']};letter-spacing:{s['letterSpacing']}px;color:{s.get('color') or self.st['textColor']};"
                   f"text-align:{s['align']};text-decoration:{s['decoration']};text-transform:{s['transform']};"
                   f"{'font-style:italic;' if s.get('italic') else ''}{_padcss(s['padding'])}{_bg(s.get('background'), None)}")
            return f'<{tag} class="{cls}" style="{css}">{content}</{tag}>'
        if t == "image":
            if not el.get("src"):
                return ""
            w = max(1, round(inner_width * s["width"] / 100))
            border = f"border:{s['borderWidth']}px solid {s['borderColor']};" if s["borderWidth"] else "border:0;"
            img = (f'<img src="{H.escape(_asset_url(self.t(el["src"], escape=False), self.base))}" alt="{H.escape(self.t(el.get("alt", ""), escape=False))}" width="{w}" '
                   f'style="display:block;width:100%;max-width:{w}px;height:auto;{border}border-radius:{s["radius"]}px;outline:none;text-decoration:none">')
            if el.get("href"):
                img = f'<a href="{H.escape(self.t(el["href"], escape=False))}" target="_blank">{img}</a>'
            return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="{s["align"]}" style="{_padcss(s["padding"])}">'
                    f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:{s["width"]}%;max-width:{w}px"><tr><td>{img}</td></tr></table></td></tr></table>')
        if t == "button":
            border = f"border:{s['borderWidth']}px solid {s['borderColor']};" if s["borderWidth"] else ""
            width = "width:100%;" if s["fullWidth"] else ""
            href = H.escape(self.t(el.get("href") or "#", escape=False))
            a_css = (f"display:block;{_bg(s['background'], s.get('gradient'))}color:{s['color']};font-family:{self.font(s.get('fontFamily'))};"
                     f"font-size:{s['fontSize']}px;font-weight:{s['fontWeight']};line-height:1.2;text-decoration:none;padding:{s['paddingY']}px {s['paddingX']}px;"
                     f"border-radius:{s['radius']}px;{border}text-align:center")
            return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="{s["align"]}" style="{_padcss(s["padding"])}">'
                    f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="{width}"><tr><td style="border-radius:{s["radius"]}px;{_bg(s["background"], s.get("gradient"))}">'
                    f'<a href="{href}" target="_blank" style="{a_css}">{H.escape(self.t(el["label"], escape=False))}</a></td></tr></table></td></tr></table>')
        if t == "divider":
            return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="{_padcss(s["padding"])}">'
                    f'<table role="presentation" width="{s["width"]}%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:{s["thickness"]}px solid {s["color"]};font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr></table>')
        if t == "spacer":
            return f'<div style="height:{s["height"]}px;line-height:{s["height"]}px;font-size:0">&nbsp;</div>'
        if t == "shape":
            return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="{s["align"]}" style="{_padcss(s["padding"])}">'
                    f'<table role="presentation" width="{s["width"]}%" cellpadding="0" cellspacing="0" border="0"><tr><td height="{s["height"]}" style="height:{s["height"]}px;{_bg(s["background"], s.get("gradient"))}border-radius:{s["radius"]}px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr></table>')
        if t == "group":
            pad = s["padding"]
            inner = inner_width - pad["left"] - pad["right"]
            border = f"border:{s['borderWidth']}px solid {s['borderColor']};" if s["borderWidth"] else ""
            body = "".join(self.element(c, inner) for c in el.get("children", []))
            return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="{_bg(s.get("background"), s.get("gradient"))}{border}border-radius:{s["radius"]}px">'
                    f'<tr><td style="{_padcss(pad)}">{body}</td></tr></table>')
        return ""

    def section(self, sec: dict) -> str:
        if sec.get("hidden"):
            return ""
        s = sec["style"]
        w = self.st["width"]
        inner = w - s["padding"]["left"] - s["padding"]["right"]
        bgimg = ""
        if s.get("backgroundImage"):
            url = H.escape(_asset_url(s["backgroundImage"], self.base))
            bgimg = f"background-image:url('{url}');background-size:cover;background-position:center;"
        cells = []
        for col in sec["columns"]:
            cw = round(inner * col["width"] / 100)
            stack = "tl-col" if s["stackOnMobile"] and len(sec["columns"]) > 1 else ""
            body = "".join(self.element(e, cw) for e in col["elements"]) or "&nbsp;"
            cells.append(f'<td class="{stack}" width="{cw}" valign="{col["verticalAlign"]}" style="width:{cw}px;vertical-align:{col["verticalAlign"]}">{body}</td>')
        return (f'<tr><td style="{_bg(s.get("background"), s.get("gradient"))}{bgimg}{_padcss(s["padding"])}">'
                f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>{"".join(cells)}</tr></table></td></tr>')

    def html(self) -> str:
        st = self.st
        rows = "".join(self.section(sec) for sec in self.doc["sections"])
        footer = ""
        if self.include_footer and st["footer"].strip():
            footer = (f'<tr><td style="padding:16px 32px 28px;font-family:{FONTS[st["fontFamily"]]};font-size:12px;line-height:1.5;color:#8a85a3;text-align:center">'
                      f'{H.escape(self.t(st["footer"], escape=False))}</td></tr>')
        pre = (f'<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:{st["background"]}">'
               f'{H.escape(self.t(self.preheader, escape=False))}&#847;&zwnj;&nbsp;</div>') if self.preheader else ""
        mobile = "".join(self.mobile_rules)
        return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<title>{H.escape(self.t(self.subject, escape=False))}</title>
<style>body{{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}}table,td{{mso-table-lspace:0;mso-table-rspace:0}}img{{-ms-interpolation-mode:bicubic}}
@media only screen and (max-width:{st["width"] + 20}px){{.tl-container{{width:100% !important}}.tl-col{{display:block !important;width:100% !important;max-width:100% !important}}{mobile}}}</style>
</head><body style="margin:0;padding:0;background-color:{st["background"]}">{pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{st["background"]}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="tl-container" width="{st["width"]}" cellpadding="0" cellspacing="0" border="0" style="width:{st["width"]}px;max-width:100%;background-color:{st["contentBackground"]};border-radius:{st["radius"]}px;overflow:hidden">
{rows}{footer}
</table></td></tr></table></body></html>"""

    def text(self) -> str:
        lines: list[str] = []
        for sec in self.doc["sections"]:
            if sec.get("hidden"):
                continue
            for col in sec["columns"]:
                for el in col["elements"]:
                    for e in ([el] + (el.get("children", []) if el["type"] == "group" else [])):
                        if e.get("hidden"):
                            continue
                        if e["type"] == "heading":
                            lines += [rich_to_text(self.t(e["content"])).upper(), ""]
                        elif e["type"] == "text":
                            lines += [rich_to_text(self.t(e["content"])), ""]
                        elif e["type"] == "button" and e.get("href"):
                            lines += [f"{self.t(e['label'], escape=False)}: {self.t(e['href'], escape=False)}", ""]
                        elif e["type"] == "image" and e.get("alt") and e.get("href"):
                            lines += [f"{self.t(e['alt'], escape=False)}: {self.t(e['href'], escape=False)}", ""]
                        elif e["type"] == "divider":
                            lines += ["----------", ""]
        if self.include_footer and self.st["footer"].strip():
            lines += ["--", self.t(self.st["footer"], escape=False)]
        return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip() + "\n"


def render(doc: dict, **kw) -> tuple[str, str]:
    r = Renderer(doc, **kw)
    return r.html(), r.text()


# ---------------------------------------------------------------- starter documents, presets and brand
def text_el(content, *, heading=False, **style) -> dict:
    return {"id": new_id(), "type": "heading" if heading else "text", "content": content, "style": style}


def section(*elements, columns=None, **style) -> dict:
    cols = columns or [{"id": new_id(), "width": 100, "elements": list(elements)}]
    return {"id": new_id(), "name": style.pop("name", "Section"), "kind": style.pop("kind", "content"), "columns": cols, "style": style}


def blank(name: str = "Untitled email") -> dict:
    return normalise({"sections": [section(text_el("Your headline", heading=True), text_el("Hi {{first_name}},<br><br>Write your message here."), name="Content")]})


PRESETS = {
    "minimal": {"background": "#FFFFFF", "contentBackground": "#FFFFFF", "fontFamily": "Helvetica", "textColor": "#111111", "linkColor": "#111111", "radius": 0,
                "button": {"background": "#111111", "color": "#FFFFFF", "radius": 0}, "heading": {"fontWeight": 600, "letterSpacing": -0.5}},
    "modern": {"background": "#F4F1FB", "contentBackground": "#FFFFFF", "fontFamily": "Helvetica", "textColor": "#1B1433", "linkColor": "#7B3FF2", "radius": 16,
               "button": {"background": "#7B3FF2", "color": "#FFFFFF", "radius": 999}, "heading": {"fontWeight": 800, "letterSpacing": -0.5}},
    "luxury": {"background": "#0F0E0C", "contentBackground": "#17150F", "fontFamily": "Georgia", "textColor": "#EDE6D6", "linkColor": "#C9A96E", "radius": 0,
               "button": {"background": "#C9A96E", "color": "#17150F", "radius": 0}, "heading": {"fontWeight": 400, "letterSpacing": 1}},
    "bold": {"background": "#FFE9DD", "contentBackground": "#FFFFFF", "fontFamily": "Arial", "textColor": "#1B1433", "linkColor": "#D9531E", "radius": 4,
             "button": {"background": "#C2410C", "color": "#FFFFFF", "radius": 4}, "heading": {"fontWeight": 900, "letterSpacing": -1}},
    "corporate": {"background": "#EEF2F7", "contentBackground": "#FFFFFF", "fontFamily": "Arial", "textColor": "#1F2937", "linkColor": "#1D4ED8", "radius": 4,
                  "button": {"background": "#1D4ED8", "color": "#FFFFFF", "radius": 4}, "heading": {"fontWeight": 700, "letterSpacing": 0}},
    "creative": {"background": "#FDF2FA", "contentBackground": "#FFFFFF", "fontFamily": "Trebuchet", "textColor": "#2B1036", "linkColor": "#C026D3", "radius": 24,
                 "button": {"background": "#C026D3", "color": "#FFFFFF", "radius": 999, "gradient": {"from": "#d32de5", "to": "#ff982e", "angle": 105}},
                 "heading": {"fontWeight": 800, "letterSpacing": -0.5}},
}


def apply_preset(doc: dict, name: str) -> dict:
    p = PRESETS.get(name)
    if not p:
        return normalise(doc)
    d = copy.deepcopy(normalise(doc))
    for k in ("background", "contentBackground", "fontFamily", "textColor", "linkColor", "radius"):
        d["settings"][k] = p[k]
    d["settings"]["preset"] = name
    for sec, _, el, _ in iter_elements(d):
        hero = sec["kind"] == "hero"  # hero text sits on its own background, so its colours are kept
        if el["type"] == "button":
            el["style"].update({k: v for k, v in p["button"].items() if k != "gradient"})
            el["style"]["gradient"] = p["button"].get("gradient")
        elif el["type"] == "heading":
            el["style"].update(p["heading"])
            if not hero:
                el["style"]["color"] = None
        elif el["type"] == "text" and not hero:
            el["style"]["color"] = None
    for sec in d["sections"]:
        if sec["kind"] != "hero":
            sec["style"]["background"] = None
            sec["style"]["gradient"] = None
    return normalise(d)


def apply_brand(doc: dict, brand: dict) -> tuple[dict, list[str]]:
    """Apply compatible brand settings. Returns (doc, list of what changed)."""
    d = copy.deepcopy(normalise(doc))
    changed = []
    primary, secondary = _color(brand.get("primary")), _color(brand.get("secondary"))
    if brand.get("font") in FONTS:
        d["settings"]["fontFamily"] = brand["font"]
        changed.append(f"Font: {brand['font']}")
    if primary:
        d["settings"]["linkColor"] = primary
        for _, _, el, _ in iter_elements(d):
            if el["type"] == "button":
                el["style"]["background"], el["style"]["gradient"] = primary, None
                el["style"]["borderColor"] = primary
        changed.append("Buttons and links use your primary colour")
    if secondary:
        for sec in d["sections"]:
            if sec["kind"] in ("header", "hero"):
                sec["style"]["background"], sec["style"]["gradient"] = secondary, None
        changed.append("Header uses your secondary colour")
    logo = brand.get("logo")
    if logo:
        found = False
        for _, _, el, _ in iter_elements(d):
            if el["type"] == "image" and el.get("name", "").lower().startswith("logo"):
                el["src"], el["alt"], found = logo, brand.get("company") or el.get("alt") or "Logo", True
        if not found:
            d["sections"].insert(0, normalise({"sections": [section({"id": new_id(), "type": "image", "name": "Logo", "src": logo, "alt": brand.get("company") or "Logo",
                                                                     "style": {"width": 30, "align": "center"}}, kind="header", name="Header")]})["sections"][0])
        changed.append("Logo")
    if brand.get("website"):
        d["settings"]["fallbacks"]["website"] = d["settings"]["fallbacks"].get("website") or brand["website"]
    return normalise(d), changed
