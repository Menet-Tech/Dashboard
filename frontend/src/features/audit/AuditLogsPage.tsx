import { useState, useMemo } from "react";
import { StatusPill, inputClassName } from "../../components/ui";
import { formatDateTime } from "../../utils/format";
import { ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import type { AuditLogItem } from "../../types";

type AuditLogsPageProps = {
  auditLogs: AuditLogItem[];
  submitting: boolean;
  onRefresh: () => void;
};

export function AuditLogsPage({ auditLogs, submitting, onRefresh }: AuditLogsPageProps) {
  const [actionFilter, setActionFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [sortField, setSortField] = useState<string | null>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const requestSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortableHeader = (label: string, field: string) => {
    const isSorted = sortField === field;
    return (
      <th 
        className="px-6 py-4 font-medium select-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
        onClick={() => requestSort(field)}
      >
        <div className="inline-flex items-center gap-1.5">
          <span>{label}</span>
          {isSorted ? (
            sortDirection === "asc" ? (
              <ChevronUp size={12} className="text-indigo-600 dark:text-indigo-400 stroke-[3]" />
            ) : (
              <ChevronDown size={12} className="text-indigo-600 dark:text-indigo-400 stroke-[3]" />
            )
          ) : (
            <ArrowUpDown size={12} className="text-slate-300 dark:text-slate-600 opacity-50 transition-opacity" />
          )}
        </div>
      </th>
    );
  };

  const uniqueActions = useMemo(() => {
    const actions = new Set<string>();
    auditLogs.forEach((log) => actions.add(log.action));
    return Array.from(actions).sort();
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const matchAction = !actionFilter || log.action === actionFilter;
      const matchDate = !dateFilter || log.created_at.startsWith(dateFilter);
      const matchSearch = !searchTerm || 
        (log.username && log.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.message && log.message.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.ip_address && log.ip_address.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.action && log.action.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchAction && matchDate && matchSearch;
    });
  }, [auditLogs, actionFilter, dateFilter, searchTerm]);

  const sortedLogs = useMemo(() => {
    const list = filteredLogs;
    if (!sortField) return list;
    return [...list].sort((a, b) => {
      let aVal = (a as any)[sortField];
      let bVal = (b as any)[sortField];

      const isNumericField = sortField === "id";
      if (aVal === null || aVal === undefined) aVal = isNumericField ? 0 : "";
      if (bVal === null || bVal === undefined) bVal = isNumericField ? 0 : "";

      if (isNumericField) {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).trim().toLowerCase();
      const bStr = String(bVal).trim().toLowerCase();
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: "base" })
        : bStr.localeCompare(aStr, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [filteredLogs, sortField, sortDirection]);

  return (
    <section className="grid gap-6">
      <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
            <label className="block">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Cari Log</span>
              <input
                type="text"
                placeholder="Cari user, IP, aksi, atau detail..."
                className="bg-white border border-slate-250 text-slate-700 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Filter Aksi</span>
              <select
                className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              >
                <option value="">Semua Aksi</option>
                {uniqueActions.map((action) => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Filter Tanggal</span>
              <input
                type="date"
                className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="bg-white border border-slate-200 hover:bg-slate-50 text-indigo-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50 h-8 flex items-center justify-center"
              disabled={submitting}
              onClick={() => {
                setActionFilter("");
                setDateFilter("");
                setSearchTerm("");
                onRefresh();
              }}
            >
              Reset & Refresh
            </button>
            <StatusPill label={`${filteredLogs.length} event`} tone="slate" />
          </div>
        </div>
      </article>

      <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-hidden">
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
              <tr>
                {renderSortableHeader("Waktu", "created_at")}
                {renderSortableHeader("User", "username")}
                {renderSortableHeader("IP", "ip_address")}
                {renderSortableHeader("Aksi", "action")}
                <th className="px-6 py-4 font-medium text-slate-500">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedLogs.length === 0 ? (
                <tr>
                  <td className="px-6 py-12 text-center text-slate-400" colSpan={5}>
                    {auditLogs.length === 0 ? "Belum ada audit log." : "Tidak ada log yang cocok dengan filter."}
                  </td>
                </tr>
              ) : (
                sortedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-slate-700 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                    <td className="px-6 py-4 text-slate-700 font-medium">{log.username ?? (log.user_id ? `#${log.user_id}` : "-")}</td>
                    <td className="px-6 py-4 text-slate-400 text-xs font-mono">{log.ip_address || "-"}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 leading-relaxed">{log.message || "-"}</td>
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
