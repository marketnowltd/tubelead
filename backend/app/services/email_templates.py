"""Built-in Creative Studio templates. Copy is neutral and editable: square-bracket prompts mark what the customer
must fill in, and nothing claims results, prices or offers on their behalf."""
from . import email_doc as E

T, S = E.text_el, E.section


def _btn(label, href="{{website}}", **style):
    return {"id": E.new_id(), "type": "button", "label": label, "href": href, "style": style}


def _shape(h=6, **style):
    return {"id": E.new_id(), "type": "shape", "name": "Accent bar", "style": {"height": h, **style}}


def _hero(title, sub, bg="#1B1433", fg="#FFFFFF", accent="#C9B8FF"):
    return S(T(sub.upper(), fontSize=12, fontWeight=700, letterSpacing=2, color=accent, align="center"),
             T(title, heading=True, fontSize=32, mobileFontSize=26, color=fg, align="center", lineHeight=1.15),
             name="Hero", kind="hero", background=bg, padding={"top": 40, "right": 32, "bottom": 36, "left": 32})


def _signoff():
    return S(T("Best regards,<br>[Your name]<br>[Your company]", fontSize=15), name="Sign-off")


def _two_col(a_title, a_body, b_title, b_body):
    return S(columns=[{"id": E.new_id(), "width": 50, "elements": [T(a_title, heading=True, fontSize=18), T(a_body, fontSize=15)]},
                      {"id": E.new_id(), "width": 50, "elements": [T(b_title, heading=True, fontSize=18), T(b_body, fontSize=15)]}],
             name="Two columns")


def build() -> list[dict]:
    out = []

    def add(cat, name, subject, sections, preset="modern"):
        doc = E.apply_preset(E.normalise({"sections": sections, "settings": {"fallbacks": {"first_name": "there", "company_name": "your business"}}}), preset)
        out.append({"category": cat, "name": name, "subject": subject, "doc": doc})

    add("business_introduction", "Business introduction", "A quick introduction from [Your company]", [
        S(T("Hi {{first_name}},", fontSize=16), T("I'm [your name] from [your company]. We help [type of business] with [what you do].<br><br>"
          "I came across {{company_name}} and thought [one specific, genuine reason it's relevant to them].", fontSize=16), name="Intro"),
        S(_btn("See how we work"), name="Call to action"), _signoff()])
    add("sales_outreach", "Sales outreach", "An idea for {{company_name}}", [
        _hero("An idea for {{company_name}}", "[Your company]"),
        S(T("Hi {{first_name}},<br><br>[Describe the problem you solve in one sentence.]<br><br>[Explain your solution and one concrete, verifiable benefit.]", fontSize=16),
          _btn("Book a 15-minute call", "[your booking link]"), name="Pitch"), _signoff()], "modern")
    add("creator_partnerships", "Creator partnership", "Partnership idea for {{company_name}}", [
        S(T("Partnership idea", heading=True, fontSize=26), T("Hi {{first_name}},<br><br>We love [what you genuinely like about their content]. "
          "We'd like to explore a paid partnership around [product or campaign].<br><br>[What you're offering, budget range or format.]", fontSize=16),
          _btn("Reply to discuss", "mailto:[your email]"), name="Pitch"), _signoff()], "creative")
    add("influencer_outreach", "Influencer outreach", "Collaboration with {{company_name}}?", [
        _hero("Let's create something together", "Collaboration", bg="#86198F", accent="#F5D0FE"),
        _two_col("What we'd love", "[Content format, timing and deliverables]", "What you get", "[Fee, product or commission: be specific]"),
        S(_btn("See the brief", "[link to brief]"), name="Call to action"), _signoff()], "creative")
    add("product_launch", "Product launch", "Introducing [product name]", [
        _hero("Introducing [product name]", "New"),
        S(T("[One sentence on what it is and who it's for.]", fontSize=17, align="center"), _btn("Take a look", "[product link]"), name="Launch"),
        _two_col("[Feature one]", "[What it does for the reader]", "[Feature two]", "[What it does for the reader]"), _signoff()], "bold")
    add("service_promotion", "Service promotion", "How [your company] can help {{company_name}}", [
        S(_shape(6, background="#7B3FF2"), T("How we can help {{company_name}}", heading=True, fontSize=26),
          T("Hi {{first_name}},<br><br>[Service], designed for [type of business] in {{business_location}}.<br><br>[What's included.]", fontSize=16),
          _btn("Get a quote", "[your quote link]"), name="Service"), _signoff()], "corporate")
    add("newsletter", "Newsletter", "[Month] update from [your company]", [
        S(T("[YOUR COMPANY] · [MONTH]", fontSize=12, fontWeight=700, letterSpacing=2, align="center"), T("This month's update", heading=True, align="center"), name="Header", kind="header"),
        S(T("[Story one]", heading=True, fontSize=20), T("[A short summary and why it matters to the reader.]", fontSize=15), _btn("Read more", "[link]", align="left"), name="Story one"),
        S({"id": E.new_id(), "type": "divider", "style": {}}, T("[Story two]", heading=True, fontSize=20), T("[A short summary.]", fontSize=15), name="Story two")], "minimal")
    add("promotional_offer", "Promotional offer", "[Offer] for {{company_name}}", [
        _hero("[Your offer, e.g. 20% off your first month]", "Offer", bg="#9A3412", accent="#FED7AA"),
        S(T("[Who it's for, how to claim it and when it ends. State the real terms.]", fontSize=16, align="center"), _btn("Claim the offer", "[offer link]"),
          T("[Terms and conditions]", fontSize=12, align="center", color="#6B6680"), name="Offer")], "bold")
    add("event_invitation", "Event invitation", "You're invited: [event name]", [
        _hero("[Event name]", "You're invited", bg="#17150F", accent="#C9A96E"),
        _two_col("When", "[Date and time]", "Where", "[Venue or online link]"),
        S(T("[Why it's worth attending.]", fontSize=16), _btn("Reserve a place", "[registration link]"), name="Details")], "luxury")
    add("follow_up", "Follow-up", "Following up on my last email", [
        S(T("Hi {{first_name}},<br><br>I wanted to follow up on my note about [topic]. [One new, useful point.]<br><br>"
            "Would it be worth a quick chat? If not, just let me know and I won't follow up again.", fontSize=16), name="Follow-up"), _signoff()], "minimal")
    add("appointment_request", "Appointment request", "15 minutes next week, {{first_name}}?", [
        S(T("Could we find 15 minutes?", heading=True, fontSize=24), T("Hi {{first_name}},<br><br>I'd like to show you [what] and hear about [their goal]. "
          "Pick any time that suits you below.", fontSize=16), _btn("Choose a time", "[your booking link]"), name="Request"), _signoff()], "corporate")
    return out


CATEGORIES = {"business_introduction": "Business introduction", "sales_outreach": "Sales outreach", "creator_partnerships": "Creator partnerships",
              "influencer_outreach": "Influencer outreach", "product_launch": "Product launch", "service_promotion": "Service promotion",
              "newsletter": "Newsletter", "promotional_offer": "Promotional offer", "event_invitation": "Event invitation", "follow_up": "Follow-up",
              "appointment_request": "Appointment request"}
