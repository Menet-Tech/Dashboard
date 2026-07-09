/**
 * Form validation functions.
 * All return FieldErrors (Record<string, string>).
 * No side-effects, no React deps.
 */

export type FieldErrors = Record<string, string>;

export function validateLogin(form: { username: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.username.trim()) errors.username = "Username wajib diisi.";
  if (!form.password.trim()) errors.password = "Password wajib diisi.";
  return errors;
}

export function validatePackage(form: {
  name: string;
  speed_mbps: number;
  price: number;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = "Nama paket wajib diisi.";
  if (form.speed_mbps <= 0) errors.speed_mbps = "Kecepatan harus lebih dari 0 Mbps.";
  if (form.price <= 0) errors.price = "Harga harus lebih dari 0.";
  return errors;
}

export function validateCustomer(form: {
  name: string;
  package_id: number;
  user_pppoe: string;
  password_pppoe: string;
  due_day: number;
  status?: string;
  diskon?: number;
  tipe_diskon?: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const isWifiUmum = form.status === "wifi_umum";
  if (!form.name.trim()) errors.name = "Nama pelanggan wajib diisi.";
  if (!form.package_id) errors.package_id = "Pilih paket pelanggan.";
  if (!isWifiUmum) {
    if (!form.user_pppoe.trim()) errors.user_pppoe = "Username PPPoE wajib diisi.";
    if (!form.password_pppoe.trim()) errors.password_pppoe = "Password PPPoE wajib diisi.";
    if (form.due_day < 1 || form.due_day > 28)
      errors.due_day = "Jatuh tempo bulanan harus antara 1-28.";
  }

  if (form.diskon !== undefined && form.tipe_diskon === "percent") {
    if (form.diskon < 0 || form.diskon > 100) {
      errors.diskon = "Diskon persen harus antara 0% - 100%.";
    }
  } else if (form.diskon !== undefined && form.diskon < 0) {
    errors.diskon = "Diskon tidak boleh bernilai negatif.";
  }

  return errors;
}

export function validateTemplate(form: {
  name: string;
  trigger_key: string;
  content: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = "Nama template wajib diisi.";
  if (!form.trigger_key.trim()) errors.trigger_key = "Trigger key wajib diisi.";
  if (!form.content.trim()) errors.content = "Isi template wajib diisi.";
  return errors;
}

export function validateManagedUser(form: { username: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.username.trim()) errors.username = "Username user wajib diisi.";
  if (form.password.trim().length < 8)
    errors.password = "Password awal minimal 8 karakter.";
  return errors;
}

export function validateSettings(form: Record<string, string | undefined>): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^\d+$/.test(form["billing_generate_day"] ?? "1"))
    errors.billing_generate_day = "Tanggal generate harus berupa angka.";
  if (!/^\d{2}:\d{2}$/.test(form["billing_generate_time"] ?? "00:05"))
    errors.billing_generate_time = "Jam generate harus format HH:MM.";
  if (!/^\d+$/.test(form["worker_interval_seconds"] ?? "60"))
    errors.worker_interval_seconds = "Interval worker harus berupa angka.";
  return errors;
}

export function validateBillPeriod(period: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^\d{4}-\d{2}$/.test(period.trim()))
    errors.period = "Periode harus memakai format YYYY-MM.";
  return errors;
}

export function validatePasswordReset(password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (password.trim().length < 8) errors.password = "Password baru minimal 8 karakter.";
  return errors;
}
