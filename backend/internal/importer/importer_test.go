package importer_test

import (
	"context"
	"database/sql"
	"io"
	"log/slog"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/importer"
)

func createSchema(t *testing.T, db *sql.DB) {
	t.Helper()
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS paket (
			id INTEGER PRIMARY KEY,
			nama TEXT,
			kecepatan_mbps INTEGER,
			harga INTEGER,
			deskripsi TEXT,
			created_at DATETIME,
			updated_at DATETIME
		);
		CREATE TABLE IF NOT EXISTS pelanggan (
			id INTEGER PRIMARY KEY,
			nama TEXT,
			paket_id INTEGER,
			user_pppoe TEXT,
			password_pppoe TEXT,
			nomor_wa TEXT,
			sn_ont TEXT,
			tgl_jatuh_tempo INTEGER,
			status TEXT,
			alamat TEXT,
			created_at DATETIME,
			updated_at DATETIME
		);
		CREATE TABLE IF NOT EXISTS template_wa (
			id INTEGER PRIMARY KEY,
			nama TEXT,
			trigger_key TEXT,
			isi_template TEXT,
			is_active INTEGER,
			created_at DATETIME,
			updated_at DATETIME
		);
		CREATE TABLE IF NOT EXISTS pengaturan (
			key TEXT PRIMARY KEY,
			value TEXT,
			updated_at DATETIME
		);
		CREATE TABLE IF NOT EXISTS tagihan (
			id INTEGER PRIMARY KEY,
			pelanggan_id INTEGER,
			paket_id INTEGER,
			periode TEXT,
			invoice_number TEXT,
			nominal INTEGER,
			jatuh_tempo TEXT,
			status TEXT,
			paid_at DATETIME,
			payment_method TEXT,
			proof_path TEXT,
			created_at DATETIME,
			updated_at DATETIME
		);
	`)
	if err != nil {
		t.Fatalf("failed to create schema: %v", err)
	}
}

func TestImportLegacy(t *testing.T) {
	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	// Setup Source DB
	sourceDB, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open source db: %v", err)
	}
	defer sourceDB.Close()
	sourceDB.SetMaxOpenConns(1)
	createSchema(t, sourceDB)

	// Seed source data
	_, _ = sourceDB.Exec(`INSERT INTO paket (id, nama, kecepatan_mbps, harga, deskripsi) VALUES (1, 'Paket A', 10, 100000, 'Basic')`)
	_, _ = sourceDB.Exec(`INSERT INTO pelanggan (id, nama, paket_id, nomor_wa, status, tgl_jatuh_tempo) VALUES (10, 'Alice', 1, '0811', 'active', 5)`)
	_, _ = sourceDB.Exec(`INSERT INTO template_wa (id, nama, trigger_key, isi_template) VALUES (100, 'Tagihan', 'billing', 'Halo {nama}')`)
	_, _ = sourceDB.Exec(`INSERT INTO pengaturan (key, value) VALUES ('setting_key', 'setting_val')`)
	_, _ = sourceDB.Exec(`INSERT INTO tagihan (id, pelanggan_id, paket_id, periode, invoice_number, nominal, jatuh_tempo, status) VALUES (1000, 10, 1, '2026-06', 'INV-1', 100000, '2026-06-05', 'belum_bayar')`)

	// Setup Target DB
	targetDB, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open target db: %v", err)
	}
	defer targetDB.Close()
	targetDB.SetMaxOpenConns(1)
	createSchema(t, targetDB)

	svc := importer.Service{
		Logger:   logger,
		SourceDB: sourceDB,
		TargetDB: targetDB,
	}

	t.Run("Dry Run - Does not commit", func(t *testing.T) {
		report, err := svc.ImportLegacy(ctx, importer.Options{DryRun: true})
		if err != nil {
			t.Fatalf("import failed: %v", err)
		}

		// Verify table counts are reported
		if len(report.Tables) != 5 {
			t.Errorf("expected 5 tables in report, got %d", len(report.Tables))
		}

		// Verify target DB remains empty
		var count int
		_ = targetDB.QueryRow("SELECT COUNT(1) FROM paket").Scan(&count)
		if count != 0 {
			t.Errorf("expected target db to be empty in dry-run, got %d rows", count)
		}
	})

	t.Run("Real Run - Commits data", func(t *testing.T) {
		report, err := svc.ImportLegacy(ctx, importer.Options{DryRun: false})
		if err != nil {
			t.Fatalf("import failed: %v", err)
		}

		// Assert upserts occurred
		for _, tbl := range report.Tables {
			if tbl.Read != 1 {
				t.Errorf("expected table %s to read 1 row, got %d", tbl.Name, tbl.Read)
			}
			if tbl.Upserted != 1 {
				t.Errorf("expected table %s to upsert 1 row, got %d", tbl.Name, tbl.Upserted)
			}
			if tbl.Errors != 0 {
				t.Errorf("expected table %s to have 0 errors, got %d", tbl.Name, tbl.Errors)
			}
		}

		// Verify target DB matches Source DB
		var name string
		err = targetDB.QueryRow("SELECT nama FROM pelanggan WHERE id = 10").Scan(&name)
		if err != nil {
			t.Fatalf("failed to query imported customer: %v", err)
		}
		if name != "Alice" {
			t.Errorf("expected Alice, got %q", name)
		}
	})
}
