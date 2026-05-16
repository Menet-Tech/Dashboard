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
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Audit Log Operasional</h2>
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
        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">Waktu</th>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">IP</th>
                <th className="px-6 py-4 font-medium">Aksi</th>
                <th className="px-6 py-4 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {auditLogs.length === 0 ? (
                <tr>
                  <td className="px-6 py-4 text-gray-700" colSpan={5}>
                    <span className="muted">Belum ada audit log.</span>
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-700">{formatDateTime(log.created_at)}</td>
                    <td className="px-6 py-4 text-gray-700">{log.username ?? (log.user_id ? `#${log.user_id}` : "-")}</td>
                    <td className="px-6 py-4 text-gray-700">
                      <span className="muted text-sm">
                        {log.ip_address || "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{log.action}</td>
                    <td className="px-6 py-4 text-gray-700">{log.message || "-"}</td>
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
