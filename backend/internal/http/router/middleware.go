package router

import (
	"log/slog"
	"net/http"
	"strings"
	"time"

	"menettech/dashboard/backend/internal/audit"
	"menettech/dashboard/backend/internal/auth"
	"menettech/dashboard/backend/internal/http/handler"
)

func requestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			next.ServeHTTP(w, r)
			if logger != nil {
				logger.Debug("request completed", "method", r.Method, "path", r.URL.Path, "duration", time.Since(start))
			}
		})
	}
}

func authMiddleware(authService auth.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(authService.SessionCookieName)
			if err != nil {
				handler.WriteUnauthorized(w)
				return
			}

			user, err := authService.Authenticate(r.Context(), cookie.Value)
			if err != nil {
				handler.WriteUnauthorized(w)
				return
			}

			ctx := auth.WithUser(r.Context(), user)
			ctx = auth.WithSessionToken(ctx, cookie.Value)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func csrfMiddleware(sessionCookieName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
				cookie, err := r.Cookie(sessionCookieName)
				if err != nil || cookie.Value == "" {
					handler.WriteUnauthorized(w)
					return
				}
				if r.Header.Get("X-CSRF-Token") != cookie.Value {
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

			action := r.Method + " " + r.URL.Path
			message := "status=" + http.StatusText(recorder.status)
			_ = auditService.Record(r.Context(), &user.ID, nil, action, message)
		})
	}
}
