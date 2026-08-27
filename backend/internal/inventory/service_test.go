package inventory_test

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/inventory"
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
		CREATE TABLE inventory_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT,
			category TEXT,
			quantity INTEGER NOT NULL DEFAULT 0,
			unit TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE inventory_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			item_id INTEGER NOT NULL,
			type TEXT NOT NULL,
			quantity INTEGER NOT NULL,
			reference TEXT,
			notes TEXT,
			created_by TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
		);
	`)
	if err != nil {
		t.Fatalf("create test tables: %v", err)
	}

	return db
}

func TestInventoryService(t *testing.T) {
	db := setupTestDB(t)
	repo := inventory.Repository{DB: db}
	svc := inventory.Service{Repository: repo}
	ctx := context.Background()

	var itemID int64

	t.Run("CreateItem - Validation Errors", func(t *testing.T) {
		_, err := svc.CreateItem(ctx, inventory.Item{Name: ""})
		if err == nil {
			t.Fatal("expected error when item name is empty")
		}
	})

	t.Run("CreateItem - Success", func(t *testing.T) {
		input := inventory.Item{
			Name:        "Kabel Drop Core",
			Description: "1 Core FTTH drop wire",
			Category:    "cable",
			Quantity:    100,
			Unit:        "meter",
		}

		created, err := svc.CreateItem(ctx, input)
		if err != nil {
			t.Fatalf("failed to create item: %v", err)
		}

		if created.ID == 0 {
			t.Fatal("expected non-zero ID")
		}
		if created.Name != input.Name {
			t.Errorf("expected name %q, got %q", input.Name, created.Name)
		}
		itemID = created.ID
	})

	t.Run("GetItem - Success", func(t *testing.T) {
		item, err := svc.GetItem(ctx, itemID)
		if err != nil {
			t.Fatalf("failed to get item: %v", err)
		}
		if item.Name != "Kabel Drop Core" {
			t.Errorf("expected name 'Kabel Drop Core', got %q", item.Name)
		}
	})

	t.Run("UpdateItem - Validation Errors", func(t *testing.T) {
		err := svc.UpdateItem(ctx, itemID, inventory.Item{Name: ""})
		if err == nil {
			t.Fatal("expected error when item name is empty")
		}
	})

	t.Run("UpdateItem - Success", func(t *testing.T) {
		err := svc.UpdateItem(ctx, itemID, inventory.Item{
			Name:        "Kabel Drop Core V2",
			Description: "Updated description",
			Category:    "cable",
			Unit:        "meter",
		})
		if err != nil {
			t.Fatalf("failed to update item: %v", err)
		}

		item, _ := svc.GetItem(ctx, itemID)
		if item.Name != "Kabel Drop Core V2" {
			t.Errorf("expected updated name, got %q", item.Name)
		}
	})

	t.Run("ListItems - Success", func(t *testing.T) {
		items, err := svc.ListItems(ctx)
		if err != nil {
			t.Fatalf("failed to list items: %v", err)
		}
		if len(items) != 1 {
			t.Fatalf("expected 1 item, got %d", len(items))
		}
	})

	t.Run("AddLog - Validation Errors", func(t *testing.T) {
		// Test log quantity <= 0
		err := svc.AddLog(ctx, inventory.Log{
			ItemID:   itemID,
			Type:     "in",
			Quantity: 0,
		})
		if err == nil {
			t.Fatal("expected error with zero quantity")
		}

		// Test invalid log type
		err = svc.AddLog(ctx, inventory.Log{
			ItemID:   itemID,
			Type:     "invalid_type",
			Quantity: 10,
		})
		if err == nil {
			t.Fatal("expected error with invalid log type")
		}
	})

	t.Run("AddLog - Success Inbound", func(t *testing.T) {
		err := svc.AddLog(ctx, inventory.Log{
			ItemID:    itemID,
			Type:      "in",
			Quantity:  50,
			Reference: "Restock cable",
			Notes:     "Purchased from supplier",
			CreatedBy: "admin",
		})
		if err != nil {
			t.Fatalf("failed to add log: %v", err)
		}

		item, _ := svc.GetItem(ctx, itemID)
		// initial quantity was 100 (from created) + 50 (restock) = 150
		if item.Quantity != 150 {
			t.Errorf("expected quantity 150, got %d", item.Quantity)
		}
	})

	t.Run("AddLog - Success Outbound", func(t *testing.T) {
		err := svc.AddLog(ctx, inventory.Log{
			ItemID:    itemID,
			Type:      "out",
			Quantity:  20,
			Reference: "Installation client dimas",
			Notes:     "Used 20 meters",
			CreatedBy: "admin",
		})
		if err != nil {
			t.Fatalf("failed to add log: %v", err)
		}

		item, _ := svc.GetItem(ctx, itemID)
		// 150 - 20 = 130
		if item.Quantity != 130 {
			t.Errorf("expected quantity 130, got %d", item.Quantity)
		}
	})

	t.Run("ListLogs - Success", func(t *testing.T) {
		logs, err := svc.ListLogs(ctx, nil)
		if err != nil {
			t.Fatalf("failed to list logs: %v", err)
		}
		if len(logs) != 2 {
			t.Errorf("expected 2 logs, got %d", len(logs))
		}

		// Filter by item ID
		logsFiltered, err := svc.ListLogs(ctx, &itemID)
		if err != nil {
			t.Fatalf("failed to list filtered logs: %v", err)
		}
		if len(logsFiltered) != 2 {
			t.Errorf("expected 2 filtered logs, got %d", len(logsFiltered))
		}
	})

	t.Run("DeleteItem - Success", func(t *testing.T) {
		err := svc.DeleteItem(ctx, itemID)
		if err != nil {
			t.Fatalf("failed to delete item: %v", err)
		}

		_, err = svc.GetItem(ctx, itemID)
		if err == nil {
			t.Fatal("expected error getting deleted item")
		}
	})
}
