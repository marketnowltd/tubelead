"""Homepage data: reviews are private until approved, stats come only from real records."""
from app.auth import DEV_OWNER
from app.config import get_settings
from app.db import SessionLocal
from app.models import Creator


def test_review_is_hidden_until_approved(client):
    st = get_settings()
    old_op = st.operator_user_ids
    st.operator_user_ids = DEV_OWNER  # the moderator is the operator
    try:
        _run_review_flow(client)
    finally:
        st.operator_user_ids = old_op


def _run_review_flow(client):
    body = {"name": "Sam Carter", "company": "Carter Fitness", "rating": 5, "body": "Found three sponsors in one afternoon, with real public emails.", "email": "sam@example.test"}
    assert client.post("/api/public/reviews", json=body).status_code == 201
    assert client.get("/api/public/reviews").json()["reviews"] == []  # not public yet
    rid = client.get("/api/admin/reviews?status=pending").json()[0]["id"]
    assert "sam@example.test" in client.get("/api/admin/reviews?status=pending").text  # operator sees the private email
    client.patch(f"/api/admin/reviews/{rid}", json={"status": "approved", "verified": False})
    pub = client.get("/api/public/reviews").json()
    assert len(pub["reviews"]) == 1 and pub["reviews"][0]["name"] == "Sam Carter"
    assert "email" not in pub["reviews"][0]  # the private email is never published
    assert pub["average_rating"] is None  # not shown until there are at least three reviews


def test_review_input_is_checked(client):
    assert client.post("/api/public/reviews", json={"name": "A", "rating": 9, "body": "short"}).status_code == 422
    assert client.post("/api/public/reviews", json={"name": "Bo", "rating": 4, "body": "<script>x</script> long enough text"}).status_code == 422


def test_stats_are_null_without_real_data(client):
    s = client.get("/api/public/stats").json()
    assert s["businesses_discovered"] is None and s["countries_covered"] is None and s["search_success_rate"] is None
    assert s["search_sources"] == 1


def test_stats_count_real_records_once_there_is_enough(client):
    with SessionLocal() as db:
        for i in range(25):
            db.add(Creator(owner_id=DEV_OWNER, youtube_channel_id=f"UCstat{i}", title=f"s{i}", channel_url="https://x", country="GB" if i % 2 else "US"))
        db.commit()
    s = client.get("/api/public/stats").json()
    assert s["businesses_discovered"] == 25 and s["countries_covered"] == 2


def test_moderation_is_operator_only(client):
    st = get_settings()
    old = (st.auth_mode, st.supabase_jwt_secret)
    st.auth_mode, st.supabase_jwt_secret = "supabase", "x" * 40
    import jwt
    try:
        cust = {"Authorization": "Bearer " + jwt.encode({"sub": "ffffffff-0000-0000-0000-000000000006", "aud": "authenticated"}, "x" * 40, algorithm="HS256")}
        assert client.get("/api/admin/reviews", headers=cust).status_code == 403
    finally:
        st.auth_mode, st.supabase_jwt_secret = old
