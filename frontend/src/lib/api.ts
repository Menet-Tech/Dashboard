import type {
  AuditLogItem,
  BillItem,
  CustomerItem,
  ManagedUserItem,
  PackageItem,
  TemplateItem,
  User,
  RevenueItem,
  AgingReport,
  NotificationLog,
  SettingsState,
  TicketItem,
  TicketMessageItem,
  TicketDetailItem,
} from "../types";

let csrfToken = "";
let onUnauthorizedCallback: (() => void) | null = null;

export function registerOnUnauthorized(callback: () => void) {
  onUnauthorizedCallback = callback;
}

function maybeStoreCSRF(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "csrf_token" in payload &&
    typeof (payload as { csrf_token?: unknown }).csrf_token === "string"
  ) {
    csrfToken = (payload as { csrf_token: string }).csrf_token;
  }
}

export type HealthPayload = {
  status: string;
  app: {
    name: string;
    environment: string;
  };
  services: {
    database: string;
    worker: string;
    backup: string;
  };
  database: {
    quick_check: {
      status: string;
      message: string;
    };
  };
  worker: {
    last_heartbeat: string;
    last_cycle_at: string;
    last_cycle_error: string;
    interval_seconds: number;
  };
  scheduler: {
    billing_auto_enabled: boolean;
    billing_generate_day: number;
    billing_generate_time: string;
    billing_retry_attempts: number;
    billing_retry_backoff_seconds: number;
    billing_last_attempt_at: string;
    billing_last_run_at: string;
    billing_last_period: string;
    billing_last_success_period: string;
    billing_last_generated_count: number;
    billing_last_error: string;
    billing_retry_count: number;
    billing_next_run: string;
  };
  backup: {
    enabled: boolean;
    scheduled_time: string;
    last_run_date: string;
    last_filename: string;
    retention_count: number;
  };
  integrations: {
    whatsapp_configured: boolean;
    whatsapp_online: boolean;
    discord_configured: boolean;
    discord_online: boolean;
    mikrotik_configured: boolean;
    mikrotik_online: boolean;
  };
  alerts: string[];
  timestamp: string;
};

export type RecentPayment = {
  id: number;
  invoice_number: string;
  customer_name: string;
  amount: number;
  paid_at: string;
  payment_method: string;
};

export type SummaryPayload = {
  total_pelanggan: number;
  total_active: number;
  total_limit: number;
  total_inactive: number;
  total_tagihan_belum_bayar: number;
  total_jatuh_tempo: number;
  total_menunggak: number;
  pendapatan_bulan_ini: number;
  pembayaran_terbaru: RecentPayment[];
};

export type GenerateBillsPayload = {
  period: string;
  generated: number;
};

export class ApiError extends Error {
  status: number;
  requestId?: string;

  constructor(status: number, message: string, requestId?: string) {
    super(requestId ? `${message} (trace: ${requestId})` : message);
    this.status = status;
    this.requestId = requestId;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(options.method && !["GET", "HEAD"].includes(options.method.toUpperCase()) && csrfToken
        ? { "X-CSRF-Token": csrfToken }
        : {}),
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;

  if (!response.ok) {
    if (response.status === 401) {
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }
    const requestId = response.headers.get("X-Request-Id") ?? undefined;
    throw new ApiError(
      response.status,
      payload?.error ?? `Request failed: ${response.status}`,
      requestId,
    );
  }

  maybeStoreCSRF(payload);
  return payload as T;
}

export function fetchHealth() {
  return request<HealthPayload>("/health");
}

export async function fetchSummary(): Promise<SummaryPayload> {
  const res = await request<SummaryPayload>("/api/v1/dashboard/summary");
  return res;
}

export async function fetchRevenue(): Promise<{ data: RevenueItem[] }> {
  const res = await request<{ data: RevenueItem[] }>("/api/v1/reports/revenue");
  return res;
}

export async function fetchAging(): Promise<{ data: AgingReport }> {
  const res = await request<{ data: AgingReport }>("/api/v1/reports/aging");
  return res;
}

export function login(username: string, password: string) {
  return request<{ user: User; csrf_token: string }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function fetchCurrentUser() {
  return request<{ user: User; csrf_token: string }>("/api/v1/auth/me");
}

export function logout() {
  return request<{ message: string }>("/api/v1/auth/logout", {
    method: "POST",
  });
}

export function fetchPackages() {
  return request<{ data: PackageItem[] }>("/api/v1/packages");
}

export function createPackage(input: Omit<PackageItem, "id" | "customer_count">) {
  return request<{ data: PackageItem }>("/api/v1/packages", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePackage(
  id: number,
  input: Omit<PackageItem, "id" | "customer_count">,
) {
  return request<{ data: PackageItem }>(`/api/v1/packages/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deletePackage(id: number) {
  return request<{ message: string }>(`/api/v1/packages/${id}`, {
    method: "DELETE",
  });
}

export function fetchCustomers() {
  return request<{ data: CustomerItem[] }>("/api/v1/customers");
}

export function createCustomer(
  input: Omit<CustomerItem, "id" | "package_name" | "package_price">,
) {
  return request<{ data: CustomerItem }>("/api/v1/customers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCustomer(
  id: number,
  input: Omit<CustomerItem, "id" | "package_name" | "package_price">,
) {
  return request<{ data: CustomerItem }>(`/api/v1/customers/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function updateCustomerStatus(id: number, status: CustomerItem["status"]) {
  return request<{ message: string }>(`/api/v1/customers/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function fetchBills(params?: {
  search?: string;
  status?: string;
  period?: string;
  customer_id?: number;
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params) {
    if (params.search) query.append("search", params.search);
    if (params.status) query.append("status", params.status);
    if (params.period) query.append("period", params.period);
    if (params.customer_id) query.append("customer_id", String(params.customer_id));
    if (params.page) query.append("page", String(params.page));
    if (params.limit !== undefined) query.append("limit", String(params.limit));
  }
  const queryString = query.toString();
  const path = queryString ? `/api/v1/bills?${queryString}` : "/api/v1/bills";
  return request<{
    data: BillItem[];
    total?: number;
    page?: number;
    limit?: number;
  }>(path);
}

export function notifyBill(id: number, triggerKey: string) {
  return request<{ message: string }>(`/api/v1/bills/${id}/notify`, {
    method: "POST",
    body: JSON.stringify({ trigger_key: triggerKey }),
  });
}

export function generateBills(period: string) {
  return request<{ data: GenerateBillsPayload }>("/api/v1/bills/generate", {
    method: "POST",
    body: JSON.stringify({ period }),
  });
}

export function markBillPaid(id: number, method: string) {
  return request<{ message: string }>(`/api/v1/bills/${id}/pay`, {
    method: "POST",
    body: JSON.stringify({ method }),
  });
}

export function uploadBillProof(id: number, file: File) {
  const formData = new FormData();
  formData.append("proof", file);
  return request<{ message: string; proof_path: string }>(`/api/v1/bills/${id}/proof`, {
    method: "POST",
    body: formData,
  });
}

export function fetchTemplates() {
  return request<{ data: TemplateItem[] }>("/api/v1/templates");
}

export function createTemplate(input: Omit<TemplateItem, "id">) {
  return request<{ data: TemplateItem }>("/api/v1/templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTemplate(id: number, input: Omit<TemplateItem, "id">) {
  return request<{ data: TemplateItem }>(`/api/v1/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteTemplate(id: number) {
  return request<{ message: string }>(`/api/v1/templates/${id}`, {
    method: "DELETE",
  });
}

export function fetchSettings() {
  return request<{ data: SettingsState }>("/api/v1/settings");
}

export function updateSettings(settings: SettingsState) {
  return request<{ message: string }>("/api/v1/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export function fetchBillNotifications(billId: number) {
  return request<{ data: NotificationLog[] }>(`/api/v1/bills/${billId}/notifications`);
}

export type BackupInfo = {
  filename: string;
  size: number;
  mod_time: string;
};

export type BackupVerificationResult = {
  filename: string;
  valid: boolean;
  message: string;
  checked_at: string;
};

export function fetchBackups() {
  return request<{ data: BackupInfo[] }>("/api/v1/backups");
}

export function fetchAuditLogs(limit = 50) {
  return request<{ data: AuditLogItem[] }>(`/api/v1/audit-logs?limit=${limit}`);
}

export function createBackup() {
  return request<{ message: string; data: { filename: string } }>("/api/v1/backups", {
    method: "POST",
  });
}

export function verifyBackup(filename: string) {
  return request<{ message?: string; data: BackupVerificationResult; error?: string }>(
    `/api/v1/backups/${encodeURIComponent(filename)}/verify`,
    {
      method: "POST",
    },
  );
}

export type RestoreSimulationResult = {
  valid: boolean;
  message: string;
  total_users: number;
  total_pelanggan: number;
  total_tagihan: number;
};

export function simulateRestore(filename: string) {
  return request<{ message: string; data: RestoreSimulationResult }>(
    `/api/v1/backups/${encodeURIComponent(filename)}/restore`,
    {
      method: "POST",
    },
  );
}

export function applyRestore() {
  return request<{ message: string }>("/api/v1/backups/staging/apply", {
    method: "POST",
  });
}

export function getBackupDownloadUrl(filename: string) {
  return `/api/v1/backups/${encodeURIComponent(filename)}/download`;
}

export function fetchUsers() {
  return request<{ data: ManagedUserItem[] }>("/api/v1/users");
}

export function createUser(payload: { username: string; password: string; role: string }) {
  return request<{ data: ManagedUserItem }>("/api/v1/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUser(id: number, payload: { role: string; is_active: boolean }) {
  return request<{ data: ManagedUserItem }>(`/api/v1/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function resetUserPassword(id: number, password: string) {
  return request<{ message: string }>(`/api/v1/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function fetchTickets(status?: string) {
  const path = status ? `/api/v1/tickets?status=${status}` : "/api/v1/tickets";
  return request<{ data: TicketItem[] }>(path);
}

export function fetchTicketDetail(id: number) {
  return request<{ data: TicketDetailItem }>(`/api/v1/tickets/${id}`);
}

export function addTicketMessage(id: number, message: string) {
  return request<{ data: TicketMessageItem }>(`/api/v1/tickets/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function closeTicket(id: number) {
  return request<{ message: string }>(`/api/v1/tickets/${id}/close`, {
    method: "POST",
  });
}

export function sendBroadcast(targetType: string, targetIDs: number[], message: string) {
  return request<{ message: string; queued: number }>("/api/v1/broadcast", {
    method: "POST",
    body: JSON.stringify({
      target_type: targetType,
      target_ids: targetIDs,
      message,
    }),
  });
}

