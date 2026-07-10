-- Migration 0047: Add counts_as_port to mapping_edges
ALTER TABLE mapping_edges ADD COLUMN counts_as_port INTEGER DEFAULT 0;
