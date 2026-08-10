-- Property-scope every punch and break through deployment migration, never a kiosk request.
ALTER TABLE time_entries RENAME TO time_entries_legacy_0054;
CREATE TABLE time_entries (
  id TEXT PRIMARY KEY NOT NULL,organization_id TEXT NOT NULL,property_id TEXT,user_email TEXT NOT NULL,
  clock_in_at TEXT NOT NULL,clock_out_at TEXT,clock_in_ip TEXT DEFAULT '' NOT NULL,
  clock_out_ip TEXT DEFAULT '' NOT NULL,location_name TEXT DEFAULT '' NOT NULL,note TEXT DEFAULT '' NOT NULL,
  status TEXT DEFAULT 'open' NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
INSERT INTO time_entries
  (id,organization_id,property_id,user_email,clock_in_at,clock_out_at,clock_in_ip,clock_out_ip,location_name,note,status,created_at,updated_at)
SELECT id,organization_id,(SELECT p.id FROM property_contexts p WHERE p.organization_id=time_entries_legacy_0054.organization_id ORDER BY CASE WHEN p.code='WG-SALINA' THEN 0 ELSE 1 END,p.created_at LIMIT 1),
  user_email,clock_in_at,clock_out_at,clock_in_ip,clock_out_ip,location_name,note,status,created_at,updated_at
FROM time_entries_legacy_0054;
DROP TABLE time_entries_legacy_0054;

ALTER TABLE time_breaks RENAME TO time_breaks_legacy_0054;
CREATE TABLE time_breaks (
  id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,property_id TEXT,time_entry_id TEXT NOT NULL,
  user_email TEXT NOT NULL,break_type TEXT NOT NULL DEFAULT 'REST',started_at TEXT NOT NULL,
  ended_at TEXT,status TEXT NOT NULL DEFAULT 'OPEN',created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
INSERT INTO time_breaks
  (id,organization_id,property_id,time_entry_id,user_email,break_type,started_at,ended_at,status,created_at,updated_at)
SELECT id,organization_id,(SELECT p.id FROM property_contexts p WHERE p.organization_id=time_breaks_legacy_0054.organization_id ORDER BY CASE WHEN p.code='WG-SALINA' THEN 0 ELSE 1 END,p.created_at LIMIT 1),
  time_entry_id,user_email,break_type,started_at,ended_at,status,created_at,updated_at
FROM time_breaks_legacy_0054;
DROP TABLE time_breaks_legacy_0054;
CREATE INDEX IF NOT EXISTS time_entries_property_scope_idx
  ON time_entries(organization_id, property_id, user_email, clock_in_at);
CREATE INDEX IF NOT EXISTS time_breaks_property_scope_idx
  ON time_breaks(organization_id, property_id, user_email, started_at);
