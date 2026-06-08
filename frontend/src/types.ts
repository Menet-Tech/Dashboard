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
  price: number;
  description: string;
  customer_count: number;
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
  sn_ont: string;
  due_day: number;
  status: "active" | "limit" | "inactive";
  address: string;
  is_trial?: boolean;
  trial_started_at?: string;
  trial_days?: number;
  diskon: number;
  referred_by_id?: number;
  referral_balance: number;
  referral_code?: string;
  referred_by_name?: string;
  voucher_discount?: number;
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
  status: "belum_bayar" | "lunas";
  display_status: "belum_bayar" | "jatuh_tempo" | "menunggak" | "lunas";
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
  is_active: boolean;
};

export type NotificationLog = {
  id: number;
  bill_id: number;
  trigger_key: string;
  sent_to: string;
  status: string;
  response_message: string;
  created_at: string;
};

export type SettingsState = {
  wa_gateway_url?: string;
  wa_account_id?: string;
  wa_billing_account_id?: string;
  wa_reminder_account_id?: string;
  wa_due_account_id?: string;
  wa_limit_account_id?: string;
  wa_payment_account_id?: string;
  wa_api_key?: string;
  discord_webhook_url?: string;
  discord_notify_payment?: string;
  discord_notify_generate?: string;
  discord_notify_worker?: string;
  billing_reminder_days?: string;
  billing_limit_days?: string;
  billing_menunggak_days?: string;
  billing_auto_generate_enabled?: string;
  billing_generate_day?: string;
  billing_generate_time?: string;
  billing_generate_retry_attempts?: string;
  billing_generate_retry_backoff_seconds?: string;
  worker_interval_seconds?: string;
  backup_auto_enabled?: string;
  backup_auto_time?: string;
  backup_retention_count?: string;
  mikrotik_host?: string;
  mikrotik_user?: string;
  mikrotik_pass?: string;
  mikrotik_test_username?: string;
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

export type ViewKey =
  | "dashboard"
  | "packages"
  | "customers"
  | "discounts"
  | "bills"
  | "templates"
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
  | "network-map";

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
  created_at?: string;
  updated_at?: string;
};

export type TelegramBotSettings = {
  botToken: string;
  chatIds: string;
  enabled: boolean;
};

export type OdpItem = {
  id: number;
  nama: string;
  lokasi: string;
  deskripsi: string;
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
