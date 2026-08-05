import { Button } from "../../components/ui/Button";
import { Fragment, useState, useMemo, type FormEvent } from "react";
import { ChevronUp, ChevronDown, ArrowUpDown, MoreVertical } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { formatCurrency } from "../../utils/format";
import { displayStatusLabel, displayStatusTone } from "../../utils/status";
import { StatusPill, inputClassName, renderInlineError, EmptyTableRow } from "../../components/ui";
import { notifyBill, grantBillExtension } from "../../lib/api";
import { useDialog } from "../../context/DialogContext";
import { copyToClipboard } from "../../utils/clipboard";
import type { ConfirmDialogState } from "../../hooks/types";
import type { BillItem, User, NotificationLog } from "../../types";
import type { FieldErrors } from "../../utils/validation";

type BillsPageProps = {

  user: User | null;
  bills: BillItem[];
  billPeriod: string;
  filterPeriod: string;
  billErrors: FieldErrors;
  submitting: boolean;
  busyAction: string | null;
  expandedBillId: number | null;
  notificationLogs: Record<number, NotificationLog[]>;
  proofFiles: Record<number, File | null>;
  search: string;
  status: string;
  page: number;
  total: number;
  limit: number;
  onBillPeriodChange: (period: string) => void;
  onFilterPeriodChange: (period: string) => void;
  onGenerateBills: (e: FormEvent<HTMLFormElement>) => void;
  onMarkBillPaid: (id: number) => void;
  onToggleNotifications: (id: number) => void;
  onProofFileChange: (id: number, file: File | null) => void;
  onUploadProof: (id: number) => void;
  onSearchChange: (search: string) => void;
  onStatusChange: (status: string) => void;
  onPageChange: (page: number) => void;
  pushToast: (tone: any, msg: string) => void;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  onShowCustomerDetails?: (customerId: number) => void;
  onGrantExtension?: (id: number) => void;
  onCancelPendingAction?: (id: number) => void;
  askForConfirmation?: (config: ConfirmDialogState) => void;
};

export function BillsPage({
  user,
  bills,
  billPeriod,
  filterPeriod,
  billErrors,
  submitting,
  busyAction,
  expandedBillId,
  notificationLogs,
  proofFiles,
  search,
  status,
  page,
  total,
  limit,
  onBillPeriodChange,
  onFilterPeriodChange,
  onGenerateBills,
  onMarkBillPaid,
  onToggleNotifications,
  onProofFileChange,
  onUploadProof,
  onSearchChange,
  onStatusChange,
  onPageChange,
  pushToast,
  pushSuccess,
  pushError,
  onShowCustomerDetails,
  onGrantExtension,
  onCancelPendingAction,
  askForConfirmation,
}: BillsPageProps) {

  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;
  const { showConfirm } = useDialog();

  const [sortField, setSortField] = useState<string | null>("invoice_number");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [waModalBillId, setWaModalBillId] = useState<number | null>(null);
  const [selectedWaTemplate, setSelectedWaTemplate] = useState<string>("");

  const requestSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedBills = useMemo(() => {
    if (!sortField) return bills;
    return [...bills].sort((a, b) => {
      let aVal = (a as any)[sortField];
      let bVal = (b as any)[sortField];

      const isNumericField = sortField === "amount";
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
  }, [bills, sortField, sortDirection]);

  const renderSortableHeader = (label: string, field: string) => {
    const isSorted = sortField === field;
    const sortAria = isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : "none";
    return (
      <th 
        className="px-6 py-4 font-medium select-none cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-gray-500 dark:text-slate-400"
        onClick={() => requestSort(field)}
        aria-sort={sortAria}
        scope="col"
      >
        <div className="inline-flex items-center gap-1.5">
          <span>{label}</span>
          {isSorted ? (
            sortDirection === "asc" ? (
              <ChevronUp size={12} className="text-indigo-650 dark:text-indigo-400 stroke-[3]" aria-hidden="true" />
            ) : (
              <ChevronDown size={12} className="text-indigo-650 dark:text-indigo-400 stroke-[3]" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown size={12} className="text-slate-350 dark:text-slate-600 opacity-50 transition-opacity" aria-hidden="true" />
          )}
        </div>
      </th>
    );
  };

  const handleSendManualWA = async (id: number, triggerKey: string) => {
    pushToast("slate", "Mengirim notifikasi WhatsApp...");
    try {
      await notifyBill(id, triggerKey);
      pushSuccess("Notifikasi WhatsApp berhasil dikirim");
      if (expandedBillId === id) {
        // Toggle off then back on to reload notification logs
        await onToggleNotifications(id);
        await onToggleNotifications(id);
      }
    } catch (err) {
      pushError("Gagal mengirim notifikasi WhatsApp");
    }
  };

  return (
    <section className="grid grid-cols-1 gap-6">
      {user?.role !== "viewer" && (
        <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Generate Tagihan</h2>
          </div>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={onGenerateBills}>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-650 dark:text-slate-400">Periode (YYYY-MM)</span>
              <input
                type="month"
                className={inputClassName(billErrors.period)}
                value={billPeriod}
                onChange={(e) => onBillPeriodChange(e.target.value)}
                onClick={(e) => {
                  try { (e.target as any).showPicker(); } catch (err) {}
                }}
              />
              {renderInlineError(billErrors.period)}
            </label>
            <div className="button-row">
              <Button variant="primary" disabled={submitting}>
                {isBusy("generate-bills") ? "Menghasilkan..." : "Generate Sekarang"}
              </Button>
            </div>
          </form>
          <p className="muted top-gap">
            Generate hanya akan membuat tagihan untuk pelanggan `active` dan `limit`
            yang belum punya tagihan di periode tersebut.
          </p>
        </article>
      )}

      <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Daftar Tagihan</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Cari, saring, dan kelola tagihan bulanan pelanggan.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-750 text-xs rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors w-64"
              placeholder="Cari Invoice atau Pelanggan..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <select
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-750 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
            >
              <option value="">Semua Status</option>
              <option value="lunas">Lunas</option>
              <option value="belum_bayar">Belum Bayar</option>
              <option value="jatuh_tempo">Jatuh Tempo</option>
              <option value="menunggak">Menunggak</option>
            </select>
            <div className="relative flex items-center">
              <input
                type="month"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-750 text-xs rounded-xl pl-3 pr-8 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer w-40"
                value={filterPeriod}
                onChange={(e) => onFilterPeriodChange(e.target.value)}
                onClick={(e) => {
                  try { (e.target as any).showPicker(); } catch (err) {}
                }}
              />
              {filterPeriod && (
                <Button variant="outline" type="button"
                  onClick={() => onFilterPeriodChange("")}
                  className="absolute right-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-650 p-1 flex items-center justify-center transition-colors cursor-pointer"
                  title="Bersihkan Filter Bulan"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </Button>
              )}
            </div>
            <a
              href="/api/v1/reports/bills/csv"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Export CSV
            </a>
            <StatusPill label={`${total} item`} tone="slate" />
          </div>
        </div>

         <div className="overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-card bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-800 text-gray-500 dark:text-slate-400">
              <tr>
                {renderSortableHeader("Invoice", "invoice_number")}
                {renderSortableHeader("Pelanggan", "customer_name")}
                {renderSortableHeader("Periode", "period")}
                {renderSortableHeader("Jatuh Tempo", "due_date")}
                {renderSortableHeader("Nominal", "amount")}
                {renderSortableHeader("Status", "display_status")}
                {renderSortableHeader("Bukti", "proof_path")}
                <th className="px-6 py-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedBills.length === 0 ? (
                <EmptyTableRow message="Tidak ada data tagihan yang sesuai." colSpan={8} />
              ) : (
                sortedBills.map((bill) => (
                  <Fragment key={bill.id}>
                    <tr>
                      <td className="px-6 py-4 text-gray-700 dark:text-slate-300 font-semibold">{bill.invoice_number}</td>
                      <td className="px-6 py-4 text-gray-700 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="link"
                            type="button"
                            className="px-0 py-0 h-auto text-indigo-600 hover:text-indigo-700 font-semibold text-left transition-colors"
                            onClick={() => onShowCustomerDetails?.(bill.customer_id)}
                          >
                            {bill.customer_name}
                          </Button>
                          {bill.customer_phone && (
                            <a
                              href={`https://wa.me/+${bill.customer_phone.replace(/[+\-\s]/g, "").replace(/^0/, "62")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-500 hover:text-emerald-700 transition-colors"
                              title="Chat Manual (wa.me)"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-700 dark:text-slate-300">{bill.period}</td>
                      <td className="px-6 py-4 text-gray-700 dark:text-slate-300">{bill.due_date}</td>
                      <td className="px-6 py-4 text-gray-700 dark:text-slate-300">{formatCurrency(bill.amount)}</td>
                      <td className="px-6 py-4 text-gray-700 dark:text-slate-300">
                        <StatusPill
                          label={displayStatusLabel(bill.display_status)}
                          tone={displayStatusTone(bill.display_status)}
                        />
                      </td>
                      <td className="px-6 py-4 text-gray-700 dark:text-slate-300">
                        {bill.proof_path ? (
                          <a href={bill.proof_path} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                            Lihat bukti
                          </a>
                        ) : (
                          <span className="muted">Belum ada</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-700 dark:text-slate-300">
                        <div className="flex gap-2 items-center justify-end">
                          {user?.role !== "viewer" && bill.status === "belum_bayar" && bill.display_status !== "perpanjangan" ? (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              className="px-3 py-1 text-xs"
                              onClick={() => onMarkBillPaid(bill.id)}
                              disabled={isBusy("mark-paid")}
                            >
                              {isBusy("mark-paid") ? "Proses..." : "Lunas"}
                            </Button>
                          ) : null}
                          
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-3 py-1 text-xs"
                            onClick={() => window.open(`/api/v1/bills/${bill.id}/invoice`, "_blank")}
                            title="Buka PDF Invoice"
                          >
                            PDF
                          </Button>

                          <div className="relative">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="w-8 h-8 rounded-full"
                              onClick={() => setOpenMenuId(openMenuId === bill.id ? null : bill.id)}
                              aria-label="Tampilkan aksi lainnya"
                              aria-expanded={openMenuId === bill.id}
                            >
                              <MoreVertical size={16} />
                            </Button>

                            {openMenuId === bill.id && (
                              <>
                                <div 
                                  className="fixed inset-0 z-40" 
                                  onClick={() => setOpenMenuId(null)} 
                                  aria-hidden="true"
                                />
                                <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 animate-in">
                                  <button
                                    type="button"
                                    className="w-full text-left px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                    onClick={() => {
                                      setWaModalBillId(bill.id);
                                      setSelectedWaTemplate("");
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Kirim Notifikasi WA
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full text-left px-4 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                    onClick={() => {
                                      onToggleNotifications(bill.id);
                                      setOpenMenuId(null);
                                    }}
                                  >
                                    Log Riwayat Notifikasi
                                  </button>

                                  {user?.role !== "viewer" && bill.status === "belum_bayar" && bill.display_status !== "perpanjangan" && onGrantExtension && (
                                    <button
                                      type="button"
                                      className="w-full text-left px-4 py-2 text-xs text-amber-600 dark:text-amber-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                      onClick={async () => {
                                        setOpenMenuId(null);
                                        if (await showConfirm(`Perpanjang tagihan ${bill.invoice_number}? Pelanggan akan dialihkan ke status 'pending' (perpanjangan) dan tagihan bulan depan digabung (nominal dikali 2).`)) {
                                          onGrantExtension(bill.id);
                                        }
                                      }}
                                    >
                                      Perpanjang Masa Aktif
                                    </button>
                                  )}

                                  {user?.role !== "viewer" && (bill.status === "pending_paid" || bill.status === "pending_extension") && onCancelPendingAction && (
                                    <button
                                      type="button"
                                      className="w-full text-left px-4 py-2 text-xs text-rose-600 dark:text-rose-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        onCancelPendingAction(bill.id);
                                      }}
                                    >
                                      Batalkan Aksi Tertunda
                                    </button>
                                  )}

                                  {user?.role !== "viewer" && bill.status !== "lunas" && bill.display_status !== "perpanjangan" && (
                                    <div className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left">
                                      <label
                                        htmlFor={`proof-upload-${bill.id}`}
                                        className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer block w-full"
                                      >
                                        Upload Bukti Transfer
                                      </label>
                                      <input
                                        type="file"
                                        accept=".jpg,.jpeg,.png,.pdf,.webp"
                                        className="hidden"
                                        id={`proof-upload-${bill.id}`}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0] ?? null;
                                          onProofFileChange(bill.id, file);
                                          if (file) onUploadProof(bill.id);
                                          setOpenMenuId(null);
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {expandedBillId === bill.id && (
                      <tr className="expanded-row">
                        <td className="px-6 py-4 text-gray-700 dark:text-slate-300" colSpan={8}>
                          <div className="expanded-content p-5 bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/40 rounded-card border border-slate-100 dark:border-slate-800 dark:border-slate-900/60 shadow-inner">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-bold text-xs text-slate-850 dark:text-slate-200 tracking-wide uppercase">Riwayat Notifikasi</h4>
                              {notificationLogs[bill.id]?.length ? (
                                <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold px-2 py-0.5 rounded-full">
                                  {notificationLogs[bill.id].length} terkirim
                                </span>
                              ) : null}
                            </div>
                            {notificationLogs[bill.id]?.length ? (
                              <div className="overflow-y-auto max-h-72 border border-slate-200 dark:border-slate-800 rounded-xl scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 shadow-sm">
                                <table className="compact-table w-full text-xs border-collapse">
                                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                                    <tr>
                                      <th className="px-4 py-3 text-left">Waktu</th>
                                      <th className="px-4 py-3 text-left">Tujuan</th>
                                      <th className="px-4 py-3 text-left">Trigger</th>
                                      <th className="px-4 py-3 text-left">Status</th>
                                      <th className="px-4 py-3 text-left">Response</th>
                                      <th className="px-4 py-3 text-center">Aksi</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 dark:bg-slate-950/30">
                                    {notificationLogs[bill.id].map((log) => (
                                      <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors">
                                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                                          {new Date(log.created_at).toLocaleString('id-ID')}
                                        </td>
                                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 font-medium">{log.sent_to}</td>
                                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 font-semibold">
                                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-400 px-1.5 py-0.5 rounded text-[10px]">
                                            {log.trigger_key}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 dark:text-slate-350">
                                          <StatusPill
                                            label={log.status.toUpperCase()}
                                            tone={log.status === "sent" ? "green" : log.status === "queued" ? "slate" : "red"}
                                          />
                                        </td>
                                        <td className="px-4 py-2.5">
                                          <div 
                                            className="text-slate-500 dark:text-slate-400 max-w-[240px] truncate font-sans" 
                                            title={log.response_message}
                                          >
                                            {log.response_message || "-"}
                                          </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-center">
                                          <div className="inline-flex items-center shadow-sm rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                                            {/* Tombol Buka WA */}
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="bg-green-50 hover:bg-green-100/80 dark:bg-green-950/20 dark:hover:bg-green-900/30 text-green-700 dark:text-green-400 border-r border-slate-200 dark:border-slate-800"
                                              title="Buka WhatsApp langsung"
                                              onClick={() => {
                                                const cleanPhone = log.sent_to.replace(/[^0-9]/g, "");
                                                let phone = cleanPhone;
                                                if (phone.startsWith("0")) {
                                                  phone = "62" + phone.slice(1);
                                                } else if (!phone.startsWith("62")) {
                                                  phone = "62" + phone;
                                                }
                                                const url = `https://wa.me/${phone}?text=${encodeURIComponent(log.message || "")}`;
                                                window.open(url, "_blank");
                                              }}
                                              icon={
                                                <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                                                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.451 5.402 0 9.798-4.394 9.802-9.793.002-2.614-1.01-5.074-2.853-6.918C16.38 2.05 13.924.966 11.312.966c-5.402 0-9.802 4.394-9.802 9.794.002 1.902.51 3.5 1.461 5.09l-.989 3.605 3.682-.966zM17.07 14.5c-.274-.138-1.62-.8-1.874-.892-.252-.093-.437-.138-.62.138-.184.276-.713.892-.873 1.077-.16.184-.32.207-.593.07-.273-.138-1.156-.426-2.202-1.36-.812-.724-1.36-1.617-1.52-1.893-.16-.276-.017-.425.12-.562.122-.122.274-.32.41-.482.138-.16.184-.276.276-.46.09-.184.045-.344-.023-.482-.068-.138-.62-1.493-.849-2.046-.224-.543-.472-.47-.62-.47-.138-.008-.32-.008-.503-.008-.184 0-.482.07-.733.344-.25.276-.957.942-.957 2.3 0 1.357.987 2.668 1.123 2.852.138.184 1.94 2.962 4.7 4.15 1.543.665 2.505.772 3.414.636.58-.087 1.62-.662 1.848-1.27.228-.607.228-1.127.16-1.27-.068-.14-.25-.224-.523-.362z"/>
                                                </svg>
                                              }
                                            >
                                              Buka WA
                                            </Button>
                                            {/* Tombol Salin Link */}
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:bg-slate-900/40 dark:hover:bg-slate-800/60 text-slate-650 dark:text-slate-400"
                                              title="Salin link wa.me ke clipboard"
                                              onClick={async () => {
                                                const cleanPhone = log.sent_to.replace(/[^0-9]/g, "");
                                                let phone = cleanPhone;
                                                if (phone.startsWith("0")) {
                                                  phone = "62" + phone.slice(1);
                                                } else if (!phone.startsWith("62")) {
                                                  phone = "62" + phone;
                                                }
                                                const url = `https://wa.me/${phone}?text=${encodeURIComponent(log.message || "")}`;
                                                try {
                                                  await copyToClipboard(url);
                                                  pushSuccess("Link wa.me berhasil disalin ke clipboard");
                                                } catch (err: any) {
                                                  pushError(err.message || "Gagal menyalin link");
                                                }
                                              }}
                                              icon={
                                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                                </svg>
                                              }
                                            >
                                              Salin
                                            </Button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="muted text-xs italic dark:text-slate-500">Belum ada riwayat notifikasi WhatsApp.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > limit && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>
              Menampilkan {Math.min((page - 1) * limit + 1, total)} - {Math.min(page * limit, total)} dari {total} item
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                Sebelumnya
              </Button>
              <span className="flex items-center px-2 text-slate-700 dark:text-slate-300">
                Halaman {page} dari {Math.ceil(total / limit)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => onPageChange(page + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        )}
      </article>

      {waModalBillId && (
        <Modal
          title="Pilih Template WhatsApp"
          onClose={() => setWaModalBillId(null)}
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => setWaModalBillId(null)}>
                Batal
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!selectedWaTemplate || isBusy(`notify-${waModalBillId}`)}
                isLoading={isBusy(`notify-${waModalBillId}`)}
                onClick={() => {
                  if (selectedWaTemplate) {
                    void handleSendManualWA(waModalBillId, selectedWaTemplate);
                    setWaModalBillId(null);
                  }
                }}
              >
                Kirim Notifikasi
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Silakan pilih template pesan WhatsApp yang akan dikirimkan ke pelanggan untuk tagihan ini:
            </p>
            <div className="grid gap-2">
              {[
                { value: "tagihan-h7", label: "H-7 (Pengingat Tagihan Baru)" },
                { value: "reminder-h3", label: "H-3 (Pengingat Sebentar Lagi)" },
                { value: "reminder-h5", label: "H-5 (Pengingat Medis/Penting)" },
                { value: "jatuh_tempo", label: "Jatuh Tempo (Hari H)" },
                { value: "limit_5hari", label: "Limit 5 Hari (Segera Isolir)" },
                { value: "isolir_20hari", label: "Isolir 20 Hari (Pemutusan sementara)" },
                { value: "lunas", label: "Lunas (Terima Kasih)" },
              ].map((template) => (
                <label key={template.value} className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <input
                    type="radio"
                    name="wa_template"
                    value={template.value}
                    checked={selectedWaTemplate === template.value}
                    onChange={(e) => setSelectedWaTemplate(e.target.value)}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                  />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{template.label}</span>
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
