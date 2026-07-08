package mikrotik

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func TestRouterService_SyncMainToSlaves_NoMain(t *testing.T) {
	db := testDB(t)
	svc := NewRouterService(db)
	ctx := context.Background()

	// No routers at all
	_, err := svc.SyncMainToSlaves(ctx)
	if err == nil || !strings.Contains(err.Error(), "no active main") {
		t.Errorf("expected no active main router error, got: %v", err)
	}
}

func TestRouterService_SyncMainToSlaves_NoSlave(t *testing.T) {
	db := testDB(t)
	svc := NewRouterService(db)
	ctx := context.Background()

	// Only Main router
	_, err := svc.Create(ctx, Router{
		Name:     "Main Router",
		Host:     "127.0.0.1:8728",
		Username: "admin",
		IsActive: true,
		Role:     "main",
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = svc.SyncMainToSlaves(ctx)
	if err == nil || !strings.Contains(err.Error(), "no active slave") {
		t.Errorf("expected no active slave router error, got: %v", err)
	}
}

func TestRouterService_SyncMainToSlaves_Success(t *testing.T) {
	ctx := context.Background()

	// Start Mock Main RouterOS
	mainMock := newMockRouterOS(t)
	mainMock.handlers["/ip/pool/print"] = [][]string{
		{"!re", "=.id=*1", "=name=pool-main", "=ranges=192.168.10.10-192.168.10.100"},
		{"!done"},
	}
	mainMock.handlers["/ppp/profile/print"] = [][]string{
		{"!re", "=.id=*1", "=name=profile-main", "=local-address=192.168.10.1", "=remote-address=pool-main", "=rate-limit=10M/10M"},
		{"!done"},
	}
	mainMock.handlers["/ppp/secret/print"] = [][]string{
		{"!re", "=.id=*1", "=name=secret-main", "=password=secretpass", "=profile=profile-main", "=disabled=false"},
		{"!done"},
	}
	mainMock.Start()
	defer mainMock.Close()

	// Start Mock Slave RouterOS
	slaveMock := newMockRouterOS(t)
	// We want to record queries on slaveMock
	slaveMock.handlers["/ip/pool/print"] = [][]string{
		{"!done"}, // doesn't exist initially
	}
	slaveMock.handlers["/ip/pool/add"] = [][]string{
		{"!done"},
	}
	slaveMock.handlers["/ppp/profile/print"] = [][]string{
		{"!done"}, // doesn't exist initially
	}
	slaveMock.handlers["/ppp/profile/add"] = [][]string{
		{"!done"},
	}
	slaveMock.handlers["/ppp/secret/print"] = [][]string{
		{"!done"}, // doesn't exist initially
	}
	slaveMock.handlers["/ppp/secret/add"] = [][]string{
		{"!done"},
	}
	slaveMock.handlers["/ppp/active/print"] = [][]string{
		{"!done"},
	}
	slaveMock.Start()
	defer slaveMock.Close()

	db := testDB(t)
	svc := NewRouterService(db)

	// Add Main Router
	_, err := svc.Create(ctx, Router{
		Name:     "Main Router",
		Host:     mainMock.addr,
		Username: "admin",
		Password: "admin",
		IsActive: true,
		Role:     "main",
	})
	if err != nil {
		t.Fatal(err)
	}

	// Add Slave Router
	_, err = svc.Create(ctx, Router{
		Name:     "Slave Router",
		Host:     slaveMock.addr,
		Username: "admin",
		Password: "admin",
		IsActive: true,
		Role:     "slave",
	})
	if err != nil {
		t.Fatal(err)
	}

	// Sync
	res, err := svc.SyncMainToSlaves(ctx)
	if err != nil {
		t.Fatalf("sync failed: %v", err)
	}

	if res.PoolsSynced != 1 {
		t.Errorf("expected 1 pool synced, got %d", res.PoolsSynced)
	}
	if res.ProfilesSynced != 1 {
		t.Errorf("expected 1 profile synced, got %d", res.ProfilesSynced)
	}
	if res.SecretsSynced != 1 {
		t.Errorf("expected 1 secret synced, got %d", res.SecretsSynced)
	}
}

func TestCheckRealSecrets(t *testing.T) {
	t.Skip("manual integration test")
	ctx := context.Background()
	db, err := sql.Open("sqlite", "d:\\xampp\\htdocs\\Dashboard\\backend\\storage\\dashboard.db")
	if err != nil {
		t.Fatalf("failed to open real db: %v", err)
	}
	defer db.Close()

	svc := NewRouterService(db)

	cMain := NewClient("99.99.99.185:8728", "admin", "")
	if err := cMain.Connect(ctx); err == nil {
		defer cMain.Close()

		// 1. Reconcile Profiles to Router Main (which previously lacked 15MB)
		err := svc.ReconcileProfiles(ctx, cMain)
		if err != nil {
			t.Fatalf("ReconcileProfiles on Main failed: %v", err)
		}

		// 2. Try SyncCustomer on Router Main again
		err = cMain.SyncCustomer(ctx, "test", "test", "15MB", "active")
		if err != nil {
			t.Fatalf("SyncCustomer on Main failed: %v", err)
		}

		t.Log("Successfully reconciled profiles and synced customer test to 15MB on Main router!")
		
		// List secrets to verify
		secrets, _ := cMain.ListSecrets(ctx)
		t.Log("=== Router Main Secrets ===")
		for _, s := range secrets {
			t.Logf("Name: %s, Profile: %s, Disabled: %t", s.Name, s.Profile, s.Disabled)
		}
	} else {
		t.Fatalf("Router Main Connect Error: %v", err)
	}
}
