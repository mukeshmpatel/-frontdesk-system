DROP INDEX IF EXISTS website_factory_variant_group_idx;
ALTER TABLE website_factory_projects DROP COLUMN research_sources_json;
ALTER TABLE website_factory_projects DROP COLUMN variant_label;
ALTER TABLE website_factory_projects DROP COLUMN variant_group_id;
