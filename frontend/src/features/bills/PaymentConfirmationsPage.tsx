import { useState, useEffect } from "react";
import {
  fetchPendingConfirmations,
  approveConfirmation,
  rejectConfirmation,
  fetchBills,
  uploadBillProof,
  createPaymentConfirmation
} from "../../lib/api";
import type { PaymentConfirmationItem, BillItem } from "../../types";
import { formatCurrency } from "../../utils/format";
import { Check, X, Eye, FileText, AlertCircle } from "lucide-react";
import { useDialog } from "../../context/DialogContext";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";

type PaymentConfirmationsPageProps = {
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  withFeedback: (fn: () => Promise<void>, actionKey?: string) => Promise<void>;
};

export function PaymentConfirmationsPage({
  pushSuccess,
  pushError,
  withFeedback,
}: PaymentConfirmationsPageProps) {
  const [confirmations, setConfirmations] = useState<PaymentConfirmationItem[]>([]);
  const { showConfirm } = useDialog();
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Manual confirmation states
  const [showAddModal, setShowAddModal] = useState(false);
  const [unpaidBills, setUnpaidBills] = useState<BillItem[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [selectedLinkedBillIds, setSelectedLinkedBillIds] = useState<number[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [catatanText, setCatatanText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadUnpaidBills = async () => {
    setLoadingBills(true);
    try {
      const res = await fetchBills({ status: "belum_bayar", limit: 200 });
      setUnpaidBills(res.data || []);
    } catch (err: any) {
      pushError(err.message || "Gagal memuat daftar tagihan");
    } finally {
      setLoadingBills(false);
    }
  };

  useEffect(() => {
    if (showAddModal) {
      void loadUnpaidBills();
    }
  }, [showAddModal]);

  const loadConfirmations = async () => {
    setLoading(true);
    try {
      const res = await fetchPendingConfirmations();
      setConfirmations(res.data || []);
    } catch (err: any) {
      pushError(err.message || "Gagal memuat konfirmasi pembayaran");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfirmations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = async (id: number) => {
    setBusyId(id);
    try {
      await withFeedback(async () => {
        await approveConfirmation(id);
      }, `approve-${id}`);
      pushSuccess("Pembayaran berhasil disetujui.");
      setConfirmations((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      pushError(err.message || "Gagal menyetujui pembayaran");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: number) => {
    if (!(await showConfirm("Apakah Anda yakin ingin menolak konfirmasi pembayaran ini?"))) return;
    setBusyId(id);
    try {
      await withFeedback(async () => {
        await rejectConfirmation(id);
      }, `reject-${id}`);
      pushSuccess("Konfirmasi pembayaran ditolak.");
      setConfirmations((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      pushError(err.message || "Gagal menolak pembayaran");
    } finally {
      setBusyId(null);
    }
  };

  const resetForm = () => {
    setSelectedBillId(null);
    setSelectedLinkedBillIds([]);
    setUploadFile(null);
    setCatatanText("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBillId) {
      pushError("Pilih tagihan terlebih dahulu.");
      return;
    }
    setSubmitting(true);
    try {
      let proofPath = "";
      if (uploadFile) {
        const uploadRes = await uploadBillProof(selectedBillId, uploadFile);
        proofPath = uploadRes.proof_path;
      }
      const selectedBill = unpaidBills.find(b => b.id === selectedBillId);
      if (!selectedBill) throw new Error("Tagihan tidak valid");

      await createPaymentConfirmation({
        tagihan_id: selectedBill.id,
        pelanggan_id: selectedBill.customer_id,
        bukti_transfer: proofPath || undefined,
        catatan: catatanText,
        linked_tagihan_ids: selectedLinkedBillIds.join(","),
      });

      pushSuccess("Konfirmasi pembayaran manual berhasil dibuat.");
      setShowAddModal(false);
      resetForm();
      void loadConfirmations();
    } catch (err: any) {
      pushError(err.message || "Gagal membuat konfirmasi pembayaran");
    } finally {
      setSubmitting(false);
    }
  };

  const isImage = (path?: string) => {
    if (!path) return false;
    const clean = path.toLowerCase().split("?")[0];
    return (
      clean.endsWith(".png") ||
      clean.endsWith(".jpg") ||
      clean.endsWith(".jpeg") ||
      clean.endsWith(".webp")
    );
  };

  const selectedBill = unpaidBills.find((b) => b.id === selectedBillId);
  const relatedBills = selectedBill
    ? unpaidBills.filter(
        (b) =>
          b.id !== selectedBill.id &&
          ((selectedBill.customer_phone && b.customer_phone === selectedBill.customer_phone) ||
            b.customer_id === selectedBill.customer_id)
      )
    : [];

  return (
    <section className="grid grid-cols-1 gap-6">
      <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 dark:text-slate-50">Review Pembayaran</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Verifikasi bukti transfer dan klaim pembayaran yang dikirimkan pelanggan melalui WhatsApp.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowAddModal(true)} variant="primary">
                Tambah Konfirmasi Manual
              </Button>
            <Button
              variant="secondary"
              onClick={loadConfirmations}
              disabled={loading}
              isLoading={loading}
              loadingText="Menyegarkan..."
            >
              Segarkan
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <span className="text-sm text-slate-400">Memuat data review...</span>
          </div>
        ) : confirmations.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-950/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-card">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-card flex items-center justify-center mb-4">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-1">Semua Bersih!</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">
              Tidak ada bukti transfer atau klaim pembayaran yang pending untuk direview saat ini.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {confirmations.map((item) => {
              const date = new Date(item.created_at).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              });
              const hasProof = !!item.bukti_transfer;
              const isImg = hasProof && isImage(item.bukti_transfer);

              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-900 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-card overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-350"
                >
                  <div className="relative bg-slate-50 dark:bg-slate-950 dark:bg-slate-900 h-64 border-b border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden group">
                    {isImg ? (
                      <img
                        src={item.bukti_transfer}
                        alt="Bukti"
                        className="object-contain w-full h-full max-h-full transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : hasProof ? (
                      <div className="flex flex-col items-center gap-3 p-6 text-slate-400 dark:text-slate-500">
                        <FileText className="w-16 h-16 text-indigo-400" />
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">File Non-Gambar</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 p-6 text-slate-400">
                        <AlertCircle className="w-12 h-12 text-amber-500" />
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Klaim Tanpa Bukti (Cash)</span>
                      </div>
                    )}

                    {hasProof && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity duration-200">
                        <a
                          href={item.bukti_transfer}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-800 p-2.5 rounded-xl shadow-lg transition-transform hover:scale-110 flex items-center gap-1.5 text-xs font-bold"
                        >
                          <Eye className="w-4 h-4" /> Lihat Asli
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 text-sm leading-tight">
                            {item.customer_name}
                          </h4>
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold tracking-wide uppercase mt-1 inline-block">
                            Invoice: {item.invoice_number}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-50">
                            {formatCurrency(item.amount + (item.linked_bills || []).reduce((acc, b) => acc + b.amount, 0))}
                          </span>
                          {item.linked_bills && item.linked_bills.length > 0 && (
                            <span className="block text-[9px] text-indigo-600 dark:text-indigo-400 font-bold mt-0.5">
                              (Total {item.linked_bills.length + 1} Akun)
                            </span>
                          )}
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{date}</span>
                        </div>
                      </div>

                      {item.linked_bills && item.linked_bills.length > 0 && (
                        <div className="mt-2.5 mb-3 space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-2">
                          <span className="block text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                            Akun Lain yang Ditautkan:
                          </span>
                          {item.linked_bills.map((lb) => (
                            <div key={lb.tagihan_id} className="flex justify-between items-center text-[11px] bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                              <span className="text-slate-600 dark:text-slate-400 font-semibold">
                                {lb.invoice_number}
                              </span>
                              <span className="font-extrabold text-slate-800 dark:text-slate-100 dark:text-slate-300">
                                {formatCurrency(lb.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/60 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
                        <strong className="block text-[10px] text-slate-400 dark:text-slate-500 mb-1 tracking-wider uppercase">
                          Keterangan:
                        </strong>
                        <p className="italic leading-relaxed break-words whitespace-pre-line">
                          {item.catatan || "(tidak ada)"}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <Button
                          onClick={() => handleReject(item.id)}
                          disabled={busyId !== null}
                          variant="danger"
                          className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/35 text-rose-600 flex-1"
                        >
                          <X className="w-4 h-4" /> Tolak
                        </Button>
                      <Button
                          onClick={() => handleApprove(item.id)}
                          disabled={busyId !== null}
                          variant="primary"
                          className="flex-1"
                        >
                          <Check className="w-4 h-4" /> Setujui
                        </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>

      {showAddModal && (
        <Modal title="Tambah Konfirmasi Pembayaran Manual" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4 font-sans">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 dark:text-slate-355 mb-1">
                Pilih Tagihan Pelanggan (Belum Bayar) *
              </label>
              {loadingBills ? (
                <div className="text-xs text-slate-400 dark:text-slate-500 py-1">Memuat daftar tagihan...</div>
              ) : (
                <select
                  value={selectedBillId || ""}
                  onChange={(e) => {
                    setSelectedBillId(Number(e.target.value) || null);
                    setSelectedLinkedBillIds([]);
                  }}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs px-3 py-2 text-slate-800 dark:text-slate-100 dark:text-slate-200"
                  required
                >
                  <option value="">-- Pilih Tagihan --</option>
                  {unpaidBills.map((bill) => (
                    <option key={bill.id} value={bill.id}>
                      {bill.customer_name} - {bill.invoice_number} ({formatCurrency(bill.amount)})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {relatedBills.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
                <span className="block text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Tautkan Tagihan Lain (Multi-Akun / Nomer WA Sama)
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {relatedBills.map((bill) => {
                    const isChecked = selectedLinkedBillIds.includes(bill.id);
                    return (
                      <label
                        key={bill.id}
                        className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/60 p-1.5 rounded-lg transition-all"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedLinkedBillIds((prev) => [...prev, bill.id]);
                            } else {
                              setSelectedLinkedBillIds((prev) => prev.filter((id) => id !== bill.id));
                            }
                          }}
                          className="rounded border-slate-300 dark:border-slate-800 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                        />
                        <span>
                          {bill.invoice_number} - {bill.package_name} ({formatCurrency(bill.amount)})
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 dark:text-slate-355 mb-1">
                Bukti Transfer (Gambar / PDF - Opsional)
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 dark:text-slate-355 mb-1">
                Catatan Pembayaran
              </label>
              <textarea
                value={catatanText}
                onChange={(e) => setCatatanText(e.target.value)}
                placeholder="Contoh: Transfer Bank Mandiri an Pengirim"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs px-3 py-2 h-20 text-slate-800 dark:text-slate-100 dark:text-slate-200"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Batal
                </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                isLoading={submitting}
                loadingText="Menyimpan..."
              >
                Simpan Konfirmasi
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
