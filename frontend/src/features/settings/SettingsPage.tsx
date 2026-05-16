import type { FormEvent } from "react";
import { inputClassName, renderInlineError } from "../../components/ui";
import type { FieldErrors } from "../../utils/validation";
import type { SettingsState } from "../../types";

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

  return (
    <section className="grid">
      <article className="surface">
        <div className="section-heading">
          <h2>Pengaturan Sistem</h2>
          <p>Konfigurasi WhatsApp, Discord, billing rule, worker, dan kebijakan backup.</p>
        </div>
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="form-group-title">
            <h4>WhatsApp Gateway</h4>
          </div>

          <label>
            <span>Gateway URL</span>
            <input
              type="text"
              value={settingsForm["wa_gateway_url"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, wa_gateway_url: e.target.value })}
              placeholder="https://api.gateway.com/v1/messages"
            />
          </label>
          <label>
            <span>API Key</span>
            <input
              type="text"
              value={settingsForm["wa_api_key"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, wa_api_key: e.target.value })}
            />
          </label>
          <label>
            <span>Account ID / Device ID</span>
            <input
              type="text"
              value={settingsForm["wa_account_id"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, wa_account_id: e.target.value })}
            />
          </label>

          <div className="form-group-title mt-4">
            <h4>Discord Notifications</h4>
          </div>

          <label className="full-width">
            <span>Webhook URL</span>
            <input
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
              value={settingsForm["discord_notify_worker"] ?? "1"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, discord_notify_worker: e.target.value })
              }
            >
              <option value="1">Aktif</option>
              <option value="0">Nonaktif</option>
            </select>
          </label>

          <div className="form-group-title mt-4">
            <h4>Billing Rules & Worker</h4>
          </div>

          <label>
            <span>Reminder Days (Hari sebelum jatuh tempo)</span>
            <input
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
              type="number"
              value={settingsForm["billing_limit_days"] ?? "5"}
              onChange={(e) => onFormChange({ ...settingsForm, billing_limit_days: e.target.value })}
            />
          </label>
          <label>
            <span>Menunggak Days (Hari untuk status menunggak)</span>
            <input
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
              type="time"
              value={settingsForm["backup_auto_time"] ?? "02:00"}
              onChange={(e) => onFormChange({ ...settingsForm, backup_auto_time: e.target.value })}
            />
          </label>
          <label>
            <span>Retensi Backup</span>
            <input
              type="number"
              min="1"
              value={settingsForm["backup_retention_count"] ?? "7"}
              onChange={(e) =>
                onFormChange({ ...settingsForm, backup_retention_count: e.target.value })
              }
            />
          </label>

          <div className="form-group-title mt-4">
            <h4>MikroTik</h4>
          </div>
          <label>
            <span>Host Router</span>
            <input
              type="text"
              value={settingsForm["mikrotik_host"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, mikrotik_host: e.target.value })}
              placeholder="192.168.88.1"
            />
          </label>
          <label>
            <span>Username Router</span>
            <input
              type="text"
              value={settingsForm["mikrotik_user"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, mikrotik_user: e.target.value })}
              placeholder="admin"
            />
          </label>
          <label>
            <span>Password Router</span>
            <input
              type="password"
              value={settingsForm["mikrotik_pass"] ?? ""}
              onChange={(e) => onFormChange({ ...settingsForm, mikrotik_pass: e.target.value })}
              placeholder="••••••••"
            />
          </label>
          <label>
            <span>Username PPPoE Test</span>
            <input
              type="text"
              value={settingsForm["mikrotik_test_username"] ?? ""}
              onChange={(e) =>
                onFormChange({ ...settingsForm, mikrotik_test_username: e.target.value })
              }
              placeholder="test-user"
            />
          </label>

          <div className="form-actions">
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
