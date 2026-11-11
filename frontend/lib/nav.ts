import { BarChart3, Bot, Rocket, BrainCircuit, CreditCard, Database, Globe2, KeyRound, LayoutDashboard, LifeBuoy, ListChecks, Megaphone, Plug, Radar, Search, Settings, ShieldCheck, Sparkles, Target, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; label: string; short: string; icon: LucideIcon; blurb: string; group: "Discover" | "Organise" | "Intelligence" | "Workspace"; staffOnly?: boolean }
/** The 16 TubeLead modules. */
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard, blurb: "Your day at a glance", group: "Discover" },
  { href: "/growth", label: "Growth Assistant", short: "Grow", icon: Rocket, blurb: "Find customers, build and launch campaigns", group: "Discover" },
  { href: "/lead-generator", label: "Lead Generator", short: "Generate", icon: Target, blurb: "Configure & launch discovery", group: "Discover" },
  { href: "/discovery-engine", label: "Discovery Engine", short: "Discovery", icon: Radar, blurb: "Live jobs, queue & quota", group: "Discover" },
  { href: "/creator-intelligence", label: "Creator Intelligence", short: "Creators", icon: Globe2, blurb: "Map, niches & profiles", group: "Discover" },
  { href: "/lead-database", label: "Lead Database", short: "Database", icon: Database, blurb: "Every creator record", group: "Organise" },
  { href: "/contact-finder", label: "Contact Finder", short: "Contacts", icon: Sparkles, blurb: "Public business routes", group: "Organise" },
  { href: "/saved-searches", label: "Saved Searches", short: "Saved", icon: Search, blurb: "Reusable & scheduled discovery", group: "Organise" },
  { href: "/campaigns", label: "Campaign Manager", short: "Campaigns", icon: Megaphone, blurb: "Group leads into campaigns", group: "Organise" },
  { href: "/automation", label: "Automation Centre", short: "Automation", icon: Bot, blurb: "Schedules & webhooks", group: "Intelligence" },
  { href: "/ai-connect", label: "AI Connect", short: "AI", icon: BrainCircuit, blurb: "Bring your own AI provider", group: "Intelligence" },
  { href: "/ai-tasks", label: "AI Task Manager", short: "AI tasks", icon: ListChecks, blurb: "Route tasks to providers", group: "Intelligence" },
  { href: "/analytics", label: "Analytics", short: "Analytics", icon: BarChart3, blurb: "Performance & reports", group: "Intelligence" },
  { href: "/integrations", label: "Integrations", short: "Integrations", icon: Plug, blurb: "Connected services", group: "Workspace" },
  { href: "/api-management", label: "API Management", short: "API", icon: KeyRound, blurb: "Keys & usage", group: "Workspace" },
  { href: "/billing", label: "Billing & Subscription", short: "Billing", icon: CreditCard, blurb: "Plan, usage & invoices", group: "Workspace" },
  { href: "/settings", label: "Account Settings", short: "Settings", icon: Settings, blurb: "Profile & preferences", group: "Workspace" },
  { href: "/support", label: "Help & Support", short: "Support", icon: LifeBuoy, blurb: "Your requests to the team", group: "Workspace" },
  { href: "/admin", label: "Admin", short: "Admin", icon: ShieldCheck, blurb: "Customers, support & system", group: "Workspace", staffOnly: true },
];

export const isStaff = (role?: string) => role === "support" || role === "admin" || role === "operator";
export const PRIMARY_MOBILE = ["/dashboard", "/lead-generator", "/lead-database", "/campaigns"];
