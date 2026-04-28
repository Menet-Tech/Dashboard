package users

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

var ErrUserNotFound = errors.New("user not found")

type User struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	IsActive bool   `json:"is_active"`
}

type CreateInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

type UpdateInput struct {
	Role     string `json:"role"`
	IsActive bool   `json:"is_active"`
}

type ResetPasswordInput struct {
	Password string `json:"password"`
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository Repository
}

func (s Service) List(ctx context.Context) ([]User, error) {
	return s.Repository.List(ctx)
}

func (s Service) Create(ctx context.Context, input CreateInput) (User, error) {
	username := strings.TrimSpace(input.Username)
	if username == "" {
		return User{}, errors.New("username is required")
	}
	if len(strings.TrimSpace(input.Password)) < 8 {
		return User{}, errors.New("password minimal 8 karakter")
	}
	role := normalizeRole(input.Role)
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, fmt.Errorf("hash password: %w", err)
	}
	return s.Repository.Create(ctx, username, string(hash), role)
}

func (s Service) Update(ctx context.Context, id int64, input UpdateInput) (User, error) {
	return s.Repository.Update(ctx, id, normalizeRole(input.Role), input.IsActive)
}

func (s Service) ResetPassword(ctx context.Context, id int64, input ResetPasswordInput) error {
	if len(strings.TrimSpace(input.Password)) < 8 {
		return errors.New("password minimal 8 karakter")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	return s.Repository.UpdatePassword(ctx, id, string(hash))
}

func normalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "petugas":
		return "petugas"
	default:
		return "admin"
	}
}

func (r Repository) List(ctx context.Context) ([]User, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, username, role, is_active
		FROM users
		ORDER BY id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	items := []User{}
	for rows.Next() {
		var item User
		var isActive int
		if err := rows.Scan(&item.ID, &item.Username, &item.Role, &isActive); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		item.IsActive = isActive == 1
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r Repository) Create(ctx context.Context, username, passwordHash, role string) (User, error) {
	result, err := r.DB.ExecContext(ctx, `
		INSERT INTO users (username, password_hash, role, is_active, updated_at)
		VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
	`, username, passwordHash, role)
	if err != nil {
		return User{}, fmt.Errorf("create user: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return User{}, fmt.Errorf("get user id: %w", err)
	}
	return User{ID: id, Username: username, Role: role, IsActive: true}, nil
}

func (r Repository) Update(ctx context.Context, id int64, role string, isActive bool) (User, error) {
	activeValue := 0
	if isActive {
		activeValue = 1
	}
	result, err := r.DB.ExecContext(ctx, `
		UPDATE users
		SET role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, role, activeValue, id)
	if err != nil {
		return User{}, fmt.Errorf("update user: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return User{}, fmt.Errorf("update user rows affected: %w", err)
	}
	if affected == 0 {
		return User{}, ErrUserNotFound
	}
	return r.FindByID(ctx, id)
}

func (r Repository) UpdatePassword(ctx context.Context, id int64, passwordHash string) error {
	result, err := r.DB.ExecContext(ctx, `
		UPDATE users
		SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, passwordHash, id)
	if err != nil {
		return fmt.Errorf("update user password: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("update password rows affected: %w", err)
	}
	if affected == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r Repository) FindByID(ctx context.Context, id int64) (User, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT id, username, role, is_active
		FROM users
		WHERE id = ?
		LIMIT 1
	`, id)
	var item User
	var isActive int
	if err := row.Scan(&item.ID, &item.Username, &item.Role, &isActive); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, ErrUserNotFound
		}
		return User{}, fmt.Errorf("find user by id: %w", err)
	}
	item.IsActive = isActive == 1
	return item, nil
}
