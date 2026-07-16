package inventory

import "time"

type Item struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	Quantity    int       `json:"quantity"`
	Unit        string    `json:"unit"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Log struct {
	ID        int64     `json:"id"`
	ItemID    int64     `json:"item_id"`
	Type      string    `json:"type"` // "in" or "out"
	Quantity  int       `json:"quantity"`
	Reference string    `json:"reference"`
	Notes     string    `json:"notes"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}
