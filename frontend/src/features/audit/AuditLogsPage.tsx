import { StatusPill } from "../../components/ui";
import { formatDateTime } from "../../utils/format";
import type { AuditLogItem } from "../../types";

type AuditLogsPageProps = {
  auditLogs: AuditLogItem[];
  submitting: boolean;
  onRefresh: () => void;
};

export function AuditLogsPage({ auditLogs, submitting, onRefresh }: AuditLogsPageProps) {
  return (
    <section className="grid">
      <article className="surface">
        <div className="section-heading">
          <h2>Audit Log Operasional</h2>
          <div className="table-actions">
            <StatusPill label={`${auditLogs.length} event`} tone="slate" />
            <button
              type="button"
              className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50"
              disabled={submitting}
              onClick={onRefresh}
            >
              Refresh Audit
            </button>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>User</th>
                <th>IP</th>
                <th>Aksi</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <span className="muted">Belum ada audit log.</span>
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDateTime(log.created_at)}</td>
                    <td>{log.username ?? (log.user_id ? `#${log.user_id}` : "-")}</td>
                    <td>
                      <span className="muted text-sm">
                        {log.ip_address || "-"}
                      </span>
                    </td>
                    <td>{log.action}</td>
                    <td>{log.message || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
