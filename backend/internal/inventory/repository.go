package inventory

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type Repository struct {
	DB *sql.DB
}

func (r Repository) ListItems(ctx context.Context) ([]Item, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, name, description, category, quantity, unit, created_at, updated_at
		FROM inventory_items
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list inventory items: %w", err)
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		var i Item
		var cAt, uAt string
		if err := rows.Scan(&i.ID, &i.Name, &i.Description, &i.Category, &i.Quantity, &i.Unit, &cAt, &uAt); err != nil {
			return nil, err
		}
		i.CreatedAt, _ = time.Parse(time.RFC3339, cAt)
		i.UpdatedAt, _ = time.Parse(time.RFC3339, uAt)
		items = append(items, i)
	}
	return items, nil
}

func (r Repository) GetItem(ctx context.Context, id int64) (Item, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT id, name, description, category, quantity, unit, created_at, updated_at
		FROM inventory_items WHERE id = ?
	`, id)
	var i Item
	var cAt, uAt string
	err := row.Scan(&i.ID, &i.Name, &i.Description, &i.Category, &i.Quantity, &i.Unit, &cAt, &uAt)
	if err != nil {
		return Item{}, err
	}
	i.CreatedAt, _ = time.Parse(time.RFC3339, cAt)
	i.UpdatedAt, _ = time.Parse(time.RFC3339, uAt)
	return i, nil
}

func (r Repository) CreateItem(ctx context.Context, item Item) (Item, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := r.DB.ExecContext(ctx, `
		INSERT INTO inventory_items (name, description, category, quantity, unit, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, item.Name, item.Description, item.Category, item.Quantity, item.Unit, now, now)
	if err != nil {
		return Item{}, err
	}
	id, _ := res.LastInsertId()
	item.ID = id
	item.CreatedAt, _ = time.Parse(time.RFC3339, now)
	item.UpdatedAt = item.CreatedAt
	return item, nil
}

func (r Repository) UpdateItem(ctx context.Context, id int64, item Item) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := r.DB.ExecContext(ctx, `
		UPDATE inventory_items
		SET name = ?, description = ?, category = ?, unit = ?, updated_at = ?
		WHERE id = ?
	`, item.Name, item.Description, item.Category, item.Unit, now, id)
	return err
}

func (r Repository) DeleteItem(ctx context.Context, id int64) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM inventory_items WHERE id = ?`, id)
	return err
}

func (r Repository) AddLog(ctx context.Context, tx *sql.Tx, log Log) error {
	now := time.Now().UTC().Format(time.RFC3339)
	
	// Update item quantity
	var op string
	switch log.Type {
	case "in":
		op = "+"
	case "out":
		op = "-"
	default:
		return fmt.Errorf("invalid log type")
	}

	query := fmt.Sprintf(`UPDATE inventory_items SET quantity = quantity %s ?, updated_at = ? WHERE id = ?`, op)
	
	var err error
	if tx != nil {
		_, err = tx.ExecContext(ctx, query, log.Quantity, now, log.ItemID)
	} else {
		_, err = r.DB.ExecContext(ctx, query, log.Quantity, now, log.ItemID)
	}
	if err != nil {
		return err
	}

	insertQuery := `
		INSERT INTO inventory_logs (item_id, type, quantity, reference, notes, created_by, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	if tx != nil {
		_, err = tx.ExecContext(ctx, insertQuery, log.ItemID, log.Type, log.Quantity, log.Reference, log.Notes, log.CreatedBy, now)
	} else {
		_, err = r.DB.ExecContext(ctx, insertQuery, log.ItemID, log.Type, log.Quantity, log.Reference, log.Notes, log.CreatedBy, now)
	}
	return err
}

func (r Repository) ListLogs(ctx context.Context, itemID *int64) ([]Log, error) {
	query := `
		SELECT id, item_id, type, quantity, reference, notes, created_by, created_at
		FROM inventory_logs
	`
	args := []interface{}{}
	if itemID != nil {
		query += " WHERE item_id = ?"
		args = append(args, *itemID)
	}
	query += " ORDER BY id DESC LIMIT 200"

	rows, err := r.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list inventory logs: %w", err)
	}
	defer rows.Close()

	var logs []Log
	for rows.Next() {
		var l Log
		var cAt, notes, ref, cBy sql.NullString
		if err := rows.Scan(&l.ID, &l.ItemID, &l.Type, &l.Quantity, &ref, &notes, &cBy, &cAt); err != nil {
			return nil, err
		}
		l.Reference = ref.String
		l.Notes = notes.String
		l.CreatedBy = cBy.String
		if cAt.Valid {
			l.CreatedAt, _ = time.Parse(time.RFC3339, cAt.String)
		}
		logs = append(logs, l)
	}
	return logs, nil
}
