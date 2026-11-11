"""Starter help articles, written from TubeLead's own FAQ, terms and plan configuration. Inserted once, when the
knowledge base is empty; after that they are edited in Admin > Knowledge base."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import KnowledgeArticle
from .plans import purchasable_plans


def _pricing() -> str:
    lines = []
    for pid, p in purchasable_plans().items():
        price = "free" if not p["price_monthly_gbp"] else f"£{p['price_monthly_gbp']}/month or £{p['price_annual_gbp']}/year"
        period = "in total" if p["lead_period"] == "lifetime" else "per month"
        lines.append(f"- {p['label']}: {price}. {p['leads']:,} leads {period}. {p['tagline']}.")
    return "TubeLead plans:\n" + "\n".join(lines) + "\nMulti-source search (Google, Reddit, Twitch, Spotify and more) is included from the Pro plan. Prices are in GBP."


ARTICLES = [
    ("company", "What is TubeLead?", "TubeLead helps businesses find YouTube creators to work with. It searches public channels through the official YouTube Data API, scores them, removes duplicates and organises the business contact details that creators publish themselves. TubeLead is not affiliated with or endorsed by YouTube or Google."),
    ("product", "Where do the contact details come from?", "Only from what creators publish themselves: their YouTube channel description and the official website or contact page linked there. The YouTube API does not expose private email addresses, and TubeLead never guesses, scrapes private data or invents addresses. Each contact shows its source."),
    ("product", "Publicly published versus verified", "Publicly published means we found the address on a public page. It is not a guarantee the mailbox exists. A separate deliverability check (DNS/MX) can be run, and the two statuses are always shown separately."),
    ("tutorial", "How do I find leads?", "Open the Lead Generator, describe the creators you want (for example 'UK fitness creators, 10K–100K subscribers'), choose the country and size, and press Generate Leads. The search runs in the background and progress is shown live. When it finishes you can download the leads as a CSV on paid plans."),
    ("product", "What happens when I reach my lead allowance?", "Searches are capped so you never go over your plan, and you'll see exactly which limit you reached with the option to upgrade. You can still view, filter and export (on paid plans) everything you already have."),
    ("product", "Do I need my own AI key for AI Connect?", "Consumer chat subscriptions such as ChatGPT Plus don't include API access. Create an API key in the provider's developer console (or run a local model with Ollama) and add it in AI Connect. Keys are stored encrypted and never shown again."),
    ("policy", "Will TubeLead send emails for me?", "Only through your own email service. The Lead Generator, Lead Database and Campaign Manager find and organise creators and don't send email. In the Growth Assistant you can design an email, check it, approve it and then send it from your own mailbox (SMTP) or your own SendGrid, Mailgun, Postmark or Resend account, or through your own Snov.io campaign. TubeLead never sends it from its own account. Follow the rules that apply to you and the recipient, such as UK PECR and GDPR; every campaign email includes an unsubscribe link."),
    ("pricing", "Plans and prices", None),
    ("policy", "Billing, renewals and cancelling", "Paid plans are billed through our secure payment provider and renew until cancelled. You can upgrade, downgrade or cancel yourself in Billing & Subscription. Changes take effect as soon as the payment is confirmed. Cancelling keeps your plan until the end of the period you paid for."),
    ("policy", "Refunds", "Refund requests are reviewed individually by a person on the TubeLead team. The support assistant cannot approve, issue or promise refunds. To ask for one, open a support request and you'll get a reference number; the team will reply by email with their decision. (Site owner: replace this with your refund policy.)"),
    ("support", "Contacting support", "Click the TubeLead Helper, the astronaut in the corner of every page. It answers common questions, can walk you through a page, and can pass anything else to the team as a support request with a reference number. Signed-in customers can follow their requests on the Support page."),
    ("support", "I can't sign in", "Use 'Forgot password?' on the sign-in page to get a reset link by email. Check your spam folder if it doesn't arrive within a few minutes. If your account has been suspended you'll see a message saying so; contact support to ask why."),
    ("policy", "Deleting your account", "You can delete your account in Settings. This permanently removes your leads, searches, settings and sign-in. Active subscriptions should be cancelled first in Billing & Subscription."),
]


def _body(title: str) -> str:
    return next(b for _, t, b in ARTICLES if t == title)


# Starter text that became out of date. Replaced only while an article still has exactly this text, so edits made
# in Admin are never overwritten.
SUPERSEDED = {
    "Will TubeLead send emails for me?": ("No. TubeLead is for discovery and organisation and has no unsolicited mass-email feature. Export your leads and use your own tools, following the rules that apply to you and the recipient, such as UK PECR and GDPR.", _body("Will TubeLead send emails for me?")),
    "Contacting support": ("Use the chat button on any page. The assistant answers common questions and can pass anything else to the team as a support request with a reference number. Signed-in customers can follow their requests on the Support page.", _body("Contacting support")),
}


def seed(db: Session) -> int:
    if db.scalar(select(func.count()).select_from(KnowledgeArticle)):
        changed = 0
        for title, (old, new) in SUPERSEDED.items():
            for a in db.scalars(select(KnowledgeArticle).where(KnowledgeArticle.title == title, KnowledgeArticle.body == old)).all():
                a.body = new
                changed += 1
        if changed:
            db.commit()
        return 0
    for cat, title, body in ARTICLES:
        db.add(KnowledgeArticle(category=cat, title=title, body=body or _pricing()))
    db.commit()
    return len(ARTICLES)
