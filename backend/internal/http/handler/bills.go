package handler

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"html/template"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/audit"
	"menettech/dashboard/backend/internal/billing"
)

type BillHandler struct {
	Service     billing.Service
	AppName     string
	StoragePath string
	Audit       audit.Service
}

type billGeneratePayload struct {
	Period string `json:"period"`
}

type billPayPayload struct {
	Method string `json:"method"`
}

var errUploadTooLarge = errors.New("upload too large")
var errUploadTypeNotAllowed = errors.New("upload file type not allowed")

func NewBillHandler(service billing.Service, appName, storagePath string, auditService audit.Service) BillHandler {
	return BillHandler{Service: service, AppName: appName, StoragePath: storagePath, Audit: auditService}
}

func (h BillHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	search := q.Get("search")
	status := q.Get("status")
	period := q.Get("period")

	var customerID int64
	if cID := q.Get("customer_id"); cID != "" {
		if id, err := strconv.ParseInt(cID, 10, 64); err == nil {
			customerID = id
		}
	}

	page := 1
	if p := q.Get("page"); p != "" {
		if val, err := strconv.Atoi(p); err == nil && val > 0 {
			page = val
		}
	}

	limit := 50
	if l := q.Get("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil && val >= 0 {
			limit = val
		}
	}

	opt := billing.FilterOptions{
		Search:     search,
		Status:     status,
		Period:     period,
		CustomerID: customerID,
		Page:       page,
		Limit:      limit,
	}

	items, total, err := h.Service.List(r.Context(), opt)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to load bills")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data":  items,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

func (h BillHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var payload billGeneratePayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid generate payload")
		return
	}

	result, err := h.Service.Generate(r.Context(), payload.Period)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": result,
	})
}

func (h BillHandler) Pay(w http.ResponseWriter, r *http.Request) {
	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid bill id")
		return
	}

	var payload billPayPayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid payment payload")
		return
	}

	if err := h.Service.PrepareMarkPaid(r.Context(), id, payload.Method, user.ID); err != nil {
		if errors.Is(err, billing.ErrBillNotFound) {
			WriteError(w, http.StatusNotFound, "bill not found")
			return
		}
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "pembayaran tagihan diproses, dapat dibatalkan dalam waktu 10 menit",
	})
}

func (h BillHandler) Extend(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid bill id")
		return
	}

	if err := h.Service.PrepareExtension(r.Context(), id); err != nil {
		if errors.Is(err, billing.ErrBillNotFound) {
			WriteError(w, http.StatusNotFound, "bill not found")
			return
		}
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "perpanjangan diproses, dapat dibatalkan dalam waktu 10 menit",
	})
}

func (h BillHandler) CancelPendingAction(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid bill id")
		return
	}

	if err := h.Service.CancelPendingAction(r.Context(), id); err != nil {
		if errors.Is(err, billing.ErrBillNotFound) {
			WriteError(w, http.StatusNotFound, "bill not found")
			return
		}
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "pending action cancelled",
	})
}

func (h BillHandler) ListPendingConfirmations(w http.ResponseWriter, r *http.Request) {
	list, err := h.Service.ListPendingConfirmations(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{
		"data": list,
	})
}

func (h BillHandler) ApprovePaymentConfirmation(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid confirmation id")
		return
	}

	user, err := currentUser(r)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if err := h.Service.ApprovePaymentConfirmation(r.Context(), id, user.ID); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	ip := getClientIP(r)
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, nil, "bills.confirmations.approve", fmt.Sprintf("Persetujuan pembayaran tagihan ID %d oleh staff ID %d sukses", id, user.ID), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "pembayaran disetujui",
	})
}

func (h BillHandler) RejectPaymentConfirmation(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid confirmation id")
		return
	}

	if err := h.Service.RejectPaymentConfirmation(r.Context(), id); err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	user, _ := currentUser(r)
	ip := getClientIP(r)
	_ = h.Audit.RecordWithIP(r.Context(), &user.ID, nil, "bills.confirmations.reject", fmt.Sprintf("Bukti pembayaran tagihan ID %d ditolak", id), ip)

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "pembayaran ditolak",
	})
}

type createConfirmationPayload struct {
	TagihanID        int64   `json:"tagihan_id"`
	PelangganID      int64   `json:"pelanggan_id"`
	BuktiTransfer    *string `json:"bukti_transfer"`
	Catatan          string  `json:"catatan"`
	LinkedTagihanIDs string  `json:"linked_tagihan_ids"`
}

func (h BillHandler) CreatePaymentConfirmation(w http.ResponseWriter, r *http.Request) {
	var payload createConfirmationPayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	if payload.TagihanID == 0 || payload.PelangganID == 0 {
		WriteError(w, http.StatusBadRequest, "tagihan_id and pelanggan_id are required")
		return
	}

	id, err := h.Service.CreatePaymentConfirmation(r.Context(), payload.TagihanID, payload.PelangganID, payload.BuktiTransfer, payload.Catatan, payload.LinkedTagihanIDs)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]any{
		"id":      id,
		"message": "payment confirmation created",
	})
}

func (h BillHandler) GetPendingConfirmation(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid bill id")
		return
	}

	pc, err := h.Service.GetPendingConfirmationForBill(r.Context(), id)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if pc == nil {
		WriteJSON(w, http.StatusOK, map[string]any{
			"data": nil,
		})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": pc,
	})
}

type uploadBase64Payload struct {
	Base64Data string `json:"base64_data"`
	Mimetype   string `json:"mimetype"`
	Filename   string `json:"filename"`
}

func (h BillHandler) UploadConfirmationProofBase64(w http.ResponseWriter, r *http.Request) {
	var payload uploadBase64Payload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	if payload.Base64Data == "" || payload.Filename == "" {
		WriteError(w, http.StatusBadRequest, "base64_data and filename are required")
		return
	}

	// Clean/validate filename
	filename := filepath.Base(payload.Filename)

	// Decode base64
	data, err := base64.StdEncoding.DecodeString(payload.Base64Data)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid base64 encoding")
		return
	}

	const maxUploadSize = 5 << 20 // 5 MB limit
	if int64(len(data)) > maxUploadSize {
		WriteError(w, http.StatusBadRequest, "file size exceeds limit of 5MB")
		return
	}

	// Validate content type
	mimetype := payload.Mimetype
	if mimetype == "" {
		mimetype = http.DetectContentType(data)
	}

	directory := filepath.Join(h.StoragePath, "uploads", "payment-proofs")
	if err := os.MkdirAll(directory, 0o755); err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to create directory")
		return
	}

	safeExt := getSafeExtension(mimetype, filename)
	if !allowedProofContentType(safeExt) {
		WriteError(w, http.StatusBadRequest, "file type is not allowed")
		return
	}

	newFilename := fmt.Sprintf("%d%s", time.Now().UnixNano(), safeExt)
	targetPath := filepath.Join(directory, newFilename)

	// Path traversal check
	absDir, err := filepath.Abs(directory)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to resolve directory")
		return
	}
	absTarget, err := filepath.Abs(targetPath)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to resolve target path")
		return
	}
	if !strings.HasPrefix(absTarget, absDir+string(filepath.Separator)) && absTarget != absDir {
		WriteError(w, http.StatusBadRequest, "invalid path traversal attempt")
		return
	}

	compressedData, _ := compressImageIfPossible(data, safeExt)
	if err := os.WriteFile(targetPath, compressedData, 0o644); err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to write file")
		return
	}

	proofPath := "/uploads/payment-proofs/" + newFilename

	WriteJSON(w, http.StatusOK, map[string]any{
		"proof_path": proofPath,
	})
}


type billNotifyPayload struct {
	TriggerKey string `json:"trigger_key"`
}

func (h BillHandler) Notify(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid bill id")
		return
	}

	var payload billNotifyPayload
	if err := decodeJSON(r, &payload); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	if err := h.Service.SendManualNotification(r.Context(), id, payload.TriggerKey); err != nil {
		if errors.Is(err, billing.ErrBillNotFound) {
			WriteError(w, http.StatusNotFound, "bill not found")
			return
		}
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "whatsapp notification queued successfully",
	})
}

func (h BillHandler) Invoice(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid bill id")
		return
	}

	item, err := h.Service.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, billing.ErrBillNotFound) {
			WriteError(w, http.StatusNotFound, "bill not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to load invoice")
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	html, err := renderInvoiceHTML(h.AppName, item)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to render invoice HTML")
		return
	}
	if _, err := w.Write([]byte(html)); err != nil {
		// Bug #14: Log w.Write() error
		slog.Error("invoice handler: failed to write response", "error", err)
	}
}

func (h BillHandler) UploadProof(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid bill id")
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	file, header, err := r.FormFile("proof")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "proof file is required")
		return
	}
	defer file.Close()

	const maxUploadSize = 5 << 20 // 5 MB limit
	if header.Size > maxUploadSize {
		WriteError(w, http.StatusBadRequest, "file size exceeds limit of 5MB")
		return
	}

	proofPath, err := h.storeProofFile(file, header.Filename, maxUploadSize)
	if err != nil {
		if errors.Is(err, errUploadTooLarge) {
			WriteError(w, http.StatusBadRequest, "file size exceeds limit of 5MB")
			return
		}
		if errors.Is(err, errUploadTypeNotAllowed) {
			WriteError(w, http.StatusBadRequest, "file type is not allowed")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to store proof file")
		return
	}

	if err := h.Service.AttachProof(r.Context(), id, proofPath); err != nil {
		if errors.Is(err, billing.ErrBillNotFound) {
			WriteError(w, http.StatusNotFound, "bill not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "failed to attach proof")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message":    "proof uploaded",
		"proof_path": proofPath,
	})
}

func (h BillHandler) storeProofFile(source io.Reader, originalName string, maxSize int64) (string, error) {
	// Bug #10: Validate original filename to prevent path traversal
	originalName = filepath.Base(originalName)

	data, err := io.ReadAll(io.LimitReader(source, maxSize+1))
	if err != nil {
		return "", err
	}
	if int64(len(data)) > maxSize {
		return "", errUploadTooLarge
	}

	directory := filepath.Join(h.StoragePath, "uploads", "payment-proofs")
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return "", err
	}

	contentType := http.DetectContentType(data)
	safeExt := getSafeExtension(contentType, originalName)
	if !allowedProofContentType(safeExt) {
		return "", errUploadTypeNotAllowed
	}
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), safeExt)
	targetPath := filepath.Join(directory, filename)

	// Bug #10: absolute path comparison validation
	absDir, err := filepath.Abs(directory)
	if err != nil {
		return "", fmt.Errorf("resolve uploads dir: %w", err)
	}
	absTarget, err := filepath.Abs(targetPath)
	if err != nil {
		return "", fmt.Errorf("resolve target path: %w", err)
	}
	if !strings.HasPrefix(absTarget, absDir+string(filepath.Separator)) && absTarget != absDir {
		return "", fmt.Errorf("invalid path traversal attempt")
	}

	compressedData, _ := compressImageIfPossible(data, safeExt)
	if err := os.WriteFile(targetPath, compressedData, 0o644); err != nil {
		return "", err
	}

	return "/uploads/payment-proofs/" + filename, nil
}

func allowedProofContentType(extension string) bool {
	return extension == ".jpg" || extension == ".jpeg" || extension == ".png" || extension == ".pdf" || extension == ".webp"
}

func getSafeExtension(contentType, filename string) string {
	ext := strings.ToLower(strings.TrimSpace(filepath.Ext(filename)))
	// If extension is empty or a generic binary, detect from mime type
	if ext == "" || ext == ".bin" {
		if strings.Contains(contentType, "image/jpeg") || strings.Contains(contentType, "image/jpg") {
			return ".jpg"
		}
		if strings.Contains(contentType, "image/png") {
			return ".png"
		}
		if strings.Contains(contentType, "image/webp") {
			return ".webp"
		}
		if strings.Contains(contentType, "application/pdf") {
			return ".pdf"
		}
	}
	switch ext {
	case ".jpg", ".jpeg", ".png", ".pdf", ".webp":
		return ext
	default:
		return ".bin"
	}
}

func renderInvoiceHTML(appName string, item billing.BillDetail) (string, error) {
	tpl, err := template.New("invoice").Parse(`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice {{ .Item.InvoiceNumber }}</title>
<style>
body{font-family:Segoe UI,Tahoma,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}
.sheet{max-width:920px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:32px;box-shadow:0 20px 50px rgba(15,23,42,.08)}
.row{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
.muted{color:#475569}
.pill{display:inline-block;padding:6px 12px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:700;text-transform:uppercase;font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:20px}
th,td{text-align:left;padding:12px 10px;border-bottom:1px solid #e2e8f0}
.total{font-size:28px;font-weight:700}
</style>
</head>
<body>
<div class="sheet">
<div class="row">
  <div>
    <p class="muted">{{ .AppName }}</p>
    <h1>Invoice {{ .Item.InvoiceNumber }}</h1>
    <p class="muted">Periode {{ .Item.Period }} | Jatuh tempo {{ .Item.DueDate }}</p>
  </div>
  <div>
    <span class="pill">{{ .Item.DisplayStatus }}</span>
  </div>
</div>
<hr>
<div class="row">
  <div>
    <h3>Pelanggan</h3>
    <p><strong>{{ .Item.CustomerName }}</strong></p>
    <p class="muted">{{ .Item.CustomerAddress }}</p>
    <p class="muted">{{ .Item.CustomerPhone }}</p>
  </div>
  <div>
    <h3>Paket</h3>
    <p><strong>{{ .Item.PackageName }}</strong></p>
    <p class="muted">{{ .Item.PackageSpeed }} Mbps</p>
  </div>
</div>
<table>
  <thead>
    <tr><th>Deskripsi</th><th>Nominal</th></tr>
  </thead>
  <tbody>
    <tr><td>Tagihan internet periode {{ .Item.Period }}</td><td>{{ .Amount }}</td></tr>
  </tbody>
</table>
<div class="row" style="margin-top:20px">
  <div>
    <h3>Status Pembayaran</h3>
    <p class="muted">Metode: {{ if .Item.PaymentMethod }}{{ .Item.PaymentMethod }}{{ else }}-{{ end }}</p>
    <p class="muted">Dibayar: {{ if .Item.PaidAt }}{{ .Item.PaidAt }}{{ else }}Belum dibayar{{ end }}</p>
  </div>
  <div>
    <p class="muted">Total</p>
    <p class="total">{{ .Amount }}</p>
  </div>
</div>
</div>
</body>
</html>`)
	if err != nil {
		return "", err
	}

	var builder strings.Builder
	if err := tpl.Execute(&builder, map[string]any{
		"AppName": appName,
		"Item":    item,
		"Amount":  formatCurrency(item.Amount),
	}); err != nil {
		return "", err
	}
	return builder.String(), nil
}

func formatCurrency(amount int) string {
	return "Rp " + humanizeThousands(amount)
}

func humanizeThousands(amount int) string {
	value := strconv.Itoa(amount)
	if len(value) <= 3 {
		return value
	}
	var parts []byte
	offset := len(value) % 3
	if offset > 0 {
		parts = append(parts, value[:offset]...)
		if len(value) > offset {
			parts = append(parts, '.')
		}
	}
	for i := offset; i < len(value); i += 3 {
		parts = append(parts, value[i:i+3]...)
		if i+3 < len(value) {
			parts = append(parts, '.')
		}
	}
	return string(parts)
}

func compressImageIfPossible(data []byte, extension string) ([]byte, error) {
	// Only compress common image extensions to keep disk footprint minimal
	if extension != ".jpg" && extension != ".jpeg" && extension != ".png" {
		return data, nil
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		// Fallback to original raw bytes if decoding fails
		return data, nil
	}

	var buf bytes.Buffer
	// Encode as JPEG with 75% quality for high compression ratio
	err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 75})
	if err != nil {
		return data, nil
	}

	// Only return compressed data if it is actually smaller
	if buf.Len() >= len(data) {
		return data, nil
	}

	return buf.Bytes(), nil
}
