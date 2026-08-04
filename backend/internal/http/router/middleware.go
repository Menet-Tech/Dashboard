package router

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/golang-jwt/jwt/v5"

	"menettech/dashboard/backend/internal/audit"
	"menettech/dashboard/backend/internal/auth"
	"menettech/dashboard/backend/internal/http/handler"
)

func requestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			reqID := middleware.GetReqID(r.Context())

			recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(recorder, r)

			if logger != nil {
				logger.Debug("request completed",
					"request_id", reqID,
					"method", r.Method,
					"path", r.URL.Path,
					"status", recorder.status,
					"duration", time.Since(start))
			}
		})
	}
}

func traceIDHeader(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := middleware.GetReqID(r.Context())
		if strings.TrimSpace(reqID) != "" {
			w.Header().Set("X-Request-Id", reqID)
		}
		next.ServeHTTP(w, r)
	})
}

func authMiddleware(authService auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			internalKey := r.Header.Get("X-Internal-Key")
			if internalKey != "" {
				var dbKey string
				err := authService.Repository.DB.QueryRowContext(r.Context(),
					`SELECT value FROM pengaturan WHERE key = 'wa_api_key' LIMIT 1`).Scan(&dbKey)
				if err == nil && dbKey != "" && internalKey == dbKey {
					sysUser := auth.User{
						ID:       0,
						Username: "whatsapp_gateway",
						Role:     "admin",
						IsActive: true,
					}
					ctx := auth.WithUser(r.Context(), sysUser)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}

			cookie, err := r.Cookie(authService.SessionCookieName)
			if err != nil {
				handler.WriteUnauthorized(w)
				return
			}

			user, csrfToken, err := authService.Authenticate(r.Context(), cookie.Value)
			if err != nil {
				if errors.Is(err, auth.ErrUnauthorized) {
					handler.WriteUnauthorized(w)
					return
				}
				slog.Error("auth middleware database or system error", "error", err)
				handler.WriteError(w, http.StatusInternalServerError, "internal server error")
				return
			}

			ctx := auth.WithUser(r.Context(), user)
			ctx = auth.WithSessionToken(ctx, cookie.Value)
			ctx = auth.WithCSRFToken(ctx, csrfToken)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func csrfMiddleware(sessionCookieName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if user, ok := auth.UserFromContext(r.Context()); ok && user.ID == 0 && user.Username == "whatsapp_gateway" {
				next.ServeHTTP(w, r)
				return
			}

			switch r.Method {
			case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
				cookie, err := r.Cookie(sessionCookieName)
				if err != nil || cookie.Value == "" {
					handler.WriteUnauthorized(w)
					return
				}
				csrfToken, _ := auth.CSRFTokenFromContext(r.Context())
				requestCSRF := r.Header.Get("X-CSRF-Token")
				// Validate X-CSRF-Token: must match the CSRF token from database/context
				if requestCSRF == "" || requestCSRF != csrfToken {
					handler.WriteUnauthorized(w)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func auditMiddleware(auditService audit.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			if strings.HasPrefix(r.URL.Path, "/api/v1/auth/") {
				next.ServeHTTP(w, r)
				return
			}

			recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(recorder, r)

			user, ok := auth.UserFromContext(r.Context())
			if !ok {
				return
			}

			// extract client IP
			clientIP := r.RemoteAddr
			if host, _, err := net.SplitHostPort(clientIP); err == nil {
				clientIP = host
			}

			action := r.Method + " " + r.URL.Path
			message := "status=" + http.StatusText(recorder.status)
			var uID *int64
			if user.ID != 0 {
				uID = &user.ID
			}
			_ = auditService.RecordWithIP(r.Context(), uID, nil, action, message, strings.TrimSpace(clientIP))
		})
	}
}

func requireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := auth.UserFromContext(r.Context())
			if !ok {
				handler.WriteUnauthorized(w)
				return
			}

			hasRole := false
			for _, role := range roles {
				if user.Role == role {
					hasRole = true
					break
				}
			}

			if !hasRole {
				slog.Warn("access denied: insufficient role", "user_id", user.ID, "username", user.Username, "required", roles, "path", r.URL.Path)
				writeJSONError(w, http.StatusForbidden, "akses ditolak: role tidak sesuai")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "error": message})
}

type contextKey string
const gacsPortalKey contextKey = "gacs_portal"
const gacsUserKey contextKey = "gacs_user"

func gacsAuthMiddleware(authService auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// 1. Try session cookie authentication first
			cookie, err := r.Cookie(authService.SessionCookieName)
			if err == nil && cookie.Value != "" {
				user, csrfToken, err := authService.Authenticate(r.Context(), cookie.Value)
				if err == nil {
					ctx := auth.WithUser(r.Context(), user)
					ctx = auth.WithSessionToken(ctx, cookie.Value)
					ctx = auth.WithCSRFToken(ctx, csrfToken)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}

			// 2. Try JWT Bearer authentication
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
				claims := &struct {
					UserID   int64  `json:"userId,omitempty"`
					Username string `json:"username,omitempty"`
					Role     string `json:"role,omitempty"`
					Portal   bool   `json:"portal,omitempty"`
					APIKey   string `json:"apiKey,omitempty"`
					jwt.RegisteredClaims
				}{}

				token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
					secret := os.Getenv("JWT_SECRET")
					return []byte(secret), nil
				})

				if err == nil && token.Valid {
					if claims.Portal {
						ctx := context.WithValue(r.Context(), gacsPortalKey, true)
						sysUser := auth.User{
							ID:       0,
							Username: "portal_api",
							Role:     "admin",
							IsActive: true,
						}
						ctx = auth.WithUser(ctx, sysUser)
						next.ServeHTTP(w, r.WithContext(ctx))
						return
					}

					sysUser := auth.User{
						ID:       claims.UserID,
						Username: claims.Username,
						Role:     claims.Role,
						IsActive: true,
					}
					ctx := context.WithValue(r.Context(), gacsUserKey, struct {
						ID   int64
						Role string
					}{ID: claims.UserID, Role: claims.Role})

					ctx = auth.WithUser(ctx, sysUser)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}

			// 3. Fallback unauthorized
			writeJSONError(w, http.StatusUnauthorized, "Authentication token required")
		})
	}
}

func gacsWriteRoleMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		user, ok := auth.UserFromContext(r.Context())
		if !ok || (user.Role != "admin" && user.Role != "petugas") {
			writeJSONError(w, http.StatusForbidden, "akses ditolak: role tidak memiliki izin untuk modifikasi data")
			return
		}
		next.ServeHTTP(w, r)
	})
}


