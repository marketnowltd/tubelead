export interface Business { campaign_name: string; product: string; audience: string; industry: string; location: string; customer_type: string; objective: string; opportunity: string; signals?: string[]; sources?: string[]; interpreted_by?: "rules" | "ai" }
export interface Stage { name: string; status: string; message?: string; count?: number }
export interface GrowthSession {
  id: string; step: number; description: string; business: Business;
  discovery: { status?: "queued" | "running" | "done" | "failed"; stage?: number; stages?: string[]; sources?: Stage[]; totals?: { found: number; duplicates_removed: number; excellent: number; good: number }; error?: string; query?: string };
  enrichment: { status?: "queued" | "running" | "done" | "failed"; done?: number; total?: number; credits_used?: { enrichment: number; verification: number }; snov?: string; snov_error?: string; error?: string };
  document_id: string | null; campaign_id: string | null; prospects: { total: number; selected: number; saved: number }; updated_at: string | null;
}
export interface Breakdown { points: number; max: number; basis: "fact" | "estimate" | "unknown"; evidence: string[] }
export interface Contact { email: string; first_name: string; last_name: string; position: string; status: "verified" | "risky" | "unverified" | "not_found"; personal: boolean; source: string; source_url: string | null; checked_at: string }
export interface Prospect {
  id: string; name: string; website: string | null; domain: string | null; platform: string; sources: string[]; source_url: string | null; description: string; industry: string; location: string;
  image_url: string | null; audience_size: number | null; score: number; classification: "excellent" | "good" | "low"; breakdown: Record<string, Breakdown>; contact_page: string | null;
  selected: boolean; saved: boolean; enrichment_status: string; contacts: Contact[]; contact_status: Contact["status"] | null;
}
export const CLASS_LABEL = { excellent: "Excellent opportunity", good: "Good match", low: "Low priority" } as const;
export const STATUS_LABEL = { verified: "Verified", risky: "Risky", unverified: "Unverified", not_found: "Not found" } as const;
export const BREAKDOWN_LABEL: Record<string, string> = { relevance: "Campaign relevance", suitability: "Customer suitability", activity: "Activity & engagement", contact: "Contact availability", signals: "Buying signals" };
export const STEPS = ["Business", "Discover", "Enrich", "Create", "Launch"] as const;
