package handler

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/mikrotik"
)

type MikrotikHandler struct {
	RouterService *mikrotik.RouterService
	Poller        *mikrotik.TrafficPoller
}

func NewMikrotikHandler(routerSvc *mikrotik.RouterService, poller *mikrotik.TrafficPoller) MikrotikHandler {
	return MikrotikHandler{
		RouterService: routerSvc,
		Poller:        poller,
	}
}

func (h MikrotikHandler) ListRouters(w http.ResponseWriter, r *http.Request) {
	routers, err := h.RouterService.List(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("gagal mengambil data router: %v", err))
		return
	}

	type routerResponse struct {
		mikrotik.Router
		Status string `json:"status"` // "online", "failed_auth", "offline"
	}

	res := make([]routerResponse, len(routers))
	var wg sync.WaitGroup
	for i, router := range routers {
		res[i] = routerResponse{Router: router, Status: "offline"}
		if !router.IsActive {
			continue
		}

		wg.Add(1)
		go func(idx int, rt mikrotik.Router) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(r.Context(), 1500*time.Millisecond)
			defer cancel()

			client := mikrotik.NewClient(rt.Host, rt.Username, rt.Password)
			if err := client.TestConnection(ctx); err != nil {
				if strings.Contains(err.Error(), "login rejected") {
					res[idx].Status = "failed_auth"
				} else {
					res[idx].Status = "offline"
				}
			} else {
				res[idx].Status = "online"
			}
		}(i, router)
	}
	wg.Wait()

	WriteJSON(w, http.StatusOK, map[string]any{"data": res})
}

func (h MikrotikHandler) CreateRouter(w http.ResponseWriter, r *http.Request) {
	var payload mikrotik.Router
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "payload tidak valid")
		return
	}

	router, err := h.RouterService.Create(r.Context(), payload)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{"data": router})
}

func (h MikrotikHandler) UpdateRouter(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "ID router tidak valid")
		return
	}

	var payload map[string]any
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "payload tidak valid")
		return
	}

	// Fetch existing router values
	router, err := h.RouterService.FindByID(r.Context(), id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Router tidak ditemukan")
		return
	}

	// Merge provided fields
	if val, ok := payload["name"].(string); ok {
		router.Name = val
	}
	if val, ok := payload["host"].(string); ok {
		router.Host = val
	}
	if val, ok := payload["username"].(string); ok {
		router.Username = val
	}
	if val, ok := payload["role"].(string); ok {
		router.Role = val
	}
	if val, ok := payload["slave_port"].(string); ok {
		router.SlavePort = val
	}
	if val, ok := payload["is_active"].(bool); ok {
		router.IsActive = val
	}

	updatePassword := false
	if val, ok := payload["password"].(string); ok {
		router.Password = val
		updatePassword = true
	}

	router, err = h.RouterService.Update(r.Context(), id, router, updatePassword)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"data": router})
}

func (h MikrotikHandler) DeleteRouter(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "ID router tidak valid")
		return
	}

	if err := h.RouterService.Delete(r.Context(), id); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"message": "Router berhasil dihapus"})
}

func (h MikrotikHandler) TestRouterConnection(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "ID router tidak valid")
		return
	}

	router, err := h.RouterService.FindByID(r.Context(), id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Router tidak ditemukan")
		return
	}

	client := mikrotik.NewClient(router.Host, router.Username, router.Password)
	if err := client.TestConnection(r.Context()); err != nil {
		WriteJSON(w, http.StatusOK, map[string]any{"success": false, "message": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"success": true, "message": "Koneksi ke router berhasil"})
}

func (h MikrotikHandler) ListIPPools(w http.ResponseWriter, r *http.Request) {
	routers, err := h.RouterService.ListActive(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "gagal mengambil data router")
		return
	}

	if len(routers) == 0 {
		WriteError(w, http.StatusBadRequest, "tidak ada router MikroTik yang aktif")
		return
	}

	// Fetch from the active main router if available, otherwise first active
	var router mikrotik.Router
	foundMain := false
	for _, rt := range routers {
		if rt.Role == "main" {
			router = rt
			foundMain = true
			break
		}
	}
	if !foundMain {
		router = routers[0]
	}
	client := mikrotik.NewClient(router.Host, router.Username, router.Password)
	if err := client.Connect(r.Context()); err != nil {
		WriteError(w, http.StatusBadGateway, fmt.Sprintf("gagal menghubungkan ke MikroTik: %v", err))
		return
	}
	defer client.Close()

	pools, err := client.ListIPPools(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, fmt.Sprintf("gagal mengambil IP Pool: %v", err))
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{"data": pools})
}

func (h MikrotikHandler) GetTrafficStats(w http.ResponseWriter, r *http.Request) {
	if h.Poller == nil {
		WriteJSON(w, http.StatusOK, map[string]any{"data": map[string]any{}})
		return
	}
	stats := h.Poller.GetAllStats()
	WriteJSON(w, http.StatusOK, map[string]any{"data": stats})
}

func (h MikrotikHandler) SyncRouters(w http.ResponseWriter, r *http.Request) {
	result, err := h.RouterService.SyncMainToSlaves(r.Context())
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Sinkronisasi router berhasil",
		"data":    result,
	})
}

func (h MikrotikHandler) GetRouterInterfaces(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		ID       *int64 `json:"id"`
		Host     string `json:"host"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "payload tidak valid")
		return
	}

	var host, user, pass string
	if payload.ID != nil && *payload.ID > 0 {
		router, err := h.RouterService.FindByID(r.Context(), *payload.ID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "Router tidak ditemukan")
			return
		}
		host = router.Host
		user = router.Username
		if payload.Password != "" {
			pass = payload.Password
		} else {
			pass = router.Password
		}
	} else {
		host = payload.Host
		user = payload.Username
		pass = payload.Password
	}

	if strings.TrimSpace(host) == "" || strings.TrimSpace(user) == "" {
		WriteError(w, http.StatusBadRequest, "host dan username wajib diisi")
		return
	}

	client := mikrotik.NewClient(host, user, pass)
	if err := client.Connect(r.Context()); err != nil {
		fallback := []string{"ether1", "ether2", "ether3", "ether4", "ether5"}
		WriteJSON(w, http.StatusOK, map[string]any{
			"success": false,
			"message": fmt.Sprintf("Gagal terhubung ke MikroTik: %v. Menggunakan fallback port.", err),
			"data":    fallback,
		})
		return
	}
	defer client.Close()

	interfaces, err := client.ListInterfaces(r.Context())
	if err != nil {
		fallback := []string{"ether1", "ether2", "ether3", "ether4", "ether5"}
		WriteJSON(w, http.StatusOK, map[string]any{
			"success": false,
			"message": fmt.Sprintf("Gagal mengambil data interface: %v. Menggunakan fallback port.", err),
			"data":    fallback,
		})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"data":    interfaces,
	})
}

