import { useState, useEffect } from "react";
import { fetchPendingConfirmations, approveConfirmation, rejectConfirmation } from "../../lib/api";
import type { PaymentConfirmationItem } from "../../types";
import { formatCurrency } from "../../utils/format";
import { Check, X, Eye, FileText, AlertCircle } from "lucide-react";
import { useDialog } from "../../context/DialogContext";

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

  return (
    <section className="grid grid-cols-1 gap-6">
      <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-55">Review Pembayaran</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Verifikasi bukti transfer dan klaim pembayaran yang dikirimkan pelanggan melalui WhatsApp.
            </p>
          </div>
          <button
            onClick={loadConfirmations}
            disabled={loading}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300 text-xs font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-all"
          >
            {loading ? "Menyegarkan..." : "Segarkan"}
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <span className="text-sm text-slate-450">Memuat data review...</span>
          </div>
        ) : confirmations.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-950/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center mb-4">
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
                  className="bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-350"
                >
                  <div className="relative bg-slate-50 dark:bg-slate-900 h-64 border-b border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden group">
                    {isImg ? (
                      <img
                        src={item.bukti_transfer}
                        alt="Bukti"
                        className="object-contain w-full h-full max-h-full transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : hasProof ? (
                      <div className="flex flex-col items-center gap-3 p-6 text-slate-400">
                        <FileText className="w-16 h-16 text-indigo-400" />
                        <span className="text-xs font-semibold text-slate-500">File Non-Gambar</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 p-6 text-slate-450">
                        <AlertCircle className="w-12 h-12 text-amber-500" />
                        <span className="text-xs font-semibold text-slate-500">Klaim Tanpa Bukti (Cash)</span>
                      </div>
                    )}

                    {hasProof && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity duration-200">
                        <a
                          href={item.bukti_transfer}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-white hover:bg-slate-100 text-slate-850 p-2.5 rounded-xl shadow-lg transition-transform hover:scale-110 flex items-center gap-1.5 text-xs font-bold"
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
                          <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-tight">
                            {item.customer_name}
                          </h4>
                          <span className="text-[10px] text-indigo-650 dark:text-indigo-400 font-semibold tracking-wide uppercase mt-1 inline-block">
                            Invoice: {item.invoice_number}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-50">
                            {formatCurrency(item.amount)}
                          </span>
                          <span className="block text-[10px] text-slate-400 mt-0.5">{date}</span>
                        </div>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3 text-xs text-slate-650 dark:text-slate-350 border border-slate-100 dark:border-slate-800">
                        <strong className="block text-[10px] text-slate-450 dark:text-slate-500 mb-1 tracking-wider uppercase">
                          Keterangan:
                        </strong>
                        <p className="italic leading-relaxed break-words whitespace-pre-line">
                          {item.catatan || "(tidak ada)"}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => handleReject(item.id)}
                        disabled={busyId !== null}
                        className="flex-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/35 text-rose-600 dark:text-rose-450 text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-55"
                      >
                        <X className="w-4 h-4" /> Tolak
                      </button>
                      <button
                        onClick={() => handleApprove(item.id)}
                        disabled={busyId !== null}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-55"
                      >
                        <Check className="w-4 h-4" /> Setujui
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}
