/** Fictional creators used ONLY by the public marketing demo. They are not real channels and are always labelled "sample". */
export interface SampleCreator {
  id: string; name: string; niche: string; country: string; subs: number; score: number; activity: "active" | "moderate" | "dormant";
  contact: "publicly_published" | "website" | "contact_form" | "none"; tone: string; engagement: number;
}
export const SAMPLE: SampleCreator[] = [
  { id: "s1", name: "Northline Fitness", niche: "Fitness", country: "GB", subs: 48200, score: 91, activity: "active", contact: "publicly_published", tone: "#244A3A", engagement: 6.4 },
  { id: "s2", name: "Pixel & Pan", niche: "Food", country: "US", subs: 126000, score: 84, activity: "active", contact: "website", tone: "#A5502F", engagement: 4.1 },
  { id: "s3", name: "Lowtide Sailing", niche: "Travel", country: "AU", subs: 23700, score: 77, activity: "moderate", contact: "contact_form", tone: "#536A4B", engagement: 5.2 },
  { id: "s4", name: "Quiet Circuits", niche: "Tech", country: "GB", subs: 88900, score: 88, activity: "active", contact: "publicly_published", tone: "#6B4E1B", engagement: 3.8 },
  { id: "s5", name: "Fold & Frame", niche: "Design", country: "DE", subs: 15400, score: 69, activity: "moderate", contact: "website", tone: "#37624F", engagement: 7.9 },
  { id: "s6", name: "Gridiron Gardens", niche: "Home & Garden", country: "US", subs: 61300, score: 73, activity: "active", contact: "none", tone: "#A5502F", engagement: 2.9 },
  { id: "s7", name: "Marlow Money", niche: "Finance", country: "GB", subs: 212000, score: 82, activity: "active", contact: "publicly_published", tone: "#244A3A", engagement: 3.3 },
  { id: "s8", name: "Tidy Tuesday Kitchen", niche: "Food", country: "CA", subs: 34800, score: 80, activity: "active", contact: "publicly_published", tone: "#7F6226", engagement: 5.7 },
  { id: "s9", name: "Atlas & Ash", niche: "Travel", country: "GB", subs: 9800, score: 58, activity: "dormant", contact: "none", tone: "#37624F", engagement: 4.4 },
  { id: "s10", name: "Bytes of Bakelite", niche: "Tech", country: "US", subs: 53100, score: 86, activity: "active", contact: "contact_form", tone: "#37624F", engagement: 4.9 },
  { id: "s11", name: "Studio Sundial", niche: "Design", country: "GB", subs: 27600, score: 79, activity: "moderate", contact: "publicly_published", tone: "#A5502F", engagement: 6.1 },
  { id: "s12", name: "Kettlebell Kate", niche: "Fitness", country: "GB", subs: 76400, score: 87, activity: "active", contact: "website", tone: "#536A4B", engagement: 5.5 },
];
export const CONTACT_LABEL: Record<SampleCreator["contact"], string> = {
  publicly_published: "Publicly published", website: "Website", contact_form: "Contact form", none: "No public route",
};
export const COUNTRY_NAME: Record<string, string> = { GB: "United Kingdom", US: "United States", AU: "Australia", DE: "Germany", CA: "Canada" };
export const NICHES = ["Fitness", "Food", "Tech", "Travel", "Design", "Finance", "Home & Garden"];
export const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "")}K` : String(n));
export const initialsOf = (n: string) => n.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
