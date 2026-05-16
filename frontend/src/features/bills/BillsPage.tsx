import { Fragment, type FormEvent } from "react";
import { formatCurrency } from "../../utils/format";
import { displayStatusLabel, displayStatusTone } from "../../utils/status";
import { StatusPill, inputClassName, renderInlineError, EmptyTableRow } from "../../components/ui";
import type { BillItem, User, NotificationLog } from "../../types";
import type { FieldErrors } from "../../utils/validation";

type BillsPageProps = {
  user: User | null;
  bills: BillItem[];
  billPeriod: string;
  billErrors: FieldErrors;
  submitting: boolean;
  busyAction: string | null;
  expandedBillId: number | null;
  notificationLogs: Record<number, NotificationLog[]>;
  proofFiles: Record<number, File | null>;
  onBillPeriodChange: (period: string) => void;
  onGenerateBills: (e: FormEvent<HTMLFormElement>) => void;
  onMarkBillPaid: (id: number) => void;
  onToggleNotifications: (id: number) => void;
  onProofFileChange: (id: number, file: File | null) => void;
  onUploadProof: (id: number) => void;
  pushToast: (tone: any, msg: string) => void;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
};

export function BillsPage({
  user,
  bills,
  billPeriod,
  billErrors,
  submitting,
  busyAction,
  expandedBillId,
  notificationLogs,
  proofFiles,
  onBillPeriodChange,
  onGenerateBills,
  onMarkBillPaid,
  onToggleNotifications,
  onProofFileChange,
  onUploadProof,
  pushToast,
  pushSuccess,
  pushError,
}: BillsPageProps) {
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;

  const handleSendWA = async (id: number) => {
    pushToast("slate", "Notifikasi WA sedang dikirim...");
    try {
      await onToggleNotifications(id);
      pushSuccess("Notifikasi WA berhasil dikirim");
    } catch (err) {
      pushError("Gagal mengirim notifikasi WA");
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
            <label>
              <span>Periode (YYYY-MM)</span>
              <input
                className={inputClassName(billErrors.period)}
                value={billPeriod}
                onChange={(e) => onBillPeriodChange(e.target.value)}
                placeholder="2026-04"
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
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Daftar Tagihan</h2>
          <StatusPill label={`${bills.length} item`} tone="slate" />
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
                <EmptyTableRow message="Belum ada tagihan untuk ditampilkan pada database ini." colSpan={8} />
              ) : (
                bills.map((bill) => (
                  <Fragment key={bill.id}>
                    <tr>
                      <td className="px-6 py-4 text-gray-700">{bill.invoice_number}</td>
                      <td className="px-6 py-4 text-gray-700">{bill.customer_name}</td>
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
                          <a href={bill.proof_path} target="_blank" rel="noreferrer">
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
                          <button
                            type="button"
                            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            onClick={() => handleSendWA(bill.id)}
                            disabled={isBusy(`notify-${bill.id}`)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.394 0 12.03c0 2.12.54 4.19 1.563 6.04L0 24l6.102-1.601a11.803 11.803 0 005.94 1.579h.005c6.637 0 12.032-5.395 12.035-12.032a11.762 11.762 0 00-3.417-8.281z"/></svg>
                            Kirim WA
                          </button>
                          <button
                            type="button"
                            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                            onClick={() => onToggleNotifications(bill.id)}
                          >
                            Log WA
                          </button>
                          {user?.role !== "viewer" && bill.status === "belum_bayar" ? (
                            <button
                              type="button"
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                              onClick={() => onMarkBillPaid(bill.id)}
                              disabled={isBusy("mark-paid")}
                            >
                              {isBusy("mark-paid") ? "Memproses..." : "Tandai Lunas"}
                            </button>
                          ) : null}
                          {user?.role !== "viewer" && (
                            <>
                              <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.pdf,.webp"
                                onChange={(e) => onProofFileChange(bill.id, e.target.files?.[0] ?? null)}
                              />
                               <button
                                type="button"
                                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                                onClick={() => onUploadProof(bill.id)}
                              >
                                {isBusy("upload-proof") ? "Mengunggah..." : "Upload Bukti"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedBillId === bill.id && (
                      <tr className="expanded-row">
                        <td className="px-6 py-4 text-gray-700" colSpan={8}>
                          <div className="expanded-content p-4">
                            <h4>Riwayat Notifikasi</h4>
                            {notificationLogs[bill.id]?.length ? (
                              <table className="compact-table mt-2 w-full">
                                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                                  <tr>
                                    <th className="text-left">Waktu</th>
                                    <th className="text-left">Tujuan</th>
                                    <th className="text-left">Trigger</th>
                                    <th className="text-left">Status</th>
                                    <th className="text-left">Response</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {notificationLogs[bill.id].map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-6 py-4 text-gray-700">{new Date(log.created_at).toLocaleString()}</td>
                                      <td className="px-6 py-4 text-gray-700">{log.sent_to}</td>
                                      <td className="px-6 py-4 text-gray-700">{log.trigger_key}</td>
                                      <td className="px-6 py-4 text-gray-700">
                                        <StatusPill
                                          label={log.status}
                                          tone={log.status === "sent" ? "green" : "slate"}
                                        />
                                      </td>
                                      <td className="px-6 py-4 text-gray-700">{log.response_message}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="muted mt-2">Belum ada riwayat notifikasi WhatsApp.</p>
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
      </article>
    </section>
  );
}
