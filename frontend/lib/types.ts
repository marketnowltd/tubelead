export interface ContactRoute {
  id: string; creator_id: string; kind: "email" | "website" | "contact_page" | "social"; value: string; platform: string | null;
  source: string; source_url: string | null; status: "published" | "unverified" | "verified"; confidence: number;
  website_status: string | null; mx_valid: boolean | null; checked_at: string | null; discovered_at: string; is_demo: boolean;
  creator?: { id: string; title: string; thumbnail_url: string | null; niche: string; country: string | null };
}
export interface Creator {
  id: string; youtube_channel_id: string; title: string; handle: string | null; thumbnail_url: string | null; channel_url: string;
  subscriber_count: number | null; video_count: number; view_count: number; country: string | null; niche: string; creator_type: string;
  avg_views: number | null; engagement_rate: number | null; last_upload_at: string | null; activity: "active" | "moderate" | "dormant" | "unknown";
  website: string | null; contact_page: string | null; website_status: string; qualification_score: number;
  verification_status: "none" | "unverified" | "published" | "verified"; outreach_status: "new" | "contacted" | "replied" | "converted";
  campaign_id: string | null; campaign_name: string | null; discovered_at: string; is_demo: boolean;
  public_email: string | null; email_status: string | null; contact_count: number; contact_status?: string;
  description?: string; score_breakdown?: Record<string, number>; contacts?: ContactRoute[];
}
export interface Paged<T> { items: T[]; total: number; page: number; page_size: number }
export interface Job {
  id: string; mode: string; params: Record<string, any>; status: "queued" | "running" | "paused" | "completed" | "failed" | "cancelling" | "cancelled";
  current_operation: string; queries_total: number; queries_done: number; channels_found: number; unique_found: number;
  duplicates_removed: number; failed_requests: number; contact_routes_found: number; keywords_done: number; qualified: number; rejected: number; enrich_total: number; enriched: number; quota_used: number;
  error: string | null; log: string[]; eta_seconds: number | null; is_demo: boolean; created_at: string; started_at: string | null; finished_at: string | null;
}
export interface Campaign {
  id: string; name: string; description: string; status: "draft" | "active" | "paused" | "completed"; target_niche: string | null;
  target_countries: string[]; is_demo: boolean; created_at: string; leads: number; new: number; contacted: number; replied: number;
  converted: number; avg_score: number; reply_rate: number;
}
export interface SavedSearch { id: string; name: string; params: Record<string, any>; schedule: string; next_run_at: string | null; last_run_at: string | null; last_job_id: string | null; run_count: number; created_at: string }
export interface SavedView { id: string; name: string; filters: Record<string, any>; created_at: string }
export interface Status {
  youtube_configured: boolean; quota: { used: number; daily_limit: number; reserve: number }; database: string; auth_mode: string;
  redis_configured: boolean; n8n_configured: boolean; environment: string; scheduler_enabled: boolean;
  plan: { id: string; label: string; leads: number; lead_period: "month" | "lifetime"; max_jobs_per_day: number; features: Record<string, boolean>; leads_used: number; at_limit: boolean };
  profile: { display_name: string; email: string }; demo_count: number; real_count: number;
}
export interface Overview {
  kpis: { total: number; qualified: number; with_email: number; with_route: number; active_campaigns: number; avg_score: number };
  trend: { date: string; discovered: number; qualified: number }[];
  countries: { country: string; count: number; avg_score: number }[];
  niches: { niche: string; count: number }[];
  search_performance: { id: string; label: string; mode: string; found: number; unique: number; qualified: number; quota: number; conversion: number; status: string }[];
  avg_conversion: number;
  quota: { today: number; daily_limit: number; week: { date: string; units: number }[] };
  campaigns: { id: string; name: string; status: string; leads: number; contacted: number; replied: number; converted: number; reply_rate: number }[];
  email_status: { published: number; unverified: number; verified: number };
}
export interface ActivityItem { id: string; kind: string; message: string; is_demo: boolean; created_at: string }
export interface Integration { id: string; name: string; category: string; connected: boolean; detail: string; configurable: boolean }
export interface ApiKeyRow { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null; secret?: string }

export interface AIProviderRow { id: string; provider: string; provider_label: string; label: string; base_url: string; has_key: boolean; key_hint: string | null; model: string; is_default: boolean; status: "untested" | "connected" | "error" | "disabled"; last_error: string | null; last_tested_at: string | null; created_at: string }
export interface AICatalog { providers: { id: string; label: string; base_url: string; needs_key: boolean; default_model: string; docs: string; note: string }[]; tasks: { id: string; label: string; blurb: string }[]; subscription_notice: string }
export interface AITask { task: string; label: string; blurb: string; enabled: boolean; provider_id: string | null; fallback_provider_id: string | null; effective_provider_id: string | null }
export interface AIUsage { days: number; requests: number; errors: number; tokens: number; cost_usd_estimate: number; cost_note: string; by_provider: Record<string, { requests: number; errors: number; tokens: number; cost_usd: number }>; by_task: Record<string, { requests: number; errors: number; tokens: number; cost_usd: number }>; recent: { id: string; task: string; provider: string; model: string; ok: boolean; error: string | null; tokens: number; cost_usd: number | null; latency_ms: number; attempts: number; created_at: string }[] }
export interface BillingPlan { id: string; label: string; tagline: string; price_monthly_gbp: number; price_annual_gbp: number; leads: number; lead_period: "month" | "lifetime"; max_jobs_per_day: number; team_seats: number; features: Record<string, boolean>; feature_labels: Record<string, string>; purchasable: boolean }
export interface Billing {
  stripe_configured: boolean; webhook_configured: boolean; plan_override: string | null; publishable_key: string | null; current_plan: string;
  subscription: { status: string; plan: string; interval: string; cancel_at_period_end: boolean; current_period_end: string | null; last_payment_status: string | null; has_customer: boolean };
  usage: { plan: string; leads_allowance: number; leads_used: number; leads_remaining: number; period: string; at_limit: boolean };
  plans: BillingPlan[];
}
