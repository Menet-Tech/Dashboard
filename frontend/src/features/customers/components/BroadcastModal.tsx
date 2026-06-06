import { useState, type FormEvent } from "react";
import { sendBroadcast } from "../../../lib/api";

type BroadcastModalProps = {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  selectedIds: Record<number, boolean>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
};

export function BroadcastModal({
  isOpen,
  onClose,
  selectedCount,
  selectedIds,
  setSelectedIds,
}: BroadcastModalProps) {
  const [targetType, setTargetType] = useState<"all" | "active" | "limit" | "selected">("all");
  const [message, setMessage] = useState("");
  const [broadcastSubmitting, setBroadcastSubmitting] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcastSuccess, setBroadcastSuccess] = useState<string | null>(null);

  // Sync state if selected count changes or when modal is opened
  useState(() => {
    if (selectedCount > 0) {
      setTargetType("selected");
    } else {
      setTargetType("all");
    }
  });

  if (!isOpen) return null;

  const handleSendBroadcast = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setBroadcastSubmitting(true);
    setBroadcastError(null);
    setBroadcastSuccess(null);

    const selectedList = Object.keys(selectedIds)
      .map(Number)
      .filter((id) => selectedIds[id]);

    try {
      const res = await sendBroadcast(targetType, selectedList, message);
      setBroadcastSuccess(`Broadcast berhasil antre! ${res.queued} pesan dimasukkan ke antrean.`);
      setSelectedIds({});
      setTimeout(() => {
        onClose();
        setBroadcastSuccess(null);
      }, 2000);
    } catch (err) {
      setBroadcastError(err instanceof Error ? err.message : "Gagal mengirim broadcast");
    } finally {
      setBroadcastSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xl max-w-lg w-full flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-slate-900">Broadcast WhatsApp</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          </button>
        </div>

        {broadcastError && (
          <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs font-semibold">
            {broadcastError}
          </div>
        )}
        {broadcastSuccess && (
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-semibold">
            {broadcastSuccess}
          </div>
        )}

        <form onSubmit={handleSendBroadcast} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-700">Target Pelanggan</span>
            <select
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as any)}
            >
              <option value="all">Semua Pelanggan Aktif / Limit</option>
              <option value="active">Hanya Pelanggan Aktif</option>
              <option value="limit">Hanya Pelanggan Isolir / Limit</option>
              <option value="selected" disabled={selectedCount === 0}>
                Pelanggan Terpilih ({selectedCount} item)
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-700">Pesan Broadcast</span>
            <textarea
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              rows={6}
              placeholder="Ketik pesan di sini... Gunakan {nama} untuk mempersonalisasi nama pelanggan."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </label>

          <p className="text-[10px] text-slate-400">
            Pesan akan dikirim menggunakan antrean (queue) latar belakang dengan delay jeda waktu 2 detik per pesan untuk mencegah ban nomor WhatsApp.
          </p>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2 px-4 rounded-xl text-xs transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={broadcastSubmitting || !message.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-sm transition-colors disabled:opacity-50"
            >
              {broadcastSubmitting ? "Mengirim..." : "Kirim Broadcast"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
