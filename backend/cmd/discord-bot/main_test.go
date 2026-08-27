package main

import (
	"database/sql"
	"testing"
	_ "modernc.org/sqlite"
)

func TestMainCompile(t *testing.T) {
	// Simple test to ensure the discord-bot main package compiles successfully
}

func TestBuildSesiInteractiveEmbed(t *testing.T) {
	// Setup in-memory sqlite DB for test
	var err error
	db, err = sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("Failed to open memory db: %v", err)
	}
	defer db.Close()

	// Create table schema
	_, err = db.Exec(`
		CREATE TABLE pelanggan (
			id INTEGER PRIMARY KEY,
			nama TEXT,
			user_pppoe TEXT,
			status TEXT,
			pppoe_status TEXT,
			pppoe_uptime TEXT,
			last_sync_at TEXT
		);
		INSERT INTO pelanggan (nama, user_pppoe, status, pppoe_status, pppoe_uptime) VALUES 
		('User 1', 'user1', 'active', 'online', '1d 2h'),
		('User 2', 'user2', 'active', 'offline', '');
	`)
	if err != nil {
		t.Fatalf("Failed to init schema: %v", err)
	}

	// Test ringkasan
	embed, _ := buildSesiInteractiveEmbed("ringkasan", 0, 10)
	if embed == nil {
		t.Fatal("Expected embed for ringkasan, got nil")
	}
	if embed.Title != "📊 Ringkasan Sesi PPPoE" {
		t.Errorf("Expected title '📊 Ringkasan Sesi PPPoE', got %q", embed.Title)
	}

	// Test aktif
	embedAktif, _ := buildSesiInteractiveEmbed("aktif", 0, 10)
	if embedAktif == nil {
		t.Fatal("Expected embed for aktif, got nil")
	}
	if embedAktif.Title != "🟢 Daftar Sesi Aktif (Online) (Hal 1)" {
		t.Errorf("Expected title for aktif, got %q", embedAktif.Title)
	}

	// Test mati
	embedMati, _ := buildSesiInteractiveEmbed("mati", 0, 10)
	if embedMati == nil {
		t.Fatal("Expected embed for mati, got nil")
	}
	if embedMati.Title != "🔴 Daftar Sesi Mati (Offline) (Hal 1)" {
		t.Errorf("Expected title for mati, got %q", embedMati.Title)
	}
}
