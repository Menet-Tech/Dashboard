export type User = {
  id: number;
  username: string;
  role: string;
  is_active?: boolean;
  last_login_at?: string;
  last_login_ip?: string;
};

export type ManagedUserItem = {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  last_login_at?: string;
  last_login_ip?: string;
};

export type PackageItem = {
  id: number;
  name: string;
  speed_mbps: number;
  rate_limit?: string; // full MikroTik rate-limit string, e.g. "10M/10M 50M/50M 10M/10M 10/10"
  price: number;
  description: string;
  customer_count: number;
  ip_pool?: string;
  local_address?: string;
  ip_pool_range?: string;
};

export type CustomerItem = {
  id: number;
  name: string;
  package_id: number;
  package_name?: string;
  package_price?: number;
  user_pppoe: string;
  password_pppoe: string;
  whatsapp: string;
  email?: string;
  sn_ont: string;
  due_day: number;
  status: "active" | "limit" | "suspended" | "inactive" | "pending" | "wifi_umum" | "trial";
  address: string;
  is_trial?: boolean;
  trial_started_at?: string;
  trial_days?: number;
  diskon: number;
  tipe_diskon?: "flat" | "percent";
  referred_by_id?: number;
  referral_balance: number;
  referral_code?: string;
  referred_by_name?: string;
  voucher_discount?: number;
  voucher_auto_apply?: number;
  ont_status?: string;
  ont_ip?: string;
  ont_uptime?: string;
  ont_rx_power?: string;
  ont_tx_power?: string;
  pppoe_status?: string;
  pppoe_ip?: string;
  pppoe_uptime?: string;
  last_sync_at?: string;
  odp_id?: number;
  odp_name?: string;
  odp_port?: number;
};

export type BillItem = {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_phone?: string;
  package_id: number;
  package_name: string;
  package_speed: number;
  period: string;
  invoice_number: string;
  amount: number;
  due_date: string;
  status: "belum_bayar" | "lunas" | "pending_paid" | "pending_extension";
  display_status: "belum_bayar" | "jatuh_tempo" | "menunggak" | "lunas" | "perpanjangan" | "pending_lunas" | "pending_perpanjangan";
  paid_at?: string;
  payment_method?: string;
  proof_path?: string;
  diskon?: number;
  diskon_referral?: number;
};

export type TemplateItem = {
  id: number;
  name: string;
  trigger_key: string;
  content: string;
  trigger_keywords?: string;
  is_active: boolean;
};

export type NotificationLog = {
  id: number;
  bill_id: number;
  trigger_key: string;
  sent_to: string;
  status: string;
  response_message: string;
  message?: string;
  created_at: string;
};

export type InventoryItem = {
  id: number;
  name: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  created_at: string;
  updated_at: string;
};

export type InventoryLog = {
  id: number;
  item_id: number;
  type: "in" | "out";
  quantity: number;
  reference: string;
  notes: string;
  created_by: string;
  created_at: string;
};

export type SettingsState = {
  [key: string]: string | undefined;
  wa_gateway_url?: string;
  wa_account_id?: string;
  wa_billing_account_id?: string;
  wa_reminder_account_id?: string;
  wa_due_account_id?: string;
  wa_limit_account_id?: string;
  wa_payment_account_id?: string;
  wa_api_key?: string;
  wa_queue_throttle_seconds?: string;
  discord_webhook_url?: string;
  discord_notify_payment?: string;
  discord_notify_generate?: string;
  discord_notify_worker?: string;
  discord_bot_token?: string;
  discord_bot_application_id?: string;
  discord_bot_guild_id?: string;
  billing_reminder_days?: string;
  billing_limit_days?: string;
  billing_menunggak_days?: string;
  billing_inactive_suspended_days?: string;
  billing_auto_generate_enabled?: string;
  billing_generate_day?: string;
  billing_generate_time?: string;
  billing_generate_retry_attempts?: string;
  billing_generate_retry_backoff_seconds?: string;
  worker_interval_seconds?: string;
  backup_auto_enabled?: string;
  backup_auto_time?: string;
  backup_retention_count?: string;
  backup_encryption_password?: string;
  backup_discord_channel_id?: string;
  backup_encryption_enabled?: string;
  mikrotik_host?: string;
  mikrotik_user?: string;
  mikrotik_pass?: string;
  mikrotik_test_username?: string;
  mikrotik_isolir_profile?: string;
  mikrotik_inactive_profile?: string;
  trial_enabled?: string;
  trial_period_days?: string;
  trial_overdue_grace_days?: string;
  chatbot_trigger_billing?: string;
  chatbot_trigger_register?: string;
  chatbot_trigger_support?: string;
  chatbot_trigger_packages?: string;
  chatbot_trigger_faq?: string;
  chatbot_trigger_admin?: string;
  acs_url?: string;
  acs_username?: string;
  acs_password?: string;
  gacs_rx_power_excellent?: string;
  gacs_rx_power_fair?: string;
  gacs_portal_api_key?: string;
  smtp_enabled?: string;
  smtp_host?: string;
  smtp_port?: string;
  smtp_username?: string;
  smtp_password?: string;
  smtp_from_email?: string;
  smtp_encryption?: string;
  wa_gateway_enabled?: string;
  discord_bot_enabled?: string;
  appName?: string;
  portalApiKey?: string;
  vpPppoeUsername?: string;
  vpWanBridge?: string;
  vpRxPower?: string;
  vpTemperature?: string;
  vpActiveDevices?: string;
  vpSuperAdmin?: string;
  vpSuperPassword?: string;
  vpUserAdmin?: string;
  vpUserPassword?: string;
  rxPowerThresholds?: string;
  autoRefreshIntervals?: string;
};

export type AuditLogItem = {
  id: number;
  user_id?: number;
  username?: string;
  pelanggan_id?: number;
  action: string;
  message: string;
  ip_address?: string;
  created_at: string;
};

export type RevenueItem = {
  period: string;
  total_billed: number;
  total_paid: number;
};

export type AgingReport = {
  current: number;
  days_1_30: number;
  days_31_60: number;
  over_60: number;
};

export type PaymentConfirmationItem = {
  id: number;
  tagihan_id: number;
  pelanggan_id: number;
  customer_name: string;
  invoice_number: string;
  amount: number;
  bukti_transfer?: string;
  status: string;
  catatan: string;
  created_at: string;
  linked_tagihan_ids?: string;
  linked_bills?: Array<{
    tagihan_id: number;
    invoice_number: string;
    amount: number;
  }>;
};

export type ViewKey =
  | "dashboard"
  | "packages"
  | "customers"
  | "discounts"
  | "bills"
  | "templates"
  | "email-templates"
  | "monitoring"
  | "audit"
  | "users"
  | "settings"
  | "tickets"
  | "registration"
  | "whatsapp"
  | "reports"
  | "odp"
  | "devices"
  | "network-map"
  | "payment-confirmations"
  | "traffic"
  | "inventory";

export type MapSettings = {
  id?: number;
  center_lat: string;
  center_lng: string;
  max_zoom_in: string;
  max_zoom_out: string;
  default_zoom: string;
  created_at?: string;
  updated_at?: string;
};

export type MapNode = {
  id?: number;
  node_id: string;
  type: "server" | "odc" | "odp" | "ont";
  name: string;
  latitude: number;
  longitude: number;
  capacity?: number;
  splitter?: string;
  pppoe?: string;
  serialnumber?: string;
  notes?: string;
  locked?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type MapEdge = {
  id?: number;
  edge_id: string;
  source: string;
  target: string;
  fiber_type?: string;
  distance?: number;
  waypoints?: [number, number][];
  notes?: string;
  counts_as_port?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type EmailTemplateItem = {
  id: number;
  name: string;
  trigger_key: string;
  subject: string;
  content: string;
  is_active: boolean;
};

export type OdpItem = {
  id: number;
  nama: string;
  lokasi: string;
  deskripsi: string;
  ports: number;
  splitter_ratio: string;
  latitude: number;
  longitude: number;
  customer_count: number;
};

export type TicketItem = {
  id: number;
  pelanggan_id?: number;
  nama: string;
  no_hp: string;
  alamat: string;
  kendala: string;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
};

export type TicketMessageItem = {
  id: number;
  ticket_id: number;
  sender_type: "admin" | "customer";
  message: string;
  created_at: string;
  is_read: number;
  read_at?: string;
};

export type TicketDetailItem = TicketItem & {
  customer_name?: string;
  messages: TicketMessageItem[];
};

// MikroTik Sync types
export type MikrotikSyncSecret = {
  name: string;
  password: string;
  profile: string;
  disabled: boolean;
  exists: boolean; // already in dashboard?
};

export type MikrotikSyncPreviewResponse = {
  secrets: MikrotikSyncSecret[];
  total: number;
};

export type MikrotikImportResult = {
  name: string;
  status: "imported" | "skipped" | "error";
  message?: string;
};

// Voucher System types
export type VoucherItem = {
  id: number;
  code: string;
  amount: number;
  type: "one-time" | "multi-use" | "permanent";
  total_cycles: number;
  description: string;
  created_at?: string;
};

export type CustomerVoucherItem = {
  id: number;
  pelanggan_id: number;
  customer_name?: string;
  voucher_id: number;
  voucher_code?: string;
  voucher_amount?: number;
  remaining_cycles: number;
  status: "active" | "completed";
  created_at: string;
};

export type VoucherUsageLogItem = {
  id: number;
  pelanggan_id: number;
  customer_name: string;
  voucher_id: number;
  voucher_code: string;
  tagihan_id: number;
  invoice_number: string;
  amount_applied: number;
  cycle_number: number;
  created_at: string;
};

