-- AI-generated website option sets. Additive only: extends the existing
-- website_factory_projects table (drizzle/0017, property-scoped by
-- drizzle/0022) rather than creating a parallel projects table. A generated
-- batch of options shares a variant_group_id so a human can compare and
-- choose one; the existing single-PUBLISHED-per-property rule and the
-- existing DRAFT -> AWAITING_APPROVAL -> PUBLISHED flow in
-- updateWebsiteProject are both untouched.
ALTER TABLE website_factory_projects ADD COLUMN variant_group_id TEXT;
ALTER TABLE website_factory_projects ADD COLUMN variant_label TEXT;
ALTER TABLE website_factory_projects ADD COLUMN research_sources_json TEXT;
CREATE INDEX IF NOT EXISTS website_factory_variant_group_idx ON website_factory_projects(organization_id, variant_group_id);
