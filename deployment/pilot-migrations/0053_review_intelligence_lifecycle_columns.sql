-- Complete the review lifecycle fields used by governed response and recovery workflows.
ALTER TABLE review_response_drafts RENAME TO review_response_drafts_legacy_0053;
CREATE TABLE review_response_drafts (
  id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,review_id TEXT NOT NULL UNIQUE,
  response_text TEXT NOT NULL,response_tone TEXT NOT NULL,model_label TEXT NOT NULL,
  status TEXT NOT NULL,approved_by TEXT,approved_at TEXT,posted_at TEXT,
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
INSERT INTO review_response_drafts
  (id,organization_id,review_id,response_text,response_tone,model_label,status,approved_by,approved_at,posted_at,created_at,updated_at)
SELECT id,organization_id,review_id,response_text,response_tone,model_label,status,approved_by,approved_at,NULL,created_at,updated_at
FROM review_response_drafts_legacy_0053;
DROP TABLE review_response_drafts_legacy_0053;

ALTER TABLE review_recovery_cases RENAME TO review_recovery_cases_legacy_0053;
CREATE TABLE review_recovery_cases (
  id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,review_id TEXT NOT NULL UNIQUE,
  priority TEXT NOT NULL,department TEXT NOT NULL,summary TEXT NOT NULL,status TEXT NOT NULL,
  owner_email TEXT,resolved_at TEXT,created_at TEXT NOT NULL
);
INSERT INTO review_recovery_cases
  (id,organization_id,review_id,priority,department,summary,status,owner_email,resolved_at,created_at)
SELECT id,organization_id,review_id,priority,department,summary,status,owner_email,NULL,created_at
FROM review_recovery_cases_legacy_0053;
DROP TABLE review_recovery_cases_legacy_0053;
