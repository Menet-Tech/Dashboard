package acs_test

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/acs"
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
		CREATE TABLE vendors (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			manufacturer_patterns TEXT,
			product_patterns TEXT,
			parameter_prefix TEXT,
			service_list_path TEXT,
			lan_binding_path TEXT,
			vlan_id_path TEXT,
			http_wan_enable_path TEXT,
			firewall_level_path TEXT,
			priority INTEGER,
			enabled INTEGER,
			description TEXT
		);
		CREATE TABLE wifi_security_config (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			product_class TEXT NOT NULL,
			security_types TEXT,
			password_param_path TEXT
		);
	`)
	if err != nil {
		t.Fatalf("create test tables: %v", err)
	}

	return db
}

func TestGetVendors(t *testing.T) {
	db := setupTestDB(t)
	ctx := context.Background()

	// Seed vendors
	_, err := db.Exec(`
		INSERT INTO vendors (name, manufacturer_patterns, product_patterns, parameter_prefix, priority, enabled, description)
		VALUES 
			('ZTE', '["ZTE"]', '["F609", "F660"]', 'InternetGatewayDevice.', 10, 1, 'ZTE Router'),
			('Huawei', '["Huawei"]', '["HG8245"]', 'InternetGatewayDevice.', 20, 1, 'Huawei Router'),
			('Disabled Vendor', '[]', '[]', '', 5, 0, 'Disabled')
	`)
	if err != nil {
		t.Fatalf("failed to seed vendors: %v", err)
	}

	vendors, err := acs.GetVendors(ctx, db)
	if err != nil {
		t.Fatalf("failed to retrieve vendors: %v", err)
	}

	// Should return 2 enabled vendors ordered by priority desc (Huawei first, then ZTE)
	if len(vendors) != 2 {
		t.Fatalf("expected 2 enabled vendors, got %d", len(vendors))
	}

	if vendors[0].Name != "Huawei" {
		t.Errorf("expected highest priority vendor 'Huawei' first, got %q", vendors[0].Name)
	}

	if vendors[1].Name != "ZTE" {
		t.Errorf("expected ZTE second, got %q", vendors[1].Name)
	}

	if len(vendors[0].ProductPatterns) != 1 || vendors[0].ProductPatterns[0] != "HG8245" {
		t.Errorf("expected product patterns ['HG8245'], got %v", vendors[0].ProductPatterns)
	}
}

func TestGetWiFiSecurityConfig(t *testing.T) {
	db := setupTestDB(t)
	ctx := context.Background()

	// Seed WiFi security config
	_, err := db.Exec(`
		INSERT INTO wifi_security_config (product_class, security_types, password_param_path)
		VALUES 
			('F609', 'wpa,wpa2', 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey'),
			('HG8245', 'wep,wpa', 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.WEPKey.1.WEPKey')
	`)
	if err != nil {
		t.Fatalf("failed to seed wifi configs: %v", err)
	}

	t.Run("Match valid product class case-insensitively", func(t *testing.T) {
		cfg, err := acs.GetWiFiSecurityConfig(ctx, db, "f609")
		if err != nil {
			t.Fatalf("failed to get wifi config: %v", err)
		}
		if cfg == nil {
			t.Fatal("expected matching config, got nil")
		}
		if cfg.ProductClass != "F609" {
			t.Errorf("expected matching ProductClass 'F609', got %q", cfg.ProductClass)
		}
		if len(cfg.SecurityTypes) != 2 || cfg.SecurityTypes[0] != "wpa" {
			t.Errorf("expected security types [wpa, wpa2], got %v", cfg.SecurityTypes)
		}
	})

	t.Run("No match returns nil config without error", func(t *testing.T) {
		cfg, err := acs.GetWiFiSecurityConfig(ctx, db, "unknown-class")
		if err != nil {
			t.Fatalf("failed to get wifi config: %v", err)
		}
		if cfg != nil {
			t.Errorf("expected nil config for unknown class, got %v", cfg)
		}
	})

	t.Run("Empty product class returns nil immediately", func(t *testing.T) {
		cfg, err := acs.GetWiFiSecurityConfig(ctx, db, "")
		if err != nil {
			t.Fatalf("failed to get wifi config: %v", err)
		}
		if cfg != nil {
			t.Errorf("expected nil config for empty class, got %v", cfg)
		}
	})
}
