"""What the TubeLead Helper knows about each page.

This is the single source of the helper's page knowledge: the greeting it gives, what the page is for, what can be
done there, the suggested questions and the walkthrough (tour) available. It is written from the pages themselves;
keep it in step with them, and never describe a feature here that the page does not have. The walkthrough steps
(which elements to highlight) live in the frontend under the same tour ids."""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Page:
    key: str
    title: str
    greeting: str
    purpose: str
    can_do: tuple[str, ...]
    next_steps: tuple[str, ...] = ()
    suggestions: tuple[str, ...] = ()
    tour: str | None = None
    tour_title: str = ""
    keywords: tuple[str, ...] = field(default_factory=tuple)


PAGES: dict[str, Page] = {p.key: p for p in [
    Page("/", "TubeLead home",
         "Hi! I'm your TubeLead helper. Want me to show you what TubeLead does?",
         "The TubeLead homepage: what TubeLead does, how it works, plans and prices, and answers to common questions.",
         ("See how discovery works in the 'How it works' section", "Compare plans and prices in the Pricing section",
          "Start a free trial or sign in", "Try the interactive demo with sample data (at /demo)"),
         ("Start a free trial to run your first search", "Ask me about plans and prices"),
         ("What does TubeLead do?", "What do the plans cost?", "Where do contact details come from?", "How do I get started?"),
         "home", "A quick look around", ("home", "homepage", "pricing")),
    Page("/demo", "Interactive demo",
         "This is the interactive demo. Everything here is sample data, so try anything you like.",
         "A public demo of the Growth Assistant using sample data. Nothing is saved or sent.",
         ("Describe a business and see sample customers", "Open a sample pitch email", "Run the sample email check"),
         ("Start a free trial to do this with real data",),
         ("Is the demo data real?", "How do I get started?")),
    Page("/dashboard", "Dashboard",
         "Hey! Welcome back. Let me show you what's happening with your TubeLead account.",
         "Your day at a glance: leads found over time, search performance, campaign performance, contact trust levels, where your creators are, and live activity.",
         ("Start a search with 'Start discovering'", "Describe what you sell in the Growth Assistant box to find customers",
          "Load demo data to explore with sample records", "Open a chart's page from its panel"),
         ("Run your first search in the Lead Generator", "Move your best leads into a campaign"),
         ("How do I get started?", "What should I do next?", "Can you explain this page?"),
         "welcome", "Tour of TubeLead", ("dashboard", "home page", "overview")),
    Page("/growth", "Growth Assistant",
         "Let's find your next customers. I'll walk you through each step.",
         "A five-step wizard: describe your business, discover prospects, find their contacts, create your email in Creative Studio, then check, approve and launch the campaign.",
         ("Describe what you sell and who you want to reach", "Review discovered prospects and see why each scored as it did",
          "Find business contacts for the prospects you select", "Design the email in the Easy or Pro editor and run TubeLead Email Check",
          "Send through your own email service, or your own Snov.io account, after approval", "Sort replies and record results"),
         ("Finish the current step, then continue to the next one",),
         ("How does the Growth Assistant work?", "How do I send my campaign?", "What is the Opportunity Score?"),
         "growth", "How the Growth Assistant works", ("growth", "prospects", "customers", "wizard", "creative studio", "email editor")),
    Page("/lead-generator", "Lead Generator",
         "Ready to find some creators? I'll show you how to get the most out of your search.",
         "Configure a discovery run. Basic search asks for a topic, how many leads and whether to leave out big brands; Advanced search adds plain-language parsing, discovery modes, regional targeting and qualification filters. Runs are real background jobs using the official YouTube Data API.",
         ("Type a niche and press Enter after each keyword", "Choose how many leads to find", "Leave big brands out (on by default)",
          "Press Find Leads to start the search and watch progress", "Switch to Advanced search for filters, modes and schedules",
          "Save a search to re-run it from Saved Searches"),
         ("Review the creators you found in the Lead Database", "Check their contact routes in Contact Finder"),
         ("How do I find YouTubers?", "How do I use the lead generator?", "What does 'big brands are left out' mean?"),
         "lead-generator", "Run your first search", ("lead generator", "find youtubers", "find creators", "search", "discovery", "youtubers")),
    Page("/discovery-engine", "Discovery Engine",
         "This is where every search runs. Let me explain what you're looking at.",
         "Every discovery job, live: its progress, queries run, creators qualified and enriched, and the API quota used today. Jobs survive reloads.",
         ("Select a job to inspect it", "Pause, resume or cancel a running job", "Start a new job from the Lead Generator"),
         ("Open the results in the Lead Database",),
         ("What do the job numbers mean?", "Can I stop a search?")),
    Page("/creator-intelligence", "Creator Intelligence",
         "Curious where your creators are? I'll show you around the map.",
         "Where your discovered creators are: a world map, top countries, and a comparison of up to four countries with their top creators.",
         ("Click countries on the map to compare up to four", "Drill into a country's top creators"),
         (), ("How do I compare countries?", "Can you explain this page?")),
    Page("/lead-database", "Lead Database",
         "Found some interesting prospects! Let me explain how to review and organise your results.",
         "Every creator you have discovered, deduplicated by YouTube channel. Filter and sort the list, open any row for the full profile and contact routes, select rows to add them to a campaign or delete them, and save the current view.",
         ("Filter by country, contact status, campaign and more", "Sort the list", "Click a row to open the creator's profile",
          "Select creators to assign them to a campaign, set their outreach status or delete them",
          "Save the current view for later", "Export all matching or selected leads as CSV"),
         ("Add your best creators to a campaign",),
         ("How do I organise my leads?", "How do I contact a creator?", "What do the contact statuses mean?"),
         "lead-database", "Review your leads", ("lead database", "my leads", "leads", "results", "creators list")),
    Page("/contact-finder", "Contact Finder",
         "Looking for a way to reach a creator? Here's how contact routes work.",
         "Publicly published business contact routes from channel descriptions, creators' own websites and their public contact pages. Nothing is guessed or invented. Each route shows its source and trust level.",
         ("See creators grouped by contact status", "Scan a creator for contact routes", "Read what each trust level means"),
         ("Add creators with verified routes to a campaign",),
         ("Where do contact details come from?", "What do the trust levels mean?", "How do I contact a creator?"),
         "contact-finder", "How contact routes work", ("contact finder", "contact", "email address", "trust level")),
    Page("/saved-searches", "Saved Searches",
         "Let's reuse a search that worked. I'll show you how.",
         "Searches you saved from the Lead Generator. Re-run one in a click or put it on an hourly, daily or weekly schedule.",
         ("Re-run a saved search", "Set or change its schedule", "Delete a saved search"),
         (), ("How do I save a search?", "How do schedules work?")),
    Page("/campaigns", "Campaign Manager",
         "Let's get your campaign organised. I'll walk you through the important steps.",
         "Group qualified creators into campaigns and track them through the outreach funnel (draft, active, paused, completed). The Campaign Manager organises your pipeline; it does not send email.",
         ("Create a campaign", "Add creators to it from the Lead Database", "Track status and reply rate", "Delete a campaign"),
         ("To send emails, use the Growth Assistant's launch step with your own email service",),
         ("How do I create a campaign?", "How do I add creators to a campaign?", "Does TubeLead send the emails?"),
         "campaigns", "Organise a campaign", ("campaign", "campaigns", "outreach", "pipeline")),
    Page("/automation", "Automation Centre",
         "Want TubeLead to work while you're away? Here's how automation works.",
         "Scheduled discovery runs and an outbound n8n webhook, so finished jobs can trigger the rest of your workflow.",
         ("See scheduled searches and recent runs", "Set your n8n webhook URL", "See the event payload sent"),
         (), ("How do I schedule a search?", "What is the n8n webhook?")),
    Page("/ai-connect", "AI Connect",
         "Want to bring your own AI? I'll show you how to connect a provider.",
         "Connect your own AI provider with your API key. Keys are encrypted and never sent back to your browser. Then choose which tasks each provider handles in AI Task Manager.",
         ("Connect a provider with its API key", "Make a provider the default", "Replace or disconnect a key", "See recent AI requests and their cost"),
         ("Route tasks in AI Task Manager",),
         ("Do I need my own AI key?", "Which providers can I connect?")),
    Page("/ai-tasks", "AI Task Manager",
         "Let's decide which AI handles each job.",
         "Choose which connected provider handles each kind of task, with a fallback, or switch a task off.",
         ("Pick a provider and fallback for each task", "Switch a task off"), (),
         ("What happens if a provider fails?",)),
    Page("/analytics", "Analytics",
         "Let's look at how your searches are doing.",
         "Performance from your stored records: lead acquisition, search performance, the discovery funnel, campaign performance, niches, countries, API use and a plain-English summary.",
         ("Read the plain-English summary", "Compare searches and campaigns"), (),
         ("Can you explain this page?",)),
    Page("/integrations", "Service status",
         "Here's what's connected and working.",
         "The status of the services TubeLead needs to find and save your leads.", ("Check each service's status",), (),
         ("Why is a service not configured?",)),
    Page("/api-management", "API Management",
         "Want to use TubeLead from your own tools? Here's how API keys work.",
         "Create keys to call TubeLead's API from your own tools. The full key is shown once, at creation; keys can be revoked.",
         ("Create a key", "Revoke a key", "Read the quick start and endpoint list"), (),
         ("How do I create an API key?",)),
    Page("/billing", "Billing & Subscription",
         "Here's your plan and usage. I can explain the options, but I can't change billing for you.",
         "Your current plan, usage and payments. You can change or cancel your plan yourself here; paid features unlock when payment is confirmed.",
         ("See your plan and usage", "Change plan", "Cancel at the end of the period", "Fix a failed payment"), (),
         ("What do the plans cost?", "How do I cancel?")),
    Page("/settings", "Account Settings",
         "Looking to change something? I'll help you find the right settings.",
         "Your profile, plan summary, the email service you send from, system information, demo data and account deletion.",
         ("Edit your display name and email", "Connect your own email service for test emails and campaigns",
          "Load or remove demo data", "Delete your account"), (),
         ("How do I connect my email?", "How do I delete my account?"),
         "settings", "Find your settings", ("settings", "profile", "email service", "smtp")),
    Page("/support", "Help & Support",
         "Need a hand? You can see your requests to the team here.",
         "Your requests to the TubeLead team. Open a new request, read replies and answer them.",
         ("Open a new request", "Read and reply to the team"), (),
         ("How long do replies take?",)),
    Page("/search-everywhere", "Search Everywhere",
         "One search across every source. Let me show you how it works.",
         "Runs the same search across each connected source at once. Sources that aren't set up say so; nothing is made up.",
         ("Type a search and pick sources", "See where each result was found"), (),
         ("Which sources are included?",)),
    Page("/login", "Sign in", "Welcome back! Sign in to pick up where you left off.",
         "Sign in to your TubeLead account.", ("Sign in", "Reset a forgotten password"), (), ("I can't sign in",)),
    Page("/signup", "Start your free trial", "Great choice! Create your account to start finding creators.",
         "Create a TubeLead account.", ("Create your account",), (), ("What's included in the free trial?",)),
]}

GENERAL = ("TubeLead finds YouTube creators (and, in the Growth Assistant, business prospects) through official sources, "
           "scores them, and shows only publicly published business contact routes. Typical journey: run a search in the "
           "Lead Generator, review results in the Lead Database, check contact routes in Contact Finder, group creators "
           "in the Campaign Manager. The Growth Assistant adds a guided flow that ends with an email you design, check, "
           "approve and send from your own email service.")

PAGE_INTENT = re.compile(r"\b(this page|this screen|what (is|does) (this|here)|where am i|explain (this|the) page|what can i do here)\b", re.I)
NEXT_INTENT = re.compile(r"\b(what (should|do|can) i do next|what now|next step|where (do|should) i (start|begin)|get(ting)? started|how do i start)\b", re.I)
SHOW_INTENT = re.compile(r"\b(show me( how)?|walk me through|give me a tour|tour|guide me)\b", re.I)


def page_for(path: str | None) -> Page | None:
    path = (path or "").split("?")[0].split("#")[0].rstrip("/") or "/"
    if path in PAGES:
        return PAGES[path]
    best = None
    for key in PAGES:
        if key != "/" and (path == key or path.startswith(key + "/")) and (not best or len(key) > len(best)):
            best = key
    return PAGES[best] if best else None


def describe(p: Page) -> str:
    lines = [f"{p.title}: {p.purpose}", "", "Here you can:"] + [f"• {x}" for x in p.can_do]
    if p.next_steps:
        lines += ["", "Next: " + p.next_steps[0] + "."]
    return "\n".join(lines)


def tour_for_text(text: str) -> Page | None:
    """The page whose walkthrough best matches a question such as 'how do I find YouTubers?'."""
    t = text.lower()
    best, score = None, 0
    for p in PAGES.values():
        if not p.tour:
            continue
        s = sum(len(k) for k in p.keywords if k in t)
        if s > score:
            best, score = p, s
    return best


def search(text: str, limit: int = 2) -> list[Page]:
    words = {w for w in re.findall(r"[a-z]{3,}", text.lower())} - {"the", "and", "how", "what", "can", "does", "this", "with", "for", "you"}
    scored = []
    for p in PAGES.values():
        hay = " ".join((p.title, p.purpose, *p.can_do, *p.keywords)).lower()
        s = sum(1 for w in words if w in hay) + 3 * sum(1 for k in p.keywords if k in text.lower())
        if s:
            scored.append((s, p))
    scored.sort(key=lambda x: -x[0])
    return [p for _, p in scored[:limit]]


def prompt_context(page: Page | None, journey: list[str]) -> str:
    """Context for the AI model: where the customer is, what the page really offers, and which pages exist."""
    names = ", ".join(f"{p.title} ({k})" for k, p in PAGES.items() if k not in ("/login", "/signup"))
    parts = [f"About TubeLead: {GENERAL}", f"The pages that exist (never mention any other feature or page): {names}."]
    if page:
        parts.append(f"The customer is on: {describe(page)}")
    if journey:
        seen = [page_for(j).title for j in journey[-6:] if page_for(j)]
        if seen:
            parts.append("Pages visited recently: " + " → ".join(seen) + ".")
    return "\n\n".join(parts)
