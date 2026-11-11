# TubeLead Helper (the astronaut assistant)

A floating astronaut on every page who answers questions, explains the page you're on, walks you through features
by flying to them, and reacts when you finish things. Added without changing the site's layout. He replaces the old
round chat button in the bottom-right corner and opens the same guarded support assistant.

Rollback point before this work: commit `bb29444`.

## 1. Character artwork

Three official sheets in `docs/brand/`. Every frame is cut from them by `frontend/scripts/helper_assets.py`; nothing
is redrawn, recoloured or stretched.

| Sheet | Background | Used for |
|---|---|---|
| `tubelead-helper-poses-sheet.png` | Transparent | Front view, wave, point, present, thinking, idea, celebrate, sparkle, crossed arms, clipboard, magnifier, thumbs-up |
| `tubelead-helper-actions-sheet.png` | Transparent | Explain, flying (dash with speed lines), jetpack climb, hover, the "typing" picture, and the visor expressions and icon visors |
| `tubelead-helper-character-sheet.png` (the original guide) | Lavender panels | The sleeping pose |

- **The transparent sheets were cut from a dark background.** Their dark outlines are semi-transparent, and a magenta
  haze surrounds each character. The script keeps near-opaque pixels, plus dark outline pixels at their own partial
  alpha (so edges stay smooth), and drops the haze.
- **Grouping.** Each character is kept together with the decorations in its cell (question mark, bulb, sparkles,
  speed lines, jet flames, hover ring). Where two icon heads touch, they're split at the midpoint.
- **Output.** 40 WebP frames in `frontend/public/helper/` (about 0.65 MB in total), plus
  `components/helper/sprites.json`. The JSON holds each frame's size and a scale factor, so the character is the same
  height in every pose, even though each sheet draws him at a different size. Only the frames the helper uses are
  written.
- **Frames made from the same pixels:**
  - **Mirrored poses**, for flying and pointing to the left. The chest logo is copied back unmirrored, so the TubeLead
    logo is never reversed.
  - **Full-body expressions and icon visors.** A visor head from the actions sheet is placed on the front-view body,
    as separate head and body layers.
  - **A blink frame.** The front view's eyes are replaced by a short closed-eye line.

To rebuild the frames: `PYTHONPATH=<folder with scipy> python3 frontend/scripts/helper_assets.py` (needs Pillow,
numpy and scipy, which are only used at build time).

## 2. Animation states

| State | Frames | When |
|---|---|---|
| Idle | Front view, blinking every 2.6–6 s (a real closed-eye frame), with a gentle hover | Resting in the corner |
| Flying | Dash pose with speed lines (mirrored when flying left), on an eased curve with a lean | Moving across the screen |
| Rising | Jetpack pose with flames | Mostly upward flights, such as flying up to the panel |
| Greeting | Wave | Introducing himself, first-visit tip |
| Thinking | Thinking pose ↔ search visor, frame by frame | Waiting for an answer |
| Searching | Magnifier ↔ search visor | A search has just been started |
| Pointing | Point (Guide) pose, mirrored for targets on his left | Walkthrough steps |
| Explaining | Present ↔ Explain, frame by frame | After an answer, and in walkthrough steps without a target |
| Idea | Idea pose with the bulb | "First time here? Let me explain how this works." |
| Helpful | Sparkle pose | Resting next to the open panel |
| Celebrating | Celebrate ↔ sparkle, plus a confetti burst in the brand colours | A search finished, a walkthrough finished |
| Success | Thumbs-up | A campaign was created, the end of a walkthrough |
| Done | Tick visor | A request was sent to the team |
| Error / Warning | Error visor / warning visor | A message failed / too many messages or a paywall |
| Curious, Excited, Surprised, Winking, Love | The matching visor on the body | Reactions (for example, excited when clicked) |
| Confident | Crossed arms | Available, for example at the end of the Contact Finder walkthrough |
| Loading | Loading visor on the body | Available for longer waits |
| Sleeping | Sleeping pose with the Z's | After 2 minutes without activity; any click or key wakes him (surprised, then idle) |

- Motion uses the `motion` library (Framer Motion), which the site already uses. GSAP and Lottie weren't added: the
  motion library covers the curves and springs, and frame-by-frame art covers the rest.
- **Reduced motion:** no flying, hovering, confetti or word-by-word text. He simply appears where he needs to be.

## 3. Behaviour

- **Dock.** A small astronaut in the bottom-right of every page, with a purple glow outline. On phones he sits above
  the tab bar. The click target stays still while the artwork hovers, so he's easy to click.
  - While docked he stays below page modals.
  - A pink dot appears when a tip went unanswered.
- **Full assistant.** Click him: he reacts, flies to the panel's corner, waves and introduces himself.
  - The panel shows what the current page is for, with "Show me how" (if the page has a walkthrough), "Explain this
    page", the page's suggested questions, the conversation, "Talk to a person", and a tips on/off switch.
  - Closing the panel flies him back to the corner.
- **Quick help (speech bubbles).** Each of these appears at most once:
  - The first visit offers a tour.
  - The first time on a page that has a walkthrough, he offers it.
  - When a search you watched finishes, he gives the real number found and a link to review them.
  - When a campaign is created, he suggests what to do next.
  - Bubbles wait while another dialog is open, close by themselves, and can be switched off.
- **Walkthroughs.**
  - The page is dimmed, with a spotlight and a glowing ring around the real element. He flies beside it and points.
  - Each step has Next, Previous, Skip tutorial and Exit, plus a progress indicator. The keyboard works too: ←/→
    to move between steps and Esc to exit.
  - Steps that need an action wait for it. For example, the Lead Generator walkthrough waits for you to press
    "Find Leads".
  - The spotlight follows the element if the page scrolls or changes size.
  - A step whose element isn't on screen (for example the sidebar on a phone) shows its card without the spotlight.
  - Walkthroughs: Tour of TubeLead (dashboard), Lead Generator, Lead Database, Contact Finder, Campaigns, Account
    Settings, Growth Assistant, and the homepage.
- **Onboarding progress** (introduction shown, pages seen, walkthroughs finished or skipped, tips on/off) is kept in
  the browser. For signed-in customers it's also saved on the account (`user_settings.preferences.helper`), so it
  follows them to other devices. Changes are sent when the page is hidden, and any that didn't arrive are sent on the
  next visit.

## 4. Conversation and page knowledge

- The conversation goes through the existing support assistant (`/api/support/chat`). The helper adds `context`:
  the current page and the last few pages visited. All the existing safety rules still apply:
  - Refunds, cancellations and account changes always go to a person.
  - Replies that claim such a change was made are blocked.
  - The rate limits are unchanged.
- The page knowledge has one source: `backend/app/services/helper_guide.py`. For each page it holds the greeting,
  what the page is for, what you can do there, next steps, suggested questions and its walkthrough. It's written
  from the pages themselves. Keep it up to date when a page changes.
- **Suggested questions have written answers.** The questions the helper suggests on each page are answered from
  `ANSWERS` in `helper_guide.py`, checked against the pages, so a suggestion never gets a loosely matching help article.
  A few are answered by a specific help article or a safety rule instead; a test checks every suggestion on every page.
- **Without an AI key:**
  - "Explain this page", "What should I do next?" and "Show me how…" are answered from the page guide.
  - Other questions are answered from the help articles, then the page guide.
  - Anything else is offered to the team.
- **With `OPENAI_API_KEY`:** the model gets the current page's guide, the pages visited, and the list of pages that
  exist. It's told never to mention any other feature.
- Answers to "how do I…" questions offer the matching walkthrough. Pressing "Show me how" opens the right page and
  starts it.
- Two starter help articles were out of date: "Will TubeLead send emails for me?" (written before sending through
  your own email service) and "Contacting support" (it described the old chat button). They're corrected
  automatically at startup, but only where the article still has its original text. Articles edited in Admin are
  left alone; check them there.

API: `GET /api/helper/pages` (the whole guide; the browser loads it once per session, so moving between pages
costs no requests), `GET /api/helper/page?path=`, `GET|PUT /api/helper/progress`.

## 5. Files

- Frontend: `components/helper/`
  - `Helper.tsx`: the dock, movement, bubbles, walkthrough runner, tips and sleep.
  - `Astronaut.tsx`: frame-by-frame rendering, blinking, confetti and preloading.
  - `sprites.ts`: the animation states.
  - `Panel.tsx`: the full assistant panel.
  - `Tour.tsx`: the spotlight and step cards.
  - `tours.ts`: the walkthroughs.
  - `target.ts`: finds a step's element by label, link, panel title or id.
  - `progress.ts` and `pages.ts`: onboarding progress and the page guide.
  - `Words.tsx`: animated text.
- Other frontend changes:
  - `components/support/chat.tsx`: the shared support conversation pieces, previously `ChatWidget.tsx`.
  - `lib/api.ts`: after a successful change it sends a data-free "done" event the helper can react to.
  - `components/pages/JobMonitor.tsx`: tells the helper when a watched search finishes.
  - Styles: the `helper-*` classes at the end of `app/globals.css`.
- Backend:
  - `services/helper_guide.py` and `routers/helper.py`.
  - The page context in `routers/support.py` and `services/support_bot.py`.
  - `routers/system.get_user_settings` now survives two first requests creating the settings row at the same moment.

## 6. Tests

- Backend: 163 passed on SQLite and PostgreSQL 16, including 14 helper tests:
  - page matching
  - the whole guide in one request
  - progress per customer
  - "explain this page", "what next" and "show me how"
  - walkthrough suggestions
  - financial requests still going to a person
  - unchanged behaviour without context
  - AI-mode context listing only real pages
  - out-of-date articles corrected while edited ones are kept
  - the settings-row race
  - every suggested question on every page getting its own answer
- Browser: 149 passed, 0 failed, on two consecutive full runs. The 20 helper checks cover:
  - one launcher instead of two, and the frames being served
  - the first-visit greeting, and the introduction not repeating
  - starting a walkthrough, the spotlight on the real link with him beside it, previous and skip
  - the panel knowing the page and explaining it
  - an answer's "Show me how" opening the right page and walkthrough
  - waiting for the real "Find Leads" click
  - progress saved to the account
  - the celebration with the real result count
  - the phone layout above the tab bar with no horizontal scroll
  - reduced motion
- Checked by hand in screenshots: desktop, iPhone, reduced motion, dozing off after 2 minutes and waking on a click,
  and tips waiting while a page modal is open.
- Found and fixed while testing:
  - Moving buttons couldn't be clicked reliably. The click target is now still.
  - The spotlight didn't follow layout changes.
  - A tip covered a page modal.
  - Loading the page guide on every navigation used up the API rate limit during fast browsing. The guide is now
    loaded once per session.
  - A race when creating the settings row.
  - The suggested question “How do I connect my email?” was answered with the AI Connect article. Suggested questions
    now have written answers.
