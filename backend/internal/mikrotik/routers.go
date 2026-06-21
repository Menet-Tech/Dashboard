package mikrotik

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

type Router struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Host      string `json:"host"`
	Username  string `json:"username"`
	Password  string `json:"password"`
	IsActive  bool   `json:"is_active"`
	Role      string `json:"role"` // "main", "slave", "none"
	IsOnline  bool   `json:"is_online"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type RouterService struct {
	DB *sql.DB
}

func NewRouterService(db *sql.DB) *RouterService {
	return &RouterService{DB: db}
}

func (s *RouterService) List(ctx context.Context) ([]Router, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, nama, host, username, password, is_active, role, is_online, created_at, updated_at
		FROM mikrotik_routers
		ORDER BY id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list routers: %w", err)
	}
	defer rows.Close()

	var list []Router
	for rows.Next() {
		var r Router
		var isActive int
		var isOnlineVal int
		if err := rows.Scan(&r.ID, &r.Name, &r.Host, &r.Username, &r.Password, &isActive, &r.Role, &isOnlineVal, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan router: %w", err)
		}
		r.IsActive = isActive != 0
		r.IsOnline = isOnlineVal != 0
		list = append(list, r)
	}
	return list, rows.Err()
}

func (s *RouterService) ListActive(ctx context.Context) ([]Router, error) {
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id, nama, host, username, password, is_active, role, is_online, created_at, updated_at
		FROM mikrotik_routers
		WHERE is_active = 1
		ORDER BY id DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list active routers: %w", err)
	}
	defer rows.Close()

	var list []Router
	for rows.Next() {
		var r Router
		var isActive int
		var isOnlineVal int
		if err := rows.Scan(&r.ID, &r.Name, &r.Host, &r.Username, &r.Password, &isActive, &r.Role, &isOnlineVal, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan active router: %w", err)
		}
		r.IsActive = isActive != 0
		r.IsOnline = isOnlineVal != 0
		list = append(list, r)
	}
	return list, rows.Err()
}

func (s *RouterService) FindByID(ctx context.Context, id int64) (Router, error) {
	row := s.DB.QueryRowContext(ctx, `
		SELECT id, nama, host, username, password, is_active, role, is_online, created_at, updated_at
		FROM mikrotik_routers
		WHERE id = ?
		LIMIT 1
	`, id)
	var r Router
	var isActive int
	var isOnlineVal int
	if err := row.Scan(&r.ID, &r.Name, &r.Host, &r.Username, &r.Password, &isActive, &r.Role, &isOnlineVal, &r.CreatedAt, &r.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Router{}, errors.New("router not found")
		}
		return Router{}, fmt.Errorf("find router: %w", err)
	}
	r.IsActive = isActive != 0
	r.IsOnline = isOnlineVal != 0
	return r, nil
}

func (s *RouterService) Create(ctx context.Context, r Router) (Router, error) {
	r.Name = strings.TrimSpace(r.Name)
	r.Host = strings.TrimSpace(r.Host)
	r.Username = strings.TrimSpace(r.Username)
	r.Password = strings.TrimSpace(r.Password)
	r.Role = strings.TrimSpace(r.Role)

	if r.Name == "" || r.Host == "" || r.Username == "" {
		return Router{}, errors.New("name, host, and username are required")
	}
	if r.Role == "" {
		r.Role = "none"
	}

	isActive := 0
	if r.IsActive {
		isActive = 1
	}

	isOnline := 0
	if r.IsOnline {
		isOnline = 1
	}

	result, err := s.DB.ExecContext(ctx, `
		INSERT INTO mikrotik_routers (nama, host, username, password, is_active, role, is_online, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`, r.Name, r.Host, r.Username, r.Password, isActive, r.Role, isOnline)
	if err != nil {
		return Router{}, fmt.Errorf("create router: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return Router{}, fmt.Errorf("get router id: %w", err)
	}

	r.ID = id
	return r, nil
}

func (s *RouterService) Update(ctx context.Context, id int64, r Router, updatePassword bool) (Router, error) {
	r.Name = strings.TrimSpace(r.Name)
	r.Host = strings.TrimSpace(r.Host)
	r.Username = strings.TrimSpace(r.Username)
	r.Password = strings.TrimSpace(r.Password)
	r.Role = strings.TrimSpace(r.Role)

	if r.Name == "" || r.Host == "" || r.Username == "" {
		return Router{}, errors.New("name, host, and username are required")
	}
	if r.Role == "" {
		r.Role = "none"
	}

	isActive := 0
	if r.IsActive {
		isActive = 1
	}

	isOnline := 0
	if r.IsOnline {
		isOnline = 1
	}

	var result sql.Result
	var err error
	if updatePassword {
		result, err = s.DB.ExecContext(ctx, `
			UPDATE mikrotik_routers
			SET nama = ?, host = ?, username = ?, password = ?, is_active = ?, role = ?, is_online = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, r.Name, r.Host, r.Username, r.Password, isActive, r.Role, isOnline, id)
	} else {
		result, err = s.DB.ExecContext(ctx, `
			UPDATE mikrotik_routers
			SET nama = ?, host = ?, username = ?, is_active = ?, role = ?, is_online = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, r.Name, r.Host, r.Username, isActive, r.Role, isOnline, id)
	}

	if err != nil {
		return Router{}, fmt.Errorf("update router: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return Router{}, err
	}
	if affected == 0 {
		return Router{}, errors.New("router not found")
	}

	r.ID = id
	return r, nil
}

func (s *RouterService) Delete(ctx context.Context, id int64) error {
	result, err := s.DB.ExecContext(ctx, `DELETE FROM mikrotik_routers WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete router: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return errors.New("router not found")
	}
	return nil
}

func (s *RouterService) UpdateOnlineStatus(ctx context.Context, id int64, isOnline bool) error {
	val := 0
	if isOnline {
		val = 1
	}
	_, err := s.DB.ExecContext(ctx, `
		UPDATE mikrotik_routers
		SET is_online = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, val, id)
	if err != nil {
		return fmt.Errorf("update online status: %w", err)
	}
	return nil
}
