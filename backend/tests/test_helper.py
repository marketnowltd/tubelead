"""TubeLead Helper: page knowledge, onboarding progress, page-aware conversation and walkthrough suggestions."""
from app.config import get_settings
from app.db import SessionLocal
from app.models import KnowledgeArticle
from app.routers import support as support_router
from app.services import helper_guide as G, knowledge_seed
from tests.test_business import H, fake_openai, no_external, user  # noqa: F401  (no_external: no real AI calls)


def chat(client, message, path, **kw):
    r = client.post("/api/support/chat", json={"message": message, "context": {"path": path, "journey": ["/dashboard", path]}}, **kw)
    assert r.status_code == 200, r.text
    return r.json()["message"]


def test_page_knowledge_matches_route_and_prefix(client):
    p = client.get("/api/helper/page", params={"path": "/lead-generator"}).json()
    assert p["title"] == "Lead Generator" and p["tour"] == "lead-generator" and p["greeting"].startswith("Ready to find some creators")
    assert "How do I find YouTubers?" in p["suggestions"]
    assert client.get("/api/helper/page", params={"path": "/lead-database/abc?x=1"}).json()["key"] == "/lead-database"
    unknown = client.get("/api/helper/page", params={"path": "/nope"}).json()
    assert unknown["key"] is None and unknown["tour"] is None


def test_all_pages_load_in_one_request(client):
    r = client.get("/api/helper/pages")
    body = r.json()
    assert r.headers["cache-control"].startswith("public") and set(body["pages"]) == set(G.PAGES)
    assert body["pages"]["/settings"]["tour"] == "settings" and body["fallback"]["key"] is None


def test_every_tour_has_a_page_and_every_page_has_suggestions():
    for key, p in G.PAGES.items():
        assert p.suggestions or key in ("/integrations",), key
        if p.tour:
            assert p.tour_title and p.keywords


def test_progress_is_saved_per_customer_and_cleaned(client):
    u, other = user(), user()
    assert client.get("/api/helper/progress", headers=H(u)).json() == {"intro_done": False, "tips_off": False, "pages_seen": [], "tours_done": [], "tours_skipped": []}
    body = {"intro_done": True, "pages_seen": ["/lead-generator", "/dashboard", "/dashboard", ""], "tours_done": ["welcome"], "tips_off": False}
    out = client.put("/api/helper/progress", json=body, headers=H(u)).json()
    assert out["pages_seen"] == ["/dashboard", "/lead-generator"] and out["tours_done"] == ["welcome"]
    assert client.get("/api/helper/progress", headers=H(u)).json()["intro_done"] is True
    assert client.get("/api/helper/progress", headers=H(other)).json()["intro_done"] is False
    assert client.put("/api/helper/progress", json={"pages_seen": ["x"] * 61}, headers=H(u)).status_code == 422


def test_explain_this_page_uses_the_real_page(client):
    m = chat(client, "Can you explain this page?", "/contact-finder")
    assert m["mode"] == "guide" and m["content"].startswith("Contact Finder:") and "trust level" in m["content"]
    assert m["action"] == "tour" and m["tour"] == {"id": "contact-finder", "title": "How contact routes work", "path": "/contact-finder"}


def test_what_next_and_show_me_how(client):
    m = chat(client, "What should I do next?", "/lead-generator")
    assert "Lead Database" in m["content"] and m["tour"]["id"] == "lead-generator"
    m = chat(client, "Show me how to organise a campaign", "/dashboard")
    assert m["tour"]["id"] == "campaigns" and "Show me how" in m["content"]
    m = chat(client, "How do I get started?", "/")
    assert "Lead Generator" in m["content"] and m["tour"]["id"] == "welcome"


def test_how_do_i_question_offers_the_matching_walkthrough(client):
    m = chat(client, "How do I find YouTubers?", "/dashboard")
    assert m["tour"]["id"] == "lead-generator" and m["action"] == "tour"


def test_financial_requests_stay_with_a_person_even_from_the_helper(client):
    m = chat(client, "I want a refund please", "/billing")
    assert m["action"] == "offer_ticket" and m["category"] == "refund" and m.get("tour") is None


def test_without_context_the_support_chat_is_unchanged(client):
    m = client.post("/api/support/chat", json={"message": "Can you explain this page?"}).json()["message"]
    assert m["mode"] == "help_articles" and m.get("tour") is None


def test_ai_mode_gets_page_context_and_only_real_pages(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "openai_api_key", "sk-test")
    calls = []
    support_router.BOT_TRANSPORT = fake_openai([{"content": "Type a niche, choose how many leads and press Find Leads."}], calls)
    m = chat(client, "How do I use the lead generator?", "/lead-generator")
    system = calls[0]["messages"][0]["content"]
    assert "The customer is on: Lead Generator" in system and "never mention any other feature" in system and "Contact Finder (/contact-finder)" in system
    assert "Pages visited recently: Dashboard → Lead Generator" in system
    assert m["mode"] == "ai" and m["tour"]["id"] == "lead-generator"


def test_outdated_starter_articles_are_corrected_but_edits_are_kept(client):
    with SessionLocal() as db:
        db.query(KnowledgeArticle).delete()
        old_send, _ = knowledge_seed.SUPERSEDED["Will TubeLead send emails for me?"]
        db.add(KnowledgeArticle(category="policy", title="Will TubeLead send emails for me?", body=old_send))
        db.add(KnowledgeArticle(category="support", title="Contacting support", body="Our own edited text."))
        db.commit()
        assert knowledge_seed.seed(db) == 0
        bodies = {a.title: a.body for a in db.query(KnowledgeArticle).all()}
    assert "own email service" in bodies["Will TubeLead send emails for me?"]
    assert bodies["Contacting support"] == "Our own edited text."


def test_settings_row_creation_survives_a_concurrent_insert():
    """Two first requests can both find no settings row and both insert one; the loser must reuse the winner's row."""
    from app.models import UserSettings
    from app.routers.system import get_user_settings
    with SessionLocal() as db:
        db.add(UserSettings(owner_id="00000000-0000-0000-0000-0000000000aa", display_name="winner"))
        db.commit()
    with SessionLocal() as db:
        real_get, calls = db.get, []
        def first_miss(model, key, *a, **kw):  # the first lookup races ahead of the other request's commit
            calls.append(key)
            return None if len(calls) == 1 else real_get(model, key, *a, **kw)
        db.get = first_miss
        us = get_user_settings(db, "00000000-0000-0000-0000-0000000000aa")
        assert us.display_name == "winner" and len(calls) == 2
