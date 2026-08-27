package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"menettech/dashboard/backend/internal/notifications"
)

const placeholderHash = "BOOTSTRAP_PENDING"

var ErrInvalidCredentials = errors.New("invalid credentials")
var ErrUnauthorized = errors.New("unauthorized")
var ErrTooManyAttempts = errors.New("too many login attempts")

type User struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	IsActive bool   `json:"is_active"`
}

type storedUser struct {
	User
	PasswordHash string
}

type Session struct {
	Token     string
	CSRFToken string
	UserID    int64
	ExpiresAt time.Time
}

type Repository struct {
	DB *sql.DB
}

type Service struct {
	Repository             Repository
	SessionCookieName      string
	SessionTTL             time.Duration
	SessionCookieSecure    bool
	LoginMaxAttempts       int
	LoginWindow            time.Duration
	BootstrapAdminUsername string
	BootstrapAdminPassword string
	Discord                notifications.DiscordSender
}

func (s Service) Bootstrap(ctx context.Context) error {
	username := strings.TrimSpace(s.BootstrapAdminUsername)
	password := strings.TrimSpace(s.BootstrapAdminPassword)
	if username == "" {
		username = "admin"
	}
	if password == "" {
		if os.Getenv("APP_ENV") == "production" {
			return errors.New("BOOTSTRAP_ADMIN_PASSWORD must be set in production environment")
		}
		password = "password"
	}
	if username == "" {
		return nil
	}

	user, err := s.Repository.FindUserByUsername(ctx, username)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("hash bootstrap password: %w", err)
		}

		return s.Repository.CreateUser(ctx, username, string(hash), "admin")
	}

	if user.PasswordHash != placeholderHash {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash bootstrap password: %w", err)
	}

	return s.Repository.UpdateUserPasswordHash(ctx, user.ID, string(hash))
}

func (s Service) Login(ctx context.Context, username, password, identifier, ip string) (User, Session, error) {
	maxAttempts := s.LoginMaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = 5
	}
	loginWindow := s.LoginWindow
	if loginWindow <= 0 {
		loginWindow = 15 * time.Minute
	}

	if strings.TrimSpace(identifier) != "" {
		failures, err := s.Repository.CountRecentFailedLogins(ctx, identifier, time.Now().UTC().Add(-loginWindow))
		if err != nil {
			return User{}, Session{}, err
		}
		if failures >= maxAttempts {
			if s.Discord != nil && s.Discord.IsEventEnabled(ctx, "discord_notify_security") {
				_ = s.Discord.SendEmbed(ctx, notifications.DiscordEmbed{
					Title:       "🚨 Deteksi Brute Force Login",
					Description: "Sistem mendeteksi aktivitas mencurigakan berupa percobaan login berulang.",
					Color:       15158332, // Red (#e74c3c)
					Fields: []notifications.EmbedField{
						{Name: "Identifier", Value: identifier, Inline: true},
						{Name: "Jumlah Percobaan Gagal", Value: fmt.Sprintf("%d Kali", failures), Inline: true},
						{Name: "Waktu Terdeteksi", Value: time.Now().Format("2006-01-02 15:04:05"), Inline: false},
						{Name: "Tindakan Sistem", Value: "Akses login ditolak sementara (Rate Limited)", Inline: false},
					},
				})
			}
			return User{}, Session{}, ErrTooManyAttempts
		}
	}

	user, err := s.Repository.FindUserByUsername(ctx, strings.TrimSpace(username))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			_ = s.Repository.RecordLoginAttempt(ctx, identifier, false)
			return User{}, Session{}, ErrInvalidCredentials
		}
		return User{}, Session{}, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		_ = s.Repository.RecordLoginAttempt(ctx, identifier, false)
		return User{}, Session{}, ErrInvalidCredentials
	}
	if !user.IsActive {
		_ = s.Repository.RecordLoginAttempt(ctx, identifier, false)
		return User{}, Session{}, ErrInvalidCredentials
	}

	token, err := generateToken()
	if err != nil {
		return User{}, Session{}, fmt.Errorf("generate session token: %w", err)
	}

	csrfToken, err := generateToken()
	if err != nil {
		return User{}, Session{}, fmt.Errorf("generate csrf token: %w", err)
	}

	session := Session{
		Token:     token,
		CSRFToken: csrfToken,
		UserID:    user.ID,
		ExpiresAt: time.Now().UTC().Add(sessionTTL(s.SessionTTL)),
	}

	if err := s.Repository.CreateSession(ctx, session); err != nil {
		return User{}, Session{}, err
	}

	_ = s.Repository.RecordLoginAttempt(ctx, identifier, true)
	_ = s.Repository.UpdateLastLogin(ctx, user.ID, ip)

	return user.User, session, nil
}

func sessionTTL(value time.Duration) time.Duration {
	if value <= 0 {
		return 24 * time.Hour
	}

	return value
}

func (s Service) Authenticate(ctx context.Context, token string) (User, string, error) {
	if strings.TrimSpace(token) == "" {
		return User{}, "", ErrUnauthorized
	}

	user, csrfToken, expiresAt, lastSeenAt, err := s.Repository.FindUserBySessionToken(ctx, token)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, "", ErrUnauthorized
		}
		return User{}, "", err
	}

	if expiresAt.Before(time.Now().UTC()) {
		_ = s.Repository.DeleteSession(ctx, token)
		return User{}, "", ErrUnauthorized
	}

	// Throttle Touching the session in the database to at most once per 60 seconds.
	// This dramatically reduces write locks and prevents writer deadlocks on concurrent requests.
	if time.Now().UTC().Sub(lastSeenAt) > 60*time.Second {
		if err := s.Repository.TouchSession(ctx, token); err != nil {
			return User{}, "", err
		}
	}

	return user, csrfToken, nil
}

func (s Service) Logout(ctx context.Context, token string) error {
	if strings.TrimSpace(token) == "" {
		return nil
	}

	return s.Repository.DeleteSession(ctx, token)
}

func (r Repository) FindUserByUsername(ctx context.Context, username string) (storedUser, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT id, username, role, is_active, password_hash
		FROM users
		WHERE username = ?
		LIMIT 1
	`, username)

	var user storedUser
	var isActive int
	err := row.Scan(&user.ID, &user.Username, &user.Role, &isActive, &user.PasswordHash)
	if err != nil {
		return storedUser{}, err
	}
	user.IsActive = isActive == 1

	return user, nil
}

func (r Repository) CreateUser(ctx context.Context, username, passwordHash, role string) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO users (username, password_hash, role, updated_at)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
	`, username, passwordHash, role)
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}

	return nil
}

func (r Repository) UpdateUserPasswordHash(ctx context.Context, userID int64, passwordHash string) error {
	_, err := r.DB.ExecContext(ctx, `
		UPDATE users
		SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, passwordHash, userID)
	if err != nil {
		return fmt.Errorf("update user password hash: %w", err)
	}

	return nil
}

func (r Repository) UpdateLastLogin(ctx context.Context, userID int64, ip string) error {
	_, err := r.DB.ExecContext(ctx, `
		UPDATE users
		SET last_login_at = CURRENT_TIMESTAMP, last_login_ip = ?
		WHERE id = ?
	`, ip, userID)
	if err != nil {
		return fmt.Errorf("update last login: %w", err)
	}
	return nil
}

func (r Repository) CreateSession(ctx context.Context, session Session) error {
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO sessions (token, csrf_token, user_id, expires_at, last_seen_at)
		VALUES (?, ?, ?, ?, ?)
	`, session.Token, session.CSRFToken, session.UserID, session.ExpiresAt.Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		return fmt.Errorf("create session: %w", err)
	}

	return nil
}

func (r Repository) FindUserBySessionToken(ctx context.Context, token string) (User, string, time.Time, time.Time, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT u.id, u.username, u.role, u.is_active, s.expires_at, COALESCE(s.csrf_token, ''), s.last_seen_at
		FROM sessions s
		INNER JOIN users u ON u.id = s.user_id
		WHERE s.token = ?
		LIMIT 1
	`, token)

	var user User
	var isActive int
	var expiresAtRaw string
	var csrfToken string
	var lastSeenAtRaw string
	if err := row.Scan(&user.ID, &user.Username, &user.Role, &isActive, &expiresAtRaw, &csrfToken, &lastSeenAtRaw); err != nil {
		return User{}, "", time.Time{}, time.Time{}, err
	}
	user.IsActive = isActive == 1

	expiresAt, err := time.Parse(time.RFC3339, expiresAtRaw)
	if err != nil {
		return User{}, "", time.Time{}, time.Time{}, fmt.Errorf("parse session expiry: %w", err)
	}

	lastSeenAt, err := time.Parse(time.RFC3339, lastSeenAtRaw)
	if err != nil {
		// Fallback to zero time if parsing fails, so it will trigger a TouchSession
		lastSeenAt = time.Time{}
	}

	if !user.IsActive {
		_ = r.DeleteSession(ctx, token)
		return User{}, "", time.Time{}, time.Time{}, ErrUnauthorized
	}

	return user, csrfToken, expiresAt, lastSeenAt, nil
}

func (r Repository) TouchSession(ctx context.Context, token string) error {
	_, err := r.DB.ExecContext(ctx, `
		UPDATE sessions
		SET last_seen_at = ?
		WHERE token = ?
	`, time.Now().UTC().Format(time.RFC3339), token)
	if err != nil {
		return fmt.Errorf("touch session: %w", err)
	}

	return nil
}

func (r Repository) DeleteSession(ctx context.Context, token string) error {
	_, err := r.DB.ExecContext(ctx, `DELETE FROM sessions WHERE token = ?`, token)
	if err != nil {
		return fmt.Errorf("delete session: %w", err)
	}

	return nil
}

func (r Repository) CountRecentFailedLogins(ctx context.Context, identifier string, since time.Time) (int, error) {
	row := r.DB.QueryRowContext(ctx, `
		SELECT COUNT(1)
		FROM login_attempts
		WHERE identifier = ? AND success = 0 AND attempted_at >= ?
	`, identifier, since.Format(time.RFC3339))
	var count int
	if err := row.Scan(&count); err != nil {
		return 0, fmt.Errorf("count recent failed logins: %w", err)
	}
	return count, nil
}

func (r Repository) RecordLoginAttempt(ctx context.Context, identifier string, success bool) error {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return nil
	}
	successValue := 0
	if success {
		successValue = 1
	}
	_, err := r.DB.ExecContext(ctx, `
		INSERT INTO login_attempts(identifier, success, attempted_at)
		VALUES (?, ?, ?)
	`, identifier, successValue, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		return fmt.Errorf("record login attempt: %w", err)
	}
	return nil
}

func generateToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(raw), nil
}
