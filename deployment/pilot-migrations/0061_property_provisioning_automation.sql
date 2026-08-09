-- AAIQ property provisioning: every property receives one protected administrator seat.
-- The seat can be reassigned by an audited administrator workflow, but it cannot be deleted.
CREATE TABLE IF NOT EXISTS protected_property_administrators (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','REASSIGNMENT_REQUIRED')),
  provisioned_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(organization_id,property_id),
  UNIQUE(organization_id,property_id,user_email)
);

CREATE INDEX IF NOT EXISTS protected_property_admin_user_idx
  ON protected_property_administrators(organization_id,user_email,status);

CREATE TRIGGER IF NOT EXISTS prevent_protected_property_admin_delete
BEFORE DELETE ON staff_members
WHEN EXISTS (
  SELECT 1 FROM protected_property_administrators a
  WHERE a.organization_id=OLD.organization_id
    AND lower(a.user_email)=lower(OLD.user_email)
    AND a.status='ACTIVE'
)
BEGIN
  SELECT RAISE(ABORT,'Protected property administrator cannot be deleted; reassign the property administrator first.');
END;
