package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/tickets"
)

type TicketHandler struct {
	Service tickets.Service
}

func NewTicketHandler(service tickets.Service) TicketHandler {
	return TicketHandler{Service: service}
}

func (h TicketHandler) List(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	items, err := h.Service.ListTickets(r.Context(), status)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to load tickets")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": items,
	})
}

func (h TicketHandler) FindByID(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid ticket id")
		return
	}

	detail, err := h.Service.GetTicketDetail(r.Context(), id)
	if err != nil {
		if errors.Is(err, tickets.ErrTicketNotFound) {
			WriteError(w, http.StatusNotFound, "ticket not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to fetch ticket detail")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": detail,
	})
}

func (h TicketHandler) CreateInternal(w http.ResponseWriter, r *http.Request) {
	var payload tickets.Ticket
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid ticket payload")
		return
	}

	item, err := h.Service.CreateTicket(r.Context(), payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{
		"data": item,
	})
}

type addMessagePayload struct {
	Message string `json:"message"`
}

func (h TicketHandler) AddMessage(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid ticket id")
		return
	}

	var payload addMessagePayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid message payload")
		return
	}

	msg, err := h.Service.AddTicketMessage(r.Context(), id, "admin", payload.Message)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{
		"data": msg,
	})
}

func (h TicketHandler) Close(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid ticket id")
		return
	}

	if err := h.Service.CloseTicket(r.Context(), id); err != nil {
		if errors.Is(err, tickets.ErrTicketNotFound) {
			WriteError(w, http.StatusNotFound, "ticket not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to close ticket")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "ticket closed",
	})
}
