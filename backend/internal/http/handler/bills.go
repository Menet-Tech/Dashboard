package handler

import (
	"errors"
	"fmt"
	"html/template"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"menettech/dashboard/backend/internal/billing"
)

type BillHandler struct {
	Service     billing.Service
	AppName     string
	StoragePath string
}

type billGeneratePayload struct {
	Period string `json:"period"`
}

type billPayPayload struct {
	Method string `json:"method"`
}

var errUploadTooLarge = errors.New("upload too large")
var errUploadTypeNotAllowed = errors.New("upload file type not allowed")

func NewBillHandler(service billing.Service, appName, storagePath string) BillHandler {
	return BillHandler{Service: service, AppName: appName, StoragePath: storagePath}
}

func (h BillHandler) List(w http.ResponseWriter, r *http.Request) {
	items, err := h.Service.List(r.Context())
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to load bills")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"data": items,
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

	if err := h.Service.MarkPaid(r.Context(), id, payload.Method, user.ID); err != nil {
		if errors.Is(err, billing.ErrBillNotFound) {
			WriteError(w, http.StatusNotFound, "bill not found")
			return
		}
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message": "bill marked as paid",
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

	extension := filepath.Ext(originalName)
	if !allowedProofContentType(http.DetectContentType(data), safeExtension(extension)) {
		return "", errUploadTypeNotAllowed
	}
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), safeExtension(extension))
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

	if err := os.WriteFile(targetPath, data, 0o644); err != nil {
		return "", err
	}

	return "/uploads/payment-proofs/" + filename, nil
}

func allowedProofContentType(contentType, extension string) bool {
	switch extension {
	case ".jpg", ".jpeg":
		return strings.HasPrefix(contentType, "image/jpeg")
	case ".png":
		return strings.HasPrefix(contentType, "image/png")
	case ".webp":
		return strings.HasPrefix(contentType, "image/webp")
	case ".pdf":
		return contentType == "application/pdf" || contentType == "application/octet-stream"
	default:
		return false
	}
}

func safeExtension(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	switch value {
	case ".jpg", ".jpeg", ".png", ".pdf", ".webp":
		return value
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
