package handler

import "net/http"

func WriteUnauthorized(w http.ResponseWriter) {
	writeError(w, http.StatusUnauthorized, "unauthorized")
}
