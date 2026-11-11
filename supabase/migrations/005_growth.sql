-- TubeLead — Growth Assistant, Creative Studio and outreach. Mirrors backend/app/models.py (keep in sync).
-- Generated from the SQLAlchemy models, then reviewed. Row Level Security: customers may read only their own rows
-- through the public API; nothing is writable through it. Secrets in provider_connections are encrypted by the backend.

CREATE TABLE IF NOT EXISTS growth_sessions (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	step INTEGER NOT NULL, 
	description TEXT NOT NULL, 
	business JSON NOT NULL, 
	discovery JSON NOT NULL, 
	enrichment JSON NOT NULL, 
	document_id UUID, 
	campaign_id UUID, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_growth_sessions_created_at ON growth_sessions (created_at);
CREATE INDEX IF NOT EXISTS ix_growth_sessions_owner_id ON growth_sessions (owner_id);

CREATE TABLE IF NOT EXISTS prospects (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	session_id UUID, 
	dedupe_key VARCHAR(200) NOT NULL, 
	name VARCHAR(300) NOT NULL, 
	website TEXT, 
	domain VARCHAR(200), 
	platform VARCHAR(32) NOT NULL, 
	sources JSON NOT NULL, 
	source_url TEXT, 
	description TEXT NOT NULL, 
	industry VARCHAR(120) NOT NULL, 
	location VARCHAR(120) NOT NULL, 
	image_url TEXT, 
	audience_size BIGINT, 
	score INTEGER NOT NULL, 
	score_breakdown JSON NOT NULL, 
	classification VARCHAR(24) NOT NULL, 
	selected BOOLEAN NOT NULL, 
	saved BOOLEAN NOT NULL, 
	removed BOOLEAN NOT NULL, 
	enrichment_status VARCHAR(16) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES growth_sessions (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_prospects_created_at ON prospects (created_at);
CREATE INDEX IF NOT EXISTS ix_prospects_domain ON prospects (domain);
CREATE INDEX IF NOT EXISTS ix_prospects_owner_id ON prospects (owner_id);
CREATE INDEX IF NOT EXISTS ix_prospects_score ON prospects (score);
CREATE INDEX IF NOT EXISTS ix_prospects_selected ON prospects (selected);
CREATE INDEX IF NOT EXISTS ix_prospects_session_id ON prospects (session_id);

CREATE TABLE IF NOT EXISTS prospect_contacts (
	id UUID NOT NULL, 
	prospect_id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	first_name VARCHAR(120) NOT NULL, 
	last_name VARCHAR(120) NOT NULL, 
	position VARCHAR(160) NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	personal BOOLEAN NOT NULL, 
	source VARCHAR(32) NOT NULL, 
	source_url TEXT, 
	checked_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_prospect_contact_email UNIQUE (prospect_id, email), 
	FOREIGN KEY(prospect_id) REFERENCES prospects (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_prospect_contacts_owner_id ON prospect_contacts (owner_id);
CREATE INDEX IF NOT EXISTS ix_prospect_contacts_prospect_id ON prospect_contacts (prospect_id);

CREATE TABLE IF NOT EXISTS email_documents (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	subject VARCHAR(300) NOT NULL, 
	preheader VARCHAR(300) NOT NULL, 
	doc JSON NOT NULL, 
	editor_mode VARCHAR(8) NOT NULL, 
	version INTEGER NOT NULL, 
	html TEXT NOT NULL, 
	text TEXT NOT NULL, 
	last_check JSON NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_email_documents_owner_id ON email_documents (owner_id);
CREATE INDEX IF NOT EXISTS ix_email_documents_updated_at ON email_documents (updated_at);

CREATE TABLE IF NOT EXISTS email_document_versions (
	id UUID NOT NULL, 
	document_id UUID NOT NULL, 
	version INTEGER NOT NULL, 
	subject VARCHAR(300) NOT NULL, 
	doc JSON NOT NULL, 
	note VARCHAR(200) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(document_id) REFERENCES email_documents (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_email_document_versions_document_id ON email_document_versions (document_id);

CREATE TABLE IF NOT EXISTS email_templates (
	id UUID NOT NULL, 
	owner_id UUID, 
	category VARCHAR(40) NOT NULL, 
	name VARCHAR(160) NOT NULL, 
	subject VARCHAR(300) NOT NULL, 
	doc JSON NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_email_templates_category ON email_templates (category);
CREATE INDEX IF NOT EXISTS ix_email_templates_owner_id ON email_templates (owner_id);

CREATE TABLE IF NOT EXISTS brand_kits (
	owner_id UUID NOT NULL, 
	data JSON NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (owner_id)
);

CREATE TABLE IF NOT EXISTS email_assets (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	filename VARCHAR(200) NOT NULL, 
	content_type VARCHAR(40) NOT NULL, 
	size INTEGER NOT NULL, 
	width INTEGER, 
	height INTEGER, 
	data BYTEA NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_email_assets_owner_id ON email_assets (owner_id);

CREATE TABLE IF NOT EXISTS outreach_campaigns (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	session_id UUID, 
	name VARCHAR(200) NOT NULL, 
	document_id UUID NOT NULL, 
	document_version INTEGER, 
	status VARCHAR(16) NOT NULL, 
	approval JSON NOT NULL, 
	provider VARCHAR(16) NOT NULL, 
	provider_ref JSON NOT NULL, 
	metrics JSON NOT NULL, 
	error TEXT NOT NULL, 
	launched_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(document_id) REFERENCES email_documents (id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_outreach_campaigns_created_at ON outreach_campaigns (created_at);
CREATE INDEX IF NOT EXISTS ix_outreach_campaigns_owner_id ON outreach_campaigns (owner_id);
CREATE INDEX IF NOT EXISTS ix_outreach_campaigns_status ON outreach_campaigns (status);

CREATE TABLE IF NOT EXISTS campaign_recipients (
	id UUID NOT NULL, 
	campaign_id UUID NOT NULL, 
	prospect_id UUID, 
	email VARCHAR(255) NOT NULL, 
	eligibility VARCHAR(16) NOT NULL, 
	reason TEXT NOT NULL, 
	provider_status VARCHAR(24) NOT NULL, 
	variables JSON NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_campaign_recipient UNIQUE (campaign_id, email), 
	FOREIGN KEY(campaign_id) REFERENCES outreach_campaigns (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_campaign_recipients_campaign_id ON campaign_recipients (campaign_id);

CREATE TABLE IF NOT EXISTS suppressions (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	reason VARCHAR(32) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_suppression UNIQUE (owner_id, email)
);
CREATE INDEX IF NOT EXISTS ix_suppressions_owner_id ON suppressions (owner_id);

CREATE TABLE IF NOT EXISTS outreach_replies (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	campaign_id UUID, 
	external_id VARCHAR(120), 
	from_email VARCHAR(255) NOT NULL, 
	subject VARCHAR(300) NOT NULL, 
	body TEXT NOT NULL, 
	classification VARCHAR(24) NOT NULL, 
	classified_by VARCHAR(8) NOT NULL, 
	suggested_response TEXT NOT NULL, 
	response_status VARCHAR(16) NOT NULL, 
	received_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_outreach_replies_campaign_id ON outreach_replies (campaign_id);
CREATE INDEX IF NOT EXISTS ix_outreach_replies_classification ON outreach_replies (classification);
CREATE INDEX IF NOT EXISTS ix_outreach_replies_owner_id ON outreach_replies (owner_id);
CREATE INDEX IF NOT EXISTS ix_outreach_replies_received_at ON outreach_replies (received_at);

CREATE TABLE IF NOT EXISTS business_results (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	campaign_id UUID, 
	kind VARCHAR(16) NOT NULL, 
	amount_pence INTEGER NOT NULL, 
	note TEXT NOT NULL, 
	occurred_on DATE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_business_results_owner_id ON business_results (owner_id);

CREATE TABLE IF NOT EXISTS provider_connections (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	provider VARCHAR(16) NOT NULL, 
	client_id_enc TEXT NOT NULL, 
	client_secret_enc TEXT NOT NULL, 
	settings JSON NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	last_error TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_provider_connection UNIQUE (owner_id, provider)
);
CREATE INDEX IF NOT EXISTS ix_provider_connections_owner_id ON provider_connections (owner_id);

CREATE TABLE IF NOT EXISTS usage_events (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	kind VARCHAR(24) NOT NULL, 
	units INTEGER NOT NULL, 
	provider VARCHAR(24) NOT NULL, 
	provider_cost_pence FLOAT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_usage_events_created_at ON usage_events (created_at);
CREATE INDEX IF NOT EXISTS ix_usage_events_kind ON usage_events (kind);
CREATE INDEX IF NOT EXISTS ix_usage_events_owner_id ON usage_events (owner_id);

CREATE TABLE IF NOT EXISTS plan_configs (
	plan_id VARCHAR(16) NOT NULL, 
	data JSON NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (plan_id)
);

-- Row Level Security
alter table growth_sessions enable row level security;
alter table prospects enable row level security;
alter table prospect_contacts enable row level security;
alter table email_documents enable row level security;
alter table email_document_versions enable row level security;
alter table email_templates enable row level security;
alter table brand_kits enable row level security;
alter table email_assets enable row level security;
alter table outreach_campaigns enable row level security;
alter table campaign_recipients enable row level security;
alter table suppressions enable row level security;
alter table outreach_replies enable row level security;
alter table business_results enable row level security;
alter table provider_connections enable row level security;
alter table usage_events enable row level security;
alter table plan_configs enable row level security;
drop policy if exists growth_sessions_own on growth_sessions;
create policy growth_sessions_own on growth_sessions for select to authenticated using (owner_id = auth.uid());
drop policy if exists prospects_own on prospects;
create policy prospects_own on prospects for select to authenticated using (owner_id = auth.uid());
drop policy if exists prospect_contacts_own on prospect_contacts;
create policy prospect_contacts_own on prospect_contacts for select to authenticated using (owner_id = auth.uid());
drop policy if exists email_documents_own on email_documents;
create policy email_documents_own on email_documents for select to authenticated using (owner_id = auth.uid());
drop policy if exists email_templates_own on email_templates;
create policy email_templates_own on email_templates for select to authenticated using (owner_id = auth.uid());
drop policy if exists brand_kits_own on brand_kits;
create policy brand_kits_own on brand_kits for select to authenticated using (owner_id = auth.uid());
drop policy if exists outreach_campaigns_own on outreach_campaigns;
create policy outreach_campaigns_own on outreach_campaigns for select to authenticated using (owner_id = auth.uid());
drop policy if exists suppressions_own on suppressions;
create policy suppressions_own on suppressions for select to authenticated using (owner_id = auth.uid());
drop policy if exists outreach_replies_own on outreach_replies;
create policy outreach_replies_own on outreach_replies for select to authenticated using (owner_id = auth.uid());
drop policy if exists business_results_own on business_results;
create policy business_results_own on business_results for select to authenticated using (owner_id = auth.uid());
drop policy if exists usage_events_own on usage_events;
create policy usage_events_own on usage_events for select to authenticated using (owner_id = auth.uid());
drop policy if exists email_document_versions_own on email_document_versions;
create policy email_document_versions_own on email_document_versions for select to authenticated
  using (exists (select 1 from email_documents d where d.id = document_id and d.owner_id = auth.uid()));
-- provider_connections (encrypted credentials), email_assets (served by the backend), campaign_recipients and plan_configs:
-- no public policies, so they are not readable through the public API at all.
