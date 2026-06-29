import { Fragment, type FormEvent } from "react";
import { formatCurrency } from "../../utils/format";
import { displayStatusLabel, displayStatusTone } from "../../utils/status";
import { StatusPill, inputClassName, renderInlineError, EmptyTableRow } from "../../components/ui";
import { notifyBill, grantBillExtension } from "../../lib/api";
import { useDialog } from "../../context/DialogContext";
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
        <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Generate Tagihan</h2>
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
              <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" disabled={submitting}>
                {isBusy("generate-bills") ? "Menghasilkan..." : "Generate Sekarang"}
              </button>
            </div>
          </form>
          <p className="muted top-gap">
            Generate hanya akan membuat tagihan untuk pelanggan `active` dan `limit`
            yang belum punya tagihan di periode tersebut.
          </p>
        </article>
      )}

      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Daftar Tagihan</h2>
            <p className="text-xs text-slate-500 mt-1">Cari, saring, dan kelola tagihan bulanan pelanggan.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              className="bg-white border border-slate-200 text-slate-750 text-xs rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors w-64"
              placeholder="Cari Invoice atau Pelanggan..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <select
              className="bg-white border border-slate-200 text-slate-750 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
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
                className="bg-white border border-slate-200 text-slate-750 text-xs rounded-xl pl-3 pr-8 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer w-40"
                value={filterPeriod}
                onChange={(e) => onFilterPeriodChange(e.target.value)}
                onClick={(e) => {
                  try { (e.target as any).showPicker(); } catch (err) {}
                }}
              />
              {filterPeriod && (
                <button
                  type="button"
                  onClick={() => onFilterPeriodChange("")}
                  className="absolute right-2.5 text-slate-400 hover:text-slate-650 p-1 flex items-center justify-center transition-colors cursor-pointer"
                  title="Bersihkan Filter Bulan"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
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

        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">Invoice</th>
                <th className="px-6 py-4 font-medium">Pelanggan</th>
                <th className="px-6 py-4 font-medium">Periode</th>
                <th className="px-6 py-4 font-medium">Jatuh Tempo</th>
                <th className="px-6 py-4 font-medium">Nominal</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Bukti</th>
                <th className="px-6 py-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {bills.length === 0 ? (
                <EmptyTableRow message="Tidak ada data tagihan yang sesuai." colSpan={8} />
              ) : (
                bills.map((bill) => (
                  <Fragment key={bill.id}>
                    <tr>
                      <td className="px-6 py-4 text-gray-700 font-semibold">{bill.invoice_number}</td>
                      <td className="px-6 py-4 text-gray-700">
                        <button
                          type="button"
                          className="text-indigo-600 hover:text-indigo-700 hover:underline font-semibold text-left transition-colors"
                          onClick={() => onShowCustomerDetails?.(bill.customer_id)}
                        >
                          {bill.customer_name}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{bill.period}</td>
                      <td className="px-6 py-4 text-gray-700">{bill.due_date}</td>
                      <td className="px-6 py-4 text-gray-700">{formatCurrency(bill.amount)}</td>
                      <td className="px-6 py-4 text-gray-700">
                        <StatusPill
                          label={displayStatusLabel(bill.display_status)}
                          tone={displayStatusTone(bill.display_status)}
                        />
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        {bill.proof_path ? (
                          <a href={bill.proof_path} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                            Lihat bukti
                          </a>
                        ) : (
                          <span className="muted">Belum ada</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                            onClick={() => window.open(`/api/v1/bills/${bill.id}/invoice`, "_blank")}
                          >
                            Invoice
                          </button>
                          
                          <select
                            className="bg-white border border-slate-200 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors cursor-pointer"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                void handleSendManualWA(bill.id, e.target.value);
                                e.target.value = "";
                              }
                            }}
                            disabled={isBusy(`notify-${bill.id}`)}
                          >
                            <option value="" disabled>Kirim WA</option>
                            <option value="tagihan-h7">Tagihan H-7</option>
                            <option value="reminder-h3">Reminder H-3</option>
                            <option value="reminder-h5">Reminder H-5</option>
                            <option value="jatuh_tempo">Jatuh Tempo</option>
                            <option value="limit_5hari">Limit 5 Hari</option>
                            <option value="isolir_20hari">Isolir 20 Hari</option>
                            <option value="lunas">Lunas</option>
                          </select>

                          <button
                            type="button"
                            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                            onClick={() => onToggleNotifications(bill.id)}
                          >
                            Log WA
                          </button>
                          {user?.role !== "viewer" && bill.status === "belum_bayar" && bill.display_status !== "perpanjangan" ? (
                            <button
                              type="button"
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                              onClick={() => onMarkBillPaid(bill.id)}
                              disabled={isBusy("mark-paid")}
                            >
                              {isBusy("mark-paid") ? "Memproses..." : "Tandai Lunas"}
                            </button>
                          ) : null}
                          {user?.role !== "viewer" && bill.status === "belum_bayar" && bill.display_status !== "perpanjangan" && onGrantExtension ? (
                            <button
                              type="button"
                              title="Perpanjangan: tagihan ini digabung ke bulan depan (nominal dikali 2)"
                              className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                              onClick={async () => {
                                if (await showConfirm(`Perpanjang tagihan ${bill.invoice_number}? Pelanggan akan dialihkan ke status 'pending' (perpanjangan) dan tagihan bulan depan digabung (nominal dikali 2).`)) {
                                  onGrantExtension(bill.id);
                                }
                              }}

                            >
                              Perpanjang
                            </button>
                          ) : null}
                          {user?.role !== "viewer" && (bill.status === "pending_paid" || bill.status === "pending_extension") && onCancelPendingAction ? (
                            <button
                              type="button"
                              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50 animate-pulse"
                              onClick={() => onCancelPendingAction(bill.id)}
                              disabled={isBusy(`cancel-pending-${bill.id}`)}
                            >
                              {isBusy(`cancel-pending-${bill.id}`) ? "Membatalkan..." : "Batal"}
                            </button>
                          ) : null}
                          {user?.role !== "viewer" && bill.status !== "lunas" && bill.display_status !== "perpanjangan" && (
                            <>
                              <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.pdf,.webp"
                                className="hidden"
                                id={`proof-upload-${bill.id}`}
                                onChange={(e) => onProofFileChange(bill.id, e.target.files?.[0] ?? null)}
                              />
                              <label
                                htmlFor={`proof-upload-${bill.id}`}
                                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors cursor-pointer"
                              >
                                {proofFiles[bill.id] ? proofFiles[bill.id]?.name : "Pilih Bukti"}
                              </label>
                              <button
                                type="button"
                                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                                onClick={() => onUploadProof(bill.id)}
                              >
                                {isBusy("upload-proof") ? "Mengunggah..." : "Upload"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedBillId === bill.id && (
                      <tr className="expanded-row">
                        <td className="px-6 py-4 text-gray-700" colSpan={8}>
                          <div className="expanded-content p-4 bg-slate-50 rounded-xl">
                            <h4 className="font-bold text-slate-800 mb-2">Riwayat Notifikasi</h4>
                            {notificationLogs[bill.id]?.length ? (
                              <div className="overflow-hidden border border-slate-200 rounded-lg">
                                <table className="compact-table w-full text-xs">
                                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                                    <tr>
                                      <th className="px-4 py-2 text-left">Waktu</th>
                                      <th className="px-4 py-2 text-left">Tujuan</th>
                                      <th className="px-4 py-2 text-left">Trigger</th>
                                      <th className="px-4 py-2 text-left">Status</th>
                                      <th className="px-4 py-2 text-left">Response</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200 bg-white">
                                    {notificationLogs[bill.id].map((log) => (
                                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-2 text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                                        <td className="px-4 py-2 text-slate-700">{log.sent_to}</td>
                                        <td className="px-4 py-2 text-slate-700">{log.trigger_key}</td>
                                        <td className="px-4 py-2 text-slate-700">
                                          <StatusPill
                                            label={log.status}
                                            tone={log.status === "sent" ? "green" : "slate"}
                                          />
                                        </td>
                                        <td className="px-4 py-2 text-slate-500">{log.response_message}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="muted text-xs">Belum ada riwayat notifikasi WhatsApp.</p>
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
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 text-slate-500 text-xs font-semibold">
            <span>
              Menampilkan {Math.min((page - 1) * limit + 1, total)} - {Math.min(page * limit, total)} dari {total} item
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-2 px-4 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                Sebelumnya
              </button>
              <span className="flex items-center px-2 text-slate-700">
                Halaman {page} dari {Math.ceil(total / limit)}
              </span>
              <button
                type="button"
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-2 px-4 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => onPageChange(page + 1)}
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
