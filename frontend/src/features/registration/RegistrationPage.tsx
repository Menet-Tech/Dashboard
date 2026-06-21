import { useState, useEffect } from "react";
import { StatusPill, EmptyTableRow, inputClassName, renderInlineError } from "../../components/ui";
import { Trash2, CheckCircle2, UserPlus, Plus } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import type { ConfirmDialogState } from "../../hooks/types";
import type { ContactForm } from "../../lib/gatewayApi";
import { getChatbotForms, updateChatbotForm, deleteChatbotForm, createChatbotForm } from "../../lib/gatewayApi";
import type { PackageItem } from "../../types";

type RegistrationPageProps = {
  waGatewayUrl?: string;
  waAccountId?: string;
  waApiKey?: string;
  packages?: PackageItem[];
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  withFeedback: (fn: () => Promise<void>, busyKey?: string) => Promise<void>;
  askForConfirmation: (config: ConfirmDialogState) => void;
  onConvert: (leadData: {
    name: string;
    whatsapp: string;
    address: string;
    ssid?: string;
    password?: string;
    referral?: string;
  }) => void;
};

type ManualRegistrationForm = {
  nama: string;
  phone: string;
  alamat: string;
  ssid: string;
  password: string;
  paket: string;
  referral: string;
};

export function RegistrationPage({
  waGatewayUrl,
  waApiKey,
  packages = [],
  pushSuccess,
  pushError,
  withFeedback,
  askForConfirmation,
  onConvert,
}: RegistrationPageProps) {
  const [leads, setLeads] = useState<ContactForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState<ManualRegistrationForm>({
    nama: "",
    phone: "",
    alamat: "",
    ssid: "",
    password: "",
    paket: "",
    referral: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const gatewayUrl = waGatewayUrl?.trim() || "http://localhost:3001";
  const apiKey = waApiKey?.trim() || "";

  const loadLeads = async () => {
    setLoading(true);
    try {
      const res = await getChatbotForms(gatewayUrl, apiKey, "registration", 100);
      setLeads(res.data);
    } catch (err: any) {
      pushError(err.message || "Gagal memuat data pendaftaran dari WA");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayUrl, apiKey]);

  const handleResolve = async (lead: ContactForm) => {
    await withFeedback(async () => {
      try {
        await updateChatbotForm(gatewayUrl, apiKey, lead.id, "resolved");
        pushSuccess("Pendaftaran ditandai telah selesai diproses");
        await loadLeads();
      } catch (err: any) {
        pushError(err.message || "Gagal memperbarui status pendaftaran");
      }
    });
  };

  const handleDelete = (id: string) => {
    askForConfirmation({
      title: "Hapus Pendaftaran",
      body: "Apakah Anda yakin ingin menghapus data pendaftaran ini?",
      confirmLabel: "Hapus",
      tone: "danger",
      onConfirm: async () => {
        try {
          await deleteForm(id);
        } catch (err: any) {
          pushError(err.message || "Gagal menghapus pendaftaran");
        }
      },
    });
  };

  const deleteForm = async (id: string) => {
    await deleteChatbotForm(gatewayUrl, apiKey, id);
    pushSuccess("Data pendaftaran berhasil dihapus");
    await loadLeads();
  };

  const handleConvert = (lead: ContactForm) => {
    const d = lead.data || {};
    onConvert({
      name: d.nama || d.name || "",
      whatsapp: lead.phone || "",
      address: d.alamat || d.address || "",
      ssid: d.ssid || d.wifi || "",
      password: d.password || d.wifi_password || "",
      referral: d.referral || d.referral_code || "",
    });
    pushSuccess("Data pendaftaran berhasil dimuat ke formulir pelanggan baru!");
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!manualForm.nama.trim()) errors.nama = "Nama lengkap wajib diisi";
    if (!manualForm.phone.trim()) {
      errors.phone = "Nomor WhatsApp wajib diisi";
    }
    if (!manualForm.alamat.trim()) errors.alamat = "Alamat lengkap wajib diisi";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setManualSubmitting(true);
    try {
      let cleanPhone = manualForm.phone.replace(/[^\d]/g, "");
      if (cleanPhone.startsWith("0")) {
        cleanPhone = "62" + cleanPhone.slice(1);
      } else if (!cleanPhone.startsWith("62")) {
        cleanPhone = "62" + cleanPhone;
      }

      await createChatbotForm(gatewayUrl, apiKey, {
        type: "registration",
        phone: cleanPhone,
        data: {
          nama: manualForm.nama,
          alamat: manualForm.alamat,
          ssid: manualForm.ssid,
          password: manualForm.password,
          paket: manualForm.paket,
          referral: manualForm.referral,
          source: "manual",
        },
      });

      pushSuccess("Pendaftaran manual berhasil ditambahkan!");
      setManualForm({
        nama: "",
        phone: "",
        alamat: "",
        ssid: "",
        password: "",
        paket: "",
        referral: "",
      });
      setFormErrors({});
      setIsManualModalOpen(false);
      await loadLeads();
    } catch (err: any) {
      pushError(err.message || "Gagal menambahkan registrasi manual");
    } finally {
      setManualSubmitting(false);
    }
  };

  const pendingLeads = leads.filter(l => l.status === "pending").length;

  return (
    <section className="flex flex-col gap-6 w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">Registrasi List</h2>
          <p className="text-xs text-slate-500 mt-1">
            Review dan kelola formulir pendaftaran pelanggan baru baik secara mandiri via WhatsApp maupun manual oleh admin.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setManualForm({
                nama: "",
                phone: "",
                alamat: "",
                ssid: "",
                password: "",
                paket: "",
                referral: "",
              });
              setFormErrors({});
              setIsManualModalOpen(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer animate-in"
          >
            <Plus size={14} />
            Tambah Registrasi Manual
          </button>
          <div className="flex gap-2">
            <StatusPill label={`${pendingLeads} Leads Pending`} tone={pendingLeads > 0 ? "gold" : "slate"} />
            <StatusPill label={`${leads.length} Total`} tone="slate" />
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-sans">List Pendaftaran Calon Pelanggan</h3>
          <button
            type="button"
            onClick={() => void loadLeads()}
            disabled={loading}
            className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-semibold"
          >
            {loading ? "Memperbarui..." : "Refresh Data"}
          </button>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm scrollbar-thin">
          <table className="w-full text-left border-collapse text-sm min-w-[1000px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-sans">
              <tr>
                <th className="px-6 py-4 font-semibold">Waktu Masuk</th>
                <th className="px-6 py-4 font-semibold">Nama / WhatsApp</th>
                <th className="px-6 py-4 font-semibold">Alamat</th>
                <th className="px-6 py-4 font-semibold">SSID & Password</th>
                <th className="px-6 py-4 font-semibold">Paket / Ref</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {leads.length === 0 ? (
                <EmptyTableRow message={loading ? "Memuat pendaftaran..." : "Belum ada pendaftaran di database."} colSpan={7} />
              ) : (
                leads.map((lead) => {
                  const d = lead.data || {};
                  const isManual = d.source === "manual";
                  const dateStr = new Date(lead.created_at).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  });
                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 text-xs font-medium text-slate-500 whitespace-nowrap">
                        {dateStr}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-slate-100">{d.nama || d.name || "-"}</span>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                            isManual
                              ? "bg-blue-50 text-blue-700 border border-blue-100"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                          }`}>
                            {isManual ? "Manual" : "WhatsApp"}
                          </span>
                        </div>
                        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-mono">+{lead.phone}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700 dark:text-slate-350 max-w-[200px] break-words">
                        {d.alamat || d.address || "-"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          SSID: <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">{d.ssid || d.wifi || "-"}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Pass: <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">{d.password || d.wifi_password || "-"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {d.paket || d.package_choice || "-"}
                        </div>
                        {d.referral && (
                          <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
                            Ref: {d.referral}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusPill
                          label={lead.status}
                          tone={lead.status === "pending" ? "gold" : "green"}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 justify-center">
                          {lead.status === "pending" && (
                            <>
                              <button
                                type="button"
                                title="Konversi ke Pelanggan"
                                onClick={() => handleConvert(lead)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-2 rounded-lg shadow-sm transition-colors flex items-center gap-1 text-xs cursor-pointer"
                              >
                                <UserPlus size={14} />
                                Konversi
                              </button>
                              <button
                                type="button"
                                title="Tandai Selesai"
                                onClick={() => void handleResolve(lead)}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold p-2 rounded-lg transition-colors cursor-pointer"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            title="Hapus Lead"
                            onClick={() => handleDelete(lead.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-700 font-bold p-2 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Manual Registration Modal */}
      {isManualModalOpen && (
        <Modal
          title="Tambah Registrasi Manual"
          onClose={() => setIsManualModalOpen(false)}
          actions={
            <>
              <button
                type="button"
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors cursor-pointer text-xs"
                onClick={() => setIsManualModalOpen(false)}
                disabled={manualSubmitting}
              >
                Batal
              </button>
              <button
                type="submit"
                form="manual-reg-form"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors cursor-pointer text-xs"
                disabled={manualSubmitting}
              >
                {manualSubmitting ? "Menyimpan..." : "Simpan Pendaftaran"}
              </button>
            </>
          }
        >
          <form id="manual-reg-form" onSubmit={handleManualSubmit} className="space-y-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Nama Lengkap *</span>
              <input
                type="text"
                className={inputClassName(formErrors.nama)}
                value={manualForm.nama}
                onChange={(e) => setManualForm(prev => ({ ...prev, nama: e.target.value }))}
                placeholder="Nama Lengkap Calon Pelanggan"
              />
              {renderInlineError(formErrors.nama)}
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Nomor WhatsApp *</span>
              <input
                type="text"
                className={inputClassName(formErrors.phone)}
                value={manualForm.phone}
                onChange={(e) => setManualForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="Contoh: 08123456789 atau +628123456789"
              />
              {renderInlineError(formErrors.phone)}
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Alamat Lengkap *</span>
              <textarea
                className={inputClassName(formErrors.alamat)}
                rows={2}
                value={manualForm.alamat}
                onChange={(e) => setManualForm(prev => ({ ...prev, alamat: e.target.value }))}
                placeholder="Alamat pemasangan lengkap"
              />
              {renderInlineError(formErrors.alamat)}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">SSID WiFi (Opsional)</span>
                <input
                  type="text"
                  className={inputClassName()}
                  value={manualForm.ssid}
                  onChange={(e) => setManualForm(prev => ({ ...prev, ssid: e.target.value }))}
                  placeholder="Nama WiFi yang diinginkan"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">WiFi Password (Opsional)</span>
                <input
                  type="text"
                  className={inputClassName()}
                  value={manualForm.password}
                  onChange={(e) => setManualForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Password WiFi"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Pilihan Paket Internet (Opsional)</span>
              <select
                className={inputClassName()}
                value={manualForm.paket}
                onChange={(e) => setManualForm(prev => ({ ...prev, paket: e.target.value }))}
              >
                <option value="">Pilih paket internet</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.name}>
                    {pkg.name} ({pkg.speed_mbps} Mbps)
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Referral (Kode / Nama - Opsional)</span>
              <input
                type="text"
                className={inputClassName()}
                value={manualForm.referral}
                onChange={(e) => setManualForm(prev => ({ ...prev, referral: e.target.value }))}
                placeholder="Kode referral atau nama pemberi saran"
              />
            </label>
          </form>
        </Modal>
      )}
    </section>
  );
}
