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
}: BillsPageProps) {
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;

  return (
    <section className="grid feature-grid">
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
                        <div className="stack-actions">
                          <button
                            type="button"
                            className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50"
                            onClick={() => window.open(`/api/v1/bills/${bill.id}/invoice`, "_blank")}
                          >
                            Invoice
                          </button>
                          {user?.role !== "viewer" && bill.status === "belum_bayar" ? (
                            <button
                              type="button"
                              className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50"
                              onClick={() => onMarkBillPaid(bill.id)}
                            >
                              Tandai Lunas
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50"
                            onClick={() => onToggleNotifications(bill.id)}
                          >
                            Log WA
                          </button>
                          {user?.role !== "viewer" && (
                            <>
                              <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.pdf,.webp"
                                onChange={(e) => onProofFileChange(bill.id, e.target.files?.[0] ?? null)}
                              />
                              <button
                                type="button"
                                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50"
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
