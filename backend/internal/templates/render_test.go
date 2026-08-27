package templates

import "testing"

func TestRenderReplacesKnownPlaceholders(t *testing.T) {
	content := "Halo {nama}, invoice {invoice_number} jatuh tempo {jatuh_tempo}"
	actual := Render(content, map[string]string{
		"nama":           "Budi",
		"invoice_number": "08-04-2026/1/20/001",
		"jatuh_tempo":    "08-04-2026",
	})

	expected := "Halo Budi, invoice 08-04-2026/1/20/001 jatuh tempo 08-04-2026"
	if actual != expected {
		t.Fatalf("expected %q, got %q", expected, actual)
	}
}
