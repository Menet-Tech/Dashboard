import { StatusPill } from "../../components/ui";
import { formatDateTime } from "../../utils/format";
import { getBackupDownloadUrl, type HealthPayload, type RestoreSimulationResult } from "../../lib/api";
import { Button } from "../../components/ui/Button";

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
  onCheckIntegrations: () => Promise<void>;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
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
  onCheckIntegrations,
  pushSuccess,
  pushError,
}: MonitoringPageProps) {
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;

  const handleCheckIntegrations = async () => {
    try {
      await onCheckIntegrations();
      pushSuccess("Check integrasi selesai. Status WA, Discord, MikroTik, dan GenieACS sudah diperbarui.");
    } catch (err) {
      pushError("Beberapa integrasi mungkin bermasalah. Cek konfigurasi.");
    }
  };

  return (
    <section className="grid gap-6">
      <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Monitoring Sistem</h2>
          <div className="table-actions">
            <StatusPill label={health?.status ?? "checking"} tone={appTone} />
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={onRefresh}
            >
              {submitting && !busyAction ? "Memproses..." : "Refresh Status"}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-card p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Database</span>
            </div>
            <div className="flex items-end justify-between">
              <strong className="text-xl font-bold text-slate-900 dark:text-slate-50 leading-none">{health?.services.database ?? "unknown"}</strong>
              <StatusPill label={health?.services.database ?? "unknown"} tone={databaseTone} />
            </div>
          </article>
          <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-card p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Worker</span>
            </div>
            <div className="flex items-end justify-between">
              <strong className="text-xl font-bold text-slate-900 dark:text-slate-50 leading-none">{health?.services.worker ?? "unknown"}</strong>
              <StatusPill label={health?.services.worker ?? "unknown"} tone={workerTone} />
            </div>
          </article>
          <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-card p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Backup Auto</span>
            </div>
            <div className="flex items-end justify-between">
              <strong className="text-xl font-bold text-slate-900 dark:text-slate-50 leading-none">{health?.services.backup ?? "unknown"}</strong>
              <StatusPill label={health?.services.backup ?? "unknown"} tone={backupTone} />
            </div>
          </article>
          <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-card p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Scheduler</span>
            </div>
            <div className="flex items-end justify-between">
              <strong className="text-xl font-bold text-slate-900 dark:text-slate-50 leading-none">{health?.scheduler.billing_auto_enabled ? "aktif" : "nonaktif"}</strong>
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
            </div>
          </article>
          <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-card p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Integrasi</span>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2.5 my-1">
                {health?.integrations.whatsapp_configured && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">WhatsApp</span>
                    <StatusPill
                      label={health.integrations.whatsapp_online ? "siap" : "mati"}
                      tone={health.integrations.whatsapp_online ? "green" : "red"}
                    />
                  </div>
                )}
                {health?.integrations.discord_configured && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Discord</span>
                    <StatusPill
                      label={health.integrations.discord_online ? "siap" : "error"}
                      tone={health.integrations.discord_online ? "green" : "red"}
                    />
                  </div>
                )}
                {health?.integrations.mikrotik_configured && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">MikroTik</span>
                    <StatusPill
                      label={health.integrations.mikrotik_online ? "siap" : "error"}
                      tone={health.integrations.mikrotik_online ? "green" : "red"}
                    />
                  </div>
                )}
                {health?.integrations.genieacs_configured && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">GenieACS</span>
                    <StatusPill
                      label={health.integrations.genieacs_online ? "siap" : "error"}
                      tone={health.integrations.genieacs_online ? "green" : "red"}
                    />
                  </div>
                )}
                {(!health || (!health.integrations.whatsapp_configured &&
                  !health.integrations.discord_configured &&
                  !health.integrations.mikrotik_configured &&
                  !health.integrations.genieacs_configured)) && (
                  <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">Belum dikonfigurasi</span>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCheckIntegrations}
                disabled={isBusy("check-integrations")}
              >
                {isBusy("check-integrations") ? "Checking..." : "Check Integrasi"}
              </Button>
            </div>
          </article>
        </div>
      </article>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Worker Detail</h2>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Backup Policy</h2>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Scheduler Billing</h2>
          </div>
          <div className="space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 dark:border-slate-800/60 pb-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Status</span>
              <StatusPill
                label={health?.scheduler.billing_auto_enabled ? "Aktif" : "Nonaktif"}
                tone={health?.scheduler.billing_auto_enabled ? "green" : "slate"}
              />
            </div>
            <div className="border-b border-slate-100 dark:border-slate-800 dark:border-slate-800/60 pb-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Jadwal Generate</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200">
                Tanggal {health?.scheduler.billing_generate_day ?? 1} pukul{" "}
                {health?.scheduler.billing_generate_time ?? "00:05"}
              </span>
            </div>
            <div className="border-b border-slate-100 dark:border-slate-800 dark:border-slate-800/60 pb-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Next Run</span>
              <span className="text-sm font-mono font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">
                {formatDateTime(health?.scheduler.billing_next_run)}
              </span>
            </div>
            <div className="border-b border-slate-100 dark:border-slate-800 dark:border-slate-800/60 pb-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Last Attempt</span>
              <span className="text-sm font-mono text-slate-700 dark:text-slate-300 dark:text-slate-350">
                {formatDateTime(health?.scheduler.billing_last_attempt_at)}
              </span>
            </div>
            <div className="border-b border-slate-100 dark:border-slate-800 dark:border-slate-800/60 pb-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Last Success</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-200">
                {health?.scheduler.billing_last_success_period
                  ? `${health.scheduler.billing_last_success_period} (${formatDateTime(
                      health.scheduler.billing_last_run_at,
                    )})`
                  : "Belum ada"}
              </span>
            </div>
            <div className="border-b border-slate-100 dark:border-slate-800 dark:border-slate-800/60 pb-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Tagihan Dibuat Terakhir</span>
              <span className="text-sm font-bold text-slate-850 dark:text-slate-100">
                {health?.scheduler.billing_last_generated_count ?? 0} invoice
              </span>
            </div>
            <div className="border-b border-slate-100 dark:border-slate-800 dark:border-slate-800/60 pb-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Retry Policy</span>
              <span className="text-sm font-semibold text-slate-750 dark:text-slate-300">
                {health?.scheduler.billing_retry_attempts ?? 0} percobaan / backoff{" "}
                {health?.scheduler.billing_retry_backoff_seconds ?? 0} detik
              </span>
            </div>
            <div className="pb-1 flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Last Error</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                health?.scheduler.billing_last_error 
                  ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-100 dark:border-red-900/40" 
                  : "text-slate-650 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 dark:bg-slate-850"
              }`}>
                {health?.scheduler.billing_last_error || "Tidak ada"}
              </span>
            </div>
          </div>
        </article>

        <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Database Integrity</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-green-800">Integritas database normal</p>
                  <p className="text-xs text-green-600">Tidak ada masalah terdeteksi pada skema dan data.</p>
                </div>
              </div>
              <StatusPill label="ok" tone="green" />
            </div>
            <dl className="grid grid-cols-1 gap-4 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-slate-800">
                <dt className="text-slate-500 dark:text-slate-400">Quick Check Status</dt>
                <dd className="font-semibold text-slate-900 dark:text-slate-50">{health?.database.quick_check.status ?? "unknown"}</dd>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-slate-800">
                <dt className="text-slate-500 dark:text-slate-400">Detail Pesan</dt>
                <dd className="text-slate-600">{health?.database.quick_check.message ?? "Database operasional."}</dd>
              </div>
            </dl>
          </div>
        </article>
      </section>

      <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Backup Database</h2>
          <StatusPill label={`${backups.length} backup tersedia`} tone="slate" />
        </div>
        <div className="flex gap-3 mb-6">
          <Button
            type="button"
            variant="primary"
            disabled={submitting}
            onClick={onCreateBackup}
          >
            {isBusy("create-backup") ? "Membuat backup..." : "Backup Sekarang"}
          </Button>
        </div>
        <div className="overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-card bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-800 text-gray-500 dark:text-slate-400">
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
                  <td className="px-6 py-4 text-gray-700 dark:text-slate-300" colSpan={4}>
                    <span className="muted">Belum ada backup.</span>
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.filename} className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 text-gray-700 dark:text-slate-300">{b.filename}</td>
                    <td className="px-6 py-4 text-gray-700 dark:text-slate-300">{(b.size / 1024).toFixed(1)} KB</td>
                    <td className="px-6 py-4 text-gray-700 dark:text-slate-300">{formatDateTime(b.mod_time)}</td>
                    <td className="px-6 py-4 text-gray-700 dark:text-slate-300">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onVerifyBackup(b.filename)}
                        >
                          Verify
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onSimulateRestore(b.filename)}
                        >
                          Restore
                        </Button>
                        <a
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50 inline-block"
                          href={getBackupDownloadUrl(b.filename)}
                          download
                        >
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
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Simulasi Restore: {restoreSimulation.filename}</h3>
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
              <Button type="button" variant="danger" onClick={onApplyRestore}>
                Apply to Live (Restart)
              </Button>
              <Button type="button" variant="outline" onClick={onCancelRestore}>
                Batal
              </Button>
            </div>
          </div>
        )}
      </article>

      <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Alert Operasional</h2>
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
