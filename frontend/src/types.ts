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

export type SettingsPayload = Record<string, string>;

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
