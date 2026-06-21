package mikrotik

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	_ "modernc.org/sqlite"

	"menettech/dashboard/backend/internal/platform/migrate"
)

func TestRouterService_Create(t *testing.T) {
	db := testDB(t)
	svc := NewRouterService(db)

	ctx := context.Background()

	// Test required validation
	_, err := svc.Create(ctx, Router{
		Name: "",
	})
	if err == nil {
		t.Error("expected error for empty name, host, username")
	}

	// Test successful creation
	router, err := svc.Create(ctx, Router{
		Name:     "Router Test",
		Host:     "192.168.1.1:8728",
		Username: "admin",
		Password: "password123",
		IsActive: true,
		Role:     "main",
	})
	if err != nil {
		t.Fatalf("failed to create router: %v", err)
	}

	if router.ID == 0 {
		t.Error("expected non-zero ID for created router")
	}

	// Verify it exists in DB
	found, err := svc.FindByID(ctx, router.ID)
	if err != nil {
		t.Fatalf("failed to find router: %v", err)
	}

	if found.Name != "Router Test" || found.Host != "192.168.1.1:8728" || found.Username != "admin" || !found.IsActive || found.Role != "main" {
		t.Errorf("retrieved router does not match expected fields: %+v", found)
	}
}

func TestRouterService_Update(t *testing.T) {
	db := testDB(t)
	svc := NewRouterService(db)

	ctx := context.Background()

	router, err := svc.Create(ctx, Router{
		Name:     "Initial Router",
		Host:     "10.0.0.1",
		Username: "admin",
		Password: "old",
		IsActive: true,
		Role:     "none",
	})
	if err != nil {
		t.Fatalf("failed to create router: %v", err)
	}

	// Test updating fields including password and role
	updated, err := svc.Update(ctx, router.ID, Router{
		Name:     "Updated Router",
		Host:     "10.0.0.2",
		Username: "newadmin",
		Password: "new",
		IsActive: false,
		Role:     "slave",
	}, true)
	if err != nil {
		t.Fatalf("failed to update router: %v", err)
	}

	if updated.Name != "Updated Router" || updated.Host != "10.0.0.2" || updated.Username != "newadmin" || updated.IsActive || updated.Role != "slave" {
		t.Errorf("returned router does not match updated values: %+v", updated)
	}

	// Double check from db
	found, _ := svc.FindByID(ctx, router.ID)
	if found.Password != "new" {
		t.Errorf("expected updated password to be 'new', got %q", found.Password)
	}
	if found.Role != "slave" {
		t.Errorf("expected updated role to be 'slave', got %q", found.Role)
	}

	// Test updating fields without password (password should remain 'new')
	_, err = svc.Update(ctx, router.ID, Router{
		Name:     "Updated Router 2",
		Host:     "10.0.0.2",
		Username: "newadmin",
		Password: "", // empty means do not update password
		IsActive: true,
		Role:     "main",
	}, false)
	if err != nil {
		t.Fatalf("failed to update router: %v", err)
	}

	found2, _ := svc.FindByID(ctx, router.ID)
	if found2.Password != "new" {
		t.Errorf("password should have remained 'new', got %q", found2.Password)
	}
	if found2.Role != "main" {
		t.Errorf("role should have been updated to 'main', got %q", found2.Role)
	}
}

func TestRouterService_ListAndActive(t *testing.T) {
	db := testDB(t)
	svc := NewRouterService(db)

	ctx := context.Background()

	// Create 1 active and 1 inactive router
	_, err := svc.Create(ctx, Router{
		Name:     "R1",
		Host:     "10.0.0.1",
		Username: "admin",
		Password: "pwd",
		IsActive: true,
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = svc.Create(ctx, Router{
		Name:     "R2",
		Host:     "10.0.0.2",
		Username: "admin",
		Password: "pwd",
		IsActive: false,
	})
	if err != nil {
		t.Fatal(err)
	}

	// List all
	all, err := svc.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Errorf("expected 2 routers, got %d", len(all))
	}

	// List active only
	active, err := svc.ListActive(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(active) != 1 {
		t.Errorf("expected 1 active router, got %d", len(active))
	}
	if active[0].Name != "R1" {
		t.Errorf("expected active router to be R1, got %q", active[0].Name)
	}
}

func TestRouterService_Delete(t *testing.T) {
	db := testDB(t)
	svc := NewRouterService(db)

	ctx := context.Background()

	router, err := svc.Create(ctx, Router{
		Name:     "To Delete",
		Host:     "10.0.0.9",
		Username: "admin",
		IsActive: true,
	})
	if err != nil {
		t.Fatal(err)
	}

	err = svc.Delete(ctx, router.ID)
	if err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	// FindByID should now error
	_, err = svc.FindByID(ctx, router.ID)
	if err == nil || !strings.Contains(err.Error(), "router not found") {
		t.Errorf("expected router not found error, got %v", err)
	}
}

func TestRouterService_UpdateOnlineStatus(t *testing.T) {
	db := testDB(t)
	svc := NewRouterService(db)
	ctx := context.Background()

	router, err := svc.Create(ctx, Router{
		Name:     "Test Router Online",
		Host:     "10.0.0.10",
		Username: "admin",
		IsActive: true,
		IsOnline: false,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Should be offline initially
	found, err := svc.FindByID(ctx, router.ID)
	if err != nil {
		t.Fatal(err)
	}
	if found.IsOnline {
		t.Error("expected IsOnline to be false initially")
	}

	// Update to online
	err = svc.UpdateOnlineStatus(ctx, router.ID, true)
	if err != nil {
		t.Fatalf("failed to update online status: %v", err)
	}

	found, err = svc.FindByID(ctx, router.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !found.IsOnline {
		t.Error("expected IsOnline to be true after update")
	}

	// Update back to offline
	err = svc.UpdateOnlineStatus(ctx, router.ID, false)
	if err != nil {
		t.Fatalf("failed to update online status: %v", err)
	}

	found, err = svc.FindByID(ctx, router.ID)
	if err != nil {
		t.Fatal(err)
	}
	if found.IsOnline {
		t.Error("expected IsOnline to be false after updating to false")
	}
}

func testDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite memory db: %v", err)
	}

	t.Cleanup(func() {
		_ = db.Close()
	})

	if err := migrate.Apply(db); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	return db
}
