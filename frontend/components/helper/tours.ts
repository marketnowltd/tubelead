/** Walkthroughs. Each step points at a real element on the page, found by its accessible label, link, panel title or
 * id (see target.ts), so no layout changes were needed. Tour ids, titles and pages match the helper's page guide on
 * the server (backend/app/services/helper_guide.py). A step whose element isn't on screen (for example the sidebar
 * on a phone) is shown without the spotlight. */
import type { Pose } from "./sprites";

export interface Target { css?: string; link?: string; button?: RegExp; panel?: string; label?: string }
export interface Step { target?: Target; title: string; body: string; pose?: Pose; waitFor?: "click" }
export interface Tour { id: string; path: string; title: string; steps: Step[] }

export const TOURS: Record<string, Tour> = Object.fromEntries(([
  { id: "welcome", path: "/dashboard", title: "Tour of TubeLead", steps: [
    { title: "Welcome to TubeLead!", body: "I'll show you the main places in a few quick steps. You can stop at any time.", pose: "greeting" },
    { target: { link: "/growth" }, title: "Growth Assistant", body: "Describe what you sell and I'll help you find customers, write your email and launch the campaign, one step at a time." },
    { target: { link: "/lead-generator" }, title: "Lead Generator", body: "Search YouTube for creators in your niche. Searches run in the background using the official YouTube Data API." },
    { target: { link: "/lead-database" }, title: "Lead Database", body: "Every creator you find lands here. Filter, sort, open profiles, export, or assign them to a campaign." },
    { target: { link: "/contact-finder" }, title: "Contact Finder", body: "Publicly published business contact routes, with where each one came from and how much to trust it." },
    { target: { link: "/campaigns" }, title: "Campaign Manager", body: "Group your best creators into campaigns and track them through your outreach." },
    { title: "That's the tour!", body: "I'm always in the corner. Click me on any page for help, an explanation of the page, or a walkthrough.", pose: "success" },
  ] },
  { id: "lead-generator", path: "/lead-generator", title: "Run your first search", steps: [
    { target: { css: '[role="radiogroup"][aria-label="Search type"]' }, title: "Basic or Advanced", body: "Basic search asks for the essentials. Switch to Advanced search for plain-language parsing, discovery modes, regional targeting and filters." },
    { target: { label: "Search creators or niche" }, title: "What are you looking for?", body: "Type a niche, such as “budget travel”, and press Enter after each keyword." },
    { target: { label: "How many leads" }, title: "How many leads", body: "Choose how many creators to find. Searches never go over your plan's allowance." },
    { target: { label: "Big brands are left out" }, title: "Leave out big brands", body: "On by default, so you get independent creators rather than big media channels." },
    { target: { button: /^(find leads|generate leads)$/i }, title: "Start the search", body: "Press Find Leads when you're ready. I'll wait here.", waitFor: "click" },
    { title: "Your search is running", body: "Progress appears on this page. When it finishes, the creators are waiting in the Lead Database.", pose: "success" },
  ] },
  { id: "lead-database", path: "/lead-database", title: "Review your leads", steps: [
    { target: { label: "Search creators" }, title: "Search and filter", body: "Search by name, then narrow the list with the filters and sorting next to it." },
    { target: { label: "Select all on this page" }, title: "Select creators", body: "Tick creators to assign them to a campaign, set their outreach status, export or delete them." },
    { target: { css: "main table tbody tr" }, title: "Open a profile", body: "Click any row for the creator's full profile and their contact routes." },
    { target: { button: /^export/i }, title: "Export", body: "Download everything that matches your filters, or just the creators you selected, as a CSV file." },
    { target: { label: "Saved views" }, title: "Saved views", body: "Save a set of filters as a view and come back to it in one click." },
  ] },
  { id: "contact-finder", path: "/contact-finder", title: "How contact routes work", steps: [
    { target: { panel: "Creators by contact status" }, title: "Contact status", body: "Creators grouped by what kind of contact route was found for them." },
    { target: { panel: "Scan a creator" }, title: "Scan a creator", body: "Look a creator up to find routes they publish themselves: their channel description, website and public contact page." },
    { title: "Nothing is guessed", body: "Every route shows its source and a trust level. TubeLead never invents or guesses an address.", pose: "confident" },
  ] },
  { id: "campaigns", path: "/campaigns", title: "Organise a campaign", steps: [
    { target: { button: /^(new campaign|create your first campaign)$/i }, title: "Create a campaign", body: "Give it a name and you're ready to start grouping creators." },
    { target: { link: "/lead-database" }, title: "Add creators", body: "In the Lead Database, tick the creators you want and use “Assign to campaign”." },
    { title: "Track your outreach", body: "Each campaign shows its status and progress here. To send emails, use the Growth Assistant with your own email service.", pose: "explaining" },
  ] },
  { id: "settings", path: "/settings", title: "Find your settings", steps: [
    { target: { panel: "Profile" }, title: "Profile", body: "Your display name and email address." },
    { target: { panel: "Plan" }, title: "Plan", body: "A summary of your plan and usage. Manage it in Billing & Subscription." },
    { target: { panel: "Your email service" }, title: "Your email service", body: "Connect your own mailbox or email provider. Test emails and campaigns are sent from it, never from TubeLead." },
    { target: { panel: "Delete account" }, title: "Delete account", body: "Permanently removes your data. Cancel any paid plan first." },
  ] },
  { id: "growth", path: "/growth", title: "How the Growth Assistant works", steps: [
    { target: { label: "Growth Assistant progress" }, title: "Five steps", body: "Describe your business, find prospects, find contacts, create your email, then launch. Your progress is saved, so you can come back later." },
    { target: { css: "#biz-desc" }, title: "Start by describing your business", body: "Say what you sell and who you'd like to reach. I'll turn it into a campaign summary you can edit." },
    { target: { label: "Growth Assistant sections" }, title: "Replies and results", body: "Switch here to sort replies and record the results your campaigns bring in." },
  ] },
  { id: "home", path: "/", title: "A quick look around", steps: [
    { target: { css: "#how" }, title: "How it works", body: "Describe the creators you want, TubeLead searches official sources and shows their publicly published business contacts." },
    { target: { css: "#capabilities" }, title: "What you can do", body: "Discovery, scoring, contact routes, campaigns and analytics in one place." },
    { target: { css: "#pricing" }, title: "Plans and prices", body: "Start with the free trial and upgrade when you need more leads." },
    { target: { css: "#faq" }, title: "Questions?", body: "Common questions are answered here, and you can always ask me.", pose: "helpful" },
  ] },
] as Tour[]).map((t) => [t.id, t]));
