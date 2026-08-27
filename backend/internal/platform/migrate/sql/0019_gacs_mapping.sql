CREATE TABLE IF NOT EXISTS map_settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    center_lat TEXT DEFAULT '-6.2088',
    center_lng TEXT DEFAULT '106.8456',
    max_zoom_in TEXT DEFAULT '18',
    max_zoom_out TEXT DEFAULT '5',
    default_zoom TEXT DEFAULT '13',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mapping_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('server', 'odc', 'odp', 'ont')),
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    capacity INTEGER,
    splitter TEXT,
    pppoe TEXT,
    serialnumber TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mapping_nodes_node_id ON mapping_nodes(node_id);
CREATE INDEX IF NOT EXISTS idx_mapping_nodes_type ON mapping_nodes(type);

CREATE TABLE IF NOT EXISTS mapping_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edge_id TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    fiber_type TEXT CHECK(fiber_type IN ('feeder', 'distribution', 'drop', 'odp_to_odp', 'odp_to_odp_ratio', 'odc_to_odc', 'odc_to_odc_ratio')),
    distance REAL,
    waypoints TEXT, -- JSON string array of coordinate pairs
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source) REFERENCES mapping_nodes(node_id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES mapping_nodes(node_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mapping_edges_source ON mapping_edges(source);
CREATE INDEX IF NOT EXISTS idx_mapping_edges_target ON mapping_edges(target);

-- Seed initial map settings
INSERT OR IGNORE INTO map_settings (id, center_lat, center_lng, max_zoom_in, max_zoom_out, default_zoom)
VALUES (1, '-6.2088', '106.8456', '18', '5', '13');
