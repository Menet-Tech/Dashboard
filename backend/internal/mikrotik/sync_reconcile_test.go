package mikrotik

import (
	"context"
	"strings"
	"testing"
)

func TestRouterService_ReconcileSecrets(t *testing.T) {
	ctx := context.Background()

	// 1. Setup mock RouterOS server
	mock := newMockRouterOS(t)

	// Define initial state of mock RouterOS secrets
	// - "extraneous-user" exists on mock router but not in db (should be deleted)
	// - "outdated-user" exists on mock router but with wrong password/profile (should be updated)
	// - "new-user" does not exist on mock router but exists in db (should be added)
	mock.handlers["/ppp/secret/print"] = [][]string{
		{"!re", "=.id=*1", "=name=extraneous-user", "=password=extraneouspass", "=profile=default", "=disabled=false"},
		{"!re", "=.id=*2", "=name=outdated-user", "=password=oldpass", "=profile=old-profile", "=disabled=true"},
		{"!done"},
	}

	// We record all called RouterOS API commands to assert their execution
	var calls []string
	mock.onCommand = func(words []string) {
		calls = append(calls, strings.Join(words, " "))
	}

	// Handlers for mock router commands
	mock.handlers["/ppp/secret/add"] = [][]string{{"!done"}}
	mock.handlers["/ppp/secret/set"] = [][]string{{"!done"}}
	mock.handlers["/ppp/secret/remove"] = [][]string{{"!done"}}
	mock.handlers["/ppp/active/print"] = [][]string{{"!done"}}

	mock.Start()
	defer mock.Close()

	// 2. Setup SQLite DB and RouterService
	db := testDB(t)
	svc := NewRouterService(db)

	// Create test package "paket1" (id=1)
	_, err := db.Exec(`INSERT INTO paket (id, nama, kecepatan_mbps, harga) VALUES (1, 'paket1', 10, 100000)`)
	if err != nil {
		t.Fatal(err)
	}

	// Enable deleting unregistered secrets for this test
	_, err = db.Exec(`INSERT INTO pengaturan (key, value) VALUES ('mikrotik_delete_unregistered', '1')`)
	if err != nil {
		t.Fatal(err)
	}

	// Create test customers
	// - "outdated-user" (updated password to 'newpass', status 'active')
	// - "new-user" (created, status 'active')
	_, err = db.Exec(`
		INSERT INTO pelanggan (nama, paket_id, tgl_jatuh_tempo, user_pppoe, password_pppoe, status)
		VALUES 
			('Outdated Customer', 1, 10, 'outdated-user', 'newpass', 'active'),
			('New Customer', 1, 10, 'new-user', 'newpass', 'active')
	`)
	if err != nil {
		t.Fatal(err)
	}

	// 3. Run ReconcileSecrets
	router := Router{
		Name:     "Test Reconcile Router",
		Host:     mock.addr,
		Username: "admin",
		Password: "admin",
		IsActive: true,
		Role:     "main",
	}

	err = svc.ReconcileSecrets(ctx, router)
	if err != nil {
		t.Fatalf("ReconcileSecrets failed: %v", err)
	}

	// 4. Assertions on commands called on mock RouterOS
	hasAdd := false
	hasSet := false
	hasRemove := false

	for _, call := range calls {
		if strings.Contains(call, "/ppp/secret/add") && strings.Contains(call, "name=new-user") {
			hasAdd = true
		}
		if strings.Contains(call, "/ppp/secret/set") && strings.Contains(call, ".id=*2") && strings.Contains(call, "password=newpass") {
			hasSet = true
		}
		if strings.Contains(call, "/ppp/secret/remove") && strings.Contains(call, ".id=*1") {
			hasRemove = true
		}
	}

	if !hasAdd {
		t.Error("expected new-user to be added to mock router")
	}
	if !hasSet {
		t.Error("expected outdated-user to be updated on mock router")
	}
	if !hasRemove {
		t.Error("expected extraneous-user to be deleted from mock router")
	}
}
