import type {
  AuditLogItem,
  BillItem,
  CustomerItem,
  ManagedUserItem,
  PackageItem,
  TemplateItem,
  User,
} from "../types";

let csrfToken = "";

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
  worker: {
    last_heartbeat: string;
    interval_seconds: number;
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
    discord_configured: boolean;
    mikrotik_configured: boolean;
  };
  alerts: string[];
  timestamp: string;
};

export type SummaryPayload = {
  total_pelanggan: number;
  total_active: number;
  total_limit: number;
  total_inactive: number;
  total_tagihan_belum_bayar: number;
};

export type GenerateBillsPayload = {
  period: string;
  generated: number;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
    throw new ApiError(
      response.status,
      payload?.error ?? `Request failed: ${response.status}`,
    );
  }

  maybeStoreCSRF(payload);
  return payload as T;
}

export function fetchHealth() {
  return request<HealthPayload>("/health");
}

export function fetchSummary() {
  return request<SummaryPayload>("/api/v1/dashboard/summary");
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

export function fetchBills() {
  return request<{ data: BillItem[] }>("/api/v1/bills");
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
  return request<{ data: Record<string, string> }>("/api/v1/settings");
}

export function updateSettings(payload: Record<string, string>) {
  return request<{ message: string }>("/api/v1/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchBillNotifications(billId: number) {
  return request<{ data: any[] }>(`/api/v1/bills/${billId}/notifications`);
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
