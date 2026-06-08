import { useState, useEffect, useCallback, type FormEvent } from "react";
import { inputClassName, renderInlineError } from "../../components/ui";
import type { FieldErrors } from "../../utils/validation";
import type { SettingsState, MikrotikSyncSecret, MikrotikImportResult } from "../../types";
import { getGatewayAccounts } from "../../lib/gatewayApi";
import { apiRequest } from "../../lib/api";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  Sliders,
  MessageCircle,
  Bell,
  Server,
  Wifi,
  Bot
} from "lucide-react";

type SettingsPageProps = {
  settingsForm: SettingsState;
  settingsErrors: FieldErrors;
  submitting: boolean;
  busyAction: string | null;
  onFormChange: (form: SettingsState) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
};

export function SettingsPage({
  settingsForm,
  settingsErrors,
  submitting,
  busyAction,
  onFormChange,
  onSubmit,
  pushSuccess,
  pushError,
}: SettingsPageProps) {
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;

  const gatewayUrl = settingsForm.wa_gateway_url || "http://localhost:3001";
  const apiKey = settingsForm.wa_api_key || "";
  const [accounts, setAccounts] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState<"whatsapp" | "billing" | "mikrotik" | "genieacs" | "discord">("whatsapp");

  const tabs = [
    { id: "whatsapp", label: "WhatsApp & Bot", icon: MessageCircle, desc: "Gateway & Chatbot Triggers" },
    { id: "billing", label: "Billing & Worker", icon: Sliders, desc: "Automation & Backup Rules" },
    { id: "mikrotik", label: "MikroTik Router", icon: Server, desc: "Router Setup & Secret Sync" },
    { id: "genieacs", label: "GenieACS TR-069", icon: Wifi, desc: "TR-069 ONT Management" },
    { id: "discord", label: "Discord Alerts", icon: Bell, desc: "Real-time Event Webhooks" },
  ];

  // Connection test states
  const [testingWa, setTestingWa] = useState(false);
  const [waResult, setWaResult] = useState<{ success: boolean; message: string } | null>(null);

  const [testingDiscord, setTestingDiscord] = useState(false);
  const [discordResult, setDiscordResult] = useState<{ success: boolean; message: string } | null>(null);

  const [testingMikrotik, setTestingMikrotik] = useState(false);
  const [mikrotikResult, setMikrotikResult] = useState<{ success: boolean; message: string } | null>(null);

  const [testingAcs, setTestingAcs] = useState(false);
  const [acsResult, setAcsResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestWhatsApp = async () => {
    setTestingWa(true);
    setWaResult(null);
    try {
      const data = await apiRequest<{ success: boolean; message: string }>("/api/v1/integration/test-whatsapp", {
        method: "POST",
        body: JSON.stringify({
          gateway_url: settingsForm.wa_gateway_url || "http://localhost:3001",
          api_key: settingsForm.wa_api_key || "",
          account_id: settingsForm.wa_account_id || "default",
        }),
      });
      setWaResult({ success: data.success, message: data.message });
      if (data.success) {
        pushSuccess("Test WhatsApp Gateway berhasil!");
      } else {
        pushError(data.message || "WhatsApp Gateway tidak merespon.");
      }
    } catch (e: any) {
      setWaResult({ success: false, message: e.message || String(e) });
      pushError(e.message || String(e));
    } finally {
      setTestingWa(false);
    }
  };

  const handleTestDiscord = async () => {
    setTestingDiscord(true);
    setDiscordResult(null);
    try {
      const data = await apiRequest<{ success: boolean; message: string }>("/api/v1/integration/test-discord", {
        method: "POST",
        body: JSON.stringify({
          webhook_url: settingsForm.discord_webhook_url || "",
        }),
      });
      setDiscordResult({ success: data.success, message: data.message });
      if (data.success) {
        pushSuccess("Test Discord Webhook berhasil!");
      } else {
        pushError(data.message || "Discord Webhook tidak merespon.");
      }
    } catch (e: any) {
      setDiscordResult({ success: false, message: e.message || String(e) });
      pushError(e.message || String(e));
    } finally {
      setTestingDiscord(false);
    }
  };

  const handleTestMikrotik = async () => {
    setTestingMikrotik(true);
    setMikrotikResult(null);
    try {
      const data = await apiRequest<{ success: boolean; message: string }>("/api/v1/integration/test-mikrotik", {
        method: "POST",
        body: JSON.stringify({
          host: settingsForm.mikrotik_host || "",
          username: settingsForm.mikrotik_user || "",
          password: settingsForm.mikrotik_pass || "",
        }),
      });
      setMikrotikResult({ success: data.success, message: data.message });
      if (data.success) {
        pushSuccess("Test MikroTik berhasil!");
      } else {
        pushError(data.message || "MikroTik tidak merespon.");
      }
    } catch (e: any) {
      setMikrotikResult({ success: false, message: e.message || String(e) });
      pushError(e.message || String(e));
    } finally {
      setTestingMikrotik(false);
    }
  };

  const handleTestGenieACS = async () => {
    setTestingAcs(true);
    setAcsResult(null);
    try {
      const data = await apiRequest<{ success: boolean; message: string }>("/api/v1/integration/test-genieacs", {
        method: "POST",
        body: JSON.stringify({
          url: settingsForm.acs_url || "http://localhost:7557",
          username: settingsForm.acs_username || "",
          password: settingsForm.acs_password || "",
        }),
      });
      setAcsResult({ success: data.success, message: data.message });
      if (data.success) {
        pushSuccess("Test GenieACS berhasil!");
      } else {
        pushError(data.message || "GenieACS tidak merespon.");
      }
    } catch (e: any) {
      setAcsResult({ success: false, message: e.message || String(e) });
      pushError(e.message || String(e));
    } finally {
      setTestingAcs(false);
    }
  };

  // MikroTik sync state
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncSecrets, setSyncSecrets] = useState<MikrotikSyncSecret[] | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importDueDay, setImportDueDay] = useState(1);
  const [importLoading, setImportLoading] = useState(false);
  const [importResults, setImportResults] = useState<MikrotikImportResult[] | null>(null);

  const handleSyncPreview = useCallback(async () => {
    setSyncLoading(true);
    setSyncError(null);
    setSyncSecrets(null);
    setSelected(new Set());
    setImportResults(null);
    try {
      const data = await apiRequest<{ secrets: MikrotikSyncSecret[] }>("/api/v1/integration/mikrotik/sync-preview");
      setSyncSecrets(data.secrets || []);
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncLoading(false);
    }
  }, []);

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    if (!syncSecrets) return;
    const newOnes = syncSecrets.filter((s) => !s.exists).map((s) => s.name);
    if (selected.size === newOnes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(newOnes));
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImportLoading(true);
    setImportResults(null);
    try {
      const data = await apiRequest<{ results: MikrotikImportResult[] }>("/api/v1/integration/mikrotik/sync-import", {
        method: "POST",
        body: JSON.stringify({ names: Array.from(selected), default_due_day: importDueDay }),
      });
      setImportResults(data.results);
      // refresh preview
      void handleSyncPreview();
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportLoading(false);
    }
  };

  useEffect(() => {
    if (!gatewayUrl || !apiKey) return;
    let active = true;
    async function load() {
      try {
        const res = await getGatewayAccounts(gatewayUrl, apiKey);
        if (active) {
          setAccounts(res.data.map((a) => a.accountId));
        }
      } catch (e) {
        // ignore
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [gatewayUrl, apiKey]);

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {/* Header Info */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sliders className="text-indigo-600" size={24} />
            Pengaturan Sistem
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
            Konfigurasi WhatsApp Gateway, Discord Webhook, Billing Rules, Integrasi Router MikroTik & TR-069 GenieACS, serta Chatbot Triggers.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="submit"
            disabled={submitting}
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold py-2.5 px-6 rounded-xl shadow-md hover:shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isBusy("save-settings") ? <Loader2 size={14} className="animate-spin" /> : null}
            {isBusy("save-settings") ? "Menyimpan..." : "Simpan Semua Pengaturan"}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <nav className="flex flex-wrap gap-2 p-1.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200/50 dark:border-slate-800/60 rounded-2xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 min-w-[150px] flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer ${
                isActive
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/60 dark:border-slate-800 font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-900/50 font-semibold"
              }`}
            >
              <Icon size={18} className={isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"} />
              <div className="text-left">
                <span className="block text-xs leading-none">{tab.label}</span>
                <span className="block text-[9px] font-normal text-slate-400 dark:text-slate-500 mt-1">{tab.desc}</span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Tab Contents */}
      <div className="space-y-6">
        
        {/* Tab 1: WhatsApp & Bot */}
        {activeTab === "whatsapp" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in duration-200">
            {/* Card 1: WhatsApp Gateway */}
            <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                    <MessageCircle size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">WhatsApp Gateway</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Hubungkan dashboard Go dengan gateway WhatsApp JS.</p>
                  </div>
                </div>

                {/* Status info card */}
                <div className="bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl p-4 flex items-start gap-3">
                  <div className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full p-2 mt-0.5 shrink-0">
                    <MessageCircle size={14} />
                  </div>
                  <div className="text-xs">
                    <p className="font-semibold text-emerald-800 dark:text-emerald-355">Gateway Terintegrasi</p>
                    <p className="text-emerald-700 dark:text-emerald-400/80 mt-0.5 leading-relaxed">
                      WhatsApp Gateway berjalan sebagai service JS terpisah. Default lokal: <code className="bg-emerald-100/60 dark:bg-emerald-900/50 px-1 rounded font-mono">http://localhost:3001</code>.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5 col-span-full">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Gateway URL</span>
                    <input
                      className={inputClassName(settingsErrors.wa_gateway_url)}
                      type="text"
                      value={settingsForm["wa_gateway_url"] ?? "http://localhost:3001"}
                      onChange={(e) => onFormChange({ ...settingsForm, wa_gateway_url: e.target.value })}
                      placeholder="http://localhost:3001"
                    />
                    {renderInlineError(settingsErrors.wa_gateway_url)}
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">URL gateway API untuk notifikasi otomatis.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Default Account ID</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["wa_account_id"] ?? "default"}
                      onChange={(e) => onFormChange({ ...settingsForm, wa_account_id: e.target.value })}
                    >
                      {!accounts.includes("default") && (
                        <option value="default">default</option>
                      )}
                      {accounts.map((acc) => (
                        <option key={acc} value={acc}>
                          {acc}
                        </option>
                      ))}
                      {settingsForm["wa_account_id"] &&
                        settingsForm["wa_account_id"] !== "default" &&
                        !accounts.includes(settingsForm["wa_account_id"]) && (
                          <option value={settingsForm["wa_account_id"]}>
                            {settingsForm["wa_account_id"]} (Tidak aktif)
                          </option>
                        )}
                    </select>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Akun notifikasi default.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Akun Generate/Billing</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["wa_billing_account_id"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, wa_billing_account_id: e.target.value })}
                    >
                      <option value="">Ikut default</option>
                      {accounts.map((acc) => (
                        <option key={acc} value={acc}>
                          {acc}
                        </option>
                      ))}
                      {settingsForm["wa_billing_account_id"] &&
                        !accounts.includes(settingsForm["wa_billing_account_id"]) && (
                          <option value={settingsForm["wa_billing_account_id"]}>
                            {settingsForm["wa_billing_account_id"]} (Tidak aktif)
                          </option>
                        )}
                    </select>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Pengiriman tagihan bulanan.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Akun Reminder</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["wa_reminder_account_id"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, wa_reminder_account_id: e.target.value })}
                    >
                      <option value="">Ikut default</option>
                      {accounts.map((acc) => (
                        <option key={acc} value={acc}>
                          {acc}
                        </option>
                      ))}
                      {settingsForm["wa_reminder_account_id"] &&
                        !accounts.includes(settingsForm["wa_reminder_account_id"]) && (
                          <option value={settingsForm["wa_reminder_account_id"]}>
                            {settingsForm["wa_reminder_account_id"]} (Tidak aktif)
                          </option>
                        )}
                    </select>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Pesan pengingat bayar.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Akun Jatuh Tempo / Trial</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["wa_due_account_id"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, wa_due_account_id: e.target.value })}
                    >
                      <option value="">Ikut default</option>
                      {accounts.map((acc) => (
                        <option key={acc} value={acc}>
                          {acc}
                        </option>
                      ))}
                      {settingsForm["wa_due_account_id"] &&
                        !accounts.includes(settingsForm["wa_due_account_id"]) && (
                          <option value={settingsForm["wa_due_account_id"]}>
                            {settingsForm["wa_due_account_id"]} (Tidak aktif)
                          </option>
                        )}
                    </select>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Notifikasi jatuh tempo.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Akun Limit / Isolir</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["wa_limit_account_id"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, wa_limit_account_id: e.target.value })}
                    >
                      <option value="">Ikut default</option>
                      {accounts.map((acc) => (
                        <option key={acc} value={acc}>
                          {acc}
                        </option>
                      ))}
                      {settingsForm["wa_limit_account_id"] &&
                        !accounts.includes(settingsForm["wa_limit_account_id"]) && (
                          <option value={settingsForm["wa_limit_account_id"]}>
                            {settingsForm["wa_limit_account_id"]} (Tidak aktif)
                          </option>
                        )}
                    </select>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Notifikasi isolir PPPoE.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Akun Pembayaran Lunas</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["wa_payment_account_id"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, wa_payment_account_id: e.target.value })}
                    >
                      <option value="">Ikut default</option>
                      {accounts.map((acc) => (
                        <option key={acc} value={acc}>
                          {acc}
                        </option>
                      ))}
                      {settingsForm["wa_payment_account_id"] &&
                        !accounts.includes(settingsForm["wa_payment_account_id"]) && (
                          <option value={settingsForm["wa_payment_account_id"]}>
                            {settingsForm["wa_payment_account_id"]} (Tidak aktif)
                          </option>
                        )}
                    </select>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Kwitansi & konfirmasi bayar.</span>
                  </label>

                  <label className="flex flex-col gap-1.5 col-span-full">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Internal API Key</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["wa_api_key"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, wa_api_key: e.target.value })}
                      placeholder="Harus sama dengan DASHBOARD_INTERNAL_API_KEY di .env"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      Untuk autentikasi backend ke gateway. Simpan sebagai <code>DASHBOARD_INTERNAL_API_KEY</code> di file env backend.
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-805 rounded-2xl p-4 mt-auto">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Uji kredensial/koneksi WhatsApp Gateway.</span>
                <div className="flex items-center gap-2">
                  {waResult && (
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                      waResult.success ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-455 dark:border-emerald-900/60" : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-455 dark:border-rose-900/60"
                    }`}>
                      {waResult.success ? "Sukses" : "Gagal"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleTestWhatsApp}
                    disabled={testingWa}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {testingWa ? <Loader2 size={12} className="animate-spin" /> : null}
                    {testingWa ? "Menguji..." : "Test Koneksi"}
                  </button>
                </div>
              </div>
            </article>

            {/* Card 6: Chatbot Triggers (WhatsApp) */}
            <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <Bot size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Chatbot Triggers (WhatsApp)</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Konfigurasi kata kunci interaktif bot otomatis di aplikasi WA gateway.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Trigger Cek Tagihan</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["chatbot_trigger_billing"] ?? "1"}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, chatbot_trigger_billing: e.target.value })
                      }
                      placeholder="1, tagihan, cek tagihan"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Cek status tagihan bulanan (pisahkan koma).</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Trigger Registrasi</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["chatbot_trigger_register"] ?? "1"}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, chatbot_trigger_register: e.target.value })
                      }
                      placeholder="1, daftar, registrasi"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Pendaftaran pelanggan baru mandiri.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Trigger Lapor Kendala (Support)</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["chatbot_trigger_support"] ?? "2"}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, chatbot_trigger_support: e.target.value })
                      }
                      placeholder="2, kendala, bantuan"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Pelaporan problem teknis untuk tiket support.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Trigger Daftar Paket</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["chatbot_trigger_packages"] ?? "3"}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, chatbot_trigger_packages: e.target.value })
                      }
                      placeholder="3, paket"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Melihat daftar paket internet yang tersedia.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Trigger Pertanyaan Umum (FAQ)</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["chatbot_trigger_faq"] ?? "4"}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, chatbot_trigger_faq: e.target.value })
                      }
                      placeholder="4, faq, tanya"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Melihat daftar FAQ / tanya jawab.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Trigger Hubungi Admin</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["chatbot_trigger_admin"] ?? "5"}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, chatbot_trigger_admin: e.target.value })
                      }
                      placeholder="5, admin, chat"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Menghubungkan langsung ke CS / admin manusia.</span>
                  </label>
                </div>
              </div>
            </article>
          </div>
        )}

        {/* Tab 2: Billing & Alerts */}
        {activeTab === "billing" && (
          <div className="grid grid-cols-1 gap-6 animate-in fade-in duration-200">
            {/* Card 3: Billing Rules & Worker */}
            <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <Sliders size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Billing Rules & Automation</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Konfigurasi parameter tagihan otomatis, scheduler backup & retensi.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Subsection A: Billing Intervals */}
                  <div className="space-y-4 md:border-r md:border-slate-100 md:dark:border-slate-800/80 md:pr-6">
                    <h4 className="text-xs font-bold text-indigo-650 dark:text-indigo-400 uppercase tracking-wider">Tenggat Waktu Billing</h4>
                    
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Reminder Days</span>
                      <input
                        className={inputClassName()}
                        type="number"
                        value={settingsForm["billing_reminder_days"] ?? "3"}
                        onChange={(e) =>
                          onFormChange({ ...settingsForm, billing_reminder_days: e.target.value })
                        }
                      />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Hari sebelum jatuh tempo untuk kirim WA pengingat.</span>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Limit Days</span>
                      <input
                        className={inputClassName()}
                        type="number"
                        value={settingsForm["billing_limit_days"] ?? "5"}
                        onChange={(e) => onFormChange({ ...settingsForm, billing_limit_days: e.target.value })}
                      />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Toleransi batas bayar sebelum isolir router.</span>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Menunggak Days</span>
                      <input
                        className={inputClassName()}
                        type="number"
                        value={settingsForm["billing_menunggak_days"] ?? "30"}
                        onChange={(e) =>
                          onFormChange({ ...settingsForm, billing_menunggak_days: e.target.value })
                        }
                      />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Batas hari untuk mengubah status tagihan menunggak.</span>
                    </label>
                  </div>

                  {/* Subsection B: Automation Scheduler */}
                  <div className="space-y-4 md:border-r md:border-slate-100 md:dark:border-slate-800/80 md:px-6">
                    <h4 className="text-xs font-bold text-indigo-650 dark:text-indigo-400 uppercase tracking-wider">Scheduler Otomatisasi</h4>
                    
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Auto Generate Tagihan</span>
                      <select
                        className={inputClassName()}
                        value={settingsForm["billing_auto_generate_enabled"] ?? "1"}
                        onChange={(e) =>
                          onFormChange({ ...settingsForm, billing_auto_generate_enabled: e.target.value })
                        }
                      >
                        <option value="1">Aktif</option>
                        <option value="0">Nonaktif</option>
                      </select>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Status generator tagihan massal otomatis.</span>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Tanggal Generate Bulanan</span>
                      <input
                        className={inputClassName(settingsErrors.billing_generate_day)}
                        type="number"
                        min="1"
                        max="28"
                        value={settingsForm["billing_generate_day"] ?? "1"}
                        onChange={(e) =>
                          onFormChange({ ...settingsForm, billing_generate_day: e.target.value })
                        }
                      />
                      {renderInlineError(settingsErrors.billing_generate_day)}
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Tanggal generator billing berjalan (1-28).</span>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Jam Generate Bulanan</span>
                      <input
                        className={inputClassName(settingsErrors.billing_generate_time)}
                        type="time"
                        value={settingsForm["billing_generate_time"] ?? "00:05"}
                        onChange={(e) =>
                          onFormChange({ ...settingsForm, billing_generate_time: e.target.value })
                        }
                      />
                      {renderInlineError(settingsErrors.billing_generate_time)}
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Format waktu generator billing berjalan.</span>
                    </label>
                  </div>

                  {/* Subsection C: Worker & Auto Backup */}
                  <div className="space-y-4 md:pl-6">
                    <h4 className="text-xs font-bold text-indigo-650 dark:text-indigo-400 uppercase tracking-wider">Worker & Backup Sistem</h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Retry Attempts</span>
                        <input
                          className={inputClassName()}
                          type="number"
                          min="1"
                          max="10"
                          value={settingsForm["billing_generate_retry_attempts"] ?? "3"}
                          onChange={(e) =>
                            onFormChange({ ...settingsForm, billing_generate_retry_attempts: e.target.value })
                          }
                        />
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">Jumlah percobaan ulang tagihan WA.</span>
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Backoff (Detik)</span>
                        <input
                          className={inputClassName()}
                          type="number"
                          min="0"
                          max="60"
                          value={settingsForm["billing_generate_retry_backoff_seconds"] ?? "2"}
                          onChange={(e) =>
                            onFormChange({
                              ...settingsForm,
                              billing_generate_retry_backoff_seconds: e.target.value,
                            })
                          }
                        />
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">Jeda antar-percobaan retry.</span>
                      </label>
                    </div>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Worker Interval (Detik)</span>
                      <input
                        className={inputClassName(settingsErrors.worker_interval_seconds)}
                        type="number"
                        value={settingsForm["worker_interval_seconds"] ?? "60"}
                        onChange={(e) =>
                          onFormChange({ ...settingsForm, worker_interval_seconds: e.target.value })
                        }
                      />
                      {renderInlineError(settingsErrors.worker_interval_seconds)}
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Looping background worker utama.</span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Auto Backup</span>
                        <select
                          className={inputClassName()}
                          value={settingsForm["backup_auto_enabled"] ?? "1"}
                          onChange={(e) =>
                            onFormChange({ ...settingsForm, backup_auto_enabled: e.target.value })
                          }
                        >
                          <option value="1">Aktif</option>
                          <option value="0">Nonaktif</option>
                        </select>
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Jadwal Backup</span>
                        <input
                          className={inputClassName()}
                          type="time"
                          value={settingsForm["backup_auto_time"] ?? "02:00"}
                          onChange={(e) => onFormChange({ ...settingsForm, backup_auto_time: e.target.value })}
                        />
                      </label>
                    </div>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Retensi Backup</span>
                      <input
                        className={inputClassName()}
                        type="number"
                        min="1"
                        value={settingsForm["backup_retention_count"] ?? "7"}
                        onChange={(e) =>
                          onFormChange({ ...settingsForm, backup_retention_count: e.target.value })
                        }
                      />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Jumlah file backup tersimpan sebelum diganti.</span>
                    </label>
                  </div>
                </div>
              </div>
            </article>
          </div>
        )}

        {/* Tab 3: MikroTik Router */}
        {activeTab === "mikrotik" && (
          <div className="grid grid-cols-1 gap-6 animate-in fade-in duration-200">
            {/* Card 4: MikroTik Router Integration */}
            <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <Server size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">MikroTik Integration</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Integrasi router MikroTik via API untuk isolir PPPoE otomatis.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5 col-span-full">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Host Router</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["mikrotik_host"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, mikrotik_host: e.target.value })}
                      placeholder="192.168.88.1"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Alamat IP / Domain router MikroTik (dilengkapi port API jika tidak standar).</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Username Router</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["mikrotik_user"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, mikrotik_user: e.target.value })}
                      placeholder="admin"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Kredensial dengan hak akses write API.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Password Router</span>
                    <input
                      className={inputClassName()}
                      type="password"
                      value={settingsForm["mikrotik_pass"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, mikrotik_pass: e.target.value })}
                      placeholder="••••••••"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Password untuk akun API MikroTik.</span>
                  </label>

                  <label className="flex flex-col gap-1.5 col-span-full">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Username PPPoE Test</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["mikrotik_test_username"] ?? ""}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, mikrotik_test_username: e.target.value })
                      }
                      placeholder="test-user"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Nama PPPoE secret yang digunakan saat tombol test diklik.</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-805 rounded-2xl p-4 mt-auto">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Uji kredensial/koneksi router MikroTik.</span>
                <div className="flex items-center gap-2">
                  {mikrotikResult && (
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                      mikrotikResult.success ? "bg-emerald-50 text-emerald-700 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-455 dark:border-emerald-900/60" : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-455 dark:border-rose-900/60"
                    }`}>
                      {mikrotikResult.success ? "Sukses" : "Gagal"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleTestMikrotik}
                    disabled={testingMikrotik}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {testingMikrotik ? <Loader2 size={12} className="animate-spin" /> : null}
                    {testingMikrotik ? "Menguji..." : "Test Koneksi"}
                  </button>
                </div>
              </div>
            </article>

            {/* MikroTik Sync Panel (Full Width) */}
            <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <RefreshCw size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Sinkronisasi Pelanggan dari MikroTik</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Tarik daftar PPPoE secret dari router dan import yang belum terdaftar di dashboard.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSyncPreview}
                  disabled={syncLoading}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm cursor-pointer"
                >
                  {syncLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {syncLoading ? "Memuat..." : "Preview Secrets"}
                </button>
              </div>

              {syncError && (
                <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-955/20 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400 text-xs rounded-xl px-4 py-3">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{syncError}</span>
                </div>
              )}

              {syncSecrets !== null && (
                <div className="space-y-4 animate-in">
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{syncSecrets.length}</span> secret ditemukan &bull;{" "}
                      <span className="font-bold text-emerald-600 dark:text-emerald-455">{syncSecrets.filter((s) => !s.exists).length}</span> belum di dashboard
                    </p>
                    <button type="button" onClick={toggleAll} className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer">
                      {selected.size === syncSecrets.filter((s) => !s.exists).length ? "Batalkan Semua" : "Pilih Semua Baru"}
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/85">
                    {syncSecrets.map((secret) => (
                      <div key={secret.name} className={`flex items-center gap-3 px-4 py-3 ${secret.exists ? "opacity-50" : ""}`}>
                        <input
                          type="checkbox"
                          id={`sync-${secret.name}`}
                          checked={selected.has(secret.name)}
                          disabled={secret.exists}
                          onChange={() => toggleSelect(secret.name)}
                          className="accent-indigo-600 w-4 h-4 shrink-0 rounded border-gray-300 dark:border-slate-700"
                        />
                        <label htmlFor={`sync-${secret.name}`} className="flex-1 cursor-pointer min-w-0">
                          <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{secret.name}</span>
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">Profile: {secret.profile || "default"}{secret.disabled ? " • disabled" : ""}</span>
                        </label>
                        {secret.exists ? (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium px-2.5 py-0.5 rounded-full">Ada</span>
                        ) : (
                          <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-medium px-2.5 py-0.5 rounded-full">Baru</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {selected.size > 0 && (
                    <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <label htmlFor="import-due-day" className="text-xs text-slate-600 dark:text-slate-400 font-semibold whitespace-nowrap">Tgl Jatuh Tempo Default:</label>
                        <input
                          id="import-due-day"
                          type="number"
                          min={1}
                          max={31}
                          value={importDueDay}
                          onChange={(e) => setImportDueDay(Number(e.target.value))}
                          className="w-16 text-center text-xs border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleImport}
                        disabled={importLoading}
                        className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer"
                      >
                        {importLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        {importLoading ? "Mengimport..." : `Import ${selected.size} Secret`}
                      </button>
                    </div>
                  )}

                  {importResults && (
                    <div className="space-y-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Hasil Import:</p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {importResults.map((r) => (
                          <div key={r.name} className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${
                            r.status === "imported" ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400" :
                            r.status === "error" ? "bg-rose-50 dark:bg-rose-955/20 text-rose-700 dark:text-rose-400" :
                            "bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-450"
                          }`}>
                            {r.status === "imported" ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> : <AlertCircle size={12} className="text-rose-500 shrink-0" />}
                            <span className="font-semibold truncate">{r.name}</span>
                            {r.message && <span className="opacity-80">— {r.message}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          </div>
        )}

        {/* Tab 4: GenieACS TR-069 */}
        {activeTab === "genieacs" && (
          <div className="grid grid-cols-1 gap-6 animate-in fade-in duration-200">
            {/* Card 5: GenieACS (TR-069) Integration */}
            <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <Wifi size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">GenieACS (TR-069)</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Integrasi GenieACS TR-069 API untuk remote reboot/reset ONT.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">GenieACS API URL</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["acs_url"] ?? "http://localhost:7557"}
                      onChange={(e) => onFormChange({ ...settingsForm, acs_url: e.target.value })}
                      placeholder="http://localhost:7557"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Endpoint NBI (Northbound Interface) server GenieACS.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">GenieACS Username</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["acs_username"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, acs_username: e.target.value })}
                      placeholder="admin"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Username autentikasi API NBI GenieACS.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">GenieACS Password</span>
                    <input
                      className={inputClassName()}
                      type="password"
                      value={settingsForm["acs_password"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, acs_password: e.target.value })}
                      placeholder="••••••••"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Password autentikasi API NBI GenieACS.</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-805 rounded-2xl p-4 mt-auto">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Uji server GenieACS.</span>
                <div className="flex items-center gap-2">
                  {acsResult && (
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                      acsResult.success ? "bg-emerald-50 text-emerald-700 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-455 dark:border-emerald-900/60" : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-455 dark:border-rose-900/60"
                    }`}>
                      {acsResult.success ? "Sukses" : "Gagal"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleTestGenieACS}
                    disabled={testingAcs}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {testingAcs ? <Loader2 size={12} className="animate-spin" /> : null}
                    {testingAcs ? "Menguji..." : "Test Koneksi"}
                  </button>
                </div>
              </div>
            </article>
          </div>
        )}

        {/* Tab 5: Discord Alerts */}
        {activeTab === "discord" && (
          <div className="grid grid-cols-1 gap-6 animate-in fade-in duration-200">
            {/* Card 2: Discord Notifications */}
            <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <Bell size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Discord Notifications</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Konfigurasi log aktivitas operasional penting ke server Discord.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Webhook URL</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["discord_webhook_url"] ?? ""}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, discord_webhook_url: e.target.value })
                      }
                      placeholder="https://discord.com/api/webhooks/..."
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">URL Discord Webhook Channel log.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Notif Pembayaran Lunas</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["discord_notify_payment"] ?? "1"}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, discord_notify_payment: e.target.value })
                      }
                    >
                      <option value="1">Aktif</option>
                      <option value="0">Nonaktif</option>
                    </select>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Kirim log instan saat pembayaran diverifikasi lunas.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Notif Generate Tagihan</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["discord_notify_generate"] ?? "1"}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, discord_notify_generate: e.target.value })
                      }
                    >
                      <option value="1">Aktif</option>
                      <option value="0">Nonaktif</option>
                    </select>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Kirim log status billing bulanan generate massal.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Notif Worker (Reminder / Limit / Backup)</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["discord_notify_worker"] ?? "1"}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, discord_notify_worker: e.target.value })
                      }
                    >
                      <option value="1">Aktif</option>
                      <option value="0">Nonaktif</option>
                    </select>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Kirim log aktivitas sinkronisasi worker otomatis.</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-805 rounded-2xl p-4 mt-auto">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Uji webhook Discord masukan di atas.</span>
                <div className="flex items-center gap-2">
                  {discordResult && (
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                      discordResult.success ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-455 dark:border-emerald-900/60" : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-455 dark:border-rose-900/60"
                    }`}>
                      {discordResult.success ? "Sukses" : "Gagal"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleTestDiscord}
                    disabled={testingDiscord}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {testingDiscord ? <Loader2 size={12} className="animate-spin" /> : null}
                    {testingDiscord ? "Menguji..." : "Test Webhook"}
                  </button>
                </div>
              </div>
            </article>
          </div>
        )}
      </div>

      {/* Bottom Actions Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
          Operasional backup manual dan histori file sekarang dipindahkan ke tab <strong>Monitoring</strong> agar tim bisa cek status sistem tanpa membuka form konfigurasi.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold py-2.5 px-6 rounded-xl shadow-md hover:shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isBusy("save-settings") ? <Loader2 size={14} className="animate-spin" /> : null}
          {isBusy("save-settings") ? "Menyimpan..." : "Simpan Semua Pengaturan"}
        </button>
      </div>
    </form>
  );
}
