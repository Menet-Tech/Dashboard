import { useState, useEffect, useCallback, type FormEvent } from "react";
import { inputClassName, renderInlineError } from "../../components/ui";
import type { FieldErrors } from "../../utils/validation";
import type { SettingsState, MikrotikSyncSecret, MikrotikImportResult } from "../../types";
import { Modal } from "../../components/ui/Modal";
import { getGatewayAccounts } from "../../lib/gatewayApi";
import {
  apiRequest,
  fetchMikrotikRouters,
  createMikrotikRouter,
  updateMikrotikRouter,
  deleteMikrotikRouter,
  testRouterConnection,
  testSMTP,
  syncMikrotikRouters,
  type MikrotikRouterItem,
  type SyncResultData,
} from "../../lib/api";
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
  Bot,
  Save,
  Mail,
  Settings,
  AlertTriangle,
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

  const [useCustomGateway, setUseCustomGateway] = useState(false);
  const [hasInitCustomGateway, setHasInitCustomGateway] = useState(false);

  useEffect(() => {
    if (settingsForm.wa_gateway_url !== undefined && !hasInitCustomGateway) {
      const url = settingsForm.wa_gateway_url || "";
      if (url !== "" && url !== "http://localhost:3001" && url !== "http://127.0.0.1:3001") {
        setUseCustomGateway(true);
      }
      setHasInitCustomGateway(true);
    }
  }, [settingsForm.wa_gateway_url, hasInitCustomGateway]);

  const [activeTab, setActiveTab] = useState<"whatsapp" | "billing" | "mikrotik" | "genieacs" | "discord" | "smtp">("whatsapp");

  const tabs = [
    { id: "whatsapp", label: "WhatsApp & Bot", icon: MessageCircle, desc: "Gateway & Chatbot Triggers" },
    { id: "billing", label: "Billing & Worker", icon: Sliders, desc: "Automation & Backup Rules" },
    { id: "mikrotik", label: "MikroTik Router", icon: Server, desc: "Router Setup & Secret Sync" },
    { id: "genieacs", label: "GenieACS TR-069", icon: Wifi, desc: "TR-069 ONT Management" },
    { id: "discord", label: "Discord Alerts", icon: Bell, desc: "Real-time Event Webhooks" },
    { id: "smtp", label: "SMTP Email", icon: Mail, desc: "Email Server Configuration" },
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

  // MikroTik multi-router states
  const [routers, setRouters] = useState<MikrotikRouterItem[]>([]);
  const [loadingRouters, setLoadingRouters] = useState(false);
  const [editingRouterId, setEditingRouterId] = useState<number | null>(null);
  const [newRouterName, setNewRouterName] = useState("");
  const [newRouterHost, setNewRouterHost] = useState("");
  const [newRouterUser, setNewRouterUser] = useState("");
  const [newRouterPass, setNewRouterPass] = useState("");
  const [newRouterIsActive, setNewRouterIsActive] = useState(true);
  const [changePassword, setChangePassword] = useState(false);
  const [deletingRouter, setDeletingRouter] = useState<MikrotikRouterItem | null>(null);
  const [routerTestStatus, setRouterTestStatus] = useState<Record<number, { success: boolean; message: string }>>({});
  const [testingRouterId, setTestingRouterId] = useState<number | null>(null);
  const [newRouterRole, setNewRouterRole] = useState("none");
  const [syncingRouters, setSyncingRouters] = useState(false);
  const [routerSyncError, setRouterSyncError] = useState<string | null>(null);
  const [routerSyncSuccess, setRouterSyncSuccess] = useState<SyncResultData | null>(null);

  const handleRouterSync = async () => {
    setSyncingRouters(true);
    setRouterSyncError(null);
    setRouterSyncSuccess(null);
    try {
      const res = await syncMikrotikRouters();
      if (res.success) {
        setRouterSyncSuccess(res.data);
        pushSuccess(res.message || "Sinkronisasi Main -> Slave berhasil!");
      } else {
        setRouterSyncError(res.message || "Sinkronisasi gagal.");
        pushError(res.message || "Sinkronisasi gagal.");
      }
    } catch (err: any) {
      setRouterSyncError(err.message || String(err));
      pushError(err.message || String(err));
    } finally {
      setSyncingRouters(false);
    }
  };

  // SMTP states
  const [testEmailReceiver, setTestEmailReceiver] = useState("");
  const [testingSMTP, setTestingSMTP] = useState(false);
  const [smtpResult, setSmtpResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadRouters = useCallback(async () => {
    setLoadingRouters(true);
    try {
      const res = await fetchMikrotikRouters();
      setRouters(res.data || []);
    } catch (err: any) {
      pushError(err.message || "Gagal memuat daftar router MikroTik");
    } finally {
      setLoadingRouters(false);
    }
  }, [pushError]);

  useEffect(() => {
    if (activeTab === "mikrotik") {
      void loadRouters();
    }
  }, [activeTab, loadRouters]);

  const handleTestSMTP = async () => {
    if (!testEmailReceiver) {
      pushError("Email tujuan test wajib diisi.");
      return;
    }
    setTestingSMTP(true);
    setSmtpResult(null);
    try {
      const data = await testSMTP({
        host: settingsForm.smtp_host || "",
        port: settingsForm.smtp_port || "",
        username: settingsForm.smtp_username || "",
        password: settingsForm.smtp_password || "",
        from_email: settingsForm.smtp_from_email || "",
        encryption: settingsForm.smtp_encryption || "TLS",
        to_email: testEmailReceiver,
      });
      setSmtpResult({ success: data.success, message: data.message });
      if (data.success) {
        pushSuccess("Test email SMTP berhasil!");
      } else {
        pushError(data.message || "Gagal mengirim email test.");
      }
    } catch (e: any) {
      setSmtpResult({ success: false, message: e.message || String(e) });
      pushError(e.message || String(e));
    } finally {
      setTestingSMTP(false);
    }
  };

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
    <>
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
            {/* Card 1: WhatsApp Gateway Connectivity */}
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

                <div className="grid grid-cols-1 gap-4">
                  <label className="flex items-center gap-2 cursor-pointer py-1.5">
                    <input
                      type="checkbox"
                      checked={useCustomGateway}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUseCustomGateway(checked);
                        if (!checked) {
                          onFormChange({
                            ...settingsForm,
                            wa_gateway_url: "",
                          });
                        } else {
                          onFormChange({
                            ...settingsForm,
                            wa_gateway_url: settingsForm.wa_gateway_url || "http://localhost:3001",
                          });
                        }
                      }}
                      className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Gunakan Gateway di Server Terpisah (Custom URL / Host Luar)
                    </span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Gateway URL</span>
                    <input
                      className={inputClassName(settingsErrors.wa_gateway_url)}
                      type="text"
                      value={useCustomGateway ? (settingsForm["wa_gateway_url"] ?? "") : "http://localhost:3001 (Lokal)"}
                      onChange={(e) => onFormChange({ ...settingsForm, wa_gateway_url: e.target.value })}
                      placeholder="http://localhost:3001"
                      disabled={!useCustomGateway}
                    />
                    {renderInlineError(settingsErrors.wa_gateway_url)}
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      URL gateway API untuk notifikasi otomatis. {!useCustomGateway && "Menggunakan default localhost."}
                    </span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Internal API Key</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["wa_api_key"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, wa_api_key: e.target.value })}
                      placeholder={!useCustomGateway ? "Otomatis di-generate saat disimpan" : "Harus sama dengan DASHBOARD_INTERNAL_API_KEY di .env"}
                      disabled={!useCustomGateway}
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      Untuk autentikasi backend ke gateway. {!useCustomGateway ? "Otomatis dibuat secara acak demi keamanan lokal." : "Simpan sebagai DASHBOARD_INTERNAL_API_KEY di file env backend."}
                    </span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Aktifkan Service WhatsApp Gateway</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["wa_gateway_enabled"] ?? "0"}
                      onChange={(e) => onFormChange({ ...settingsForm, wa_gateway_enabled: e.target.value })}
                    >
                      <option value="1">Aktif (Jalankan Service)</option>
                      <option value="0">Nonaktif (Matikan Service)</option>
                    </select>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      Jalankan atau matikan background process service WhatsApp Gateway.
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

            {/* Card 2: WhatsApp Template Accounts Routing */}
            <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5 animate-in fade-in duration-200">
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <Mail size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Template WA Routing</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Pilih akun pengirim WhatsApp untuk masing-masing template pesan otomatis.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5 col-span-full">
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
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Akun notifikasi default untuk pesan manual atau yang tidak diatur di bawah.</span>
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
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Akun untuk pengiriman tagihan bulanan baru.</span>
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
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Akun untuk pengingat tagihan sebelum jatuh tempo.</span>
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
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Akun untuk notifikasi akun yang lewat jatuh tempo atau trial habis.</span>
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
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Akun untuk pemberitahuan isolir layanan internet.</span>
                  </label>

                  <label className="flex flex-col gap-1.5 col-span-full">
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
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Akun untuk kirim bukti kwitansi setelah tagihan dibayar lunas.</span>
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

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Subsection A: Billing Intervals */}
                  <div className="space-y-4 lg:border-r lg:border-slate-100 lg:dark:border-slate-800/80 lg:pr-6 pb-6 lg:pb-0">
                    <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Tenggat Waktu Billing</h4>
                    
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
                  <div className="space-y-4 lg:border-r lg:border-slate-100 lg:dark:border-slate-800/80 lg:px-6 pb-6 lg:pb-0">
                    <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Scheduler Otomatisasi</h4>
                    
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
                  <div className="space-y-4 lg:border-r lg:border-slate-100 lg:dark:border-slate-800/80 lg:px-6 pb-6 lg:pb-0">
                    <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Worker & Backup Sistem</h4>

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

                  {/* Subsection D: Masa Trial / Percobaan */}
                  <div className="space-y-4 lg:pl-6">
                    <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Masa Trial / Percobaan</h4>
                    
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Trial Aktif</span>
                      <select
                        className={inputClassName()}
                        value={settingsForm["trial_enabled"] ?? "1"}
                        onChange={(e) =>
                          onFormChange({ ...settingsForm, trial_enabled: e.target.value })
                        }
                      >
                        <option value="1">Aktif</option>
                        <option value="0">Nonaktif</option>
                      </select>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Gunakan masa trial untuk pelanggan baru.</span>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Default Trial Days</span>
                      <input
                        className={inputClassName()}
                        type="number"
                        min="1"
                        value={settingsForm["trial_period_days"] ?? "3"}
                        onChange={(e) =>
                          onFormChange({ ...settingsForm, trial_period_days: e.target.value })
                        }
                      />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Masa aktif trial default pelanggan baru (hari).</span>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Trial Grace Overdue Days</span>
                      <input
                        className={inputClassName()}
                        type="number"
                        min="0"
                        value={settingsForm["trial_overdue_grace_days"] ?? "7"}
                        onChange={(e) =>
                          onFormChange({ ...settingsForm, trial_overdue_grace_days: e.target.value })
                        }
                      />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Toleransi batas bayar setelah masa trial berakhir (hari).</span>
                    </label>
                  </div>
                </div>
              </div>
            </article>
          </div>
        )}

        {/* Tab 3: MikroTik Router */}
        {activeTab === "mikrotik" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-in fade-in duration-200">
            {/* Left: Router List Table */}
            <article className="xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                      <Server size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">MikroTik Router Accounts</h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">Kelola dan hubungkan beberapa router MikroTik secara sinkron.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadRouters()}
                    className="p-1.5 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
                    title="Refresh List"
                  >
                    <RefreshCw size={14} className={loadingRouters ? "animate-spin" : ""} />
                  </button>
                </div>

                {loadingRouters ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="animate-spin text-indigo-650" />
                  </div>
                ) : routers.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    <p className="text-xs text-slate-400 dark:text-slate-500">Belum ada router MikroTik terdaftar. Silakan tambahkan akun router pertama Anda di sebelah kanan.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {routers.map((router) => (
                      <div
                        key={router.id}
                        className="border border-slate-200 dark:border-slate-850 rounded-2xl p-5 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between hover:border-slate-350 dark:hover:border-slate-755 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="font-bold text-slate-950 dark:text-slate-50 text-sm">{router.name}</h4>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 font-mono">{router.host}</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                              User: {router.username} &bull; Peran: {router.role === "main" ? "Utama (Main)" : router.role === "slave" ? "Slave (Second)" : "Tidak Ada"}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {!router.is_active ? (
                              <span className="flex items-center gap-1 text-[10px] font-bold bg-slate-50 text-slate-500 dark:bg-slate-950/20 dark:text-slate-400 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                Nonaktif
                              </span>
                            ) : (router.status === "failed_auth" || (routerTestStatus[router.id] && !routerTestStatus[router.id].success)) ? (
                              <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-955/20 dark:text-amber-400 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                Failed Auth
                              </span>
                            ) : router.status === "offline" ? (
                              <span className="flex items-center gap-1 text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-400 border border-rose-200 dark:border-rose-900 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                Offline
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-955/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Aktif
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 mt-4 pt-3 border-t border-slate-50 dark:border-slate-800/65 justify-end">
                          <button
                            type="button"
                            onClick={async () => {
                              setTestingRouterId(router.id);
                              try {
                                const res = await testRouterConnection(router.id);
                                setRouterTestStatus((prev) => ({ ...prev, [router.id]: { success: res.success, message: res.message } }));
                                setRouters((prev) =>
                                  prev.map((r) =>
                                    r.id === router.id
                                      ? { ...r, status: res.success ? "online" : "failed_auth" }
                                      : r
                                  )
                                );
                                if (res.success) {
                                  pushSuccess(`Koneksi ${router.name} berhasil!`);
                                } else {
                                  pushError(`Koneksi ${router.name} gagal: ${res.message}`);
                                }
                              } catch (err: any) {
                                setRouterTestStatus((prev) => ({ ...prev, [router.id]: { success: false, message: err.message || String(err) } }));
                                setRouters((prev) =>
                                  prev.map((r) =>
                                    r.id === router.id
                                      ? { ...r, status: "failed_auth" }
                                      : r
                                  )
                                );
                                pushError(err.message || String(err));
                              } finally {
                                setTestingRouterId(null);
                              }
                            }}
                            disabled={testingRouterId !== null}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {testingRouterId === router.id ? <Loader2 size={10} className="animate-spin" /> : null}
                            Test Koneksi
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRouterId(router.id);
                              setNewRouterName(router.name);
                              setNewRouterHost(router.host);
                              setNewRouterUser(router.username);
                              setNewRouterPass(""); // blank means no change unless typed
                              setNewRouterRole(router.role || "none");
                              setNewRouterIsActive(router.is_active);
                              setChangePassword(false);
                            }}
                            className="text-[10px] font-bold text-slate-700 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700/80 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingRouter(router)}
                            className="text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-955/20 dark:hover:bg-rose-955/40 p-1.5 rounded-lg transition-colors cursor-pointer"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>

            {/* Right: Add/Edit Account Router Form */}
            <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-3xl border border-slate-200 dark:border-slate-850 h-fit space-y-4">
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                {editingRouterId ? "Edit Akun Router" : "Tambah Router Baru"}
              </h3>
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Nama Router / Identitas</span>
                  <input
                    type="text"
                    required
                    value={newRouterName}
                    onChange={(e) => setNewRouterName(e.target.value)}
                    placeholder="Contoh: Router Utama, Router Backup"
                    className={inputClassName()}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Host IP / Domain</span>
                  <input
                    type="text"
                    required
                    value={newRouterHost}
                    onChange={(e) => setNewRouterHost(e.target.value)}
                    placeholder="192.168.88.1:8728"
                    className={inputClassName()}
                  />
                  <span className="text-[9px] text-slate-400 block mt-1">Gunakan port API MikroTik (default: 8728 atau 8729 untuk SSL).</span>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Username Admin Router</span>
                  <input
                    type="text"
                    required
                    value={newRouterUser}
                    onChange={(e) => setNewRouterUser(e.target.value)}
                    placeholder="admin"
                    className={inputClassName()}
                  />
                </label>
                {editingRouterId && (
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={changePassword}
                      onChange={(e) => setChangePassword(e.target.checked)}
                      className="accent-indigo-600 w-4 h-4 rounded border-gray-300 dark:border-slate-700"
                    />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Ubah Password
                    </span>
                  </label>
                )}

                {(!editingRouterId || changePassword) && (
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Password Admin {editingRouterId ? "(Kosongkan jika ingin password kosong)" : ""}
                    </span>
                    <input
                      type="password"
                      value={newRouterPass}
                      onChange={(e) => setNewRouterPass(e.target.value)}
                      placeholder="••••••••"
                      className={inputClassName()}
                    />
                  </label>
                )}

                <label className="block">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Peran / Role Router</span>
                  <select
                    value={newRouterRole}
                    onChange={(e) => setNewRouterRole(e.target.value)}
                    className={inputClassName()}
                  >
                    <option value="none">Tidak Ada (None)</option>
                    <option value="main">Utama (Main)</option>
                    <option value="slave">Slave (Second)</option>
                  </select>
                </label>


                <div className="flex gap-2 pt-2">
                  {editingRouterId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRouterId(null);
                        setNewRouterName("");
                        setNewRouterHost("");
                        setNewRouterUser("");
                        setNewRouterPass("");
                        setNewRouterRole("none");
                        setNewRouterIsActive(true);
                        setChangePassword(false);
                      }}
                      className="flex-1 bg-white border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-355 font-bold py-2 px-4 rounded-xl text-xs shadow-sm hover:bg-slate-50 transition-all cursor-pointer"
                    >
                      Batal
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newRouterName.trim() || !newRouterHost.trim() || !newRouterUser.trim()) {
                        pushError("Harap lengkapi semua field wajib.");
                        return;
                      }
                      try {
                        if (editingRouterId) {
                          await updateMikrotikRouter(editingRouterId, {
                            name: newRouterName,
                            host: newRouterHost,
                            username: newRouterUser,
                            role: newRouterRole,
                            is_active: newRouterIsActive,
                            ...(changePassword ? { password: newRouterPass } : {}),
                          });
                          pushSuccess("Router berhasil diperbarui.");
                        } else {
                          await createMikrotikRouter({
                            name: newRouterName,
                            host: newRouterHost,
                            username: newRouterUser,
                            password: newRouterPass,
                            is_active: newRouterIsActive,
                            role: newRouterRole,
                          });
                          pushSuccess("Router baru berhasil didaftarkan.");
                        }
                        setEditingRouterId(null);
                        setNewRouterName("");
                        setNewRouterHost("");
                        setNewRouterUser("");
                        setNewRouterPass("");
                        setNewRouterRole("none");
                        setNewRouterIsActive(true);
                        setChangePassword(false);
                        void loadRouters();
                      } catch (err: any) {
                        pushError(err.message || "Gagal menyimpan konfigurasi router");
                      }
                    }}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl text-xs shadow-md transition-all cursor-pointer text-center"
                  >
                    {editingRouterId ? "Simpan Perubahan" : "Daftarkan Router"}
                  </button>
                </div>
              </div>
            </div>

            {/* Global MikroTik Settings (Full Width) */}
            <article className="col-span-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                  <Settings size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Pengaturan Global MikroTik</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">Konfigurasi profile bandwidth default untuk status isolir.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <label className="flex flex-col gap-1.5 font-sans">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Nama PPPoE Profile Limit (Isolir)</span>
                  <input
                    className={inputClassName()}
                    type="text"
                    value={settingsForm["mikrotik_isolir_profile"] ?? "isolir"}
                    onChange={(e) =>
                      onFormChange({ ...settingsForm, mikrotik_isolir_profile: e.target.value })
                    }
                    placeholder="isolir"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">PPPoE Profile di MikroTik yang digunakan ketika pelanggan berstatus Limit/Isolir.</span>
                </label>
              </div>
            </article>

            {/* Router Main -> Slave Sync Panel (Full Width) */}
            <article className="col-span-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4 animate-in fade-in duration-200">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <RefreshCw size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Sinkronisasi Router Utama ke Slave</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Salin otomatis IP Pool, PPP Profile, dan PPP Secret dari router Utama ke semua router Slave.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRouterSync}
                  disabled={syncingRouters}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm cursor-pointer"
                >
                  {syncingRouters ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {syncingRouters ? "Menyinkronkan..." : "Sync Main -> Slave Sekarang"}
                </button>
              </div>

              {routerSyncError && (
                <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-955/20 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-455 text-xs rounded-xl px-4 py-3">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{routerSyncError}</span>
                </div>
              )}

              {routerSyncSuccess && (
                <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-955/20 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-455 text-xs rounded-xl px-4 py-3">
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Sinkronisasi Berhasil!</p>
                    <p className="mt-1 text-[11px]">
                      IP Pool: <span className="font-semibold text-slate-700 dark:text-slate-300">{routerSyncSuccess.pools_synced}</span> &bull;{" "}
                      PPP Profile: <span className="font-semibold text-slate-700 dark:text-slate-300">{routerSyncSuccess.profiles_synced}</span> &bull;{" "}
                      PPP Secret: <span className="font-semibold text-slate-700 dark:text-slate-300">{routerSyncSuccess.secrets_synced}</span>
                    </p>
                  </div>
                </div>
              )}
            </article>

            {/* MikroTik Sync Panel (Full Width) */}
            <article className="col-span-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
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
                          className="w-16 text-center text-xs border border-slate-300 dark:border-slate-850 bg-white dark:bg-slate-900 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 font-mono"
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
                            r.status === "imported" ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-455" :
                            r.status === "error" ? "bg-rose-50 dark:bg-rose-955/20 text-rose-700 dark:text-rose-455" :
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

        {/* Tab: SMTP Email */}
        {activeTab === "smtp" && (
          <div className="grid grid-cols-1 gap-6 animate-in fade-in duration-200">
            <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <Mail size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">SMTP Email Notification</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Konfigurasi server SMTP untuk notifikasi tagihan dan kuitansi via email.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5 col-span-full">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Status Layanan Email</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["smtp_enabled"] ?? "0"}
                      onChange={(e) => onFormChange({ ...settingsForm, smtp_enabled: e.target.value })}
                    >
                      <option value="1">Aktif</option>
                      <option value="0">Nonaktif</option>
                    </select>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Mengaktifkan/menonaktifkan pengiriman email ke pelanggan.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">SMTP Host</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["smtp_host"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, smtp_host: e.target.value })}
                      placeholder="smtp.gmail.com"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">SMTP Port</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["smtp_port"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, smtp_port: e.target.value })}
                      placeholder="587"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">SMTP Username</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["smtp_username"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, smtp_username: e.target.value })}
                      placeholder="billing@domain.com"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">SMTP Password</span>
                    <input
                      className={inputClassName()}
                      type="password"
                      value={settingsForm["smtp_password"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, smtp_password: e.target.value })}
                      placeholder="••••••••"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Sender Email (From)</span>
                    <input
                      className={inputClassName()}
                      type="email"
                      value={settingsForm["smtp_from_email"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, smtp_from_email: e.target.value })}
                      placeholder="billing@domain.com"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Metode Enkripsi</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["smtp_encryption"] ?? "TLS"}
                      onChange={(e) => onFormChange({ ...settingsForm, smtp_encryption: e.target.value })}
                    >
                      <option value="None">None (Unencrypted)</option>
                      <option value="SSL">SSL (Port 465)</option>
                      <option value="TLS">TLS (Port 587)</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-805 pt-5 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Uji Pengiriman Email</h4>
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <label className="flex-1 flex flex-col gap-1.5 font-sans">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Email Tujuan Test</span>
                    <input
                      className={inputClassName()}
                      type="email"
                      value={testEmailReceiver}
                      onChange={(e) => setTestEmailReceiver(e.target.value)}
                      placeholder="tujuan@gmail.com"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleTestSMTP}
                    disabled={testingSMTP}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer h-[42px]"
                  >
                    {testingSMTP ? <Loader2 size={14} className="animate-spin" /> : null}
                    {testingSMTP ? "Menguji..." : "Kirim Email Test"}
                  </button>
                </div>
                {smtpResult && (
                  <div className={`flex items-start gap-2 border text-xs rounded-xl px-4 py-3 ${
                    smtpResult.success 
                      ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-250 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-455" 
                      : "bg-rose-50 dark:bg-rose-955/20 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-455"
                  }`}>
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{smtpResult.message}</span>
                  </div>
                )}
              </div>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Excellent RX Power Threshold (dBm)</span>
                      <input
                        className={inputClassName()}
                        type="text"
                        value={settingsForm["gacs_rx_power_excellent"] ?? "-27"}
                        onChange={(e) => onFormChange({ ...settingsForm, gacs_rx_power_excellent: e.target.value })}
                        placeholder="-27"
                      />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Nilai minimum untuk status sinyal Excellent (biasanya -27 dBm).</span>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Fair RX Power Threshold (dBm)</span>
                      <input
                        className={inputClassName()}
                        type="text"
                        value={settingsForm["gacs_rx_power_fair"] ?? "-25"}
                        onChange={(e) => onFormChange({ ...settingsForm, gacs_rx_power_fair: e.target.value })}
                        placeholder="-25"
                      />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Nilai minimum untuk status sinyal Cukup/Fair (biasanya -25 dBm).</span>
                    </label>
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Portal API Key</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["gacs_portal_api_key"] ?? ""}
                      onChange={(e) => onFormChange({ ...settingsForm, gacs_portal_api_key: e.target.value })}
                      placeholder="API Key portal"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">API Key untuk mengamankan integrasi captive portal.</span>
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

        {/* Telegram bot settings tab removed */}

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

            {/* Card: Discord Bot Settings */}
            <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5 animate-in fade-in duration-200">
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <Bot size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Discord Bot Settings</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Konfigurasi kredensial Discord Bot untuk menerima perintah interaktif slash commands.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Bot Token</span>
                    <input
                      className={inputClassName()}
                      type="password"
                      value={settingsForm["discord_bot_token"] ?? ""}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, discord_bot_token: e.target.value })
                      }
                      placeholder="MTAx..."
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Token bot Discord Anda (didapatkan dari Discord Developer Portal).</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Application ID</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["discord_bot_application_id"] ?? ""}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, discord_bot_application_id: e.target.value })
                      }
                      placeholder="Application ID"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">ID Aplikasi/Klien bot Discord Anda.</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Guild ID (Opsional)</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={settingsForm["discord_bot_guild_id"] ?? ""}
                      onChange={(e) =>
                        onFormChange({ ...settingsForm, discord_bot_guild_id: e.target.value })
                      }
                      placeholder="Guild (Server) ID"
                    />
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">ID Server Discord untuk pendaftaran slash commands instan (opsional).</span>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Aktifkan Service Discord Bot</span>
                    <select
                      className={inputClassName()}
                      value={settingsForm["discord_bot_enabled"] ?? "0"}
                      onChange={(e) => onFormChange({ ...settingsForm, discord_bot_enabled: e.target.value })}
                    >
                      <option value="1">Aktif (Jalankan Service)</option>
                      <option value="0">Nonaktif (Matikan Service)</option>
                    </select>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      Jalankan atau matikan background process service Discord Bot.
                    </span>
                  </label>
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
      {deletingRouter && (
        <Modal
          title="Hapus Router"
          onClose={() => setDeletingRouter(null)}
          actions={
            <>
              <button
                type="button"
                onClick={() => setDeletingRouter(null)}
                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await deleteMikrotikRouter(deletingRouter.id);
                    pushSuccess("Router berhasil dihapus.");
                    setDeletingRouter(null);
                    void loadRouters();
                  } catch (err: any) {
                    pushError(err.message || "Gagal menghapus router");
                  }
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md hover:shadow-rose-500/20 transition-all cursor-pointer"
              >
                Hapus Router
              </button>
            </>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Apakah Anda yakin ingin menghapus router <strong>{deletingRouter.name}</strong>?
              </p>
              <p className="text-xs text-slate-450 mt-2 leading-relaxed">
                Tindakan ini tidak dapat dibatalkan. Koneksi ke router <strong>{deletingRouter.host}</strong> akan dihentikan dan sinkronisasi secret tidak akan berjalan untuk router ini.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
