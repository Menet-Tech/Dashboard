package templates

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

var ErrEmailTemplateNotFound = errors.New("email template not found")

type EmailTemplate struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	TriggerKey string `json:"trigger_key"`
	Subject    string `json:"subject"`
	Content    string `json:"content"`
	IsActive   bool   `json:"is_active"`
}

func (s Service) ListEmailTemplates(ctx context.Context) ([]EmailTemplate, error) {
	return s.Repository.ListEmailTemplates(ctx)
}

func (s Service) CreateEmailTemplate(ctx context.Context, item EmailTemplate) (EmailTemplate, error) {
	item = normalizeEmailTemplate(item)
	if err := validateEmailTemplate(item); err != nil {
		return EmailTemplate{}, err
	}
	return s.Repository.CreateEmailTemplate(ctx, item)
}

func (s Service) UpdateEmailTemplate(ctx context.Context, id int64, item EmailTemplate) (EmailTemplate, error) {
	item = normalizeEmailTemplate(item)
	if err := validateEmailTemplate(item); err != nil {
		return EmailTemplate{}, err
	}
	return s.Repository.UpdateEmailTemplate(ctx, id, item)
}

func (s Service) DeleteEmailTemplate(ctx context.Context, id int64) error {
	return s.Repository.DeleteEmailTemplate(ctx, id)
}

func (s Service) FindActiveEmailTemplateByTrigger(ctx context.Context, triggerKey string) (EmailTemplate, error) {
	return s.Repository.FindActiveEmailTemplateByTrigger(ctx, triggerKey)
}

func normalizeEmailTemplate(item EmailTemplate) EmailTemplate {
	item.Name = strings.TrimSpace(item.Name)
	item.TriggerKey = strings.TrimSpace(item.TriggerKey)
	item.Subject = strings.TrimSpace(item.Subject)
	item.Content = strings.TrimSpace(item.Content)
	return item
}

func validateEmailTemplate(item EmailTemplate) error {
	if item.Name == "" {
		return errors.New("email template name is required")
	}
	if item.TriggerKey == "" {
		return errors.New("trigger key is required")
	}
	if item.Subject == "" {
		return errors.New("subject is required")
	}
	if item.Content == "" {
		return errors.New("content is required")
	}
	return nil
}

func (r Repository) ListEmailTemplates(ctx context.Context) ([]EmailTemplate, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, nama, trigger_key, subject, isi_template, is_active
		FROM template_email
		ORDER BY id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list email templates: %w", err)
	}
	defer rows.Close()

	items := []EmailTemplate{}
	for rows.Next() {
		var item EmailTemplate
		var active int
		if err := rows.Scan(&item.ID, &item.Name, &item.TriggerKey, &item.Subject, &item.Content, &active); err != nil {
			return nil, fmt.Errorf("scan email template: %w", err)
		}
		item.IsActive = active == 1
		items = append(items, item)
	}

	return items, rows.Err()
}

func (r Repository) CreateEmailTemplate(ctx context.Context, item EmailTemplate) (EmailTemplate, error) {
	result, err := r.DB.ExecContext(ctx, `
		INSERT INTO template_email (nama, trigger_key, subject, isi_template, is_active, updated_at)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, item.Name, item.TriggerKey, item.Subject, item.Content, boolInt(item.IsActive))
	if err != nil {
		return EmailTemplate{}, fmt.Errorf("create email template: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return EmailTemplate{}, fmt.Errorf("email template last insert id: %w", err)
	}
	item.ID = id
	return item, nil
}

func (r Repository) UpdateEmailTemplate(ctx context.Context, id int64, item EmailTemplate) (EmailTemplate, error) {
	result, err := r.DB.ExecContext(ctx, `
		UPDATE template_email
		SET nama = ?, trigger_key = ?, subject = ?, isi_template = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, item.Name, item.TriggerKey, item.Subject, item.Content, boolInt(item.IsActive), id)
	if err != nil {
		return EmailTemplate{}, fmt.Errorf("update email template: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return EmailTemplate{}, fmt.Errorf("email template update rows affected: %w", err)
	}
	if affected == 0 {
		return EmailTemplate{}, ErrEmailTemplateNotFound
	}
	item.ID = id
	return item, nil
}

func (r Repository) DeleteEmailTemplate(ctx context.Context, id int64) error {
	result, err := r.DB.ExecContext(ctx, `DELETE FROM template_email WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete email template: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("email template delete rows affected: %w", err)
	}
	if affected == 0 {
		return ErrEmailTemplateNotFound
	}
	return nil
}

func (r Repository) FindActiveEmailTemplateByTrigger(ctx context.Context, triggerKey string) (EmailTemplate, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT id, nama, trigger_key, subject, isi_template, is_active
		FROM template_email
		WHERE trigger_key = ?
		  AND is_active = 1
		LIMIT 1
	`, triggerKey)

	var item EmailTemplate
	var active int
	if err := row.Scan(&item.ID, &item.Name, &item.TriggerKey, &item.Subject, &item.Content, &active); err != nil {
		if err == sql.ErrNoRows {
			return EmailTemplate{}, ErrEmailTemplateNotFound
		}
		return EmailTemplate{}, fmt.Errorf("find email template by trigger: %w", err)
	}
	item.IsActive = active == 1
	return item, nil
}
