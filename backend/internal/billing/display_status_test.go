package billing

import (
	"testing"
	"time"
)

func TestComputeDisplayStatus(t *testing.T) {
	now := time.Date(2026, 4, 27, 10, 0, 0, 0, time.UTC)

	tests := []struct {
		name          string
		status        string
		dueDate       string
		menunggakDays int
		expected      string
	}{
		{
			name:          "paid bill stays lunas",
			status:        "lunas",
			dueDate:       "2026-04-08",
			menunggakDays: 30,
			expected:      "lunas",
		},
		{
			name:          "future due date stays belum_bayar",
			status:        "belum_bayar",
			dueDate:       "2026-04-30",
			menunggakDays: 30,
			expected:      "belum_bayar",
		},
		{
			name:          "recent overdue becomes jatuh_tempo",
			status:        "belum_bayar",
			dueDate:       "2026-04-20",
			menunggakDays: 30,
			expected:      "jatuh_tempo",
		},
		{
			name:          "long overdue becomes menunggak",
			status:        "belum_bayar",
			dueDate:       "2026-03-01",
			menunggakDays: 30,
			expected:      "menunggak",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual := computeDisplayStatus(test.status, test.dueDate, test.menunggakDays, now)
			if actual != test.expected {
				t.Fatalf("expected %q, got %q", test.expected, actual)
			}
		})
	}
}
