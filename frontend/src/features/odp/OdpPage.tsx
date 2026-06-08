import { useState, useEffect } from "react";
import { Loader2, Plus, Edit3, Trash2, ShieldAlert, Send } from "lucide-react";
import { StatusPill, EmptyTableRow } from "../../components/ui";
import { Modal } from "../../components/ui/Modal";
import type { OdpItem, User } from "../../types";

type OdpPageProps = {
  user: User | null;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
};

export function OdpPage({ user, pushSuccess, pushError }: OdpPageProps) {
  const [odps, setOdps] = useState<OdpItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Modal forms
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingOdp, setEditingOdp] = useState<OdpItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formDescription, setFormDescription] = useState("");

  // Broadcast Modal
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastingOdp, setBroadcastingOdp] = useState<OdpItem | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState("");

  const fetchOdps = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/odps", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat ODP");
      setOdps(data.data || []);
    } catch (err: any) {
      pushError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOdps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenCreate = () => {
    setEditingOdp(null);
    setFormName("");
    setFormLocation("");
    setFormDescription("");
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (item: OdpItem) => {
    setEditingOdp(item);
    setFormName(item.nama);
    setFormLocation(item.lokasi);
    setFormDescription(item.deskripsi);
    setIsFormModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formLocation.trim()) {
      alert("Nama ODP dan Lokasi wajib diisi.");
      return;
    }

    setSubmitting(true);
    const payload = {
      nama: formName,
      lokasi: formLocation,
      deskripsi: formDescription,
    };

    try {
      let res;
      if (editingOdp) {
        res = await fetch(`/api/v1/odps/${editingOdp.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });
      } else {
        res = await fetch("/api/v1/odps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan ODP");

      pushSuccess(editingOdp ? "ODP berhasil diperbarui." : "ODP berhasil dibuat.");
      setIsFormModalOpen(false);
      await fetchOdps();
    } catch (err: any) {
      pushError(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus ODP ini?")) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/odps/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus ODP");
      pushSuccess("ODP berhasil dihapus.");
      await fetchOdps();
    } catch (err: any) {
      pushError(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenBroadcast = (item: OdpItem) => {
    setBroadcastingOdp(item);
    setBroadcastMessage(
      `PEMBERITAHUAN MAINTENANCE:\nHalo pelanggan setia Menet-Tech di sekitar area ODP *${item.nama}*.\n\nKami menginfokan bahwa akan dilakukan maintenance terjadwal pada node ODP Anda untuk meningkatkan kestabilan layanan. Estimasi pengerjaan adalah 1-2 jam. Koneksi internet Anda kemungkinan akan terputus sementara.\n\nMohon maaf atas ketidaknyamanan ini.`
    );
    setIsBroadcastModalOpen(true);
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastingOdp || !broadcastMessage.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: "odp",
          target_ids: [broadcastingOdp.id],
          message: broadcastMessage,
        }),
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengirim broadcast");

      pushSuccess(`Broadcast maintenance berhasil dijadwalkan ke ${data.queued} pelanggan.`);
      setIsBroadcastModalOpen(false);
    } catch (err: any) {
      pushError(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const isViewer = user?.role === "viewer";

  return (
    <section className="flex flex-col gap-6">
      {/* Header and Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">Manajemen ODP (Optical Distribution Point)</h2>
          <p className="text-xs text-slate-500 mt-1">
            Kelola data titik distribusi ODP dan kirim notifikasi gangguan/maintenance massal berdasarkan node ODP.
          </p>
        </div>
        {!isViewer && (
          <button
            type="button"
            onClick={handleOpenCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5"
          >
            <Plus size={14} />
            Tambah ODP Baru
          </button>
        )}
      </div>

      {/* ODP List Table */}
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-sans">Daftar Titik ODP</h3>
          <StatusPill label={`${odps.length} Node`} tone="slate" />
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm scrollbar-thin">
          <table className="w-full text-left border-collapse text-sm min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Nama Node ODP</th>
                <th className="px-6 py-4 font-semibold">Lokasi Koordinat/Area</th>
                <th className="px-6 py-4 font-semibold">Deskripsi</th>
                <th className="px-6 py-4 font-semibold text-center">Jumlah Pelanggan</th>
                <th className="px-6 py-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <Loader2 className="animate-spin text-indigo-600 mx-auto" />
                  </td>
                </tr>
              ) : odps.length === 0 ? (
                <EmptyTableRow message="Belum ada node ODP yang terdaftar." colSpan={5} />
              ) : (
                odps.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">{item.nama}</td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-medium">{item.lokasi}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-xs font-sans max-w-[200px] truncate" title={item.deskripsi}>
                      {item.deskripsi || "-"}
                    </td>
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-bold text-center">
                      <span className="bg-slate-100 px-2.5 py-1 rounded-full text-xs font-semibold">
                        {item.customer_count} Pelanggan
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      <div className="flex gap-2 justify-center">
                        {!isViewer && item.customer_count > 0 && (
                          <button
                            type="button"
                            onClick={() => handleOpenBroadcast(item)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1"
                          >
                            <ShieldAlert size={12} />
                            Broadcast WA
                          </button>
                        )}
                        {!isViewer && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(item)}
                              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1"
                            >
                              <Edit3 size={12} />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              disabled={item.customer_count > 0}
                              title={item.customer_count > 0 ? "Tidak bisa menghapus ODP yang masih memiliki pelanggan" : ""}
                              className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                            >
                              <Trash2 size={12} />
                              Hapus
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Create / Edit Form Modal */}
      {isFormModalOpen && (
        <Modal
          title={editingOdp ? "Edit Node ODP" : "Tambah Node ODP"}
          onClose={() => setIsFormModalOpen(false)}
          actions={
            <>
              <button
                type="button"
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                onClick={() => setIsFormModalOpen(false)}
              >
                Batal
              </button>
              <button
                type="submit"
                form="odp-form"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors flex items-center gap-1"
                disabled={submitting}
              >
                {submitting ? "Menyimpan..." : "Simpan ODP"}
              </button>
            </>
          }
        >
          <form id="odp-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-750">Nama ODP</span>
              <input
                type="text"
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="contoh: ODP-LNK-01"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-750">Lokasi / Area</span>
              <input
                type="text"
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder="contoh: Jl. Mawar No. 12 atau Koordinat Lat/Long"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-750">Deskripsi / Catatan</span>
              <textarea
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="contoh: Port 1-8 aktif, terpasang di tiang PLN dekat pertigaan"
                rows={3}
              />
            </label>
          </form>
        </Modal>
      )}

      {/* Broadcast Maintenance Modal */}
      {isBroadcastModalOpen && broadcastingOdp && (
        <Modal
          title={`Broadcast Maintenance ODP: ${broadcastingOdp.nama}`}
          onClose={() => setIsBroadcastModalOpen(false)}
          actions={
            <>
              <button
                type="button"
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                onClick={() => setIsBroadcastModalOpen(false)}
              >
                Batal
              </button>
              <button
                type="submit"
                form="broadcast-form"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                disabled={submitting}
              >
                {submitting ? "Mengirim..." : (
                  <>
                    <Send size={14} />
                    Kirim Broadcast WA ({broadcastingOdp.customer_count})
                  </>
                )}
              </button>
            </>
          }
        >
          <form id="broadcast-form" onSubmit={handleSendBroadcast} className="flex flex-col gap-4">
            <div className="bg-amber-50 text-amber-800 text-xs p-4 rounded-xl border border-amber-200">
              Pemberitahuan ini akan dikirimkan secara otomatis via WhatsApp ke seluruh pelanggan yang terhubung dengan node ODP <strong>{broadcastingOdp.nama}</strong>. Gunakan <code>{"{nama}"}</code> untuk personalisasi nama pelanggan.
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-750">Pesan WhatsApp</span>
              <textarea
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                rows={8}
                required
              />
            </label>
          </form>
        </Modal>
      )}
    </section>
  );
}
