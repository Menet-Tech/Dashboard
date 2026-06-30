package odp_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/odp"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite memory db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	_, err = db.Exec(`
		CREATE TABLE odp (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			nama TEXT NOT NULL,
			lokasi TEXT NOT NULL,
			deskripsi TEXT,
			ports INTEGER DEFAULT 8,
			splitter_ratio TEXT DEFAULT '1:8',
			updated_at DATETIME
		);
		CREATE TABLE pelanggan (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			odp_id INTEGER REFERENCES odp(id)
		);
		CREATE TABLE mapping_nodes (
			node_id TEXT PRIMARY KEY,
			type TEXT,
			name TEXT,
			latitude REAL,
			longitude REAL,
			capacity INTEGER,
			splitter TEXT,
			notes TEXT,
			created_at DATETIME,
			updated_at DATETIME
		);
	`)
	if err != nil {
		t.Fatalf("create test tables: %v", err)
	}

	return db
}

func TestOdpService(t *testing.T) {
	db := setupTestDB(t)
	repo := odp.Repository{DB: db}
	svc := odp.Service{Repository: repo}
	ctx := context.Background()

	t.Run("Create ODP - Validation errors", func(t *testing.T) {
		_, err := svc.Create(ctx, odp.Odp{Nama: "", Lokasi: "-6.2,106.8"})
		if err == nil {
			t.Fatal("expected error with empty name")
		}

		_, err = svc.Create(ctx, odp.Odp{Nama: "ODP-TEST", Lokasi: ""})
		if err == nil {
			t.Fatal("expected error with empty location")
		}
	})

	t.Run("Create ODP - Valid input", func(t *testing.T) {
		input := odp.Odp{
			Nama:          "ODP-A",
			Lokasi:        "-6.1234,106.5678",
			Deskripsi:     "Main box",
			Ports:         16,
			SplitterRatio: "1:16",
		}

		created, err := svc.Create(ctx, input)
		if err != nil {
			t.Fatalf("failed to create ODP: %v", err)
		}

		if created.ID == 0 {
			t.Fatal("expected non-zero ID")
		}
		if created.Nama != "ODP-A" {
			t.Errorf("expected name ODP-A, got %q", created.Nama)
		}
		if created.Latitude != -6.1234 || created.Longitude != 106.5678 {
			t.Errorf("expected parsed coordinates, got (%f, %f)", created.Latitude, created.Longitude)
		}

		// Verify mapping node was created
		var nodeType string
		err = db.QueryRow(`SELECT type FROM mapping_nodes WHERE node_id = ?`, "odp-1").Scan(&nodeType)
		if err != nil {
			t.Fatalf("failed to query mapping node: %v", err)
		}
		if nodeType != "odp" {
			t.Errorf("expected node type 'odp', got %q", nodeType)
		}
	})

	t.Run("Find ODP by ID", func(t *testing.T) {
		o, err := svc.FindByID(ctx, 1)
		if err != nil {
			t.Fatalf("failed to find ODP: %v", err)
		}
		if o.Nama != "ODP-A" {
			t.Errorf("expected ODP name 'ODP-A', got %q", o.Nama)
		}

		_, err = svc.FindByID(ctx, 999)
		if !errors.Is(err, odp.ErrOdpNotFound) {
			t.Errorf("expected ErrOdpNotFound, got %v", err)
		}
	})

	t.Run("Update ODP", func(t *testing.T) {
		updateInput := odp.Odp{
			Nama:          "ODP-A-Updated",
			Lokasi:        "-6.5555,106.9999",
			Ports:         8,
			SplitterRatio: "1:8",
		}

		updated, err := svc.Update(ctx, 1, updateInput)
		if err != nil {
			t.Fatalf("failed to update ODP: %v", err)
		}

		if updated.Nama != "ODP-A-Updated" {
			t.Errorf("expected updated name, got %q", updated.Nama)
		}
		if updated.Latitude != -6.5555 || updated.Longitude != 106.9999 {
			t.Errorf("expected updated coordinates, got (%f, %f)", updated.Latitude, updated.Longitude)
		}
	})

	t.Run("List ODPs", func(t *testing.T) {
		list, err := svc.List(ctx)
		if err != nil {
			t.Fatalf("failed to list ODPs: %v", err)
		}
		if len(list) != 1 {
			t.Fatalf("expected 1 ODP in list, got %d", len(list))
		}
		if list[0].Nama != "ODP-A-Updated" {
			t.Errorf("expected ODP name 'ODP-A-Updated', got %q", list[0].Nama)
		}
	})

	t.Run("Delete ODP - Fail if in use", func(t *testing.T) {
		// Link a customer to the ODP
		_, err := db.Exec("INSERT INTO pelanggan (odp_id) VALUES (1)")
		if err != nil {
			t.Fatalf("failed to insert test customer: %v", err)
		}

		err = svc.Delete(ctx, 1)
		if !errors.Is(err, odp.ErrOdpInUse) {
			t.Errorf("expected ErrOdpInUse, got %v", err)
		}
	})

	t.Run("Delete ODP - Success when free", func(t *testing.T) {
		// Free the ODP
		_, _ = db.Exec("DELETE FROM pelanggan WHERE odp_id = 1")

		err := svc.Delete(ctx, 1)
		if err != nil {
			t.Fatalf("failed to delete ODP: %v", err)
		}

		// Verify deletion
		_, err = svc.FindByID(ctx, 1)
		if !errors.Is(err, odp.ErrOdpNotFound) {
			t.Errorf("expected ODP to be deleted, got find result: %v", err)
		}

		// Verify mapping node was deleted too
		var count int
		_ = db.QueryRow(`SELECT COUNT(1) FROM mapping_nodes WHERE node_id = ?`, "odp-1").Scan(&count)
		if count != 0 {
			t.Error("expected mapping node to be deleted")
		}
	})
}
