package templates

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var ErrTemplateNotFound = errors.New("template not found")

type Template struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	TriggerKey string `json:"trigger_key"`
	Content    string `json:"content"`
	IsActive   bool   `json:"is_active"`
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
}

func (s Service) List(ctx context.Context) ([]Template, error) {
	return s.Repository.List(ctx)
}

func (s Service) Create(ctx context.Context, item Template) (Template, error) {
	item = normalize(item)
	if err := validate(item); err != nil {
		return Template{}, err
	}
	return s.Repository.Create(ctx, item)
}

func (s Service) Update(ctx context.Context, id int64, item Template) (Template, error) {
	item = normalize(item)
	if err := validate(item); err != nil {
		return Template{}, err
	}
	return s.Repository.Update(ctx, id, item)
}

func (s Service) Delete(ctx context.Context, id int64) error {
	return s.Repository.Delete(ctx, id)
}

func (s Service) FindActiveByTrigger(ctx context.Context, triggerKey string) (Template, error) {
	return s.Repository.FindActiveByTrigger(ctx, triggerKey)
}

func normalize(item Template) Template {
	item.Name = strings.TrimSpace(item.Name)
	item.TriggerKey = strings.TrimSpace(item.TriggerKey)
	item.Content = strings.TrimSpace(item.Content)
	return item
}

func validate(item Template) error {
	if item.Name == "" {
		return errors.New("template name is required")
	}
	if item.TriggerKey == "" {
		return errors.New("trigger key is required")
	}
	if item.Content == "" {
		return errors.New("template content is required")
	}
	return nil
}

func (r Repository) List(ctx context.Context) ([]Template, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, nama, trigger_key, isi_template, is_active
		FROM template_wa
		ORDER BY id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list templates: %w", err)
	}
	defer rows.Close()

	items := []Template{}
	for rows.Next() {
		var item Template
		var active int
		if err := rows.Scan(&item.ID, &item.Name, &item.TriggerKey, &item.Content, &active); err != nil {
			return nil, fmt.Errorf("scan template: %w", err)
		}
		item.IsActive = active == 1
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r Repository) Create(ctx context.Context, item Template) (Template, error) {
	result, err := r.DB.ExecContext(ctx, `
		INSERT INTO template_wa (nama, trigger_key, isi_template, is_active, updated_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, item.Name, item.TriggerKey, item.Content, boolInt(item.IsActive))
	if err != nil {
		return Template{}, fmt.Errorf("create template: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Template{}, fmt.Errorf("template last insert id: %w", err)
	}
	item.ID = id
	return item, nil
}

func (r Repository) Update(ctx context.Context, id int64, item Template) (Template, error) {
	result, err := r.DB.ExecContext(ctx, `
		UPDATE template_wa
		SET nama = ?, trigger_key = ?, isi_template = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, item.Name, item.TriggerKey, item.Content, boolInt(item.IsActive), id)
	if err != nil {
		return Template{}, fmt.Errorf("update template: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Template{}, fmt.Errorf("template update rows affected: %w", err)
	}
	if affected == 0 {
		return Template{}, ErrTemplateNotFound
	}
	item.ID = id
	return item, nil
}

func (r Repository) Delete(ctx context.Context, id int64) error {
	result, err := r.DB.ExecContext(ctx, `DELETE FROM template_wa WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete template: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("template delete rows affected: %w", err)
	}
	if affected == 0 {
		return ErrTemplateNotFound
	}
	return nil
}

func (r Repository) FindActiveByTrigger(ctx context.Context, triggerKey string) (Template, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT id, nama, trigger_key, isi_template, is_active
		FROM template_wa
		WHERE trigger_key = ?
		  AND is_active = 1
		LIMIT 1
	`, triggerKey)

	var item Template
	var active int
	if err := row.Scan(&item.ID, &item.Name, &item.TriggerKey, &item.Content, &active); err != nil {
		if err == sql.ErrNoRows {
			return Template{}, ErrTemplateNotFound
		}
		return Template{}, fmt.Errorf("find template by trigger: %w", err)
	}
	item.IsActive = active == 1
	return item, nil
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
