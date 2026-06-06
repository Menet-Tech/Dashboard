package handler

import (
	"net/http"

	"menettech/dashboard/backend/internal/broadcast"
)

type BroadcastHandler struct {
	Service broadcast.Service
}

func NewBroadcastHandler(service broadcast.Service) BroadcastHandler {
	return BroadcastHandler{Service: service}
}

type sendBroadcastPayload struct {
	TargetType string  `json:"target_type"`
	TargetIDs  []int64 `json:"target_ids"`
	Message    string  `json:"message"`
}

func (h BroadcastHandler) Send(w http.ResponseWriter, r *http.Request) {
	var payload sendBroadcastPayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid broadcast payload")
		return
	}

	count, err := h.Service.SendBroadcast(r.Context(), payload.TargetType, payload.TargetIDs, payload.Message)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "broadcast messages queued successfully",
		"queued":  count,
	})
}
