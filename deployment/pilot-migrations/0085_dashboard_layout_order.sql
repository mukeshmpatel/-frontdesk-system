-- Personal dashboard ordering for the existing Quick Links preference layer
-- (db/home-adoption.ts, app/components/smart-quick-links.tsx). Additive only:
-- the canonical user_quick_link_preferences table remains authoritative for
-- personalization; this only adds explicit manual order so pinned cards can
-- be moved, not just pinned/hidden. Presentation only — never business state.
ALTER TABLE user_quick_link_preferences ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
