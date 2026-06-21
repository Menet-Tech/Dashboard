package mikrotik

import (
	"context"
	"strings"
	"testing"
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
