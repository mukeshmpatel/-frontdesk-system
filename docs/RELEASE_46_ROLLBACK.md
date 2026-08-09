# Release 46 rollback

## Source rollback

Deploy the preserved Release 45 checkpoint/source commit `9143b54`.

## Days Inn reconciliation rollback

Before applying a reconciliation, AAIQ stores the original asset-root property binding and Website
Factory project binding in `property_reconciliation_plans.rollback_json`.

An authorized administrator can restore:

1. `website_factory_projects.property_context_id` to the stored prior value.
2. `property_assets.property_id` for the source root and descendants to the stored prior value.
3. the created `property_assignments` row.
4. the canonical `property_contexts` row only after verifying no operational records reference it.

Rollback must append `ROLLBACK_STARTED` and `ROLLBACK_COMPLETED` reconciliation audit entries. It must
never delete asset IDs, attachments, website revisions, or historical audit entries.

## Database safety

The R46 migration adds nullable columns, indexes, and new tables. Source rollback does not require
dropping them. Retaining additive schema is safer and preserves audit/reconciliation history.
