-- Guided, human-confirmed custom domain connection for Website Factory
-- projects. AAIQ never modifies a real external DNS zone automatically --
-- it generates the exact records to add and verifies them with a real
-- DNS-over-HTTPS lookup once the human confirms they've added them.
CREATE TABLE IF NOT EXISTS website_domain_connections(
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  target_hostname TEXT NOT NULL,
  verification_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AWAITING_DNS' CHECK(status IN('AWAITING_DNS','VERIFIED','FAILED')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  verified_at TEXT,
  last_checked_at TEXT,
  last_check_error TEXT,
  UNIQUE(organization_id,domain)
);
CREATE INDEX IF NOT EXISTS website_domain_connections_project_idx ON website_domain_connections(organization_id,project_id);
