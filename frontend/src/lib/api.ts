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
  MapSettings,
  MapNode,
  MapEdge,
  EmailTemplateItem,
  VoucherItem,
  CustomerVoucherItem,
  VoucherUsageLogItem,
  PaymentConfirmationItem,
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
    genieacs_configured?: boolean;
    genieacs_online?: boolean;
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

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
  return request<HealthPayload>("/api/v1/health");
}

export async function fetchSummary(): Promise<SummaryPayload> {
  const res = await request<{ data: SummaryPayload }>("/api/v1/dashboard/summary");
  return res.data;
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

export function deletePackage(id: number, deletePool?: boolean) {
  const query = deletePool ? "?delete_pool=true" : "";
  return request<{ message: string }>(`/api/v1/packages/${id}${query}`, {
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
}export function deleteCustomer(id: number) {
  return request<{ message: string }>(`/api/v1/customers/${id}`, {
    method: "DELETE",
  });
}

export function assignCustomerOdp(id: number, odpId: number | null, odpPort: number | null) {
  return request<{ message: string }>(`/api/v1/customers/${id}/odp`, {
    method: "PATCH",
    body: JSON.stringify({ odp_id: odpId, odp_port: odpPort }),
  });
}

export function endCustomerTrial(id: number) {
  return request<{ message: string }>(`/api/v1/customers/${id}/end-trial`, {
    method: "POST",
  });
}


export function bulkUpdateCustomerStatus(
  ids: number[],
  status?: CustomerItem["status"],
  odp_id?: number | null,
  paket_id?: number,
  referred_by_id?: number | null
) {
  return request<{ message: string; success_count: number; errors?: string[] }>("/api/v1/customers/bulk-status", {
    method: "POST",
    body: JSON.stringify({
      ids,
      status,
      odp_id,
      paket_id,
      referred_by_id,
    }),
  });
}

export function bulkDeleteCustomers(ids: number[]) {
  return request<{ message: string; success_count: number; errors?: string[] }>("/api/v1/customers/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
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

export function grantBillExtension(id: number) {
  return request<{ message: string }>(`/api/v1/bills/${id}/extend`, {
    method: "POST",
  });
}

export function cancelPendingBillAction(id: number) {
  return request<{ message: string }>(`/api/v1/bills/${id}/cancel-pending`, {
    method: "POST",
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

export type IntegrationCheckPayload = {
  whatsapp: string;
  discord: string;
  mikrotik: string;
  genieacs: string;
};

export function checkIntegrations() {
  return request<IntegrationCheckPayload>("/api/v1/integration/check");
}

export function getBackupDownloadUrl(filename: string) {
  return `/api/v1/backups/${encodeURIComponent(filename)}/download`;
}

export type VendorItem = {
  id: number;
  name: string;
  manufacturer_patterns: string[];
  product_patterns: string[];
  parameter_prefix: string;
  service_list_path: string;
  lan_binding_path: string;
  vlan_id_path: string;
  http_wan_enable_path: string;
  firewall_level_path: string;
  priority: number;
  enabled: number;
  description: string;
};

export type WifiSecurityItem = {
  id: number;
  product_class: string;
  security_types: string[];
  password_param_path: string;
};

export function fetchVendors() {
  return request<{ data: VendorItem[] }>("/api/vendor-management/vendors");
}

export function createVendor(payload: Partial<VendorItem>) {
  return request<{ success: boolean; message: string; id?: number }>("/api/vendor-management/vendors", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateVendor(id: number, payload: Partial<VendorItem>) {
  return request<{ success: boolean; message: string }>(`/api/vendor-management/vendors/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteVendor(id: number) {
  return request<{ success: boolean; message: string }>(`/api/vendor-management/vendors/${id}`, {
    method: "DELETE",
  });
}

export function fetchWifiSecurities() {
  return request<{ data: WifiSecurityItem[] }>("/api/vendor-management/wifi-security");
}

export function createWifiSecurity(payload: Partial<WifiSecurityItem>) {
  return request<{ success: boolean; message: string; id?: number }>("/api/vendor-management/wifi-security", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateWifiSecurity(id: number, payload: Partial<WifiSecurityItem>) {
  return request<{ success: boolean; message: string }>(`/api/vendor-management/wifi-security/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteWifiSecurity(id: number) {
  return request<{ success: boolean; message: string }>(`/api/vendor-management/wifi-security/${id}`, {
    method: "DELETE",
  });
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

export function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  return request<T>(path, options);
}

export const REFERRAL_WITHDRAWAL_AMOUNT = 50_000;

export function withdrawReferral(id: number, method?: string, paymentTarget?: string) {
  return request<{ message: string; id?: number }>(`/api/v1/customers/${id}/referral/withdraw`, {
    method: "POST",
    body: JSON.stringify({ amount: REFERRAL_WITHDRAWAL_AMOUNT, method, payment_target: paymentTarget }),
  });
}

export type ReferralWithdrawalItem = {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  amount: number;
  method: string;
  payment_target: string;
  period: string;
  status: "pending" | "completed" | "rejected";
  proof_path?: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export function fetchReferralWithdrawals(status?: string) {
  const path = status ? `/api/v1/referral/withdrawals?status=${status}` : `/api/v1/referral/withdrawals`;
  return request<{ data: ReferralWithdrawalItem[] }>(path);
}

export function completeReferralWithdrawal(id: number, proofFile: File, notes: string) {
  const formData = new FormData();
  formData.append("proof", proofFile);
  formData.append("notes", notes);
  return request<{ message: string; proof_path: string }>(`/api/v1/referral/withdrawals/${id}/complete`, {
    method: "POST",
    body: formData,
  });
}

export function rejectReferralWithdrawal(id: number, notes: string) {
  return request<{ message: string }>(`/api/v1/referral/withdrawals/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });
}

export function convertReferralToVoucher(id: number) {
  return request<{ message: string }>(`/api/v1/customers/${id}/referral/convert-voucher`, {
    method: "POST",
    body: JSON.stringify({ amount: REFERRAL_WITHDRAWAL_AMOUNT }),
  });
}

export function rebootONT(id: number) {
  return request<{ message: string }>(`/api/v1/customers/${id}/ont-reboot`, {
    method: "POST",
  });
}

export function factoryResetONT(id: number) {
  return request<{ message: string }>(`/api/v1/customers/${id}/ont-factory-reset`, {
    method: "POST",
  });
}

export function updateONTWifi(id: number, ssid: string, wpaKey: string) {
  return request<{ message: string }>(`/api/v1/customers/${id}/ont-wifi`, {
    method: "POST",
    body: JSON.stringify({ ssid, password: wpaKey }),
  });
}

export function kickMikrotikSession(id: number) {
  return request<{ message: string }>(`/api/v1/customers/${id}/mikrotik-kick`, {
    method: "POST",
  });
}

// ─── GACS / GenieACS Device Management ─────────────────────────────────────

export type GacsDevice = {
  _id: string;
  _deviceId: {
    _Manufacturer: string;
    _ProductClass: string;
    _SerialNumber: string;
    _OUI: string;
  };
  _lastInform?: string;
  _registered?: string;
  _tag?: string[];
  _summary?: {
    ssid?: string;
    pppoe_username?: string;
    rx_power?: string;
    tx_power?: string;
    uptime?: string;
    wan_ip?: string;
  };
  customer_id?: number;
  customer_name?: string;
  is_registered?: boolean;
};

export type VPValue = {
  path: string;
  value: any;
};

export type DetailedDeviceInfo = {
  productclass: string;
  serialNumber: string;
  manufacturer: string;
  oui: string;
  hardwareVersion: string;
  softwareVersion: string;
  upTime: string;
  macAddress: string;
};

export type ConnectionInfo = {
  _lastInform: string;
  _lastBoot: string;
  _registered: string;
};

export type WANConnectionParsed = {
  type: string;
  path: string;
  wanDeviceIndex: string;
  connDeviceIndex: string;
  index: string;
  enable: VPValue;
  connectionStatus: VPValue;
  externalIPAddress: VPValue;
  subnetMask?: VPValue;
  defaultGateway?: VPValue;
  username?: string;
  dnsServers?: VPValue;
  connectionType?: VPValue;
  name?: VPValue;
  natEnabled?: VPValue;
  addressingType?: VPValue;
  lastConnectionError?: VPValue;
  serviceList?: {
    serviceList: VPValue;
  };
  lanBinding?: {
    path: string;
    wanInterface: string;
    normalized: {
      lan1: boolean;
      lan2: boolean;
      lan3: boolean;
      lan4: boolean;
      ssid1: boolean;
      ssid2: boolean;
      ssid3: boolean;
      ssid4: boolean;
      ssid5: boolean;
      ssid6: boolean;
      ssid7: boolean;
      ssid8: boolean;
    };
    raw?: {
      path?: string;
      type: string;
      vendor: string;
      data: string;
      parsed: string[];
      bindingIndex?: string;
    };
  };
  vlanInfo?: {
    path: string;
    value: any;
  };
};

export type WANConnections = {
  wanIPConnections: WANConnectionParsed[] | null;
  wanPPPConnections: WANConnectionParsed[] | null;
  totalConnections: number;
  totalIPConnections: number;
  totalPPPConnections: number;
};

export type WlanAP = {
  enabled: VPValue;
  ssid: VPValue;
  password: VPValue;
  security: {
    path: string;
    rawValue: string;
    normalizedValue: string;
  };
  stations: VPValue;
  channel: VPValue;
};

export type WiFiClient = {
  index: string;
  hostname: string;
  ip: string;
  mac: string;
};

export type GacsDeviceDetail = {
  _id: string;
  tags: string[] | null;
  vendor: string;
  deviceInfo: DetailedDeviceInfo;
  connectionInfo: ConnectionInfo;
  wanConnections: WANConnections;
  wifiInfo: Record<string, WlanAP>;
  wifiClients: WiFiClient[];
  virtualParameters: Record<string, VPValue>;
  securityInfo?: Record<string, VPValue>;
  vendorDetection: {
    vendor: string;
    vendorId: number;
    vendorName: string;
    parameterPrefix: string;
  };
  faults: GacsFault[] | null;
  customer?: {
    id: number;
    name: string;
    user_pppoe: string;
    sn_ont: string;
    status: string;
    whatsapp: string;
    address: string;
  };
  mikrotikSecret?: {
    username: string;
    password?: string;
    profile: string;
    disabled: boolean;
    last_logged_out?: string;
    last_caller_id?: string;
    last_disconnect_reason?: string;
  };
  mikrotikActiveConn?: {
    active: boolean;
    address: string;
    uptime: string;
    caller_id: string;
  };
};

export function fetchGacsDevices(params?: { manufacturer?: string; productClass?: string; tag?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.manufacturer) query.append("manufacturer", params.manufacturer);
  if (params?.productClass) query.append("productClass", params.productClass);
  if (params?.tag) query.append("tag", params.tag);
  if (params?.limit) query.append("limit", String(params.limit));
  const qs = query.toString();
  return request<{ success: boolean; data: GacsDevice[]; total?: number }>(`/api/v1/gacs/devices${qs ? `?${qs}` : ""}`);
}

export function fetchGacsDeviceDetail(id: string) {
  return request<GacsDeviceDetail>(`/api/v1/gacs/devices/${encodeURIComponent(id)}`);
}

export function summonGacsDevice(id: string) {
  return request<{ success: boolean; message?: string }>(`/api/v1/gacs/devices/${encodeURIComponent(id)}/summon`, {
    method: "POST",
  });
}

export function rebootGacsDevice(deviceId: string) {
  return request<{ success: boolean; message?: string }>(`/api/reboot-device`, {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  });
}

export function deleteGacsDevice(id: string) {
  return request<{ success: boolean; message?: string }>(`/api/v1/gacs/devices/${encodeURIComponent(id)}/wan`, {
    method: "DELETE",
  });
}

export function addGacsDeviceTag(id: string, tag: string) {
  return request<{ success: boolean }>(`/api/v1/gacs/devices/${encodeURIComponent(id)}/wan`, {
    method: "POST",
    body: JSON.stringify({ tag }),
  });
}

export function fetchGacsFaults(deviceId?: string) {
  const path = deviceId
    ? `/api/faults?deviceId=${encodeURIComponent(deviceId)}`
    : "/api/faults";
  return request<{ success: boolean; data: GacsFault[]; total?: number }>(path);
}

export type GacsFault = {
  _id: string;
  device_id: string;
  channel: string;
  code: string;
  message: string;
  detail?: string;
  timestamp: string;
  retries?: number;
};

// Check WAN status
export function checkWAN(deviceId: string) {
  return request<{
    success: boolean;
    deviceId: string;
    productClass: string;
    manufacturer: string;
    wanIPConnections: string[];
    wanPPPConnections: string[];
    availableSlots: Record<string, string[]>;
  }>(`/api/v1/gacs/check-wan/${encodeURIComponent(deviceId)}`);
}

// Check GPON / EPON mode
export function checkGponEpon(deviceId: string) {
  return request<{
    success: boolean;
    deviceId: string;
    productClass: string;
    manufacturer: string;
    mode: "GPON" | "EPON" | "UNKNOWN";
  }>(`/api/v1/gacs/check-gponepon/${encodeURIComponent(deviceId)}`);
}

// Map settings CRUD
export function fetchMapSettings() {
  return request<MapSettings>("/api/v1/map-settings");
}

export function updateMapSettings(settings: MapSettings) {
  return request<{ success: boolean }>("/api/v1/map-settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export function resetMapSettings() {
  return request<MapSettings>("/api/v1/map-settings/reset", {
    method: "POST",
  });
}

// Map nodes CRUD
export function fetchNodes() {
  return request<MapNode[]>("/api/v1/mapping-data/nodes");
}

export function fetchNode(nodeId: string) {
  return request<MapNode>(`/api/v1/mapping-data/nodes/${encodeURIComponent(nodeId)}`);
}

export function createNode(node: MapNode) {
  return request<MapNode>("/api/v1/mapping-data/nodes", {
    method: "POST",
    body: JSON.stringify(node),
  });
}

export function updateNode(nodeId: string, node: MapNode) {
  return request<MapNode>(`/api/v1/mapping-data/nodes/${encodeURIComponent(nodeId)}`, {
    method: "PUT",
    body: JSON.stringify(node),
  });
}

export function deleteNode(nodeId: string) {
  return request<{ success: boolean }>(`/api/v1/mapping-data/nodes/${encodeURIComponent(nodeId)}`, {
    method: "DELETE",
  });
}

// Map edges CRUD
export function fetchEdges() {
  return request<MapEdge[]>("/api/v1/mapping-data/edges");
}

export function fetchEdge(edgeId: string) {
  return request<MapEdge>(`/api/v1/mapping-data/edges/${encodeURIComponent(edgeId)}`);
}

export function createEdge(edge: MapEdge) {
  return request<MapEdge>("/api/v1/mapping-data/edges", {
    method: "POST",
    body: JSON.stringify(edge),
  });
}

export function updateEdge(edgeId: string, edge: MapEdge) {
  return request<MapEdge>(`/api/v1/mapping-data/edges/${encodeURIComponent(edgeId)}`, {
    method: "PUT",
    body: JSON.stringify(edge),
  });
}

export function deleteEdge(edgeId: string) {
  return request<{ success: boolean }>(`/api/v1/mapping-data/edges/${encodeURIComponent(edgeId)}`, {
    method: "DELETE",
  });
}

// Sync mapping data
export function syncMappingData(data: { nodes: MapNode[]; edges: MapEdge[] }) {
  return request<{ success: boolean }>("/api/v1/mapping-data/sync", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Reset mapping data
export function resetMappingData(password: string) {
  return request<{ success: boolean }>("/api/v1/mapping-data/reset", {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
}

// Email Templates API
export function fetchEmailTemplates() {
  return request<{ data: EmailTemplateItem[] }>("/api/v1/email-templates");
}

export function createEmailTemplate(input: Omit<EmailTemplateItem, "id">) {
  return request<{ data: EmailTemplateItem }>("/api/v1/email-templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEmailTemplate(id: number, input: Omit<EmailTemplateItem, "id">) {
  return request<{ data: EmailTemplateItem }>(`/api/v1/email-templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteEmailTemplate(id: number) {
  return request<{ message: string }>(`/api/v1/email-templates/${id}`, {
    method: "DELETE",
  });
}

// Vouchers API
export function fetchVouchers() {
  return request<{ data: VoucherItem[] }>("/api/v1/vouchers");
}

export function createVoucher(input: Omit<VoucherItem, "id" | "created_at">) {
  return request<{ data: VoucherItem }>("/api/v1/vouchers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteVoucher(id: number) {
  return request<{ message: string }>(`/api/v1/vouchers/${id}`, {
    method: "DELETE",
  });
}

export function fetchVoucherUsageLogs() {
  return request<{ data: VoucherUsageLogItem[] }>("/api/v1/vouchers/usage-logs");
}

export function fetchCustomerVouchers() {
  return request<{ data: CustomerVoucherItem[] }>("/api/v1/vouchers/customer-vouchers");
}

export function claimCustomerVoucher(customerId: number, code: string) {
  return request<{ message: string; data: CustomerVoucherItem }>(`/api/v1/customers/${customerId}/vouchers/claim`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function toggleCustomerVoucherAutoApply(customerId: number, autoApply: boolean) {
  return request<{ message: string }>(`/api/v1/customers/${customerId}/vouchers/toggle-auto-apply`, {
    method: "POST",
    body: JSON.stringify({ auto_apply: autoApply }),
  });
}

// ─── MikroTik Multi-Router & IP Pools & Traffic Stats & SMTP Test ──────────

export type MikrotikRouterItem = {
  id: number;
  name: string;
  host: string;
  username: string;
  password?: string;
  is_active: boolean;
  role: string;
  slave_port?: string;
  status?: "online" | "failed_auth" | "offline";
};

export function fetchMikrotikRouters() {
  return request<{ data: MikrotikRouterItem[] }>("/api/v1/mikrotik/routers");
}

export function createMikrotikRouter(input: Omit<MikrotikRouterItem, "id">) {
  return request<{ data: MikrotikRouterItem }>("/api/v1/mikrotik/routers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateMikrotikRouter(id: number, input: Partial<MikrotikRouterItem>) {
  return request<{ data: MikrotikRouterItem }>(`/api/v1/mikrotik/routers/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteMikrotikRouter(id: number) {
  return request<{ message: string }>(`/api/v1/mikrotik/routers/${id}`, {
    method: "DELETE",
  });
}

export function testRouterConnection(id: number) {
  return request<{ success: boolean; message: string }>(`/api/v1/mikrotik/routers/${id}/test`, {
    method: "POST",
  });
}

export type SyncResultData = {
  pools_synced: number;
  profiles_synced: number;
  secrets_synced: number;
  errors?: string[];
};

export function syncMikrotikRouters() {
  return request<{ success: boolean; message: string; data: SyncResultData }>("/api/v1/mikrotik/routers/sync", {
    method: "POST",
  });
}

export type MikrotikIPPoolItem = {
  id: string;
  name: string;
  ranges: string;
};

export function fetchMikrotikIPPools() {
  return request<{ data: MikrotikIPPoolItem[] }>("/api/v1/mikrotik/ip-pools");
}

export function fetchRouterInterfaces(input: { id?: number; host?: string; username?: string; password?: string }) {
  return request<{ success: boolean; message?: string; data: string[] }>("/api/v1/mikrotik/routers/interfaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type TrafficStats = {
  tx_rate: number;
  rx_rate: number;
};

export function fetchTrafficStats() {
  return request<{ data: Record<string, TrafficStats> }>("/api/v1/monitoring/traffic");
}

export type SMTPTestPayload = {
  host: string;
  port: string;
  username: string;
  password?: string;
  from_email: string;
  encryption: string;
  to_email: string;
};

export function testSMTP(payload: SMTPTestPayload) {
  return request<{ success: boolean; message: string }>("/api/v1/integration/test-smtp", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteSetting(key: string) {
  return request<{ message: string }>(`/api/v1/settings/${key}`, {
    method: "DELETE",
  });
}

// Payment Confirmations API
export function fetchPendingConfirmations() {
  return request<{ data: PaymentConfirmationItem[] }>("/api/v1/bills/confirmations/pending");
}

export function approveConfirmation(id: number) {
  return request<{ message: string }>(`/api/v1/bills/confirmations/${id}/approve`, {
    method: "POST",
  });
}

export function rejectConfirmation(id: number) {
  return request<{ message: string }>(`/api/v1/bills/confirmations/${id}/reject`, {
    method: "POST",
  });
}

export function createPaymentConfirmation(payload: {
  tagihan_id: number;
  pelanggan_id: number;
  bukti_transfer?: string;
  catatan?: string;
  linked_tagihan_ids?: string;
}) {
  return request<{ id: number; message: string }>("/api/v1/chatbot/confirmations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Inventory API
import type { InventoryItem, InventoryLog } from "../types";

export function fetchInventoryItems() {
  return request<{ data: InventoryItem[] }>("/api/v1/inventory");
}

export function createInventoryItem(input: Omit<InventoryItem, "id" | "created_at" | "updated_at">) {
  return request<{ data: InventoryItem }>("/api/v1/inventory", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateInventoryItem(id: number, input: Omit<InventoryItem, "id" | "created_at" | "updated_at">) {
  return request<{ data: InventoryItem }>(`/api/v1/inventory/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteInventoryItem(id: number) {
  return request<{ message: string }>(`/api/v1/inventory/${id}`, {
    method: "DELETE",
  });
}

export function fetchInventoryLogs(itemId?: number) {
  const url = itemId ? `/api/v1/inventory/logs?item_id=${itemId}` : "/api/v1/inventory/logs";
  return request<{ data: InventoryLog[] }>(url);
}

export function createInventoryLog(itemId: number, input: Omit<InventoryLog, "id" | "item_id" | "created_by" | "created_at">) {
  return request<{ message: string }>(`/api/v1/inventory/${itemId}/logs`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
