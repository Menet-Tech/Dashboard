import { useState, useEffect } from "react";
import { Loader2, Plus, Edit3, Trash2, ShieldAlert, Send, MapPin, Map } from "lucide-react";
import { StatusPill, EmptyTableRow } from "../../components/ui";
import { Modal } from "../../components/ui/Modal";
import type { OdpItem, User, CustomerItem } from "../../types";
import { CustomerDetailModal } from "../customers/components/CustomerDetailModal";
import { request } from "../../lib/api";

type OdpPageProps = {
  user: User | null;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  onEndTrial?: (id: number) => void;
};

export function OdpPage({ user, pushSuccess, pushError, onEndTrial }: OdpPageProps) {
  const [odps, setOdps] = useState<OdpItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Modal forms
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingOdp, setEditingOdp] = useState<OdpItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formLatitude, setFormLatitude] = useState("");
  const [formLongitude, setFormLongitude] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPorts, setFormPorts] = useState(8);
  const [formSplitterRatio, setFormSplitterRatio] = useState("1:8");

  // Delete confirmation modal
  const [deletingOdp, setDeletingOdp] = useState<OdpItem | null>(null);

  // Detail Modal & Linkages
  const [selectedOdpForDetail, setSelectedOdpForDetail] = useState<OdpItem | null>(null);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [detailedCustomer, setDetailedCustomer] = useState<CustomerItem | null>(null);

  // Broadcast Modal
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastingOdp, setBroadcastingOdp] = useState<OdpItem | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState("");

  const fetchOdps = async () => {
    setLoading(true);
    try {
      const data = await request<{ data: OdpItem[] }>("/api/v1/odps");
      setOdps(data.data || []);
    } catch (err: any) {
      pushError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomersList = async () => {
    try {
      const data = await request<{ data: CustomerItem[] }>("/api/v1/customers");
      setCustomers(data.data || []);
    } catch (err) {
      console.error("Failed to load customers", err);
    }
  };

  useEffect(() => {
    void fetchOdps();
    void fetchCustomersList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenCreate = () => {
    setEditingOdp(null);
    setFormName("");
    setFormLocation("");
    setFormLatitude("");
    setFormLongitude("");
    setFormDescription("");
    setFormPorts(8);
    setFormSplitterRatio("1:8");
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (item: OdpItem) => {
    setEditingOdp(item);
    setFormName(item.nama);
    setFormLocation(item.lokasi);
    // Parse coordinates from lokasi or use direct lat/lng
    setFormLatitude(item.latitude ? String(item.latitude) : "");
    setFormLongitude(item.longitude ? String(item.longitude) : "");
    setFormDescription(item.deskripsi);
    setFormPorts(item.ports || 8);
    setFormSplitterRatio(item.splitter_ratio || "1:8");
    setIsFormModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formLocation.trim()) {
      pushError("Nama ODP dan Lokasi wajib diisi.");
      return;
    }

    setSubmitting(true);

    const lat = parseFloat(formLatitude) || 0;
    const lng = parseFloat(formLongitude) || 0;

    const payload = {
      nama: formName,
      lokasi: formLocation,
      deskripsi: formDescription,
      ports: formPorts,
      splitter_ratio: formSplitterRatio,
      latitude: lat,
      longitude: lng,
    };

    try {
      if (editingOdp) {
        await request<{ data: OdpItem }>(`/api/v1/odps/${editingOdp.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await request<{ data: OdpItem }>("/api/v1/odps", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      pushSuccess(editingOdp ? "ODP berhasil diperbarui." : "ODP berhasil dibuat.");
      setIsFormModalOpen(false);
      await fetchOdps();
    } catch (err: any) {
      pushError(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingOdp) return;
    setSubmitting(true);
    try {
      await request<{ success: boolean }>(`/api/v1/odps/${deletingOdp.id}`, {
        method: "DELETE",
      });
      pushSuccess("ODP berhasil dihapus.");
      setDeletingOdp(null);
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
      const data = await request<{ queued: number }>("/api/v1/broadcast", {
        method: "POST",
        body: JSON.stringify({
          target_type: "odp",
          target_ids: [broadcastingOdp.id],
          message: broadcastMessage,
        }),
      });

      pushSuccess(`Broadcast maintenance berhasil dijadwalkan ke ${data.queued} pelanggan.`);
      setIsBroadcastModalOpen(false);
    } catch (err: any) {
      pushError(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // When splitter ratio changes, auto-update ports
  const handleSplitterChange = (ratio: string) => {
    setFormSplitterRatio(ratio);
    const parts = ratio.split(":");
    if (parts.length === 2) {
      const portCount = parseInt(parts[1], 10);
      if (!isNaN(portCount) && portCount > 0) {
        setFormPorts(portCount);
      }
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
          <table className="w-full text-left border-collapse text-sm min-w-[800px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Nama Node ODP</th>
                <th className="px-6 py-4 font-semibold">Lokasi / Koordinat</th>
                <th className="px-6 py-4 font-semibold">Splitter Ratio</th>
                <th className="px-6 py-4 font-semibold">Deskripsi</th>
                <th className="px-6 py-4 font-semibold text-center">Port Terpakai / Total</th>
                <th className="px-6 py-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8">
                    <Loader2 className="animate-spin text-indigo-600 mx-auto" />
                  </td>
                </tr>
              ) : odps.length === 0 ? (
                <EmptyTableRow message="Belum ada node ODP yang terdaftar." colSpan={6} />
              ) : (
                odps.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        {item.nama}
                        {(item.latitude !== 0 || item.longitude !== 0) && (
                          <span title={`${item.latitude?.toFixed(5)}, ${item.longitude?.toFixed(5)}`} className="text-cyan-500">
                            <Map size={12} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-medium text-xs max-w-[160px] truncate" title={item.lokasi}>{item.lokasi}</td>
                    <td className="px-6 py-4">
                      <span className="bg-cyan-50 text-cyan-700 border border-cyan-100 px-2 py-0.5 rounded-full text-xs font-semibold">
                        {item.splitter_ratio || "1:8"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-xs font-sans max-w-[200px] truncate" title={item.deskripsi}>
                      {item.deskripsi || "—"}
                    </td>
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-bold text-center">
                      <span className="bg-slate-100 px-2.5 py-1 rounded-full text-xs font-semibold">
                        {item.customer_count} / {item.ports || 8} Port
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      <div className="flex gap-2 justify-center">
                        <button
                          type="button"
                          onClick={() => setSelectedOdpForDetail(item)}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1"
                        >
                          Detail Port
                        </button>
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
                              onClick={() => setDeletingOdp(item)}
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
                placeholder="contoh: Jl. Mawar No. 12 atau nama area"
                required
              />
            </label>

            {/* Coordinates */}
            <div className="border border-slate-100 rounded-xl p-3.5 bg-slate-50/50 grid gap-3">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-cyan-600 shrink-0" />
                <span className="text-xs font-bold text-slate-600">Koordinat GPS (untuk peta)</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-slate-500">LATITUDE</span>
                  <input
                    type="number"
                    step="any"
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-mono shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={formLatitude}
                    onChange={(e) => setFormLatitude(e.target.value)}
                    placeholder="-6.2088"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-slate-500">LONGITUDE</span>
                  <input
                    type="number"
                    step="any"
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-mono shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={formLongitude}
                    onChange={(e) => setFormLongitude(e.target.value)}
                    placeholder="106.8456"
                  />
                </label>
              </div>
              <p className="text-[10px] text-slate-400 leading-snug">
                💡 Isi koordinat agar ODP langsung muncul di peta jaringan. Kosongkan jika koordinat belum diketahui.
              </p>
            </div>

            {/* Splitter Ratio & Ports */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-750">Splitter Ratio</span>
                <select
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={formSplitterRatio}
                  onChange={(e) => handleSplitterChange(e.target.value)}
                >
                  <option value="1:2">1:2</option>
                  <option value="1:4">1:4</option>
                  <option value="1:8">1:8</option>
                  <option value="1:16">1:16</option>
                  <option value="1:32">1:32</option>
                  <option value="1:64">1:64</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-750">Jumlah Port ODP</span>
                <input
                  type="number"
                  min={1}
                  max={64}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={formPorts}
                  onChange={(e) => setFormPorts(Number(e.target.value) || 8)}
                  placeholder="8"
                  required
                />
              </label>
            </div>

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

      {/* Delete Confirmation Modal */}
      {deletingOdp && (
        <Modal
          title="Hapus Node ODP"
          onClose={() => setDeletingOdp(null)}
          actions={
            <>
              <button
                type="button"
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                onClick={() => setDeletingOdp(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                onClick={() => void handleConfirmDelete()}
                disabled={submitting}
              >
                <Trash2 size={14} />
                {submitting ? "Menghapus..." : "Ya, Hapus ODP"}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-800">
              <p className="font-bold mb-1">⚠️ Perhatian</p>
              <p>
                Anda akan menghapus ODP <strong>{deletingOdp.nama}</strong>. Node ODP ini juga akan dihapus dari peta jaringan. Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
          </div>
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

      {/* ODP Port Detail Modal */}
      {selectedOdpForDetail && (
        <Modal
          title={`Detail Port ODP: ${selectedOdpForDetail.nama}`}
          onClose={() => setSelectedOdpForDetail(null)}
          actions={
            <button
              type="button"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
              onClick={() => setSelectedOdpForDetail(null)}
            >
              Tutup
            </button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-150 p-3.5 rounded-xl leading-relaxed">
              <p><strong>Lokasi:</strong> {selectedOdpForDetail.lokasi}</p>
              {selectedOdpForDetail.latitude !== 0 && (
                <p className="mt-1"><strong>Koordinat:</strong> {selectedOdpForDetail.latitude?.toFixed(6)}, {selectedOdpForDetail.longitude?.toFixed(6)}</p>
              )}
              <p className="mt-1"><strong>Splitter Ratio:</strong> {selectedOdpForDetail.splitter_ratio || "1:8"}</p>
              <p className="mt-1"><strong>Deskripsi:</strong> {selectedOdpForDetail.deskripsi || "—"}</p>
              <p className="mt-1"><strong>Kapasitas:</strong> {selectedOdpForDetail.ports || 8} Port</p>
            </div>

            <div className="overflow-hidden border border-gray-200 rounded-xl bg-white shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-center w-16">Port</th>
                    <th className="px-4 py-3">Pelanggan</th>
                    <th className="px-4 py-3">User PPPoE</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {Array.from({ length: selectedOdpForDetail.ports || 8 }, (_, i) => i + 1).map((portNum) => {
                    const matchedCustomer = customers.find(
                      (c) => c.odp_id === selectedOdpForDetail.id && c.odp_port === portNum
                    );

                    return (
                      <tr key={portNum} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-bold text-slate-700 text-center">#{portNum}</td>
                        {matchedCustomer ? (
                          <>
                            <td className="px-4 py-3 font-bold text-slate-900">{matchedCustomer.name}</td>
                            <td className="px-4 py-3 font-mono text-slate-600">{matchedCustomer.user_pppoe || "—"}</td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  matchedCustomer.status === "active"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                    : matchedCustomer.status === "limit"
                                    ? "bg-amber-50 text-amber-700 border border-amber-100"
                                    : "bg-red-50 text-red-700 border border-red-100"
                                }`}
                              >
                                {matchedCustomer.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => setDetailedCustomer(matchedCustomer)}
                                className="text-indigo-600 hover:text-indigo-850 font-bold hover:underline"
                              >
                                Lihat Profil
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 text-slate-400 italic" colSpan={3}>
                              Kosong (Belum terpakai)
                            </td>
                            <td className="px-4 py-3 text-center text-slate-350">-</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {/* Customer Detail Modal inside ODP detail view */}
      {detailedCustomer && (
        <CustomerDetailModal
          customer={detailedCustomer}
          onClose={() => setDetailedCustomer(null)}
          user={user}
          pushSuccess={pushSuccess}
          pushError={pushError}
          onRefresh={() => {
            void fetchOdps();
            void fetchCustomersList();
          }}
          onEndTrial={onEndTrial}
        />
      )}

    </section>
  );
}
