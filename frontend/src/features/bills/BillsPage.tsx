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
        <article className="surface">
          <div className="section-heading">
            <h2>Generate Tagihan</h2>
          </div>
          <form className="form-grid" onSubmit={onGenerateBills}>
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
              <button className="primary-button" disabled={submitting}>
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

      <article className="surface">
        <div className="section-heading">
          <h2>Daftar Tagihan</h2>
          <StatusPill label={`${bills.length} item`} tone="slate" />
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Pelanggan</th>
                <th>Periode</th>
                <th>Jatuh Tempo</th>
                <th>Nominal</th>
                <th>Status</th>
                <th>Bukti</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {bills.length === 0 ? (
                <EmptyTableRow message="Belum ada tagihan untuk ditampilkan pada database ini." colSpan={8} />
              ) : (
                bills.map((bill) => (
                  <Fragment key={bill.id}>
                    <tr>
                      <td>{bill.invoice_number}</td>
                      <td>{bill.customer_name}</td>
                      <td>{bill.period}</td>
                      <td>{bill.due_date}</td>
                      <td>{formatCurrency(bill.amount)}</td>
                      <td>
                        <StatusPill
                          label={displayStatusLabel(bill.display_status)}
                          tone={displayStatusTone(bill.display_status)}
                        />
                      </td>
                      <td>
                        {bill.proof_path ? (
                          <a href={bill.proof_path} target="_blank" rel="noreferrer">
                            Lihat bukti
                          </a>
                        ) : (
                          <span className="muted">Belum ada</span>
                        )}
                      </td>
                      <td>
                        <div className="stack-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => window.open(`/api/v1/bills/${bill.id}/invoice`, "_blank")}
                          >
                            Invoice
                          </button>
                          {user?.role !== "viewer" && bill.status === "belum_bayar" ? (
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => onMarkBillPaid(bill.id)}
                            >
                              Tandai Lunas
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="ghost-button"
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
                                className="secondary-button"
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
                        <td colSpan={8}>
                          <div className="expanded-content p-4">
                            <h4>Riwayat Notifikasi</h4>
                            {notificationLogs[bill.id]?.length ? (
                              <table className="compact-table mt-2 w-full">
                                <thead>
                                  <tr>
                                    <th className="text-left">Waktu</th>
                                    <th className="text-left">Tujuan</th>
                                    <th className="text-left">Trigger</th>
                                    <th className="text-left">Status</th>
                                    <th className="text-left">Response</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {notificationLogs[bill.id].map((log) => (
                                    <tr key={log.id}>
                                      <td>{new Date(log.created_at).toLocaleString()}</td>
                                      <td>{log.sent_to}</td>
                                      <td>{log.trigger_key}</td>
                                      <td>
                                        <StatusPill
                                          label={log.status}
                                          tone={log.status === "sent" ? "green" : "slate"}
                                        />
                                      </td>
                                      <td>{log.response_message}</td>
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
