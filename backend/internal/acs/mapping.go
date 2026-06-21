package acs

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type MapSettings struct {
	ID          int64  `json:"id"`
	CenterLat   string `json:"center_lat"`
	CenterLng   string `json:"center_lng"`
	MaxZoomIn   string `json:"max_zoom_in"`
	MaxZoomOut  string `json:"max_zoom_out"`
	DefaultZoom string `json:"default_zoom"`
	CreatedAt   string `json:"created_at,omitempty"`
	UpdatedAt   string `json:"updated_at,omitempty"`
}

type MappingNode struct {
	ID           int64   `json:"id,omitempty"`
	NodeID       string  `json:"node_id"`
	Type         string  `json:"type"` // 'server', 'odc', 'odp', 'ont'
	Name         string  `json:"name"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	Capacity     *int    `json:"capacity,omitempty"`
	Splitter     *string `json:"splitter,omitempty"`
	Pppoe        *string `json:"pppoe,omitempty"`
	SerialNumber *string `json:"serialnumber,omitempty"`
	Notes        *string `json:"notes,omitempty"`
	CreatedAt    string  `json:"created_at,omitempty"`
	UpdatedAt    string  `json:"updated_at,omitempty"`
}

type MappingEdge struct {
	ID        int64           `json:"id,omitempty"`
	EdgeID    string          `json:"edge_id"`
	Source    string          `json:"source"`
	Target    string          `json:"target"`
	FiberType *string         `json:"fiber_type,omitempty"` // 'feeder', 'distribution', 'drop', etc.
	Distance  *float64        `json:"distance,omitempty"`
	Waypoints json.RawMessage `json:"waypoints,omitempty"` // coordinates JSON string
	Notes     *string         `json:"notes,omitempty"`
	CreatedAt string          `json:"created_at,omitempty"`
	UpdatedAt string          `json:"updated_at,omitempty"`
}

// GetMapSettings retrieves the Leaflet map configuration.
func GetMapSettings(ctx context.Context, db *sql.DB) (*MapSettings, error) {
	row := db.QueryRowContext(ctx, "SELECT id, center_lat, center_lng, max_zoom_in, max_zoom_out, default_zoom, created_at, updated_at FROM map_settings WHERE id = 1")
	var s MapSettings
	err := row.Scan(&s.ID, &s.CenterLat, &s.CenterLng, &s.MaxZoomIn, &s.MaxZoomOut, &s.DefaultZoom, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Fallback defaults
			return &MapSettings{
				CenterLat:   "-6.2088",
				CenterLng:   "106.8456",
				MaxZoomIn:   "18",
				MaxZoomOut:  "5",
				DefaultZoom: "13",
			}, nil
		}
		return nil, err
	}
	return &s, nil
}

// UpdateMapSettings updates map config at ID 1 or inserts if missing.
func UpdateMapSettings(ctx context.Context, db *sql.DB, s *MapSettings) error {
	res, err := db.ExecContext(ctx, `
		UPDATE map_settings SET 
			center_lat = ?, center_lng = ?, max_zoom_in = ?, max_zoom_out = ?, default_zoom = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = 1`,
		s.CenterLat, s.CenterLng, s.MaxZoomIn, s.MaxZoomOut, s.DefaultZoom,
	)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		_, err = db.ExecContext(ctx, `
			INSERT INTO map_settings (id, center_lat, center_lng, max_zoom_in, max_zoom_out, default_zoom)
			VALUES (1, ?, ?, ?, ?, ?)`,
			s.CenterLat, s.CenterLng, s.MaxZoomIn, s.MaxZoomOut, s.DefaultZoom,
		)
		return err
	}
	return nil
}

// ResetMapSettings resets the map configuration to defaults.
func ResetMapSettings(ctx context.Context, db *sql.DB) (*MapSettings, error) {
	_, err := db.ExecContext(ctx, `
		UPDATE map_settings SET 
			center_lat = '-6.2088', center_lng = '106.8456', max_zoom_in = '18', max_zoom_out = '5', default_zoom = '13', updated_at = CURRENT_TIMESTAMP
		WHERE id = 1`,
	)
	if err != nil {
		return nil, err
	}
	return GetMapSettings(ctx, db)
}

// GetNodes gets all mapping nodes.
func GetNodes(ctx context.Context, db *sql.DB) ([]MappingNode, error) {
	rows, err := db.QueryContext(ctx, "SELECT id, node_id, type, name, latitude, longitude, capacity, splitter, pppoe, serialnumber, notes, created_at, updated_at FROM mapping_nodes ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []MappingNode
	for rows.Next() {
		var n MappingNode
		err = rows.Scan(&n.ID, &n.NodeID, &n.Type, &n.Name, &n.Latitude, &n.Longitude, &n.Capacity, &n.Splitter, &n.Pppoe, &n.SerialNumber, &n.Notes, &n.CreatedAt, &n.UpdatedAt)
		if err != nil {
			return nil, err
		}
		nodes = append(nodes, n)
	}
	return nodes, nil
}

// GetNode gets a single node by node ID.
func GetNode(ctx context.Context, db *sql.DB, nodeID string) (*MappingNode, error) {
	row := db.QueryRowContext(ctx, "SELECT id, node_id, type, name, latitude, longitude, capacity, splitter, pppoe, serialnumber, notes, created_at, updated_at FROM mapping_nodes WHERE node_id = ?", nodeID)
	var n MappingNode
	err := row.Scan(&n.ID, &n.NodeID, &n.Type, &n.Name, &n.Latitude, &n.Longitude, &n.Capacity, &n.Splitter, &n.Pppoe, &n.SerialNumber, &n.Notes, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &n, nil
}

// CreateNode inserts a new mapping node.
func CreateNode(ctx context.Context, db *sql.DB, n *MappingNode) error {
	res, err := db.ExecContext(ctx, `
		INSERT INTO mapping_nodes (node_id, type, name, latitude, longitude, capacity, splitter, pppoe, serialnumber, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		n.NodeID, n.Type, n.Name, n.Latitude, n.Longitude, n.Capacity, n.Splitter, n.Pppoe, n.SerialNumber, n.Notes,
	)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err == nil {
		n.ID = id
	}
	return nil
}

// UpdateNode updates an existing mapping node.
func UpdateNode(ctx context.Context, db *sql.DB, nodeID string, n *MappingNode) error {
	res, err := db.ExecContext(ctx, `
		UPDATE mapping_nodes SET
			name = COALESCE(?, name),
			latitude = COALESCE(?, latitude),
			longitude = COALESCE(?, longitude),
			capacity = COALESCE(?, capacity),
			splitter = COALESCE(?, splitter),
			pppoe = COALESCE(?, pppoe),
			serialnumber = COALESCE(?, serialnumber),
			notes = COALESCE(?, notes),
			updated_at = CURRENT_TIMESTAMP
		WHERE node_id = ?`,
		n.Name, n.Latitude, n.Longitude, n.Capacity, n.Splitter, n.Pppoe, n.SerialNumber, n.Notes, nodeID,
	)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("node not found")
	}
	return nil
}

// DeleteNode removes a node by node ID.
func DeleteNode(ctx context.Context, db *sql.DB, nodeID string) error {
	res, err := db.ExecContext(ctx, "DELETE FROM mapping_nodes WHERE node_id = ?", nodeID)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("node not found")
	}
	return nil
}

// GetEdges gets all edges.
func GetEdges(ctx context.Context, db *sql.DB) ([]MappingEdge, error) {
	rows, err := db.QueryContext(ctx, "SELECT id, edge_id, source, target, fiber_type, distance, waypoints, notes, created_at, updated_at FROM mapping_edges ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var edges []MappingEdge
	for rows.Next() {
		var e MappingEdge
		var waypointsVal sql.NullString
		err = rows.Scan(&e.ID, &e.EdgeID, &e.Source, &e.Target, &e.FiberType, &e.Distance, &waypointsVal, &e.Notes, &e.CreatedAt, &e.UpdatedAt)
		if err != nil {
			return nil, err
		}
		if waypointsVal.Valid && waypointsVal.String != "" {
			e.Waypoints = json.RawMessage(waypointsVal.String)
		} else {
			e.Waypoints = json.RawMessage("[]")
		}
		edges = append(edges, e)
	}
	return edges, nil
}

// GetEdge gets a single edge.
func GetEdge(ctx context.Context, db *sql.DB, edgeID string) (*MappingEdge, error) {
	row := db.QueryRowContext(ctx, "SELECT id, edge_id, source, target, fiber_type, distance, waypoints, notes, created_at, updated_at FROM mapping_edges WHERE edge_id = ?", edgeID)
	var e MappingEdge
	var waypointsVal sql.NullString
	err := row.Scan(&e.ID, &e.EdgeID, &e.Source, &e.Target, &e.FiberType, &e.Distance, &waypointsVal, &e.Notes, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if waypointsVal.Valid && waypointsVal.String != "" {
		e.Waypoints = json.RawMessage(waypointsVal.String)
	} else {
		e.Waypoints = json.RawMessage("[]")
	}
	return &e, nil
}

// ValidateEdgeCapacity checks if source node has available connection capacity.
func ValidateEdgeCapacity(ctx context.Context, db *sql.DB, source, target string, fiberType *string) error {
	var srcType string
	var srcCapacity sql.NullInt64
	err := db.QueryRowContext(ctx, "SELECT type, capacity FROM mapping_nodes WHERE node_id = ?", source).Scan(&srcType, &srcCapacity)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("source node '%s' not found", source)
		}
		return err
	}

	var tgtType string
	err = db.QueryRowContext(ctx, "SELECT type FROM mapping_nodes WHERE node_id = ?", target).Scan(&tgtType)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("target node '%s' not found", target)
		}
		return err
	}

	fType := ""
	if fiberType != nil {
		fType = *fiberType
	}

	// 1. Check ODC Capacity
	if srcType == "odc" && (tgtType == "odp" || (tgtType == "odc" && fType == "odc_to_odc")) {
		if srcCapacity.Valid && srcCapacity.Int64 > 0 {
			query := "SELECT COUNT(*) FROM mapping_edges WHERE source = ?"
			var count int
			if tgtType == "odp" {
				query += " AND target IN (SELECT node_id FROM mapping_nodes WHERE type = 'odp')"
				err = db.QueryRowContext(ctx, query, source).Scan(&count)
			} else {
				query += " AND target IN (SELECT node_id FROM mapping_nodes WHERE type = 'odc') AND fiber_type = 'odc_to_odc'"
				err = db.QueryRowContext(ctx, query, source).Scan(&count)
			}
			if err != nil {
				return err
			}
			if int64(count) >= srcCapacity.Int64 {
				return fmt.Errorf("ODC \"%s\" slots are full (%d/%d)", source, count, srcCapacity.Int64)
			}
		}
	}

	// 2. Check ODP Capacity
	if srcType == "odp" && (tgtType == "ont" || (tgtType == "odp" && fType == "odp_to_odp")) {
		if srcCapacity.Valid && srcCapacity.Int64 > 0 {
			query := "SELECT COUNT(*) FROM mapping_edges WHERE source = ?"
			var count int
			if tgtType == "ont" {
				query += " AND target IN (SELECT node_id FROM mapping_nodes WHERE type = 'ont')"
				err = db.QueryRowContext(ctx, query, source).Scan(&count)
			} else {
				query += " AND target IN (SELECT node_id FROM mapping_nodes WHERE type = 'odp') AND fiber_type = 'odp_to_odp'"
				err = db.QueryRowContext(ctx, query, source).Scan(&count)
			}
			if err != nil {
				return err
			}
			if int64(count) >= srcCapacity.Int64 {
				return fmt.Errorf("ODP \"%s\" slots are full (%d/%d)", source, count, srcCapacity.Int64)
			}
		}
	}

	return nil
}

// CreateEdge creates a new connection link after validating slot capacity.
func CreateEdge(ctx context.Context, db *sql.DB, e *MappingEdge) error {
	// First validate slot capacity
	if err := ValidateEdgeCapacity(ctx, db, e.Source, e.Target, e.FiberType); err != nil {
		return err
	}

	var waypointsStr *string
	if len(e.Waypoints) > 0 {
		str := string(e.Waypoints)
		waypointsStr = &str
	}

	res, err := db.ExecContext(ctx, `
		INSERT INTO mapping_edges (edge_id, source, target, fiber_type, distance, waypoints, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		e.EdgeID, e.Source, e.Target, e.FiberType, e.Distance, waypointsStr, e.Notes,
	)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err == nil {
		e.ID = id
	}
	return nil
}

// UpdateEdge updates an existing edge.
func UpdateEdge(ctx context.Context, db *sql.DB, edgeID string, e *MappingEdge) error {
	var waypointsStr *string
	if len(e.Waypoints) > 0 {
		str := string(e.Waypoints)
		waypointsStr = &str
	}

	res, err := db.ExecContext(ctx, `
		UPDATE mapping_edges SET
			fiber_type = COALESCE(?, fiber_type),
			distance = COALESCE(?, distance),
			waypoints = COALESCE(?, waypoints),
			notes = COALESCE(?, notes),
			updated_at = CURRENT_TIMESTAMP
		WHERE edge_id = ?`,
		e.FiberType, e.Distance, waypointsStr, e.Notes, edgeID,
	)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("edge not found")
	}
	return nil
}

// DeleteEdge deletes an edge.
func DeleteEdge(ctx context.Context, db *sql.DB, edgeID string) error {
	res, err := db.ExecContext(ctx, "DELETE FROM mapping_edges WHERE edge_id = ?", edgeID)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("edge not found")
	}
	return nil
}

// SyncMappingData deletes all nodes and edges and replaces them within a transaction.
func SyncMappingData(ctx context.Context, db *sql.DB, nodes []MappingNode, edges []MappingEdge) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Query existing ODPs from the database first
	rows, err := tx.QueryContext(ctx, "SELECT id, nama FROM odp")
	if err != nil {
		return fmt.Errorf("query existing odps: %w", err)
	}
	dbOdps := make(map[string]int64)
	for rows.Next() {
		var id int64
		var nama string
		if err := rows.Scan(&id, &nama); err == nil {
			dbOdps[nama] = id
		}
	}
	rows.Close()

	// Validate and delete ODPs that are no longer present on the map
	for dbOdpName, dbOdpID := range dbOdps {
		matched := false
		expectedNodeID := fmt.Sprintf("odp-%d", dbOdpID)
		for _, n := range nodes {
			if n.Type == "odp" && (n.NodeID == expectedNodeID || n.Name == dbOdpName) {
				matched = true
				break
			}
		}
		if !matched {
			var count int
			err := tx.QueryRowContext(ctx, "SELECT COUNT(1) FROM pelanggan WHERE odp_id = ?", dbOdpID).Scan(&count)
			if err != nil {
				return fmt.Errorf("check customer count for ODP '%s': %w", dbOdpName, err)
			}
			if count > 0 {
				return fmt.Errorf("ODP '%s' masih digunakan oleh pelanggan dan tidak dapat dihapus", dbOdpName)
			}
			_, err = tx.ExecContext(ctx, "DELETE FROM odp WHERE id = ?", dbOdpID)
			if err != nil {
				return fmt.Errorf("delete ODP '%s' from odp table: %w", dbOdpName, err)
			}
		}
	}

	// Clear tables
	_, err = tx.ExecContext(ctx, "DELETE FROM mapping_edges")
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, "DELETE FROM mapping_nodes")
	if err != nil {
		return err
	}

	// Insert nodes
	nodeStmt, err := tx.PrepareContext(ctx, `
		INSERT INTO mapping_nodes (node_id, type, name, latitude, longitude, capacity, splitter, pppoe, serialnumber, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
	if err != nil {
		return err
	}
	defer nodeStmt.Close()

	for _, n := range nodes {
		_, err = nodeStmt.ExecContext(ctx, n.NodeID, n.Type, n.Name, n.Latitude, n.Longitude, n.Capacity, n.Splitter, n.Pppoe, n.SerialNumber, n.Notes)
		if err != nil {
			return err
		}

		if n.Type == "odp" {
			loc := fmt.Sprintf("%f, %f", n.Latitude, n.Longitude)
			desc := ""
			if n.Notes != nil {
				desc = *n.Notes
			}
			ports := 8
			if n.Capacity != nil && *n.Capacity > 0 {
				ports = *n.Capacity
			}

			// Try to parse ID from NodeID (e.g. "odp-123")
			var odpID int64
			var hasOdpID bool
			if strings.HasPrefix(n.NodeID, "odp-") {
				if _, err := fmt.Sscanf(n.NodeID, "odp-%d", &odpID); err == nil {
					hasOdpID = true
				}
			}

			if hasOdpID {
				_, err = tx.ExecContext(ctx, `
					INSERT INTO odp (id, nama, lokasi, deskripsi, ports, updated_at)
					VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
					ON CONFLICT(id) DO UPDATE SET
						nama = ?,
						lokasi = ?,
						deskripsi = ?,
						ports = ?,
						updated_at = CURRENT_TIMESTAMP`,
					odpID, n.Name, loc, desc, ports,
					n.Name, loc, desc, ports,
				)
			} else {
				_, err = tx.ExecContext(ctx, `
					INSERT INTO odp (nama, lokasi, deskripsi, ports, updated_at)
					VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
					ON CONFLICT(nama) DO UPDATE SET
						lokasi = ?,
						deskripsi = ?,
						ports = ?,
						updated_at = CURRENT_TIMESTAMP`,
					n.Name, loc, desc, ports,
					loc, desc, ports,
				)
			}
			if err != nil {
				return fmt.Errorf("sync odp node '%s' to odp table: %w", n.Name, err)
			}
		}
	}

	// Insert edges
	edgeStmt, err := tx.PrepareContext(ctx, `
		INSERT INTO mapping_edges (edge_id, source, target, fiber_type, distance, waypoints, notes)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
	)
	if err != nil {
		return err
	}
	defer edgeStmt.Close()

	for _, e := range edges {
		var waypointsStr *string
		if len(e.Waypoints) > 0 {
			str := string(e.Waypoints)
			waypointsStr = &str
		}
		_, err = edgeStmt.ExecContext(ctx, e.EdgeID, e.Source, e.Target, e.FiberType, e.Distance, waypointsStr, e.Notes)
		if err != nil {
			return err
		}
	}

	// Sync Customer ODP references
	// 1. Build a map of node_id -> Name for ODP nodes to resolve ODP name on the map
	odpNodeNames := make(map[string]string)
	for _, n := range nodes {
		if n.Type == "odp" {
			odpNodeNames[n.NodeID] = n.Name
		}
	}

	// 2. Query all ODPs from the database to map their Name to their ID
	rows, err = tx.QueryContext(ctx, "SELECT id, nama FROM odp")
	if err != nil {
		return fmt.Errorf("query odp table: %w", err)
	}

	odpNameToID := make(map[string]int64)
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			rows.Close()
			return fmt.Errorf("scan odp name/id: %w", err)
		}
		odpNameToID[name] = id
	}
	rows.Close()

	// 3. Find edges and build mapping of Target (ONT) -> Source (ODP) or vice versa
	ontToOdpNodeID := make(map[string]string)
	for _, e := range edges {
		if _, isOdp := odpNodeNames[e.Source]; isOdp {
			ontToOdpNodeID[e.Target] = e.Source
		} else if _, isOdp := odpNodeNames[e.Target]; isOdp {
			ontToOdpNodeID[e.Source] = e.Target
		}
	}

	// 4. Update each customer's odp_id based on their ONT node's connected ODP
	for _, n := range nodes {
		if n.Type == "ont" && n.Pppoe != nil && *n.Pppoe != "" {
			var odpID *int64
			if connectedOdpNodeID, exists := ontToOdpNodeID[n.NodeID]; exists {
				if odpName, ok := odpNodeNames[connectedOdpNodeID]; ok {
					if id, ok := odpNameToID[odpName]; ok {
						val := id
						odpID = &val
					}
				}
			}

			// Update customer in database
			if odpID != nil {
				_, err = tx.ExecContext(ctx, "UPDATE pelanggan SET odp_id = ?, odp_port = COALESCE(odp_port, 1), updated_at = CURRENT_TIMESTAMP WHERE user_pppoe = ?", *odpID, *n.Pppoe)
			} else {
				_, err = tx.ExecContext(ctx, "UPDATE pelanggan SET odp_id = NULL, odp_port = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_pppoe = ?", *n.Pppoe)
			}
			if err != nil {
				return fmt.Errorf("update customer odp_id for pppoe '%s': %w", *n.Pppoe, err)
			}
		}
	}

	return tx.Commit()
}

// ResetMappingData clears all edges and nodes.
func ResetMappingData(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, "DELETE FROM mapping_edges")
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, "DELETE FROM mapping_nodes")
	if err != nil {
		return err
	}

	return tx.Commit()
}
