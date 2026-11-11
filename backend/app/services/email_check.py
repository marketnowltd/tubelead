"""TubeLead Email Check: inspects a Creative Studio document before a campaign can be approved.

Every finding has: id, category (design|content|technical|deliverability), severity (critical|warning|info),
message, element id (if any), and whether it has a SAFE automatic fix. Safe fixes never change offers, prices,
claims, legal wording or meaning: they only adjust sizes, alt text placeholders, link schemes, spacing and typos.

Scoring (documented, deterministic):
- Each category starts at 100. A critical finding costs 40, a warning 12, an info 3 (floor 0).
- Readiness = rounded mean of the four categories. If ANY critical finding exists, readiness is capped at 49 and
  `can_launch` is false, so a critical failure is never hidden behind a high overall score.
- Deliverability checks that could not run (e.g. DNS unavailable) are reported as "not checked", never as passed."""
from __future__ import annotations

import copy
import re
from urllib.parse import urlparse

from . import email_doc as E

PENALTY = {"critical": 40, "warning": 12, "info": 3}
CATEGORIES = ("design", "content", "technical", "deliverability")
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at"}
FREE_MAIL = {"gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "live.co.uk",
             "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com", "gmx.com", "gmx.co.uk", "mail.com", "yandex.com",
             "btinternet.com", "sky.com", "virginmedia.com", "talktalk.net", "zoho.com"}
MISSPELLINGS = {"recieve": "receive", "seperate": "separate", "definately": "definitely", "occured": "occurred", "accomodate": "accommodate",
                "untill": "until", "wich": "which", "thier": "their", "begining": "beginning", "beleive": "believe", "calender": "calendar",
                "collegue": "colleague", "comming": "coming", "concious": "conscious", "embarass": "embarrass", "enviroment": "environment",
                "existance": "existence", "goverment": "government", "garantee": "guarantee", "guarentee": "guarantee", "independant": "independent",
                "neccessary": "necessary", "noticable": "noticeable", "occassion": "occasion", "persue": "pursue", "posession": "possession",
                "prefered": "preferred", "recomend": "recommend", "reccomend": "recommend", "refered": "referred", "relevent": "relevant",
                "succesful": "successful", "sucessful": "successful", "tommorow": "tomorrow", "truely": "truly", "wierd": "weird",
                "adress": "address", "buisness": "business", "busness": "business", "oppurtunity": "opportunity", "opportunty": "opportunity",
                "acheive": "achieve", "acheived": "achieved", "advertisment": "advertisement", "occurence": "occurrence", "publically": "publicly",
                "teh": "the", "managment": "management", "commited": "committed", "explaination": "explanation"}
WEAK_SUBJECTS = re.compile(r"^(hi|hello|hey|quick question|following up|follow up|re:?|test|untitled|update|news)\W*$", re.I)
SPAMMY = re.compile(r"\b(100% free|act now|risk[- ]free|guaranteed|click here|buy now|limited time|winner|cash bonus|no obligation)\b", re.I)


def _f(fid, cat, sev, msg, el=None, fix=None, detail=""):
    return {"id": fid, "category": cat, "severity": sev, "message": msg, "element_id": el, "fix": fix, "detail": detail}


def _luminance(hex_color: str | None) -> float | None:
    if not hex_color or not hex_color.startswith("#"):
        return None
    h = hex_color[1:]
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h[:3])
    try:
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except ValueError:
        return None
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4  # noqa: E731
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(a: str | None, b: str | None) -> float | None:
    la, lb = _luminance(a), _luminance(b)
    if la is None or lb is None:
        return None
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def _links(doc: dict) -> list[tuple[str | None, str, str]]:
    """(element id, href, visible text) for every link."""
    out = []
    for _, _, el, _ in E.iter_elements(doc):
        if el.get("hidden"):
            continue
        if el["type"] in ("button",) and el.get("href") is not None:
            out.append((el["id"], el.get("href") or "", el.get("label", "")))
        if el["type"] == "image" and el.get("href"):
            out.append((el["id"], el["href"], el.get("alt", "")))
        if el["type"] in ("heading", "text"):
            for m in re.finditer(r'<a href="([^"]*)">(.*?)</a>', el.get("content", "")):
                out.append((el["id"], m.group(1), re.sub(r"<[^>]+>", "", m.group(2))))
    return out


def inspect(doc: dict, *, subject: str, preheader: str = "", html: str = "", text: str = "", sender_domain: str | None = None,
            dns_results: dict | None = None, link_results: dict | None = None, recipients: dict | None = None) -> dict:
    """Run every check. dns_results/link_results are supplied by the caller (network checks); None means not checked."""
    d = E.normalise(doc)
    st = d["settings"]
    F: list[dict] = []
    visible = [(s, c, e, g) for s, c, e, g in E.iter_elements(d) if not e.get("hidden") and not s.get("hidden")]
    texts = [e for _, _, e, _ in visible if e["type"] in ("heading", "text")]
    all_text = " ".join(E.rich_to_text(e["content"]) for e in texts) + " " + " ".join(e.get("label", "") for _, _, e, _ in visible if e["type"] == "button")

    # ---------------- design
    if not visible:
        F.append(_f("empty", "design", "critical", "The email has no visible content."))
    for sec, col, el, _ in visible:
        s = el.get("style", {})
        if el["type"] == "image":
            if not el.get("src"):
                F.append(_f(f"img-missing-{el['id']}", "design", "critical", f"“{el['name']}” has no image.", el["id"]))
            nat = el.get("naturalWidth")
            col_px = round((st["width"] - sec["style"]["padding"]["left"] - sec["style"]["padding"]["right"]) * col["width"] / 100)
            shown = round(col_px * s.get("width", 100) / 100)
            if nat and nat < shown:
                F.append(_f(f"img-small-{el['id']}", "design", "warning", f"“{el['name']}” is {nat}px wide but shown at {shown}px, so it will look blurry.", el["id"],
                            fix="image_fit"))
        if el["type"] in ("heading", "text"):
            size = s.get("fontSize", 16)
            mobile = s.get("mobileFontSize") or size
            if el["type"] == "text" and mobile < 14:
                F.append(_f(f"small-text-{el['id']}", "design", "warning", f"“{el['name']}” is {mobile}px on mobile; 14px or more is easier to read.", el["id"], fix="text_size"))
            if el["type"] == "heading" and mobile > 32:
                F.append(_f(f"big-heading-{el['id']}", "design", "warning", f"Your mobile headline “{el['name']}” is {mobile}px, which is large for phones.", el["id"], fix="mobile_heading"))
            bg = s.get("background") or sec["style"].get("background") or st["contentBackground"]
            ratio = contrast(s.get("color") or st["textColor"], bg)
            if ratio is not None and ratio < 4.5:
                F.append(_f(f"contrast-{el['id']}", "design", "warning" if ratio >= 3 else "critical",
                            f"“{el['name']}” has low contrast against its background ({ratio:.1f}:1; 4.5:1 is recommended).", el["id"]))
        if el["type"] == "button":
            if s.get("paddingY", 14) * 2 + s.get("fontSize", 16) < 40:
                F.append(_f(f"tap-{el['id']}", "design", "warning", f"Button “{el['label']}” may be hard to tap on phones (under 40px tall).", el["id"], fix="button_size"))
            ratio = contrast(s.get("color"), s.get("background"))
            if ratio is not None and ratio < 3:
                F.append(_f(f"btn-contrast-{el['id']}", "design", "warning", f"Button “{el['label']}” text is hard to read ({ratio:.1f}:1).", el["id"]))
    for sec in d["sections"]:
        if len(sec["columns"]) > 1 and not sec["style"]["stackOnMobile"]:
            F.append(_f(f"stack-{sec['id']}", "design", "warning", f"Section “{sec['name']}” keeps {len(sec['columns'])} columns side by side on phones.", None, fix="stack_columns"))

    # ---------------- content
    subj = (subject or "").strip()
    if not subj:
        F.append(_f("subject-missing", "content", "critical", "The email has no subject line."))
    elif WEAK_SUBJECTS.match(subj) or len(subj) < 8:
        F.append(_f("subject-weak", "content", "warning", "Your subject line could be clearer about why you're writing."))
    elif len(subj) > 78:
        F.append(_f("subject-long", "content", "info", f"Your subject line is {len(subj)} characters; phones show about 40–60."))
    if subj and SPAMMY.search(subj):
        F.append(_f("subject-spammy", "deliverability", "warning", f"The subject line uses wording often filtered as spam (“{SPAMMY.search(subj).group(0)}”)."))
    if not any(e["type"] == "button" and e.get("href") for _, _, e, _ in visible) and not _links(d):
        F.append(_f("cta-missing", "content", "warning", "There's no call to action (a button or link) for the reader."))
    words = re.findall(r"[A-Za-z']+", all_text)
    seen = set()
    for w in words:
        lw = w.lower()
        if lw in MISSPELLINGS and lw not in seen:
            seen.add(lw)
            F.append(_f(f"spell-{lw}", "content", "warning", f"Possible spelling mistake: “{w}” (did you mean “{MISSPELLINGS[lw]}”?).", fix="spelling"))
    for m in re.finditer(r"\b(\w+)\s+\1\b", all_text, flags=re.I):
        F.append(_f(f"repeat-{m.group(1).lower()}", "content", "warning", f"Repeated word: “{m.group(0)}”.", fix="repeated_words"))
        break
    vars_used = set(E.VAR_RE.findall(" ".join([subj, preheader, all_text] + [h for _, h, _ in _links(d)])))
    for v in sorted(vars_used - set(E.VARIABLES)):
        F.append(_f(f"var-unknown-{v}", "content", "critical", f"Unknown personalisation field {{{{{v}}}}}. It would be sent as written."))
    for v in sorted(vars_used & set(E.VARIABLES)):
        if not st["fallbacks"].get(v):
            F.append(_f(f"var-fallback-{v}", "content", "warning", f"{{{{{v}}}}} has no fallback, so it will be blank for recipients without that information.", fix="fallback"))
    if re.search(r"\{\{[^}]*$|^[^{]*\}\}", all_text) or all_text.count("{{") != all_text.count("}}"):
        F.append(_f("var-broken", "content", "critical", "A personalisation field has unbalanced braces, e.g. “{{first_name”."))
    if not texts:
        F.append(_f("no-text", "content", "warning", "The email has no text; image-only emails are often filtered and unreadable without images."))

    # ---------------- technical
    for eid, href, label in _links(d):
        if not href or href == "#":
            F.append(_f(f"link-empty-{eid}", "technical", "critical", f"“{label or 'A link'}” doesn't link anywhere.", eid))
            continue
        if E.VAR_RE.fullmatch(href):
            continue
        if href.startswith("http://"):
            F.append(_f(f"link-http-{eid}", "technical", "warning", f"“{label or href}” uses an insecure http:// link.", eid, fix="https"))
        host = urlparse(href).hostname or ""
        if host in SHORTENERS:
            F.append(_f(f"link-short-{eid}", "deliverability", "warning", f"Link shorteners ({host}) are often treated as suspicious.", eid))
        if re.fullmatch(r"\d+\.\d+\.\d+\.\d+", host):
            F.append(_f(f"link-ip-{eid}", "deliverability", "critical", "A link points to a bare IP address, which looks like phishing.", eid))
        shown = re.search(r"([a-z0-9-]+\.)+[a-z]{2,}", (label or "").lower())
        if shown and host and not host.endswith(shown.group(0).lstrip("www.")) and not shown.group(0).lstrip("www.").endswith(host.lstrip("www.")):
            F.append(_f(f"link-mismatch-{eid}", "deliverability", "warning", f"Link text shows {shown.group(0)} but goes to {host}.", eid))
        if link_results is not None:
            res = link_results.get(href)
            if res == "broken":
                F.append(_f(f"link-broken-{eid}", "technical", "critical", f"Broken link: {href}", eid))
            elif res == "unreachable":
                F.append(_f(f"link-unreachable-{eid}", "technical", "info", f"Couldn't reach {href} to check it.", eid))
    for _, _, el, _ in visible:
        if el["type"] == "image" and el.get("src") and not el.get("alt", "").strip():
            F.append(_f(f"alt-{el['id']}", "technical", "warning", f"Your image “{el['name']}” needs alternative text.", el["id"], fix="alt_text"))
        if el["type"] == "image" and el.get("src", "").startswith("http://"):
            F.append(_f(f"img-http-{el['id']}", "technical", "warning", f"“{el['name']}” loads over http://, which some clients block.", el["id"], fix="https"))
    size = len((html or "").encode())
    if size > 102_000:
        F.append(_f("html-size", "technical", "critical", f"The email is {size // 1024} KB; Gmail clips messages over about 100 KB."))
    elif size > 80_000:
        F.append(_f("html-size", "technical", "warning", f"The email is {size // 1024} KB; keep it under 100 KB to avoid Gmail clipping."))
    if not (text or "").strip():
        F.append(_f("plain-text", "technical", "critical", "There's no plain-text version."))
    if re.search(r"<(script|iframe|form|video|object|embed)\b", html or "", re.I):
        F.append(_f("unsupported", "technical", "critical", "The email contains elements email clients don't support (scripts, forms or embeds)."))
    if not st["footer"].strip():
        F.append(_f("optout", "deliverability", "critical", "There's no way for recipients to opt out. UK PECR requires a simple way to refuse further emails.", fix="footer"))

    # ---------------- deliverability
    checks = {}
    if not sender_domain:
        F.append(_f("sender", "deliverability", "critical", "No sender is connected, so the campaign can't be sent. Connect Snov.io and set your sending domain."))
    elif dns_results is None:
        F.append(_f("dns-unchecked", "deliverability", "info", f"SPF, DKIM and DMARC for {sender_domain} were not checked."))
    else:
        checks = dns_results
        if dns_results.get("spf") == "missing":
            F.append(_f("spf", "deliverability", "critical", f"{sender_domain} has no SPF record, so mailbox providers may reject your emails."))
        if dns_results.get("dmarc") == "missing":
            F.append(_f("dmarc", "deliverability", "warning", f"{sender_domain} has no DMARC record."))
        if dns_results.get("dkim") == "not_found":
            F.append(_f("dkim", "deliverability", "warning", f"No DKIM key was found for {sender_domain} on the usual selectors. Your provider may use a different selector; check its setup page."))
        for k in ("spf", "dmarc", "dkim"):
            if dns_results.get(k) == "unavailable":
                F.append(_f(f"{k}-unchecked", "deliverability", "info", f"{k.upper()} could not be checked (DNS unavailable)."))
    if SPAMMY.search(all_text):
        F.append(_f("body-spammy", "deliverability", "info", f"The text uses wording often filtered as spam (“{SPAMMY.search(all_text).group(0)}”)."))
    if recipients is not None:
        if recipients.get("eligible", 0) == 0:
            F.append(_f("no-recipients", "deliverability", "critical", "No recipients are eligible to receive this campaign."))
        for key, msg in (("suppressed", "are on your suppression list and will be skipped"), ("needs_consent", "look like personal addresses; under PECR you need their consent, so they will be skipped"),
                         ("unverified", "have no verified email and will be skipped")):
            if recipients.get(key):
                F.append(_f(f"recip-{key}", "deliverability", "info", f"{recipients[key]} recipient(s) {msg}."))
        if recipients.get("over_limit"):
            F.append(_f("limit", "deliverability", "critical", f"This campaign has more recipients than your plan allows this month ({recipients['over_limit']})."))

    scores = {}
    for c in CATEGORIES:
        scores[c] = max(0, 100 - sum(PENALTY[f["severity"]] for f in F if f["category"] == c))
    critical = [f for f in F if f["severity"] == "critical"]
    readiness = round(sum(scores.values()) / 4)
    if critical:
        readiness = min(readiness, 49)
    issues = [f for f in F if f["severity"] != "info"]
    headline = ("Your email is ready to go." if not issues else
                f"Your email {'looks professional' if not critical else 'needs attention before it can be sent'}. We found {len(issues)} thing{'s' if len(issues) != 1 else ''} to improve.")
    return {"scores": scores, "readiness": readiness, "can_launch": not critical, "critical": len(critical), "headline": headline,
            "findings": sorted(F, key=lambda f: (["critical", "warning", "info"].index(f["severity"]), CATEGORIES.index(f["category"]))),
            "dns": checks, "safe_fixes": sum(1 for f in F if f["fix"])}


# ---------------------------------------------------------------- safe fixes
def apply_fix(doc: dict, finding: dict, subject: str) -> tuple[dict, str]:
    """Apply ONE safe fix. Returns (new doc, subject). Never changes meaning, offers, prices or legal wording."""
    d = copy.deepcopy(E.normalise(doc))
    fix, eid = finding.get("fix"), finding.get("element_id")
    els = {e["id"]: (s, c, e) for s, c, e, _ in E.iter_elements(d)}
    if fix == "alt_text" and eid in els:
        _, _, e = els[eid]
        e["alt"] = e.get("alt") or re.sub(r"[-_]+", " ", e.get("name") or "Image").strip().capitalize()
    elif fix == "text_size" and eid in els:
        e = els[eid][2]
        e["style"]["mobileFontSize"] = 14 if (e["style"].get("mobileFontSize") or 0) < 14 else e["style"]["mobileFontSize"]
        e["style"]["fontSize"] = max(e["style"]["fontSize"], 14)
    elif fix == "mobile_heading" and eid in els:
        els[eid][2]["style"]["mobileFontSize"] = 28
    elif fix == "button_size" and eid in els:
        st = els[eid][2]["style"]
        st["paddingY"] = max(st["paddingY"], 13)
        st["fontSize"] = max(st["fontSize"], 15)
    elif fix == "image_fit" and eid in els:
        s, c, e = els[eid]
        col_px = round((d["settings"]["width"] - s["style"]["padding"]["left"] - s["style"]["padding"]["right"]) * c["width"] / 100)
        if e.get("naturalWidth"):
            e["style"]["width"] = max(10, min(100, int(e["naturalWidth"] * 100 / max(col_px, 1))))
    elif fix == "https":
        def up(u): return "https://" + u[7:] if isinstance(u, str) and u.startswith("http://") else u
        for _, _, e, _ in E.iter_elements(d):
            for k in ("href", "src"):
                if k in e:
                    e[k] = up(e[k])
            if e["type"] in ("heading", "text"):
                e["content"] = e["content"].replace('href="http://', 'href="https://')
    elif fix == "spelling":
        pat = re.compile(r"\b(" + "|".join(MISSPELLINGS) + r")\b", re.I)
        def corr(m):
            w = m.group(0)
            right = MISSPELLINGS[w.lower()]
            return right.capitalize() if w[0].isupper() else right
        for _, _, e, _ in E.iter_elements(d):
            if e["type"] in ("heading", "text"):
                # only text between tags is corrected; tags and link URLs are untouched
                e["content"] = re.sub(r"(?:^|(?<=>))[^<]+", lambda m: pat.sub(corr, m.group(0)), e["content"])
            if e["type"] == "button":
                e["label"] = pat.sub(corr, e["label"])
    elif fix == "repeated_words":
        for _, _, e, _ in E.iter_elements(d):
            if e["type"] in ("heading", "text"):
                e["content"] = re.sub(r"\b(\w+)(\s+)\1\b", r"\1", e["content"], flags=re.I)
    elif fix == "fallback":
        defaults = {"first_name": "there", "last_name": "", "company_name": "your business", "website": "your website", "industry": "your industry",
                    "business_location": "your area", "campaign_name": ""}
        for k, v in defaults.items():
            if not d["settings"]["fallbacks"].get(k):
                d["settings"]["fallbacks"][k] = v
    elif fix == "stack_columns":
        for sec in d["sections"]:
            sec["style"]["stackOnMobile"] = True
    elif fix == "footer":
        d["settings"]["footer"] = E.normalise({})["settings"]["footer"]
    return E.normalise(d), subject


def apply_all_safe(doc: dict, findings: list[dict], subject: str) -> tuple[dict, str, int]:
    n = 0
    for f in findings:
        if f.get("fix"):
            doc, subject = apply_fix(doc, f, subject)
            n += 1
    return doc, subject, n
