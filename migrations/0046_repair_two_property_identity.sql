-- Repair the comparison property identity created before the pilot's canonical
-- property rules were enforced. This preserves the property id, assignments,
-- launch tasks, reports, and audit history while correcting shared master data.
UPDATE property_contexts
SET code = 'DI-SALINA-SOUTH',
    address = '632 Westport Blvd, Salina, KS 67401',
    timezone = 'America/Chicago',
    updated_at = datetime('now')
WHERE code = 'DAYS-INN-SALINA-SOUT'
  AND lower(name) LIKE '%days inn%salina%south%'
  AND NOT EXISTS (
    SELECT 1 FROM property_contexts canonical
    WHERE canonical.organization_id = property_contexts.organization_id
      AND canonical.code = 'DI-SALINA-SOUTH'
      AND canonical.id <> property_contexts.id
  );

UPDATE property_contexts
SET address = '632 Westport Blvd, Salina, KS 67401',
    timezone = 'America/Chicago',
    updated_at = datetime('now')
WHERE lower(name) LIKE '%days inn%salina%south%'
   OR code IN ('DI-SALINA-SOUTH', 'DAYS-INN-SALINA-SOUT');
