-- Migration 0044: Expand fiber_type values for mapping_edges
-- SQLite doesn't support ALTER TABLE ... MODIFY COLUMN, so we rebuild the table.
-- The new constraint adds: server_odc, server_odp, odc_odp, odp_ont, ont_ont, other

PRAGMA foreign_keys = OFF;

CREATE TABLE mapping_edges_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edge_id TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    fiber_type TEXT CHECK(fiber_type IS NULL OR fiber_type IN (
        'feeder', 'distribution', 'drop',
        'odp_to_odp', 'odp_to_odp_ratio',
        'odc_to_odc', 'odc_to_odc_ratio',
        'server_odc', 'server_odp',
        'odc_odp', 'odp_ont', 'ont_ont', 'other'
    )),
    distance REAL,
    waypoints TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source) REFERENCES mapping_nodes(node_id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES mapping_nodes(node_id) ON DELETE CASCADE
);

INSERT INTO mapping_edges_new
    SELECT id, edge_id, source, target,
           CASE fiber_type
               WHEN 'feeder' THEN 'feeder'
               WHEN 'distribution' THEN 'distribution'
               WHEN 'drop' THEN 'drop'
               ELSE NULL
           END,
           distance, waypoints, notes, created_at, updated_at
    FROM mapping_edges;

DROP TABLE mapping_edges;
ALTER TABLE mapping_edges_new RENAME TO mapping_edges;

CREATE INDEX IF NOT EXISTS idx_mapping_edges_source ON mapping_edges(source);
CREATE INDEX IF NOT EXISTS idx_mapping_edges_target ON mapping_edges(target);

PRAGMA foreign_keys = ON;
