-- Migration 0048: Create Inventory Tables

CREATE TABLE inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT, -- e.g., 'backbone', 'client', 'tools'
    quantity INTEGER NOT NULL DEFAULT 0,
    unit TEXT, -- e.g., 'meter', 'pcs', 'box'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'in', 'out'
    quantity INTEGER NOT NULL,
    reference TEXT, -- e.g., "Pemasangan Client A"
    notes TEXT,
    created_by TEXT, -- For audit
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);
