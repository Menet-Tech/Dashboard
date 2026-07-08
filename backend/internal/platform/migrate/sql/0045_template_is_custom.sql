-- Migration 0045: Add is_custom flag to template_wa
-- When is_custom = 1, the billing notification renderer uses the template content
-- instead of the hardcoded builder. Set to 0 for all existing templates
-- (they are the system defaults).

ALTER TABLE template_wa ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0;
