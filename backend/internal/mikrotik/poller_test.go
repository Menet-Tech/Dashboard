package mikrotik

import (
	"context"
	"testing"
	"time"
)

func TestExtractPPPoEUser(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"<pppoe-budi>", "budi"},
		{"pppoe-ani", "ani"},
		{"<PPPoE-joko>", "joko"}, // check case-insensitive match on prefix/suffix
		{"client1", ""},
		{"", ""},
	}

	for _, tc := range tests {
		actual := extractPPPoEUser(tc.input)
		if actual != tc.expected {
			t.Errorf("extractPPPoEUser(%q) = %q; expected %q", tc.input, actual, tc.expected)
		}
	}
}

func TestTrafficPoller_StatsStore(t *testing.T) {
	db := testDB(t)
	routerSvc := NewRouterService(db)
	poller := NewTrafficPoller(routerSvc)

	// Ensure initially empty
	stats := poller.GetStats("nonexistent")
	if stats.RxRate != 0 || stats.TxRate != 0 {
		t.Errorf("expected zero stats, got %+v", stats)
	}

	// Manually inject stats to test GetStats/GetAllStats with trimming and case insensitivity
	poller.mu.Lock()
	poller.rates["budi"] = TrafficStats{RxRate: 1000000, TxRate: 200000}
	poller.rates["ani"] = TrafficStats{RxRate: 5000000, TxRate: 1000000}
	poller.mu.Unlock()

	budiStats := poller.GetStats("  Budi  ")
	if budiStats.RxRate != 1000000 || budiStats.TxRate != 200000 {
		t.Errorf("expected budi stats Rx=1000000 Tx=200000, got %+v", budiStats)
	}

	all := poller.GetAllStats()
	if len(all) != 2 {
		t.Errorf("expected 2 records in all stats, got %d", len(all))
	}
	if all["budi"].RxRate != 1000000 || all["ani"].RxRate != 5000000 {
		t.Errorf("incorrect data in all stats copy: %+v", all)
	}

	// Ensure copy is separate (modifying copy doesn't affect source)
	all["budi"] = TrafficStats{RxRate: 99, TxRate: 99}
	originalBudi := poller.GetStats("budi")
	if originalBudi.RxRate == 99 {
		t.Error("GetAllStats returned map is not a copy; modifications leaked to original")
	}
}

func TestTrafficPoller_StartCancel(t *testing.T) {
	db := testDB(t)
	routerSvc := NewRouterService(db)
	poller := NewTrafficPoller(routerSvc)

	ctx, cancel := context.WithCancel(context.Background())
	doneChan := make(chan struct{})

	go func() {
		poller.Start(ctx, 10*time.Millisecond)
		close(doneChan)
	}()

	// Let it run slightly then cancel
	time.Sleep(20 * time.Millisecond)
	cancel()

	select {
	case <-doneChan:
		// success
	case <-time.After(1 * time.Second):
		t.Fatal("Start loop did not terminate after context cancel")
	}
}
