package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"menettech/dashboard/backend/internal/auth"
)

func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]any{
		"success": false,
		"error":   message,
	})
}

func decodeJSON(r *http.Request, destination any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(destination)
}

func currentUser(r *http.Request) (auth.User, error) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		return auth.User{}, errors.New("authenticated user missing from context")
	}

	return user, nil
}

func requireAdmin(r *http.Request) error {
	user, err := currentUser(r)
	if err != nil {
		return err
	}
	if user.Role != "admin" {
		return errors.New("admin access required")
	}
	return nil
}

func csrfTokenFromRequest(r *http.Request) string {
	token, ok := auth.CSRFTokenFromContext(r.Context())
	if ok {
		return token
	}
	return ""
}
