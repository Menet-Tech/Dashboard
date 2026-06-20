import { useState, useEffect } from "react";
import { StatusPill, EmptyTableRow } from "../../components/ui";
import { Trash2, CheckCircle2, UserPlus, AlertCircle } from "lucide-react";
import type { ConfirmDialogState } from "../../hooks/types";
import type { ContactForm } from "../../lib/gatewayApi";
import { getChatbotForms, updateChatbotForm, deleteChatbotForm } from "../../lib/gatewayApi";

type RegistrationPageProps = {
  waGatewayUrl?: string;
  waAccountId?: string;
  waApiKey?: string;
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

export function RegistrationPage({
  waGatewayUrl,
  waApiKey,
  pushSuccess,
  pushError,
  withFeedback,
  askForConfirmation,
  onConvert,
}: RegistrationPageProps) {
  const [leads, setLeads] = useState<ContactForm[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLeads = async () => {
    if (!waGatewayUrl || !waApiKey) return;
    setLoading(true);
    try {
      const res = await getChatbotForms(waGatewayUrl, waApiKey, "registration", 100);
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
  }, [waGatewayUrl, waApiKey]);

  const handleResolve = async (lead: ContactForm) => {
    if (!waGatewayUrl || !waApiKey) return;
    await withFeedback(async () => {
      try {
        await updateChatbotForm(waGatewayUrl, waApiKey, lead.id, "resolved");
        pushSuccess("Pendaftaran ditandai telah selesai diproses");
        await loadLeads();
      } catch (err: any) {
        pushError(err.message || "Gagal memperbarui status pendaftaran");
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!waGatewayUrl || !waApiKey) return;
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
    if (!waGatewayUrl || !waApiKey) return;
    await deleteChatbotForm(waGatewayUrl, waApiKey, id);
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

  if (!waGatewayUrl || !waApiKey) {
    return (
      <section className="w-full p-6">
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-2xl p-6 text-center max-w-xl mx-auto">
          <AlertCircle className="w-12 h-12 text-amber-600 dark:text-amber-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-amber-900 dark:text-amber-300">WhatsApp Gateway Belum Terkonfigurasi</h3>
          <p className="text-xs text-amber-700 dark:text-amber-500 mt-2">
            Silakan lengkapi URL WhatsApp Gateway dan API Key di menu Pengaturan terlebih dahulu untuk melihat pendaftaran dari WA.
          </p>
        </div>
      </section>
    );
  }

  const pendingLeads = leads.filter(l => l.status === "pending").length;

  return (
    <section className="flex flex-col gap-6 w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">Registrasi WA</h2>
          <p className="text-xs text-slate-500 mt-1">
            Review dan kelola formulir pendaftaran mandiri pelanggan baru yang dikirimkan melalui chatbot WhatsApp.
          </p>
        </div>
        <div className="flex gap-2">
          <StatusPill label={`${pendingLeads} Leads Pending`} tone={pendingLeads > 0 ? "gold" : "slate"} />
          <StatusPill label={`${leads.length} Total`} tone="slate" />
        </div>
      </div>

      {/* Leads Table */}
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-sans">Pendaftaran Chatbot WA</h3>
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
                <EmptyTableRow message={loading ? "Memuat pendaftaran..." : "Belum ada pendaftaran melalui chatbot WA."} colSpan={7} />
              ) : (
                leads.map((lead) => {
                  const d = lead.data || {};
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
                        <div className="font-bold text-slate-900 dark:text-slate-100">{d.nama || d.name || "-"}</div>
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
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-2 rounded-lg shadow-sm transition-colors flex items-center gap-1 text-xs"
                              >
                                <UserPlus size={14} />
                                Konversi
                              </button>
                              <button
                                type="button"
                                title="Tandai Selesai"
                                onClick={() => void handleResolve(lead)}
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold p-2 rounded-lg transition-colors"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            title="Hapus Lead"
                            onClick={() => handleDelete(lead.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-700 font-bold p-2 rounded-lg transition-colors"
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
    </section>
  );
}
