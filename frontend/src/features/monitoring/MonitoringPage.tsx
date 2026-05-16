import { StatusPill } from "../../components/ui";
import { formatDateTime } from "../../utils/format";
import { integrationSummary } from "../../utils/status";
import { getBackupDownloadUrl, type HealthPayload, type RestoreSimulationResult } from "../../lib/api";

export type BackupItem = {
  filename: string;
  size: number;
  mod_time: string;
};

type MonitoringPageProps = {
  health: HealthPayload | null;
  backups: BackupItem[];
  restoreSimulation: { filename: string; result: RestoreSimulationResult } | null;
  submitting: boolean;
  busyAction: string | null;
  appTone: "green" | "gold" | "red" | "slate";
  databaseTone: "green" | "gold" | "red" | "slate";
  workerTone: "green" | "gold" | "red" | "slate";
  backupTone: "green" | "gold" | "red" | "slate";
  schedulerTone: "green" | "gold" | "red" | "slate";
  onRefresh: () => void;
  onCreateBackup: () => void;
  onVerifyBackup: (filename: string) => void;
  onSimulateRestore: (filename: string) => void;
  onApplyRestore: () => void;
  onCancelRestore: () => void;
};

export function MonitoringPage({
  health,
  backups,
  restoreSimulation,
  submitting,
  busyAction,
  appTone,
  databaseTone,
  workerTone,
  backupTone,
  schedulerTone,
  onRefresh,
  onCreateBackup,
  onVerifyBackup,
  onSimulateRestore,
  onApplyRestore,
  onCancelRestore,
}: MonitoringPageProps) {
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;

  return (
    <section className="grid">
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Monitoring Sistem</h2>
          <div className="table-actions">
            <StatusPill label={health?.status ?? "checking"} tone={appTone} />
            <button
              type="button"
              className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50"
              disabled={submitting}
              onClick={onRefresh}
            >
              {submitting && !busyAction ? "Memproses..." : "Refresh Status"}
            </button>
          </div>
        </div>
        <div className="monitor-grid">
          <article className="monitor-card">
            <span>Database</span>
            <strong>{health?.services.database ?? "unknown"}</strong>
            <StatusPill label={health?.services.database ?? "unknown"} tone={databaseTone} />
          </article>
          <article className="monitor-card">
            <span>Worker</span>
            <strong>{health?.services.worker ?? "unknown"}</strong>
            <StatusPill label={health?.services.worker ?? "unknown"} tone={workerTone} />
          </article>
          <article className="monitor-card">
            <span>Backup Otomatis</span>
            <strong>{health?.services.backup ?? "unknown"}</strong>
            <StatusPill label={health?.services.backup ?? "unknown"} tone={backupTone} />
          </article>
          <article className="monitor-card">
            <span>Scheduler Billing</span>
            <strong>{health?.scheduler.billing_auto_enabled ? "aktif" : "nonaktif"}</strong>
            <StatusPill
              label={
                health?.scheduler.billing_last_error
                  ? "error"
                  : health?.scheduler.billing_auto_enabled
                    ? "scheduled"
                    : "disabled"
              }
              tone={schedulerTone}
            />
          </article>
          <article className="monitor-card">
            <span>Integrasi</span>
            <strong>{integrationSummary(health)}</strong>
            <StatusPill
              label={
                health?.integrations.whatsapp_configured ||
                health?.integrations.discord_configured ||
                health?.integrations.mikrotik_configured
                  ? "configured"
                  : "pending"
              }
              tone={
                health?.integrations.whatsapp_configured ||
                health?.integrations.discord_configured ||
                health?.integrations.mikrotik_configured
                  ? "green"
                  : "gold"
              }
            />
          </article>
        </div>
      </article>

      <section className="grid detail-grid">
        <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Worker Detail</h2>
          </div>
          <dl className="meta-list">
            <div>
              <dt>Last Heartbeat</dt>
              <dd>{formatDateTime(health?.worker.last_heartbeat)}</dd>
            </div>
            <div>
              <dt>Worker Interval</dt>
              <dd>{health?.worker.interval_seconds ?? 0} detik</dd>
            </div>
            <div>
              <dt>Last Health Check</dt>
              <dd>{formatDateTime(health?.timestamp)}</dd>
            </div>
            <div>
              <dt>Last Cycle</dt>
              <dd>{formatDateTime(health?.worker.last_cycle_at)}</dd>
            </div>
            <div>
              <dt>Cycle Error</dt>
              <dd>{health?.worker.last_cycle_error || "Tidak ada"}</dd>
            </div>
          </dl>
        </article>

        <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Backup Policy</h2>
          </div>
          <dl className="meta-list">
            <div>
              <dt>Status</dt>
              <dd>{health?.backup.enabled ? "Aktif" : "Nonaktif"}</dd>
            </div>
            <div>
              <dt>Jadwal Harian</dt>
              <dd>{health?.backup.scheduled_time ?? "-"}</dd>
            </div>
            <div>
              <dt>Retensi</dt>
              <dd>{health?.backup.retention_count ?? 0} file</dd>
            </div>
            <div>
              <dt>Backup Terakhir</dt>
              <dd>
                {health?.backup.last_filename
                  ? `${health.backup.last_filename} (${health.backup.last_run_date})`
                  : "Belum ada"}
              </dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="grid detail-grid">
        <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Scheduler Billing</h2>
          </div>
          <dl className="meta-list">
            <div>
              <dt>Status</dt>
              <dd>{health?.scheduler.billing_auto_enabled ? "Aktif" : "Nonaktif"}</dd>
            </div>
            <div>
              <dt>Jadwal Generate</dt>
              <dd>
                Tanggal {health?.scheduler.billing_generate_day ?? 1} pukul{" "}
                {health?.scheduler.billing_generate_time ?? "00:05"}
              </dd>
            </div>
            <div>
              <dt>Next Run</dt>
              <dd>{formatDateTime(health?.scheduler.billing_next_run)}</dd>
            </div>
            <div>
              <dt>Last Attempt</dt>
              <dd>{formatDateTime(health?.scheduler.billing_last_attempt_at)}</dd>
            </div>
            <div>
              <dt>Last Success</dt>
              <dd>
                {health?.scheduler.billing_last_success_period
                  ? `${health.scheduler.billing_last_success_period} (${formatDateTime(
                      health.scheduler.billing_last_run_at,
                    )})`
                  : "Belum ada"}
              </dd>
            </div>
            <div>
              <dt>Tagihan Dibuat Terakhir</dt>
              <dd>{health?.scheduler.billing_last_generated_count ?? 0}</dd>
            </div>
            <div>
              <dt>Retry Policy</dt>
              <dd>
                {health?.scheduler.billing_retry_attempts ?? 0} percobaan / backoff{" "}
                {health?.scheduler.billing_retry_backoff_seconds ?? 0} detik
              </dd>
            </div>
            <div>
              <dt>Last Error</dt>
              <dd>{health?.scheduler.billing_last_error || "Tidak ada"}</dd>
            </div>
          </dl>
        </article>

        <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Database Integrity</h2>
          </div>
          <dl className="meta-list">
            <div>
              <dt>Quick Check</dt>
              <dd>{health?.database.quick_check.status ?? "unknown"}</dd>
            </div>
            <div>
              <dt>Pesan</dt>
              <dd>{health?.database.quick_check.message ?? "-"}</dd>
            </div>
          </dl>
        </article>
      </section>

      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Backup Database</h2>
          <StatusPill label={`${backups.length} backup tersedia`} tone="slate" />
        </div>
        <div className="button-row mb-4">
          <button
            type="button"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            disabled={submitting}
            onClick={onCreateBackup}
          >
            {isBusy("create-backup") ? "Membuat backup..." : "Backup Sekarang"}
          </button>
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">Filename</th>
                <th className="px-6 py-4 font-medium">Ukuran</th>
                <th className="px-6 py-4 font-medium">Waktu</th>
                <th className="px-6 py-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {backups.length === 0 ? (
                <tr>
                  <td className="px-6 py-4 text-gray-700" colSpan={4}>
                    <span className="muted">Belum ada backup.</span>
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.filename} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-700">{b.filename}</td>
                    <td className="px-6 py-4 text-gray-700">{(b.size / 1024).toFixed(1)} KB</td>
                    <td className="px-6 py-4 text-gray-700">{formatDateTime(b.mod_time)}</td>
                    <td className="px-6 py-4 text-gray-700">
                      <div className="table-actions">
                        <button
                          type="button"
                          className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50"
                          onClick={() => onVerifyBackup(b.filename)}
                        >
                          Verify
                        </button>
                        <button
                          type="button"
                          className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50"
                          onClick={() => onSimulateRestore(b.filename)}
                        >
                          Simulasi Restore
                        </button>
                        <a className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50" href={getBackupDownloadUrl(b.filename)} download>
                          Download
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {restoreSimulation && (
          <div className="top-gap p-4 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--surface)]">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Simulasi Restore: {restoreSimulation.filename}</h3>
            <p>
              Status:{" "}
              {restoreSimulation.result.valid ? (
                <span className="text-[var(--success)]">Valid</span>
              ) : (
                "Invalid"
              )}
            </p>
            <p>Pesan: {restoreSimulation.result.message}</p>
            <ul>
              <li>Total Users: {restoreSimulation.result.total_users}</li>
              <li>Total Pelanggan: {restoreSimulation.result.total_pelanggan}</li>
              <li>Total Tagihan: {restoreSimulation.result.total_tagihan}</li>
            </ul>
            <div className="button-row top-gap">
              <button type="button" className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={onApplyRestore}>
                Apply to Live (Restart)
              </button>
              <button type="button" className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50" onClick={onCancelRestore}>
                Batal
              </button>
            </div>
          </div>
        )}
      </article>

      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Alert Operasional</h2>
          <StatusPill
            label={`${health?.alerts?.length ?? 0} alert`}
            tone={health?.alerts?.length ? "gold" : "green"}
          />
        </div>
        {!health?.alerts?.length ? (
          <p className="muted">Tidak ada alert operasional dari health check saat ini.</p>
        ) : (
          <ul className="simple-list">
            {health.alerts.map((alert, idx) => (
              <li key={`${idx}-${alert}`}>{alert}</li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
