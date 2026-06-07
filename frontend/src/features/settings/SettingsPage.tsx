import { useState, useEffect, useCallback, type FormEvent } from "react";
import { inputClassName, renderInlineError } from "../../components/ui";
import type { FieldErrors } from "../../utils/validation";
import type { SettingsState, MikrotikSyncSecret, MikrotikImportResult } from "../../types";
import { getGatewayAccounts } from "../../lib/gatewayApi";
import { RefreshCw, CheckCircle2, AlertCircle, Download, Loader2 } from "lucide-react";

type SettingsPageProps = {
  settingsForm: SettingsState;
  settingsErrors: FieldErrors;
  submitting: boolean;
  busyAction: string | null;
  onFormChange: (form: SettingsState) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
};

export function SettingsPage({
  settingsForm,
  settingsErrors,
  submitting,
  busyAction,
  onFormChange,
  onSubmit,
}: SettingsPageProps) {
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;

  const gatewayUrl = settingsForm.wa_gateway_url || "http://localhost:3001";
  const apiKey = settingsForm.wa_api_key || "";
  const [accounts, setAccounts] = useState<string[]>([]);

  // MikroTik sync state
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncSecrets, setSyncSecrets] = useState<MikrotikSyncSecret[] | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importDueDay, setImportDueDay] = useState(1);
  const [importLoading, setImportLoading] = useState(false);
  const [importResults, setImportResults] = useState<MikrotikImportResult[] | null>(null);

  const handleSyncPreview = useCallback(async () => {
    setSyncLoading(true);
    setSyncError(null);
    setSyncSecrets(null);
    setSelected(new Set());
    setImportResults(null);
    try {
      const res = await fetch("/api/v1/integration/mikrotik/sync-preview", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal mengambil data MikroTik");
      setSyncSecrets((data.secrets as MikrotikSyncSecret[]) || []);
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncLoading(false);
    }
  }, []);

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    if (!syncSecrets) return;
    const newOnes = syncSecrets.filter((s) => !s.exists).map((s) => s.name);
    if (selected.size === newOnes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(newOnes));
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImportLoading(true);
    setImportResults(null);
    try {
      const res = await fetch("/api/v1/integration/mikrotik/sync-import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: Array.from(selected), default_due_day: importDueDay }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Import gagal");
      setImportResults(data.results as MikrotikImportResult[]);
      // refresh preview
      void handleSyncPreview();
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportLoading(false);
    }
  };

  useEffect(() => {
    if (!gatewayUrl || !apiKey) return;
    let active = true;
    async function load() {
      try {
        const res = await getGatewayAccounts(gatewayUrl, apiKey);
        if (active) {
          setAccounts(res.data.map((a) => a.accountId));
        }
      } catch (e) {
        // ignore
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [gatewayUrl, apiKey]);

  return (
    <section className="grid">
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Pengaturan Sistem</h2>
          <p>Konfigurasi WhatsApp, Discord, billing rule, worker, dan kebijakan backup.</p>
        </div>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={onSubmit}>
          <div className="col-span-full border-b border-slate-100 pb-2 mt-4 first:mt-0">
            <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">WhatsApp Gateway</h4>
          </div>

          {/* Status info card for the JS gateway bridge used by billing automation. */}
          <div className="col-span-full bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <div className="bg-emerald-100 text-emerald-600 rounded-full p-2 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.46a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.86a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Gateway Terintegrasi</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                WhatsApp Gateway berjalan sebagai service JS terpisah. Dashboard Go memakai URL dan Account ID di bawah ini untuk billing otomatis.
                Default lokal: <code className="bg-emerald-100 px-1 rounded">http://localhost:3001</code>.
              </p>
            </div>
          </div>

          <label>
            <span>Gateway URL</span>
            <input
              className={inputClassName(settingsErrors.wa_gateway_url)}
              type="text"
              value={settingsForm["wa_gateway_url"] ?? "http://localhost:3001"}
              onChange={(e) => onFormChange({ ...settingsForm, wa_gateway_url: e.target.value })}
              placeholder="http://localhost:3001"
            />
            {renderInlineError(settingsErrors.wa_gateway_url)}
            <span className="text-xs text-slate-400 mt-1 block">Dipakai dashboard, worker billing, dan test integrasi untuk menghubungi gateway JS.</span>
          </label>

          <label>
            <span>Default Account ID</span>
            <select
              className={inputClassName()}
              value={settingsForm["wa_account_id"] ?? "default"}
              onChange={(e) => onFormChange({ ...settingsForm, wa_account_id: e.target.value })}
            >
              {!accounts.includes("default") && (
                <option value="default">default</option>
              )}
              {accounts.map((acc) => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
              {settingsForm["wa_account_id"] &&
                settingsForm["wa_account_id"] !== "default" &&
                !accounts.includes(settingsForm["wa_account_id"]) && (
                  <option value={settingsForm["wa_account_id"]}>
                    {settingsForm["wa_account_id"]} (Tidak aktif)
                  </option>
                )}
            </select>
            <span className="text-xs text-slate-400 mt-1 block">Akun WhatsApp utama untuk notifikasi otomatis seperti billing, reminder, dan pembayaran lunas.</span>
          </label>

          <label>
            <span>Akun Generate/Billing</span>
            <select
              className={inputClassName()}
              value={settingsForm["wa_billing_account_id"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, wa_billing_account_id: e.target.value })}
            >
              <option value="">Ikut default</option>
              {accounts.map((acc) => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
              {settingsForm["wa_billing_account_id"] &&
                !accounts.includes(settingsForm["wa_billing_account_id"]) && (
                  <option value={settingsForm["wa_billing_account_id"]}>
                    {settingsForm["wa_billing_account_id"]} (Tidak aktif)
                  </option>
                )}
            </select>
          </label>

          <label>
            <span>Akun Reminder</span>
            <select
              className={inputClassName()}
              value={settingsForm["wa_reminder_account_id"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, wa_reminder_account_id: e.target.value })}
            >
              <option value="">Ikut default</option>
              {accounts.map((acc) => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
              {settingsForm["wa_reminder_account_id"] &&
                !accounts.includes(settingsForm["wa_reminder_account_id"]) && (
                  <option value={settingsForm["wa_reminder_account_id"]}>
                    {settingsForm["wa_reminder_account_id"]} (Tidak aktif)
                  </option>
                )}
            </select>
          </label>

          <label>
            <span>Akun Jatuh Tempo / Trial</span>
            <select
              className={inputClassName()}
              value={settingsForm["wa_due_account_id"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, wa_due_account_id: e.target.value })}
            >
              <option value="">Ikut default</option>
              {accounts.map((acc) => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
              {settingsForm["wa_due_account_id"] &&
                !accounts.includes(settingsForm["wa_due_account_id"]) && (
                  <option value={settingsForm["wa_due_account_id"]}>
                    {settingsForm["wa_due_account_id"]} (Tidak aktif)
                  </option>
                )}
            </select>
          </label>

          <label>
            <span>Akun Limit / Isolir</span>
            <select
              className={inputClassName()}
              value={settingsForm["wa_limit_account_id"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, wa_limit_account_id: e.target.value })}
            >
              <option value="">Ikut default</option>
              {accounts.map((acc) => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
              {settingsForm["wa_limit_account_id"] &&
                !accounts.includes(settingsForm["wa_limit_account_id"]) && (
                  <option value={settingsForm["wa_limit_account_id"]}>
                    {settingsForm["wa_limit_account_id"]} (Tidak aktif)
                  </option>
                )}
            </select>
          </label>

          <label>
            <span>Akun Pembayaran Lunas</span>
            <select
              className={inputClassName()}
              value={settingsForm["wa_payment_account_id"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, wa_payment_account_id: e.target.value })}
            >
              <option value="">Ikut default</option>
              {accounts.map((acc) => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
              {settingsForm["wa_payment_account_id"] &&
                !accounts.includes(settingsForm["wa_payment_account_id"]) && (
                  <option value={settingsForm["wa_payment_account_id"]}>
                    {settingsForm["wa_payment_account_id"]} (Tidak aktif)
                  </option>
                )}
            </select>
          </label>

          <label>
            <span>Internal API Key</span>
            <input
              className={inputClassName()}
              type="text"
              value={settingsForm["wa_api_key"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, wa_api_key: e.target.value })}
              placeholder="Harus sama dengan DASHBOARD_INTERNAL_API_KEY di .env"
            />
            <span className="text-xs text-slate-400 mt-1 block">Digunakan gateway untuk autentikasi ke backend. Simpan di <code>backend/.env</code> sebagai <code>DASHBOARD_INTERNAL_API_KEY</code>.</span>
          </label>

          <div className="col-span-full border-b border-slate-100 pb-2 mt-6">
            <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Discord Notifications</h4>
          </div>

          <label className="full-width">
            <span>Webhook URL</span>
            <input
              className={inputClassName()}
              type="text"
              value={settingsForm["discord_webhook_url"] ?? ""}
              onChange={(e) =>
                onFormChange({ ...settingsForm, discord_webhook_url: e.target.value })
              }
              placeholder="https://discord.com/api/webhooks/..."
            />
          </label>
          <label>
            <span>Notif Pembayaran Lunas</span>
            <select
              className={inputClassName()}
              value={settingsForm["discord_notify_payment"] ?? "1"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, discord_notify_payment: e.target.value })
              }
            >
              <option value="1">Aktif</option>
              <option value="0">Nonaktif</option>
            </select>
          </label>
          <label>
            <span>Notif Generate Tagihan</span>
            <select
              className={inputClassName()}
              value={settingsForm["discord_notify_generate"] ?? "1"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, discord_notify_generate: e.target.value })
              }
            >
              <option value="1">Aktif</option>
              <option value="0">Nonaktif</option>
            </select>
          </label>
          <label>
            <span>Notif Worker (Reminder / Limit / Backup)</span>
            <select
              className={inputClassName()}
              value={settingsForm["discord_notify_worker"] ?? "1"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, discord_notify_worker: e.target.value })
              }
            >
              <option value="1">Aktif</option>
              <option value="0">Nonaktif</option>
            </select>
          </label>

          <div className="col-span-full border-b border-slate-100 pb-2 mt-6">
            <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Billing Rules & Worker</h4>
          </div>

          <label>
            <span>Reminder Days (Hari sebelum jatuh tempo)</span>
            <input
              className={inputClassName()}
              type="number"
              value={settingsForm["billing_reminder_days"] ?? "3"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, billing_reminder_days: e.target.value })
              }
            />
          </label>
          <label>
            <span>Limit Days (Batas bayar sebelum isolir)</span>
            <input
              className={inputClassName()}
              type="number"
              value={settingsForm["billing_limit_days"] ?? "5"}
              onChange={(e) => onFormChange({ ...settingsForm, billing_limit_days: e.target.value })}
            />
          </label>
          <label>
            <span>Menunggak Days (Hari untuk status menunggak)</span>
            <input
              className={inputClassName()}
              type="number"
              value={settingsForm["billing_menunggak_days"] ?? "30"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, billing_menunggak_days: e.target.value })
              }
            />
          </label>
          <label>
            <span>Auto Generate Tagihan</span>
            <select
              className={inputClassName()}
              value={settingsForm["billing_auto_generate_enabled"] ?? "1"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, billing_auto_generate_enabled: e.target.value })
              }
            >
              <option value="1">Aktif</option>
              <option value="0">Nonaktif</option>
            </select>
          </label>
          <label>
            <span>Tanggal Generate Bulanan</span>
            <input
              className={inputClassName(settingsErrors.billing_generate_day)}
              type="number"
              min="1"
              max="28"
              value={settingsForm["billing_generate_day"] ?? "1"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, billing_generate_day: e.target.value })
              }
            />
            {renderInlineError(settingsErrors.billing_generate_day)}
          </label>
          <label>
            <span>Jam Generate Bulanan</span>
            <input
              className={inputClassName(settingsErrors.billing_generate_time)}
              type="time"
              value={settingsForm["billing_generate_time"] ?? "00:05"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, billing_generate_time: e.target.value })
              }
            />
            {renderInlineError(settingsErrors.billing_generate_time)}
          </label>
          <label>
            <span>Retry Generate</span>
            <input
              className={inputClassName()}
              type="number"
              min="1"
              max="10"
              value={settingsForm["billing_generate_retry_attempts"] ?? "3"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, billing_generate_retry_attempts: e.target.value })
              }
            />
          </label>
          <label>
            <span>Backoff Retry (Detik)</span>
            <input
              className={inputClassName()}
              type="number"
              min="0"
              max="60"
              value={settingsForm["billing_generate_retry_backoff_seconds"] ?? "2"}
              onChange={(e) =>
                onFormChange({
                  ...settingsForm,
                  billing_generate_retry_backoff_seconds: e.target.value,
                })
              }
            />
          </label>
          <label>
            <span>Worker Interval (Detik)</span>
            <input
              className={inputClassName(settingsErrors.worker_interval_seconds)}
              type="number"
              value={settingsForm["worker_interval_seconds"] ?? "60"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, worker_interval_seconds: e.target.value })
              }
            />
            {renderInlineError(settingsErrors.worker_interval_seconds)}
          </label>
          <label>
            <span>Auto Backup</span>
            <select
              className={inputClassName()}
              value={settingsForm["backup_auto_enabled"] ?? "1"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, backup_auto_enabled: e.target.value })
              }
            >
              <option value="1">Aktif</option>
              <option value="0">Nonaktif</option>
            </select>
          </label>
          <label>
            <span>Jadwal Backup Harian</span>
            <input
              className={inputClassName()}
              type="time"
              value={settingsForm["backup_auto_time"] ?? "02:00"}
              onChange={(e) => onFormChange({ ...settingsForm, backup_auto_time: e.target.value })}
            />
          </label>
          <label>
            <span>Retensi Backup</span>
            <input
              className={inputClassName()}
              type="number"
              min="1"
              value={settingsForm["backup_retention_count"] ?? "7"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, backup_retention_count: e.target.value })
              }
            />
          </label>

          <div className="col-span-full border-b border-slate-100 pb-2 mt-6">
            <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">MikroTik</h4>
          </div>
          <label>
            <span>Host Router</span>
            <input
              className={inputClassName()}
              type="text"
              value={settingsForm["mikrotik_host"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, mikrotik_host: e.target.value })}
              placeholder="192.168.88.1"
            />
          </label>
          <label>
            <span>Username Router</span>
            <input
              className={inputClassName()}
              type="text"
              value={settingsForm["mikrotik_user"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, mikrotik_user: e.target.value })}
              placeholder="admin"
            />
          </label>
          <label>
            <span>Password Router</span>
            <input
              className={inputClassName()}
              type="password"
              value={settingsForm["mikrotik_pass"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, mikrotik_pass: e.target.value })}
              placeholder="••••••••"
            />
          </label>
          <label>
            <span>Username PPPoE Test</span>
            <input
              className={inputClassName()}
              type="text"
              value={settingsForm["mikrotik_test_username"] ?? ""}
              onChange={(e) =>
                onFormChange({ ...settingsForm, mikrotik_test_username: e.target.value })
              }
              placeholder="test-user"
            />
          </label>

          {/* MikroTik Sync Panel */}
          <div className="col-span-full mt-4">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-indigo-700">Sinkronisasi dari MikroTik</p>
                  <p className="text-xs text-slate-500 mt-0.5">Tarik daftar PPPoE secret dari router dan import yang belum ada di dashboard</p>
                </div>
                <button
                  type="button"
                  onClick={handleSyncPreview}
                  disabled={syncLoading}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  {syncLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {syncLoading ? "Memuat..." : "Preview Secrets"}
                </button>
              </div>

              {syncError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2.5 mb-3">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{syncError}</span>
                </div>
              )}

              {syncSecrets !== null && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{syncSecrets.length}</span> secret ditemukan &bull;{" "}
                      <span className="font-semibold text-green-700">{syncSecrets.filter((s) => !s.exists).length}</span> belum di dashboard
                    </p>
                    <button type="button" onClick={toggleAll} className="text-xs text-indigo-600 hover:underline font-medium">
                      {selected.size === syncSecrets.filter((s) => !s.exists).length ? "Batalkan Semua" : "Pilih Semua Baru"}
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                    {syncSecrets.map((secret) => (
                      <div key={secret.name} className={`flex items-center gap-3 px-3 py-2.5 ${secret.exists ? "opacity-50" : ""}`}>
                        <input
                          type="checkbox"
                          id={`sync-${secret.name}`}
                          checked={selected.has(secret.name)}
                          disabled={secret.exists}
                          onChange={() => toggleSelect(secret.name)}
                          className="accent-indigo-600 w-4 h-4 shrink-0"
                        />
                        <label htmlFor={`sync-${secret.name}`} className="flex-1 cursor-pointer min-w-0">
                          <span className="block text-xs font-semibold text-slate-800 truncate">{secret.name}</span>
                          <span className="block text-[10px] text-slate-400 truncate">Profile: {secret.profile || "default"}{secret.disabled ? " • disabled" : ""}</span>
                        </label>
                        {secret.exists ? (
                          <span className="text-[10px] bg-slate-100 text-slate-500 font-medium px-2 py-0.5 rounded-full">Ada</span>
                        ) : (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 font-medium px-2 py-0.5 rounded-full">Baru</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {selected.size > 0 && (
                    <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                      <div className="flex items-center gap-2">
                        <label htmlFor="import-due-day" className="text-xs text-slate-600 font-medium whitespace-nowrap">Tgl Jatuh Tempo:</label>
                        <input
                          id="import-due-day"
                          type="number"
                          min={1}
                          max={31}
                          value={importDueDay}
                          onChange={(e) => setImportDueDay(Number(e.target.value))}
                          className="w-16 text-center text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleImport}
                        disabled={importLoading}
                        className="ml-auto flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
                      >
                        {importLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        {importLoading ? "Mengimport..." : `Import ${selected.size} Secret`}
                      </button>
                    </div>
                  )}

                  {importResults && (
                    <div className="space-y-1 pt-2">
                      <p className="text-xs font-bold text-slate-600 mb-1">Hasil Import:</p>
                      {importResults.map((r) => (
                        <div key={r.name} className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${
                          r.status === "imported" ? "bg-emerald-50 text-emerald-700" :
                          r.status === "error" ? "bg-red-50 text-red-700" :
                          "bg-slate-50 text-slate-500"
                        }`}>
                          {r.status === "imported" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                          <span className="font-semibold">{r.name}</span>
                          {r.message && <span className="opacity-70">— {r.message}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="col-span-full border-b border-slate-100 pb-2 mt-6">
            <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Chatbot Triggers (WhatsApp)</h4>
          </div>
          <label>
            <span>Trigger Cek Tagihan</span>
            <input
              className={inputClassName()}
              type="text"
              value={settingsForm["chatbot_trigger_billing"] ?? "1"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, chatbot_trigger_billing: e.target.value })
              }
              placeholder="1, tagihan, cek tagihan"
            />
            <span className="text-xs text-slate-400 mt-1 block">Kata kunci cek status tagihan bulanan (pisahkan dengan koma).</span>
          </label>
          <label>
            <span>Trigger Registrasi</span>
            <input
              className={inputClassName()}
              type="text"
              value={settingsForm["chatbot_trigger_register"] ?? "1"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, chatbot_trigger_register: e.target.value })
              }
              placeholder="1, daftar, registrasi"
            />
            <span className="text-xs text-slate-400 mt-1 block">Kata kunci registrasi mandiri pelanggan baru.</span>
          </label>
          <label>
            <span>Trigger Lapor Kendala (Support)</span>
            <input
              className={inputClassName()}
              type="text"
              value={settingsForm["chatbot_trigger_support"] ?? "2"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, chatbot_trigger_support: e.target.value })
              }
              placeholder="2, kendala, bantuan"
            />
            <span className="text-xs text-slate-400 mt-1 block">Kata kunci untuk laporan kendala ke teknisi.</span>
          </label>
          <label>
            <span>Trigger Daftar Paket</span>
            <input
              className={inputClassName()}
              type="text"
              value={settingsForm["chatbot_trigger_packages"] ?? "3"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, chatbot_trigger_packages: e.target.value })
              }
              placeholder="3, paket"
            />
            <span className="text-xs text-slate-400 mt-1 block">Kata kunci untuk melihat paket wifi ISP.</span>
          </label>
          <label>
            <span>Trigger Pertanyaan Umum (FAQ)</span>
            <input
              className={inputClassName()}
              type="text"
              value={settingsForm["chatbot_trigger_faq"] ?? "4"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, chatbot_trigger_faq: e.target.value })
              }
              placeholder="4, faq, tanya"
            />
            <span className="text-xs text-slate-400 mt-1 block">Kata kunci untuk melihat list FAQ.</span>
          </label>
          <label>
            <span>Trigger Hubungi Admin</span>
            <input
              className={inputClassName()}
              type="text"
              value={settingsForm["chatbot_trigger_admin"] ?? "5"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, chatbot_trigger_admin: e.target.value })
              }
              placeholder="5, admin, chat"
            />
            <span className="text-xs text-slate-400 mt-1 block">Kata kunci untuk langsung menghubungi admin.</span>
          </label>

          <div className="flex gap-3 mt-8 col-span-full">
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" disabled={submitting}>
              {isBusy("save-settings") ? "Menyimpan..." : "Simpan Pengaturan"}
            </button>
          </div>
        </form>
        <p className="muted top-gap">
          Operasional backup manual dan histori file sekarang dipindahkan ke tab Monitoring agar tim
          bisa cek status sistem tanpa membuka form konfigurasi.
        </p>
      </article>
    </section>
  );
}
