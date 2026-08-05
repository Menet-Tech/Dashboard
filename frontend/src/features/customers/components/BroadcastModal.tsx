import { useState, type FormEvent } from "react";
import { sendBroadcast } from "../../../lib/api";
import { Button } from "../../../components/ui/Button";

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
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl max-w-lg w-full flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Broadcast WhatsApp</h3>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          </Button>
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
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Target Pelanggan</span>
            <select
              autoFocus={true}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Pesan Broadcast</span>
            <textarea
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              rows={6}
              placeholder="Ketik pesan di sini... Gunakan {nama} untuk mempersonalisasi nama pelanggan."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </label>

          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            Pesan akan dikirim menggunakan antrean (queue) latar belakang dengan delay jeda waktu 2 detik per pesan untuk mencegah ban nomor WhatsApp.
          </p>

          <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-3 mt-2">
            <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
            <Button
              type="submit"
              disabled={broadcastSubmitting || !message.trim()}
              isLoading={broadcastSubmitting}
              loadingText="Mengirim..."
            >
              Kirim Broadcast
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
