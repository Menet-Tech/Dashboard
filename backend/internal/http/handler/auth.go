package handler

import (
	"errors"
	"net"
	"net/http"
	"strings"

	"menettech/dashboard/backend/internal/audit"
	"menettech/dashboard/backend/internal/auth"
)

type AuthHandler struct {
	Service auth.Service
	Audit   audit.Service
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func NewAuthHandler(service auth.Service, auditService audit.Service) AuthHandler {
	return AuthHandler{Service: service, Audit: auditService}
}

func (h AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var request loginRequest
	if err := decodeJSON(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid login payload")
		return
	}

	identifier := loginIdentifier(r, request.Username)
	user, session, err := h.Service.Login(r.Context(), request.Username, request.Password, identifier)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "username atau password tidak valid")
			return
		}
		if errors.Is(err, auth.ErrTooManyAttempts) {
			writeError(w, http.StatusTooManyRequests, "terlalu banyak percobaan login, coba lagi beberapa menit lagi")
			return
		}

		writeError(w, http.StatusInternalServerError, "failed to authenticate user")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     h.Service.SessionCookieName,
		Value:    session.Token,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.Service.SessionCookieSecure,
		SameSite: http.SameSiteLaxMode,
		Expires:  session.ExpiresAt,
		MaxAge:   int(h.Service.SessionTTL.Seconds()),
	})

	_ = h.Audit.Record(r.Context(), &user.ID, nil, "auth.login", "User login berhasil")

	writeJSON(w, http.StatusOK, map[string]any{
		"user":       user,
		"csrf_token": session.CSRFToken,
	})
}

func (h AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user":       user,
		"csrf_token": csrfTokenFromRequest(r),
	})
}

func (h AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.Service.SessionCookieName)
	if err == nil {
		_ = h.Service.Logout(r.Context(), cookie.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     h.Service.SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   h.Service.SessionCookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})

	if user, err := currentUser(r); err == nil {
		_ = h.Audit.Record(r.Context(), &user.ID, nil, "auth.logout", "User logout")
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message": "logged out",
	})
}

func loginIdentifier(r *http.Request, username string) string {
	remoteAddr := strings.TrimSpace(r.RemoteAddr)
	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		remoteAddr = host
	}
	parts := []string{strings.TrimSpace(username), remoteAddr}
	return strings.Join(parts, "|")
}
