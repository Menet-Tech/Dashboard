import { useState, useEffect, useMemo, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { StatusPill, EmptyTableRow, inputClassName, renderInlineError } from "../../components/ui";
import { Trash2, CheckCircle2, UserPlus, Plus, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
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
  customers?: any[];
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
    user_pppoe?: string;
    password_pppoe?: string;
    sn_ont?: string;
    odp_id?: string;
    odp_port?: string;
    paket?: string;
    due_day?: number;
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
  user_pppoe: string;
  password_pppoe: string;
  sn_ont: string;
  odp_id: string;
  odp_port: string;
};

export function RegistrationPage({
  waGatewayUrl,
  waApiKey,
  packages = [],
  customers = [],
  pushSuccess,
  pushError,
  withFeedback,
  askForConfirmation,
  onConvert,
}: RegistrationPageProps) {
  const [leads, setLeads] = useState<ContactForm[]>([]);
  const [loading, setLoading] = useState(false);

  const [sortField, setSortField] = useState<string | null>("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const requestSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedLeads = useMemo(() => {
    if (!sortField) return leads;
    return [...leads].sort((a, b) => {
      let aVal: any = null;
      let bVal: any = null;

      if (sortField === "created_at" || sortField === "status") {
        aVal = a[sortField as keyof ContactForm];
        bVal = b[sortField as keyof ContactForm];
      } else {
        // e.g. "name", "address", "ssid", "user_pppoe", "paket"
        aVal = a.data?.[sortField] || "";
        bVal = b.data?.[sortField] || "";
      }

      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";

      const aStr = String(aVal).trim().toLowerCase();
      const bStr = String(bVal).trim().toLowerCase();
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: "base" })
        : bStr.localeCompare(aStr, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [leads, sortField, sortDirection]);

  const renderSortableHeader = (label: string, field: string) => {
    const isSorted = sortField === field;
    return (
      <th 
        className="px-6 py-4 font-semibold select-none cursor-pointer hover:bg-gray-105 dark:hover:bg-slate-805 transition-colors text-slate-500 dark:text-slate-400"
        onClick={() => requestSort(field)}
      >
        <div className="inline-flex items-center gap-1.5">
          <span>{label}</span>
          {isSorted ? (
            sortDirection === "asc" ? (
              <ChevronUp size={12} className="text-indigo-605 dark:text-indigo-400 stroke-[3]" />
            ) : (
              <ChevronDown size={12} className="text-indigo-655 dark:text-indigo-400 stroke-[3]" />
            )
          ) : (
            <ArrowUpDown size={12} className="text-slate-355 dark:text-slate-600 opacity-50 transition-opacity" />
          )}
        </div>
      </th>
    );
  };

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [convertPreview, setConvertPreview] = useState<ContactForm | null>(null);
  const [convertForm, setConvertForm] = useState<{
    name: string;
    whatsapp: string;
    address: string;
    paket: string;
    user_pppoe: string;
    password_pppoe: string;
    sn_ont: string;
    odp_id: string;
    odp_port: string;
    ssid: string;
    password: string;
    referral: string;
    due_day: number;
  }>({
    name: "", whatsapp: "", address: "", paket: "",
    user_pppoe: "", password_pppoe: "", sn_ont: "",
    odp_id: "", odp_port: "", ssid: "", password: "",
    referral: "", due_day: 8,
  });
  const [convertErrors, setConvertErrors] = useState<Record<string, string>>({});
  const [manualForm, setManualForm] = useState<ManualRegistrationForm>({
    nama: "",
    phone: "",
    alamat: "",
    ssid: "",
    password: "",
    paket: "",
    referral: "",
    user_pppoe: "",
    password_pppoe: "",
    sn_ont: "",
    odp_id: "",
    odp_port: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [odps, setOdps] = useState<any[]>([]);

  const gatewayUrl = waGatewayUrl?.trim() || "http://localhost:3001";
  const apiKey = waApiKey?.trim() || "";

  const getOccupiedPortsForOdp = (odpId: string | number) => {
    return customers
      .filter((c) => String(c.odp_id) === String(odpId))
      .map((c) => c.odp_port)
      .filter(Boolean) as number[];
  };

  // Load ODP list for select input
  useEffect(() => {
    fetch("/api/v1/odps", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setOdps(data.data || []))
      .catch((err) => console.error("Gagal memuat ODP", err));
  }, []);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const res = await getChatbotForms(gatewayUrl, apiKey, "registration", 100);
      setLeads(res.data);
    } catch (err: any) {
      pushError(err.message || "Gagal memuat data pendaftaran");
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
    // Auto-generate PPPoE user from name if not provided
    const rawName = d.nama || d.name || "";
    let autoPppoe = d.user_pppoe || "";
    if (!autoPppoe && rawName) {
      autoPppoe = rawName.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 16);
    }
    const autoPass = d.password_pppoe || (autoPppoe ? Math.floor(10000000 + Math.random() * 90000000).toString() : "");

    setConvertForm({
      name: rawName,
      whatsapp: lead.phone || "",
      address: d.alamat || d.address || "",
      paket: d.paket || d.package_choice || "",
      user_pppoe: autoPppoe,
      password_pppoe: autoPass,
      sn_ont: d.sn_ont || "",
      odp_id: d.odp_id || "",
      odp_port: d.odp_port || "",
      ssid: d.ssid || d.wifi || "",
      password: d.password || d.wifi_password || "",
      referral: d.referral || d.referral_code || "",
      due_day: 8,
    });
    setConvertErrors({});
    setConvertPreview(lead);
  };

  const handleConfirmConvert = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!convertPreview) return;

    // Basic validation
    const errs: Record<string, string> = {};
    if (!convertForm.name.trim()) errs.name = "Nama wajib diisi";
    if (!convertForm.user_pppoe.trim()) errs.user_pppoe = "User PPPoE wajib diisi";
    if (!convertForm.password_pppoe.trim()) errs.password_pppoe = "Password PPPoE wajib diisi";
    if (Object.keys(errs).length > 0) { setConvertErrors(errs); return; }

    const lead = convertPreview;

    await withFeedback(async () => {
      try {
        // 1. Save customer directly
        await onConvert({
          name: convertForm.name,
          whatsapp: convertForm.whatsapp,
          address: convertForm.address,
          ssid: convertForm.ssid,
          password: convertForm.password,
          referral: convertForm.referral,
          user_pppoe: convertForm.user_pppoe,
          password_pppoe: convertForm.password_pppoe,
          sn_ont: convertForm.sn_ont,
          odp_id: convertForm.odp_id,
          odp_port: convertForm.odp_port,
          paket: convertForm.paket,
          due_day: convertForm.due_day,
        });

        // 2. Mark lead as resolved
        await updateChatbotForm(gatewayUrl, apiKey, lead.id, "resolved");

        // 3. Reload lead list
        await loadLeads();

        setConvertPreview(null);
        pushSuccess("Pelanggan berhasil ditambahkan!");
      } catch (err: any) {
        pushError(err.message || "Gagal melakukan konversi pelanggan");
      }
    });
  };

  const handleNamaChange = (namaVal: string) => {
    setManualForm((prev) => {
      const next = { ...prev, nama: namaVal };
      if (!prev.user_pppoe) {
        const cleanName = namaVal
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .substring(0, 16);
        if (cleanName) {
          next.user_pppoe = cleanName;
        }
      }
      if (!prev.password_pppoe && next.user_pppoe) {
        next.password_pppoe = Math.floor(10000000 + Math.random() * 90000000).toString();
      }
      return next;
    });
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!manualForm.nama.trim()) errors.nama = "Nama lengkap wajib diisi";
    
    if (!manualForm.phone.trim()) {
      errors.phone = "Nomor WhatsApp wajib diisi";
    } else {
      const cleanPhoneForValidation = manualForm.phone.replace(/[^\d]/g, "");
      if (cleanPhoneForValidation.length < 10 || cleanPhoneForValidation.length > 13) {
        errors.phone = "Nomor WhatsApp harus terdiri dari 10 sampai 13 digit angka";
      }
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
          user_pppoe: manualForm.user_pppoe,
          password_pppoe: manualForm.password_pppoe,
          sn_ont: manualForm.sn_ont,
          odp_id: manualForm.odp_id,
          odp_port: manualForm.odp_port,
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
        user_pppoe: "",
        password_pppoe: "",
        sn_ont: "",
        odp_id: "",
        odp_port: "",
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

  const getOdpName = (id: any) => {
    if (!id) return null;
    const odp = odps.find((o) => String(o.id) === String(id));
    return odp ? odp.nama : `ODP ID ${id}`;
  };

  const pendingLeads = leads.filter(l => l.status === "pending").length;

  return (
    <section className="flex flex-col gap-6 w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 font-sans">Registrasi List</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Review dan kelola formulir pendaftaran pelanggan baru baik secara mandiri via WhatsApp maupun manual oleh admin.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setManualForm({
                nama: "",
                phone: "",
                alamat: "",
                ssid: "",
                password: "",
                paket: "",
                referral: "",
                user_pppoe: "",
                password_pppoe: "",
                sn_ont: "",
                odp_id: "",
                odp_port: "",
              });
              setFormErrors({});
              setIsManualModalOpen(true);
            }}
            className="!py-2 !px-4 animate-in"
          >
            <Plus size={14} />
            Tambah Registrasi Manual
          </Button>
          <div className="flex gap-2">
            <StatusPill label={`${pendingLeads} Leads Pending`} tone={pendingLeads > 0 ? "gold" : "slate"} />
            <StatusPill label={`${leads.length} Total`} tone="slate" />
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm overflow-hidden flex flex-col w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider font-sans">List Pendaftaran Calon Pelanggan</h3>
          <Button
            type="button"
            variant="link"
            onClick={() => void loadLeads()}
            disabled={loading}
            className="!text-xs !font-semibold"
          >
            {loading ? "Memperbarui..." : "Refresh Data"}
          </Button>
        </div>

        <div className="overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-card bg-white dark:bg-slate-900 shadow-sm scrollbar-thin">
          <table className="w-full text-left border-collapse text-sm min-w-[1000px]">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-800 text-gray-500 dark:text-slate-400 font-sans">
              <tr>
                {renderSortableHeader("Waktu Masuk", "created_at")}
                {renderSortableHeader("Nama / WhatsApp", "name")}
                {renderSortableHeader("Alamat", "address")}
                {renderSortableHeader("SSID & Password", "ssid")}
                {renderSortableHeader("PPPoE & Perangkat", "user_pppoe")}
                {renderSortableHeader("Paket / Ref", "paket")}
                {renderSortableHeader("Status", "status")}
                <th className="px-6 py-4 font-semibold text-center text-slate-500 dark:text-slate-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedLeads.length === 0 ? (
                <EmptyTableRow message={loading ? "Memuat pendaftaran..." : "Belum ada pendaftaran di database."} colSpan={8} />
              ) : (
                sortedLeads.map((lead) => {
                  const d = lead.data || {};
                  const isManual = d.source === "manual";
                  const dateStr = new Date(lead.created_at).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  });
                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {dateStr}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span 
                            className="font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 underline decoration-indigo-200/50 underline-offset-4"
                            onClick={() => setSelectedLead(lead)}
                            title="Lihat Detail Registrasi"
                          >
                            {d.nama || d.name || "-"}
                          </span>
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
                      <td className="px-6 py-4 text-slate-700 dark:text-slate-300 dark:text-slate-350 max-w-[200px] break-words">
                        {d.alamat || d.address || "-"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-200">
                          SSID: <span className="font-mono bg-slate-100 dark:bg-slate-850 px-1 rounded">{d.ssid || d.wifi || "-"}</span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Pass: <span className="font-mono bg-slate-100 dark:bg-slate-850 px-1 rounded">{d.password || d.wifi_password || "-"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {d.user_pppoe ? (
                          <>
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-200">
                              PPPoE: <span className="font-mono bg-indigo-50 text-indigo-700 px-1 rounded">{d.user_pppoe}</span>
                            </div>
                            {d.sn_ont && (
                              <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                                SN: {d.sn_ont}
                              </div>
                            )}
                            {d.odp_id && (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                ODP: {getOdpName(d.odp_id)} (Port {d.odp_port || "-"})
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-sans italic">Belum dikonfigurasi</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200">
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
                              <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                title="Konversi ke Pelanggan"
                                onClick={() => handleConvert(lead)}
                                className="!p-2 !gap-1"
                              >
                                <UserPlus size={14} />
                                Konversi
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                title="Tandai Selesai"
                                onClick={() => void handleResolve(lead)}
                                className="!p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-transparent"
                              >
                                <CheckCircle2 size={14} />
                              </Button>
                            </>
                          )}
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            title="Hapus Lead"
                            onClick={() => handleDelete(lead.id)}
                            className="!p-2"
                          >
                            <Trash2 size={14} />
                          </Button>
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsManualModalOpen(false)}
                disabled={manualSubmitting}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant="primary"
                form="manual-reg-form"
                disabled={manualSubmitting}
                isLoading={manualSubmitting}
                loadingText="Menyimpan..."
              >
                Simpan Pendaftaran
              </Button>
            </>
          }
        >
          <form id="manual-reg-form" onSubmit={handleManualSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 scrollbar-thin">
            {/* Section 1: Informasi Pelanggan */}
            <div className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Informasi Utama</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Nama Lengkap *</span>
                  <input
                    type="text"
                    className={inputClassName(formErrors.nama)}
                    value={manualForm.nama}
                    onChange={(e) => handleNamaChange(e.target.value)}
                    placeholder="Nama Lengkap Calon Pelanggan"
                  />
                  {renderInlineError(formErrors.nama)}
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-355">Nomor WhatsApp *</span>
                  <input
                    type="text"
                    className={inputClassName(formErrors.phone)}
                    value={manualForm.phone}
                    onChange={(e) => setManualForm(prev => ({ ...prev, phone: formatWhatsAppNumber(e.target.value) }))}
                    placeholder="contoh: 0812-3456-7890 atau +62 812-3456-7890"
                  />
                  {renderInlineError(formErrors.phone)}
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-355">Alamat Lengkap *</span>
                <textarea
                  className={inputClassName(formErrors.alamat)}
                  rows={2}
                  value={manualForm.alamat}
                  onChange={(e) => setManualForm(prev => ({ ...prev, alamat: e.target.value }))}
                  placeholder="Alamat pemasangan lengkap"
                />
                {renderInlineError(formErrors.alamat)}
              </label>
            </div>

            {/* Section 2: Paket & PPPoE */}
            <div className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Paket & Akun PPPoE</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 col-span-full">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Pilihan Paket Internet</span>
                  <select
                    className={inputClassName()}
                    value={manualForm.paket}
                    onChange={(e) => setManualForm(prev => ({ ...prev, paket: e.target.value }))}
                  >
                    <option value="">Pilih paket internet</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.name}>
                        {pkg.name} ({pkg.speed_mbps === 0 ? "Bypass" : `${pkg.speed_mbps} Mbps`})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">User PPPoE (Otomatis)</span>
                  <input
                    type="text"
                    className={inputClassName()}
                    value={manualForm.user_pppoe}
                    onChange={(e) => setManualForm(prev => ({ ...prev, user_pppoe: e.target.value }))}
                    placeholder="Username PPPoE"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Password PPPoE (Otomatis)</span>
                  <input
                    type="text"
                    className={inputClassName()}
                    value={manualForm.password_pppoe}
                    onChange={(e) => setManualForm(prev => ({ ...prev, password_pppoe: e.target.value }))}
                    placeholder="Password PPPoE"
                  />
                </label>
              </div>
            </div>

            {/* Section 3: ONT & ODP */}
            <div className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Perangkat & ODP</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 col-span-full">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-355">SN ONT (Serial Number)</span>
                  <input
                    type="text"
                    className={inputClassName()}
                    value={manualForm.sn_ont}
                    onChange={(e) => setManualForm(prev => ({ ...prev, sn_ont: e.target.value }))}
                    placeholder="Serial Number ONT"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-355">Titik Distribusi ODP</span>
                  <select
                    className={inputClassName()}
                    value={manualForm.odp_id}
                    onChange={(e) => {
                      const nextOdpId = e.target.value;
                      let firstAvailablePort = "";
                      if (nextOdpId) {
                        const totalPorts = odps.find((o) => String(o.id) === String(nextOdpId))?.ports || 8;
                        const taken = getOccupiedPortsForOdp(nextOdpId);
                        for (let p = 1; p <= totalPorts; p++) {
                          if (!taken.includes(p)) {
                            firstAvailablePort = String(p);
                            break;
                          }
                        }
                      }
                      setManualForm(prev => ({
                        ...prev,
                        odp_id: nextOdpId,
                        odp_port: nextOdpId ? firstAvailablePort : ""
                      }));
                    }}
                  >
                    <option value="">Pilih ODP (Jika ada)</option>
                    {odps.map((odp) => (
                      <option key={odp.id} value={odp.id}>
                        {odp.nama} - {odp.lokasi}
                      </option>
                    ))}
                  </select>
                </label>

                {manualForm.odp_id && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Port ODP</span>
                    <select
                      className={inputClassName()}
                      value={manualForm.odp_port}
                      onChange={(e) => setManualForm(prev => ({ ...prev, odp_port: e.target.value }))}
                    >
                      {Array.from(
                        { length: odps.find((o) => String(o.id) === String(manualForm.odp_id))?.ports || 8 },
                        (_, i) => i + 1
                      )
                        .filter((portNum) => {
                          const taken = getOccupiedPortsForOdp(manualForm.odp_id);
                          return !taken.includes(portNum);
                        })
                        .map((portNum) => (
                          <option key={portNum} value={String(portNum)}>
                            Port {portNum}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            {/* Section 4: WiFi & Referral */}
            <div className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">SSID WiFi & Referral</h4>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">SSID WiFi (Opsional)</span>
                  <input
                    type="text"
                    className={inputClassName()}
                    value={manualForm.ssid}
                    onChange={(e) => setManualForm(prev => ({ ...prev, ssid: e.target.value }))}
                    placeholder="Nama WiFi yang diinginkan"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">WiFi Password (Opsional)</span>
                  <input
                    type="text"
                    className={inputClassName()}
                    value={manualForm.password}
                    onChange={(e) => setManualForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Password WiFi"
                  />
                </label>

                <label className="flex flex-col gap-1 col-span-full">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-355">Referral (Pemberi Saran - Opsional)</span>
                  <input
                    type="text"
                    list="referral-list"
                    className={inputClassName()}
                    value={manualForm.referral}
                    onChange={(e) => setManualForm(prev => ({ ...prev, referral: e.target.value }))}
                    placeholder="Ketik nama atau kode referral untuk mencari..."
                  />
                  <datalist id="referral-list">
                    {customers.map((c) => (
                      <option key={c.id} value={c.referral_code || c.name}>
                        {c.name} {c.referral_code ? `(Ref: ${c.referral_code})` : ""} {c.whatsapp ? `(${c.whatsapp})` : ""}
                      </option>
                    ))}
                  </datalist>
                </label>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Convert Form Modal — full editable form pre-filled from lead */}
      {convertPreview && (
        <Modal
          title="Konversi ke Pelanggan Baru"
          onClose={() => setConvertPreview(null)}
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConvertPreview(null)}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleConfirmConvert()}
              >
                <UserPlus size={13} />
                Simpan & Konversi Pelanggan
              </Button>
            </>
          }
        >
          <form
            id="convert-customer-form"
            onSubmit={handleConfirmConvert}
            className="space-y-4 max-h-[72vh] overflow-y-auto pr-1 scrollbar-thin"
          >
            {/* Info banner */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 text-xs text-indigo-800">
              Data dari pendaftaran WhatsApp sudah diisi otomatis. Lengkapi atau ubah sesuai kebutuhan sebelum menekan simpan.
            </div>

            {/* Section: Identitas */}
            <div className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Identitas Pelanggan</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Nama Lengkap *</span>
                  <input
                    type="text"
                    className={inputClassName(convertErrors.name)}
                    value={convertForm.name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setConvertForm(prev => {
                        const next = { ...prev, name: v };
                        // Auto-fill PPPoE user from name if it hasn't been manually edited
                        const autoPppoe = v.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 16);
                        if (!prev.user_pppoe || prev.user_pppoe === prev.name.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 16)) {
                          next.user_pppoe = autoPppoe;
                        }
                        return next;
                      });
                    }}
                    placeholder="Nama Lengkap"
                  />
                  {renderInlineError(convertErrors.name)}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Nomor WhatsApp</span>
                  <input
                    type="text"
                    className={inputClassName()}
                    value={convertForm.whatsapp}
                    onChange={(e) => setConvertForm(prev => ({ ...prev, whatsapp: e.target.value }))}
                    placeholder="+62 812-3456-7890"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Alamat Pemasangan</span>
                <textarea
                  rows={2}
                  className={inputClassName()}
                  value={convertForm.address}
                  onChange={(e) => setConvertForm(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Alamat lengkap lokasi pemasangan"
                />
              </label>
            </div>

            {/* Section: Paket & PPPoE */}
            <div className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Paket & Akun PPPoE</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 col-span-full">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Pilihan Paket Internet</span>
                  <select
                    className={inputClassName()}
                    value={convertForm.paket}
                    onChange={(e) => setConvertForm(prev => ({ ...prev, paket: e.target.value }))}
                  >
                    <option value="">Pilih paket internet</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.name}>
                        {pkg.name} ({pkg.speed_mbps === 0 ? "Bypass" : `${pkg.speed_mbps} Mbps`})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">User PPPoE *</span>
                  <input
                    type="text"
                    className={inputClassName(convertErrors.user_pppoe)}
                    value={convertForm.user_pppoe}
                    onChange={(e) => setConvertForm(prev => ({ ...prev, user_pppoe: e.target.value }))}
                    placeholder="Username PPPoE"
                  />
                  {renderInlineError(convertErrors.user_pppoe)}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Password PPPoE *</span>
                  <input
                    type="text"
                    className={inputClassName(convertErrors.password_pppoe)}
                    value={convertForm.password_pppoe}
                    onChange={(e) => setConvertForm(prev => ({ ...prev, password_pppoe: e.target.value }))}
                    placeholder="Password PPPoE"
                  />
                  {renderInlineError(convertErrors.password_pppoe)}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Tanggal Jatuh Tempo</span>
                  <input
                    type="number"
                    min={1} max={31}
                    className={inputClassName()}
                    value={convertForm.due_day}
                    onChange={(e) => setConvertForm(prev => ({ ...prev, due_day: Number(e.target.value) }))}
                  />
                </label>
              </div>
            </div>

            {/* Section: Perangkat & ODP */}
            <div className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Perangkat & ODP</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 col-span-full">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">SN ONT (Serial Number)</span>
                  <input
                    type="text"
                    className={inputClassName()}
                    value={convertForm.sn_ont}
                    onChange={(e) => setConvertForm(prev => ({ ...prev, sn_ont: e.target.value }))}
                    placeholder="Serial Number ONT"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Titik Distribusi ODP</span>
                  <select
                    className={inputClassName()}
                    value={convertForm.odp_id}
                    onChange={(e) => {
                      const nextOdpId = e.target.value;
                      let firstAvailablePort = "";
                      if (nextOdpId) {
                        const totalPorts = odps.find((o) => String(o.id) === String(nextOdpId))?.ports || 8;
                        const taken = getOccupiedPortsForOdp(nextOdpId);
                        for (let p = 1; p <= totalPorts; p++) {
                          if (!taken.includes(p)) {
                            firstAvailablePort = String(p);
                            break;
                          }
                        }
                      }
                      setConvertForm(prev => ({
                        ...prev,
                        odp_id: nextOdpId,
                        odp_port: nextOdpId ? firstAvailablePort : ""
                      }));
                    }}
                  >
                    <option value="">Pilih ODP (Jika ada)</option>
                    {odps.map((odp) => (
                      <option key={odp.id} value={odp.id}>
                        {odp.nama} - {odp.lokasi}
                      </option>
                    ))}
                  </select>
                </label>
                {convertForm.odp_id && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Port ODP</span>
                    <select
                      className={inputClassName()}
                      value={convertForm.odp_port}
                      onChange={(e) => setConvertForm(prev => ({ ...prev, odp_port: e.target.value }))}
                    >
                      {Array.from(
                        { length: odps.find(o => String(o.id) === String(convertForm.odp_id))?.ports || 8 },
                        (_, i) => i + 1
                      )
                        .filter((portNum) => {
                          const taken = getOccupiedPortsForOdp(convertForm.odp_id);
                          return !taken.includes(portNum);
                        })
                        .map(p => (
                          <option key={p} value={String(p)}>Port {p}</option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            {/* Section: WiFi & Referral */}
            <div className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">WiFi & Referral</h4>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">SSID WiFi (Opsional)</span>
                  <input
                    type="text"
                    className={inputClassName()}
                    value={convertForm.ssid}
                    onChange={(e) => setConvertForm(prev => ({ ...prev, ssid: e.target.value }))}
                    placeholder="Nama WiFi"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Password WiFi (Opsional)</span>
                  <input
                    type="text"
                    className={inputClassName()}
                    value={convertForm.password}
                    onChange={(e) => setConvertForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Password WiFi"
                  />
                </label>
                <label className="flex flex-col gap-1 col-span-full">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Referral (Opsional)</span>
                  <input
                    type="text"
                    list="convert-referral-list"
                    className={inputClassName()}
                    value={convertForm.referral}
                    onChange={(e) => setConvertForm(prev => ({ ...prev, referral: e.target.value }))}
                    placeholder="Nama atau kode referral"
                  />
                  <datalist id="convert-referral-list">
                    {customers.map((c) => (
                      <option key={c.id} value={c.referral_code || c.name}>
                        {c.name} {c.referral_code ? `(Ref: ${c.referral_code})` : ""}
                      </option>
                    ))}
                  </datalist>
                </label>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {selectedLead && (
        <Modal 
          onClose={() => setSelectedLead(null)}
          title="Detail Registrasi"
        >
          <div className="p-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">
              Data Registrasi - {selectedLead.data?.nama || selectedLead.data?.name || selectedLead.phone}
            </h3>
            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 overflow-x-auto">
              <pre className="text-xs font-mono text-slate-700 dark:text-slate-300">
                {JSON.stringify(selectedLead.data, null, 2)}
              </pre>
            </div>
            <div className="mt-6 flex justify-end">
              <Button type="button" onClick={() => setSelectedLead(null)} variant="secondary">
                Tutup
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function formatWhatsAppNumber(val: string): string {
  let clean = val.replace(/[^\d+]/g, "");
  
  if (clean.startsWith("+62")) {
    clean = "62" + clean.slice(3);
  }
  
  if (/^[89]/.test(clean)) {
    clean = "0" + clean;
  }

  if (clean.startsWith("62")) {
    const rest = clean.slice(2).replace(/\D/g, "");
    let formatted = "+62";
    if (rest.length > 0) {
      formatted += " ";
      if (rest.length <= 3) {
        formatted += rest;
      } else if (rest.length <= 7) {
        formatted += `${rest.slice(0, 3)}-${rest.slice(3)}`;
      } else {
        formatted += `${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7, 12)}`;
      }
    }
    return formatted;
  } else if (clean.startsWith("0")) {
    const rest = clean.slice(1).replace(/\D/g, "");
    let formatted = "0";
    if (rest.length > 0) {
      if (rest.length <= 3) {
        formatted += rest;
      } else if (rest.length <= 7) {
        formatted += `${rest.slice(0, 3)}-${rest.slice(3)}`;
      } else {
        formatted += `${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7, 12)}`;
      }
    }
    return formatted;
  }
  return clean;
}
