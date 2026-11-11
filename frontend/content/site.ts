/**
 * HOMEPAGE CONTENT — the only place genuine customers, awards and reviews are listed.
 *
 * Rules (keep them, the site's honesty depends on them):
 * - CUSTOMERS: add a company ONLY when it has agreed in writing to be named. Add the logo file to /public/customers/.
 * - AWARDS: add an award ONLY when it is real, with its issuer and year. Leave the list empty otherwise.
 * - Reviews are NOT in this file. Customers submit them on the site, and an operator approves them in Settings.
 *
 * When this file is empty, the homepage shows industries and product strengths instead, and says so.
 */

export type Customer = { name: string; logo: string; url?: string };
export const CUSTOMERS: Customer[] = [];

export type Award = { title: string; issuer: string; year: string; url?: string };
export const AWARDS: Award[] = [];

/** Industries TubeLead helps you find creators in. Plain text, no brand logos. */
export const INDUSTRIES: { name: string; example: string }[] = [
  { name: "Fitness & wellness", example: "supplements, gyms, coaching, apparel" },
  { name: "Technology", example: "gadgets, software, apps, accessories" },
  { name: "Gaming", example: "hardware, peripherals, streaming tools" },
  { name: "Food & drink", example: "recipes, kitchen products, meal kits" },
  { name: "Beauty & fashion", example: "skincare, styling, clothing brands" },
  { name: "Business & finance", example: "software, courses, investment tools" },
  { name: "Travel & lifestyle", example: "hotels, travel gear, home products" },
  { name: "Education", example: "courses, learning tools, publishers" },
];

/** Where TubeLead finds creators. Only sources that are live are listed as live. */
export const SEARCH_SOURCES: { name: string; status: "live" | "planned"; detail: string }[] = [
  { name: "YouTube", status: "live", detail: "Public channels, videos and channel descriptions" },
  { name: "Google Search", status: "planned", detail: "Public web pages that mention a creator" },
  { name: "Reddit", status: "planned", detail: "Public posts and communities" },
  { name: "Twitch", status: "planned", detail: "Public streamer channels" },
  { name: "Spotify", status: "planned", detail: "Music artist profiles" },
  { name: "Last.fm", status: "planned", detail: "Music artist pages" },
  { name: "MusicBrainz", status: "planned", detail: "Open music artist records" },
];

/** Product strengths shown when there are no awards yet. These describe what the product really does. */
export const STRENGTHS: { title: string; detail: string }[] = [
  { title: "Duplicates removed automatically", detail: "Every creator is recorded once, however many searches find them." },
  { title: "Public contacts only", detail: "Only addresses the creator published themselves. Nothing is guessed or scraped from private sources." },
  { title: "Built around your quota", detail: "Each search has a limit, so the YouTube quota is never used up by surprise." },
  { title: "Pause, resume or cancel", detail: "Long searches can be controlled at any point, and progress is saved." },
  { title: "Creators, not big brands", detail: "Corporate and very large channels are left out by default." },
];
