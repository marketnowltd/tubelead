-- 006: customers send campaigns and test emails through their own email service (SMTP, SendGrid, Mailgun,
-- Postmark or Resend). Secrets are encrypted by the backend; the table has RLS with no public policies, so it is
-- reachable only through the backend.

CREATE TABLE IF NOT EXISTS sending_accounts (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	provider VARCHAR(16) NOT NULL, 
	label VARCHAR(120) NOT NULL, 
	from_name VARCHAR(120) NOT NULL, 
	from_email VARCHAR(255) NOT NULL, 
	reply_to VARCHAR(255) NOT NULL, 
	settings JSON NOT NULL, 
	secret_enc TEXT NOT NULL, 
	daily_limit INTEGER NOT NULL, 
	per_minute INTEGER NOT NULL, 
	is_default BOOLEAN NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	last_error TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_sending_accounts_owner_id ON sending_accounts (owner_id);

ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS send_error TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS message_id VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS sending_account_id UUID;
CREATE INDEX IF NOT EXISTS ix_campaign_recipients_sent_at ON campaign_recipients (sent_at);
CREATE INDEX IF NOT EXISTS ix_campaign_recipients_sending_account_id ON campaign_recipients (sending_account_id);

alter table sending_accounts enable row level security;
