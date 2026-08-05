import { Button } from "../../components/ui";
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
  fetchRouterInterfaces,
  fetchMikrotikIPPools,
  type MikrotikRouterItem,
  type SyncResultData,
  type MikrotikIPPoolItem,
  // New imports
  fetchVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  fetchWifiSecurities,
  createWifiSecurity,
  updateWifiSecurity,
  deleteWifiSecurity,
  updateSettings,
  type VendorItem,
  type WifiSecurityItem,
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
  // New icons
  User as UserIcon,
  Lock,
  Plus,
  Edit,
  Trash2,
  Shield,
  Upload,
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

  const [activeTab, setActiveTab] = useState<"app" | "acs">("app");
  const [appSubTab, setAppSubTab] = useState<"general" | "whatsapp" | "billing" | "mikrotik" | "discord" | "smtp">("general");
  const [acsSubTab, setAcsSubTab] = useState<"acs-config" | "vendor-management">("acs-config");
  const [vendorSubTab, setVendorSubTab] = useState<"vendors" | "wifi">("vendors");

  const tabs = [
    { id: "app", label: "App Settings", icon: Settings, desc: "Sistem & Integrasi App" },
    { id: "acs", label: "ACS & Vendor", icon: Wifi, desc: "TR-069, Vendor & WiFi Config" },
  ];

  // Helper to parse JSON safely
  const getJsonValue = (jsonStr: string | undefined, key: string, fallback: any) => {
    if (!jsonStr) return fallback;
    try {
      const parsed = JSON.parse(jsonStr);
      return parsed[key] !== undefined ? parsed[key] : fallback;
    } catch (e) {
      return fallback;
    }
  };

  // Helper to set JSON values
  const setJsonValue = (jsonKey: string, valKey: string, val: any) => {
    let current = {};
    const raw = settingsForm[jsonKey];
    if (raw) {
      try {
        current = JSON.parse(raw);
      } catch (e) { }
    }
    const updated = { ...current, [valKey]: val };
    onFormChange({
      ...settingsForm,
      [jsonKey]: JSON.stringify(updated),
    });
  };

  // Syncing excellent & fair thresholds to both json and individual settings
  const handleExcellentChange = (val: string) => {
    const num = Number(val);
    let current = {};
    if (settingsForm.rxPowerThresholds) {
      try { current = JSON.parse(settingsForm.rxPowerThresholds); } catch (e) { }
    }
    onFormChange({
      ...settingsForm,
      gacs_rx_power_excellent: val,
      rxPowerThresholds: JSON.stringify({ ...current, excellent: num }),
    });
  };

  const handleFairChange = (val: string) => {
    const num = Number(val);
    let current = {};
    if (settingsForm.rxPowerThresholds) {
      try { current = JSON.parse(settingsForm.rxPowerThresholds); } catch (e) { }
    }
    onFormChange({
      ...settingsForm,
      gacs_rx_power_fair: val,
      rxPowerThresholds: JSON.stringify({ ...current, fair: num }),
    });
  };

  // Saving section-specific data helper
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const saveSection = async (sectionName: string, keys: string[]) => {
    setSavingSection(sectionName);
    const dataToSave: Record<string, string> = {};
    keys.forEach((key) => {
      dataToSave[key] = settingsForm[key] ?? "";
    });
    try {
      await updateSettings(dataToSave);
      pushSuccess(`Pengaturan ${sectionName} berhasil disimpan.`);
      if (sectionName === "MikroTik Global" || sectionName === "MikroTik") {
        void handleCheckProfiles();
      }
    } catch (e: any) {
      pushError(e.message || `Gagal menyimpan pengaturan ${sectionName}.`);
    } finally {
      setSavingSection(null);
    }
  };

  // Vendors state
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Partial<VendorItem> | null>(null);
  const [deletingVendorItem, setDeletingVendorItem] = useState<VendorItem | null>(null);

  // WiFi Security Config state
  const [wifiConfigs, setWifiConfigs] = useState<WifiSecurityItem[]>([]);
  const [loadingWifi, setLoadingWifi] = useState(false);
  const [editingWifiConfig, setEditingWifiConfig] = useState<Partial<WifiSecurityItem> | null>(null);
  const [deletingWifiItem, setDeletingWifiItem] = useState<WifiSecurityItem | null>(null);

  // User tab states
  const [userSubmitting, setUserSubmitting] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleUpdateUsername = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUsername || !newUsername) {
      pushError("Semua field wajib diisi.");
      return;
    }
    setUserSubmitting("username");
    try {
      const res = await apiRequest<{ success: boolean; message: string }>("/api/auth/change-username", {
        method: "POST",
        body: JSON.stringify({ currentUsername, newUsername }),
      });
      pushSuccess(res.message || "Username berhasil diperbarui.");
      setCurrentUsername("");
      setNewUsername("");
    } catch (err: any) {
      pushError(err.message || "Gagal memperbarui username.");
    } finally {
      setUserSubmitting(null);
    }
  };

  const handleUpdatePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      pushError("Semua field wajib diisi.");
      return;
    }
    if (newPassword !== confirmPassword) {
      pushError("Konfirmasi password baru tidak cocok.");
      return;
    }
    setUserSubmitting("password");
    try {
      const res = await apiRequest<{ success: boolean; message: string }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      pushSuccess(res.message || "Password berhasil diperbarui.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      pushError(err.message || "Gagal memperbarui password.");
    } finally {
      setUserSubmitting(null);
    }
  };

  // Vendor loading
  const loadVendors = useCallback(async () => {
    setLoadingVendors(true);
    try {
      const res = await fetchVendors();
      setVendors(res.data || []);
    } catch (e: any) {
      pushError(e.message || "Gagal memuat daftar Vendor");
    } finally {
      setLoadingVendors(false);
    }
  }, [pushError]);

  // WiFi Config loading
  const loadWifiConfigs = useCallback(async () => {
    setLoadingWifi(true);
    try {
      const res = await fetchWifiSecurities();
      setWifiConfigs(res.data || []);
    } catch (e: any) {
      pushError(e.message || "Gagal memuat daftar WiFi Security");
    } finally {
      setLoadingWifi(false);
    }
  }, [pushError]);

  useEffect(() => {
    if (activeTab === "acs" && acsSubTab === "vendor-management") {
      if (vendorSubTab === "vendors") {
        void loadVendors();
      } else {
        void loadWifiConfigs();
      }
    }
  }, [activeTab, acsSubTab, vendorSubTab, loadVendors, loadWifiConfigs]);

  const exportData = (data: any[], filename: string) => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(data, null, 2)
    )}`;
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportVendors = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed)) {
            let successCount = 0;
            for (const item of parsed) {
              const payload = {
                name: item.name,
                manufacturer_patterns: item.manufacturer_patterns,
                product_patterns: item.product_patterns,
                parameter_prefix: item.parameter_prefix,
                service_list_path: item.service_list_path,
                lan_binding_path: item.lan_binding_path,
                vlan_id_path: item.vlan_id_path,
                http_wan_enable_path: item.http_wan_enable_path,
                firewall_level_path: item.firewall_level_path,
                priority: item.priority || 10,
                enabled: item.enabled !== undefined ? item.enabled : 1,
                description: item.description || ""
              };
              await createVendor(payload);
              successCount++;
            }
            pushSuccess(`Berhasil mengimpor ${successCount} Vendor.`);
            void loadVendors();
          } else {
            pushError("Format JSON tidak valid. Harus berupa array.");
          }
        } catch (err: any) {
          pushError("Gagal membaca file JSON: " + err.message);
        }
      };
    }
  };

  const handleImportWifi = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed)) {
            let successCount = 0;
            for (const item of parsed) {
              const payload = {
                product_class: item.product_class,
                security_types: item.security_types,
                password_param_path: item.password_param_path
              };
              await createWifiSecurity(payload);
              successCount++;
            }
            pushSuccess(`Berhasil mengimpor ${successCount} WiFi Security.`);
            void loadWifiConfigs();
          } else {
            pushError("Format JSON tidak valid. Harus berupa array.");
          }
        } catch (err: any) {
          pushError("Gagal membaca file JSON: " + err.message);
        }
      };
    }
  };

  // Connection test states
  const [testingWa, setTestingWa] = useState(false);
  const [waResult, setWaResult] = useState<{ success: boolean; authenticated?: boolean; message: string } | null>(null);

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
  const [togglingRouterId, setTogglingRouterId] = useState<number | null>(null);
  const [newRouterRole, setNewRouterRole] = useState("none");
  const [newRouterSlavePort, setNewRouterSlavePort] = useState("ether2");
  const [routerInterfaces, setRouterInterfaces] = useState<string[]>(["ether1", "ether2", "ether3", "ether4", "ether5"]);
  const [fetchingInterfaces, setFetchingInterfaces] = useState(false);
  const [syncingRouters, setSyncingRouters] = useState(false);
  const [routerSyncError, setRouterSyncError] = useState<string | null>(null);
  const [routerSyncSuccess, setRouterSyncSuccess] = useState<SyncResultData | null>(null);

  const loadRouterInterfaces = useCallback(async (params: { id?: number; host?: string; username?: string; password?: string }) => {
    if (!params.host || !params.username) return;
    setFetchingInterfaces(true);
    try {
      const res = await fetchRouterInterfaces(params);
      if (res.data && res.data.length > 0) {
        setRouterInterfaces(res.data);
      }
    } catch (err) {
      console.error("Gagal memuat interface router:", err);
    } finally {
      setFetchingInterfaces(false);
    }
  }, []);

  useEffect(() => {
    if (newRouterRole === "slave" && newRouterHost && newRouterUser) {
      void loadRouterInterfaces({
        id: editingRouterId || undefined,
        host: newRouterHost,
        username: newRouterUser,
        password: newRouterPass || undefined,
      });
    }
  }, [newRouterRole, newRouterHost, newRouterUser, loadRouterInterfaces, editingRouterId]);

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

  const [profileCheck, setProfileCheck] = useState<{
    isolir_exists: boolean;
    inactive_exists: boolean;
    isolir_profile_name: string;
    inactive_profile_name: string;
    success?: boolean;
    message?: string;
  } | null>(null);
  const [checkingProfiles, setCheckingProfiles] = useState(false);
  const [settingUpProfiles, setSettingUpProfiles] = useState(false);

  const handleCheckProfiles = useCallback(async () => {
    setCheckingProfiles(true);
    try {
      const data = await apiRequest<{
        success: boolean;
        isolir_exists: boolean;
        inactive_exists: boolean;
        isolir_profile_name: string;
        inactive_profile_name: string;
        message?: string;
      }>("/api/v1/integration/mikrotik/check-profiles");
      if (data.success) {
        setProfileCheck(data);
      } else {
        setProfileCheck({
          isolir_exists: true,
          inactive_exists: true,
          isolir_profile_name: "isolir",
          inactive_profile_name: "nonaktif",
          success: false,
          message: data.message,
        });
      }
    } catch (e: any) {
      setProfileCheck({
        isolir_exists: true,
        inactive_exists: true,
        isolir_profile_name: "isolir",
        inactive_profile_name: "nonaktif",
        success: false,
        message: e.message || String(e),
      });
    } finally {
      setCheckingProfiles(false);
    }
  }, []);

  const [mikrotikPools, setMikrotikPools] = useState<MikrotikIPPoolItem[]>([]);
  const [showSetupForm, setShowSetupForm] = useState(false);

  // Setup form states
  const [setupIsolirName, setSetupIsolirName] = useState("");
  const [setupIsolirLocal, setSetupIsolirLocal] = useState("192.168.0.254");
  const [setupIsolirLimit, setSetupIsolirLimit] = useState("128k/128k");
  const [setupIsolirPoolMode, setSetupIsolirPoolMode] = useState<"new" | "existing">("new");
  const [setupIsolirPoolName, setSetupIsolirPoolName] = useState("isolir");
  const [setupIsolirPoolRange, setSetupIsolirPoolRange] = useState("192.168.3.2-192.168.3.254");

  const [setupInactiveName, setSetupInactiveName] = useState("");
  const [setupInactiveLocal, setSetupInactiveLocal] = useState("192.168.0.254");
  const [setupInactiveLimit, setSetupInactiveLimit] = useState("8k/8k");
  const [setupInactivePoolMode, setSetupInactivePoolMode] = useState<"new" | "existing">("new");
  const [setupInactivePoolName, setSetupInactivePoolName] = useState("nonaktif");
  const [setupInactivePoolRange, setSetupInactivePoolRange] = useState("192.168.4.2-192.168.4.254");

  const loadMikrotikPools = useCallback(async () => {
    try {
      const res = await fetchMikrotikIPPools();
      if (res.data) {
        setMikrotikPools(res.data);
      }
    } catch (e) {
      console.error("Gagal memuat IP Pool MikroTik:", e);
    }
  }, []);

  const triggerSetupProfiles = async () => {
    setSettingUpProfiles(true);
    try {
      const data = await apiRequest<{ success: boolean; message: string }>("/api/v1/integration/mikrotik/setup-profiles", {
        method: "POST",
        body: JSON.stringify({
          isolir_profile_name: setupIsolirName,
          isolir_local_address: setupIsolirLocal,
          isolir_remote_address: setupIsolirPoolName,
          isolir_rate_limit: setupIsolirLimit,
          isolir_create_pool: setupIsolirPoolMode === "new",
          isolir_pool_range: setupIsolirPoolRange,

          inactive_profile_name: setupInactiveName,
          inactive_local_address: setupInactiveLocal,
          inactive_remote_address: setupInactivePoolName,
          inactive_rate_limit: setupInactiveLimit,
          inactive_create_pool: setupInactivePoolMode === "new",
          inactive_pool_range: setupInactivePoolRange,
        }),
      });
      if (data.success) {
        pushSuccess(data.message || "Setup profile berhasil!");
        setShowSetupForm(false);
        onFormChange({
          ...settingsForm,
          mikrotik_isolir_profile: setupIsolirName,
          mikrotik_inactive_profile: setupInactiveName,
        });
        void handleCheckProfiles();
        void loadMikrotikPools();
      } else {
        pushError(data.message || "Setup profile gagal.");
      }
    } catch (e: any) {
      pushError(e.message || String(e));
    } finally {
      setSettingUpProfiles(false);
    }
  };

  useEffect(() => {
    if (activeTab === "app" && appSubTab === "mikrotik") {
      void loadRouters();
      void handleCheckProfiles();
      void loadMikrotikPools();
    }
  }, [activeTab, appSubTab, loadRouters, handleCheckProfiles, loadMikrotikPools]);

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
      const data = await apiRequest<{ success: boolean; authenticated?: boolean; message: string }>("/api/v1/integration/test-whatsapp", {
        method: "POST",
        body: JSON.stringify({
          gateway_url: settingsForm.wa_gateway_url || "http://localhost:3001",
          api_key: settingsForm.wa_api_key || "",
          account_id: settingsForm.wa_account_id || "default",
        }),
      });
      setWaResult({ success: data.success, authenticated: data.authenticated, message: data.message });
      if (data.success) {
        pushSuccess(data.message || "Test WhatsApp Gateway berhasil!");
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
  const [importActivateTrial, setImportActivateTrial] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResults, setImportResults] = useState<MikrotikImportResult[] | null>(null);

  const handleSyncPreview = useCallback(async () => {
    setSyncLoading(true);
    setSyncError(null);
    setSyncSecrets(null);
    setSelected(new Set());
    setImportResults(null);
    setImportActivateTrial(false);
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
        body: JSON.stringify({
          names: Array.from(selected),
          default_due_day: importDueDay,
          activate_trial: importActivateTrial,
        }),
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
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 flex items-center gap-2">
              <Sliders className="text-indigo-600" size={24} />
              Pengaturan Sistem
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
              Konfigurasi sistem, GenieACS TR-069, Vendor ONT & WiFi, serta manajemen keamanan akun.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Button
              type="submit"
              variant="primary"
              disabled={submitting}
              isLoading={isBusy("save-settings")}
              className="w-full md:w-auto"
            >
              Simpan Semua Pengaturan
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex flex-wrap gap-2 p-1.5 bg-slate-50 dark:bg-slate-950 dark:bg-slate-950/60 border border-slate-200/50 dark:border-slate-800/60 rounded-card">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Button variant="outline"
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 min-w-[150px] flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer ${isActive
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/60 dark:border-slate-800 font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-900/50 font-semibold"
                  }`}
              >
                <Icon size={18} className={isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"} />
                <div className="text-left">
                  <span className="block text-xs leading-none">{tab.label}</span>
                  <span className="block text-[9px] font-normal text-slate-400 dark:text-slate-500 mt-1">{tab.desc}</span>
                </div>
              </Button>
            );
          })}
        </nav>

        {/* Tab Contents */}
        <div className="space-y-6">

          {/* Tab 1: App Settings with Sidebar Navigation */}
          {activeTab === "app" && (
            <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in duration-200">
              {/* Sidebar Sub-tabs */}
              <aside className="w-full lg:w-64 shrink-0 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 lg:pr-4">
                {[
                  { id: "general", label: "General System", icon: Settings },
                  { id: "billing", label: "Billing & Rules", icon: Sliders },
                  { id: "whatsapp", label: "WhatsApp Gateway", icon: MessageCircle },
                  { id: "mikrotik", label: "MikroTik Routers", icon: Server },
                  { id: "discord", label: "Discord Alerts", icon: Bell },
                  { id: "smtp", label: "SMTP Email", icon: Mail },
                ].map((sub) => {
                  const SubIcon = sub.icon;
                  const isSubActive = appSubTab === sub.id;
                  return (
                    <Button variant="outline"
                      key={sub.id}
                      type="button"
                      onClick={() => setAppSubTab(sub.id as any)}
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${isSubActive
                        ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-900/50"
                        }`}
                    >
                      <SubIcon size={16} />
                      {sub.label}
                    </Button>
                  );
                })}
              </aside>

              {/* Sub-tab content area */}
              <div className="flex-1 min-w-0">

                {/* General Sub-tab */}
                {appSubTab === "general" && (
                  <div className="space-y-6">
                    <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                      <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                          <Settings size={18} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">General Configuration</h3>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">Konfigurasi nama portal dan token keamanan captive portal.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Application Name</span>
                          <input
                            className={inputClassName()}
                            type="text"
                            value={settingsForm["appName"] ?? ""}
                            onChange={(e) => onFormChange({ ...settingsForm, appName: e.target.value })}
                            placeholder="Menet-Tech Dashboard Go"
                          />
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">Nama aplikasi yang muncul pada title bar dan kop surat tagihan.</span>
                        </label>

                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Captive Portal API Key</span>
                          <input
                            className={inputClassName()}
                            type="text"
                            value={settingsForm["portalApiKey"] ?? ""}
                            onChange={(e) => onFormChange({ ...settingsForm, portalApiKey: e.target.value })}
                            placeholder="Masukkan API Key"
                          />
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">Kunci token API untuk sinkronisasi data ONT ke Captive Portal.</span>
                        </label>
                      </div>

                      <div className="flex justify-end pt-3 border-t border-slate-50 dark:border-slate-800/60">
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => saveSection("General", ["appName", "portalApiKey"])}
                          disabled={savingSection === "General"}
                          isLoading={savingSection === "General"}
                          icon={<Save size={14} />}
                        >
                          Save General Settings
                        </Button>
                      </div>
                    </article>
                  </div>
                )}

                {/* WhatsApp Gateway Sub-tab */}
                {appSubTab === "whatsapp" && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* Card 1: WhatsApp Gateway Connectivity */}
                    <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                          <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                            <MessageCircle size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">WhatsApp Gateway</h3>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">Hubungkan dashboard Go dengan gateway WhatsApp JS.</p>
                          </div>
                        </div>

                        {/* Status info card */}
                        <div className="bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/40 rounded-card p-4 flex items-start gap-3">
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
                              className={inputClassName(settingsErrors.wa_gateway_url, !useCustomGateway)}
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
                              className={inputClassName(undefined, !useCustomGateway)}
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

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Aktifkan Chatbot WhatsApp</span>
                            <select
                              className={inputClassName()}
                              value={settingsForm["wa_chatbot_enabled"] ?? "1"}
                              onChange={(e) => onFormChange({ ...settingsForm, wa_chatbot_enabled: e.target.value })}
                            >
                              <option value="1">Aktif (Gunakan Chatbot)</option>
                              <option value="0">Nonaktif (Matikan Chatbot)</option>
                            </select>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              Mengaktifkan atau menonaktifkan respon otomatis dari chatbot WhatsApp secara global.
                            </span>
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Jeda Pengiriman Antrean WhatsApp (Detik)</span>
                            <input
                              type="number"
                              className={inputClassName()}
                              value={settingsForm["wa_queue_throttle_seconds"] ?? "120"}
                              onChange={(e) => onFormChange({ ...settingsForm, wa_queue_throttle_seconds: e.target.value })}
                              placeholder="Default: 120"
                            />
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              Jeda waktu (detik) antara pengiriman pesan dalam antrean otomatis/broadcast. Pengiriman manual dari dashboard akan mengabaikan jeda ini.
                            </span>
                          </label>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 dark:border-slate-805 rounded-card p-4 mt-auto">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Uji kredensial/koneksi WhatsApp Gateway.</span>
                        <div className="flex items-center gap-2">
                          {waResult && (
                            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                              !waResult.success 
                                ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-955/20 dark:text-rose-455 dark:border-rose-900/60" 
                                : waResult.authenticated === false 
                                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-455 dark:border-amber-900/60" 
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-455 dark:border-emerald-900/60"
                            }`}>
                              {!waResult.success 
                                ? "Gagal" 
                                : waResult.authenticated === false 
                                  ? "Belum Auth" 
                                  : "Sukses"}
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleTestWhatsApp}
                            disabled={testingWa}
                            isLoading={testingWa}
                          >
                            Test Koneksi
                          </Button>
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
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Template WA Routing</h3>
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

                      <div className="flex justify-end pt-3 border-t border-slate-50 dark:border-slate-800/60 mt-auto">
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => saveSection("WhatsApp", [
                            "wa_gateway_url", "wa_api_key", "wa_gateway_enabled", "wa_chatbot_enabled", "wa_account_id",
                            "wa_billing_account_id", "wa_reminder_account_id", "wa_due_account_id",
                            "wa_limit_account_id", "wa_payment_account_id"
                          ])}
                          disabled={savingSection === "WhatsApp"}
                          isLoading={savingSection === "WhatsApp"}
                          icon={<Save size={14} />}
                        >
                          Save WhatsApp Settings
                        </Button>
                      </div>
                    </article>
                  </div>
                )}

                {/* Billing Sub-tab */}
                {appSubTab === "billing" && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <Sliders size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Billing Rules & Automation</h3>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">Konfigurasi parameter tagihan otomatis, scheduler backup & retensi.</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Subsection A: Billing Intervals */}
                          <div className="space-y-4 p-5 bg-slate-50 dark:bg-slate-950 dark:bg-slate-950/40 rounded-card border border-slate-100 dark:border-slate-800 dark:border-slate-800/60">
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

                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Suspended Days</span>
                              <input
                                className={inputClassName()}
                                type="number"
                                value={settingsForm["billing_inactive_suspended_days"] ?? "20"}
                                onChange={(e) =>
                                  onFormChange({ ...settingsForm, billing_inactive_suspended_days: e.target.value })
                                }
                              />
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">Batas hari setelah ditangguhkan (suspended) sebelum status menjadi nonaktif (inactive) dan PPPoE secret dimatikan sepenuhnya.</span>
                            </label>
                          </div>

                          {/* Subsection B: Automation Scheduler */}
                          <div className="space-y-4 p-5 bg-slate-50 dark:bg-slate-950 dark:bg-slate-950/40 rounded-card border border-slate-100 dark:border-slate-800 dark:border-slate-800/60">
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
                                max="31"
                                value={settingsForm["billing_generate_day"] ?? "1"}
                                onChange={(e) =>
                                  onFormChange({ ...settingsForm, billing_generate_day: e.target.value })
                                }
                              />
                              {renderInlineError(settingsErrors.billing_generate_day)}
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">Tanggal generator billing berjalan (1-31).</span>
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
                          <div className="space-y-4 p-5 bg-slate-50 dark:bg-slate-950 dark:bg-slate-950/40 rounded-card border border-slate-100 dark:border-slate-800 dark:border-slate-800/60">
                            <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Worker & Backup Sistem</h4>

                            <div className="grid grid-cols-2 gap-4">
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
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">Percobaan tagihan WA.</span>
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
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">Jeda retry.</span>
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

                            <div className="grid grid-cols-2 gap-4">
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
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">Jadwal backup otomatis.</span>
                              </label>

                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Jadwal Backup</span>
                                <input
                                  className={inputClassName()}
                                  type="time"
                                  value={settingsForm["backup_auto_time"] ?? "02:00"}
                                  onChange={(e) => onFormChange({ ...settingsForm, backup_auto_time: e.target.value })}
                                />
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">Jam backup berjalan.</span>
                              </label>
                            </div>

                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Retensi Backup</span>
                              <input
                                className={inputClassName()}
                                type="number"
                                min="1"
                                value={settingsForm["backup_retention_count"] ?? "3"}
                                onChange={(e) =>
                                  onFormChange({ ...settingsForm, backup_retention_count: e.target.value })
                                }
                              />
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">Jumlah file backup tersimpan sebelum diganti.</span>
                            </label>

                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Enkripsi Backup</span>
                              <select
                                className={inputClassName()}
                                value={settingsForm["backup_encryption_enabled"] ?? "1"}
                                onChange={(e) =>
                                  onFormChange({ ...settingsForm, backup_encryption_enabled: e.target.value })
                                }
                              >
                                <option value="1">Aktif</option>
                                <option value="0">Nonaktif</option>
                              </select>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">Gunakan enkripsi password saat membungkus file ke dalam ZIP.</span>
                            </label>

                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Password Enkripsi Backup</span>
                              <input
                                className={inputClassName()}
                                type="password"
                                value={settingsForm["backup_encryption_password"] ?? ""}
                                onChange={(e) =>
                                  onFormChange({ ...settingsForm, backup_encryption_password: e.target.value })
                                }
                                placeholder="Masukkan password enkripsi"
                              />
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">Password untuk mengunci/mengenkripsi file backup (kosongkan untuk menggunakan token default).</span>
                            </label>

                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Discord Backup Channel ID</span>
                              <input
                                className={inputClassName()}
                                type="text"
                                value={settingsForm["backup_discord_channel_id"] ?? ""}
                                onChange={(e) =>
                                  onFormChange({ ...settingsForm, backup_discord_channel_id: e.target.value })
                                }
                                placeholder="Masukkan ID Channel Discord (opsional)"
                              />
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">ID channel khusus untuk mengirim file backup (kosongkan untuk menggunakan default webhook).</span>
                            </label>
                          </div>

                          {/* Subsection D: Masa Trial / Percobaan */}
                          <div className="space-y-4 p-5 bg-slate-50 dark:bg-slate-950 dark:bg-slate-950/40 rounded-card border border-slate-100 dark:border-slate-800 dark:border-slate-800/60">
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

                      <div className="flex justify-end pt-3 border-t border-slate-50 dark:border-slate-800/60 mt-auto">
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => saveSection("Billing", [
                            "billing_reminder_days", "billing_limit_days", "billing_menunggak_days", "billing_inactive_suspended_days",
                            "billing_auto_generate_enabled", "billing_generate_day", "billing_generate_time",
                            "billing_generate_retry_attempts", "billing_generate_retry_backoff_seconds",
                            "worker_interval_seconds", "backup_auto_enabled", "backup_auto_time",
                            "backup_retention_count", "backup_encryption_password", "backup_discord_channel_id", "backup_encryption_enabled",
                            "trial_enabled", "trial_period_days", "trial_overdue_grace_days"
                          ])}
                          disabled={savingSection === "Billing"}
                          isLoading={savingSection === "Billing"}
                          icon={<Save size={14} />}
                        >
                          Save Billing Settings
                        </Button>
                      </div>
                    </article>
                  </div>
                )}

                {/* MikroTik Routers Sub-tab */}
                {appSubTab === "mikrotik" && (
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
                              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">MikroTik Router Accounts</h3>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">Kelola dan hubungkan beberapa router MikroTik secara sinkron.</p>
                            </div>
                          </div>
                          <Button variant="outline" type="button"
                            onClick={() => void loadRouters()}
                            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                            title="Refresh List"
                          >
                            <RefreshCw size={14} className={loadingRouters ? "animate-spin" : ""} />
                          </Button>
                        </div>

                        {loadingRouters ? (
                          <div className="flex justify-center py-12">
                            <Loader2 className="animate-spin text-indigo-650" />
                          </div>
                        ) : routers.length === 0 ? (
                          <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-card">
                            <p className="text-xs text-slate-400 dark:text-slate-500">Belum ada router MikroTik terdaftar. Silakan tambahkan akun router pertama Anda di sebelah kanan.</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {routers.map((router) => (
                              <div
                                key={router.id}
                                className="border border-slate-200 dark:border-slate-800 dark:border-slate-850 rounded-card p-5 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between hover:border-slate-350 dark:hover:border-slate-755 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <h4 className="font-bold text-slate-950 dark:text-slate-50 text-sm">{router.name}</h4>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 font-mono">{router.host}</p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                      User: {router.username} &bull; Peran: {router.role === "main" ? "Utama (Main)" : router.role === "slave" ? `Slave (Port: ${router.slave_port || "ether2"})` : "Tidak Ada"}
                                    </p>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    {!router.is_active ? (
                                      <span className="flex items-center gap-1 text-[10px] font-bold bg-slate-50 dark:bg-slate-950 text-slate-500 dark:bg-slate-950/20 dark:text-slate-400 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full">
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
                                      <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-955/20 dark:text-emerald-455 border border-emerald-200 dark:border-emerald-900 px-2 py-0.5 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        Aktif
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex gap-2 mt-4 pt-3 border-t border-slate-50 dark:border-slate-800/65 justify-end">
                                  {/* Enable / Disable toggle */}
                                  <Button
                                    type="button"
                                    onClick={async () => {
                                      setTogglingRouterId(router.id);
                                      try {
                                        const updated = await updateMikrotikRouter(router.id, { is_active: !router.is_active });
                                        setRouters((prev) =>
                                          prev.map((r) => r.id === router.id ? { ...r, is_active: updated.data.is_active } : r)
                                        );
                                        pushSuccess(updated.data.is_active ? `Router ${router.name} diaktifkan.` : `Router ${router.name} dinonaktifkan.`);
                                      } catch (err: any) {
                                        pushError(err.message || String(err));
                                      } finally {
                                        setTogglingRouterId(null);
                                      }
                                    }}
                                    disabled={togglingRouterId !== null || testingRouterId !== null}
                                    isLoading={togglingRouterId === router.id}
                                    variant={router.is_active ? "danger" : "primary"}
                                    className="!py-1 !px-2.5 text-[10px]"
                                  >
                                    {router.is_active ? "Nonaktifkan" : "Aktifkan"}
                                  </Button>
                                  <Button
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
                                    disabled={testingRouterId !== null || togglingRouterId !== null}
                                    isLoading={testingRouterId === router.id}
                                    variant="secondary"
                                    className="!py-1 !px-2.5 text-[10px]"
                                  >
                                    Test Koneksi
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingRouterId(router.id);
                                      setNewRouterName(router.name);
                                      setNewRouterHost(router.host);
                                      setNewRouterUser(router.username);
                                      setNewRouterPass(""); // blank means no change unless typed
                                      setNewRouterRole(router.role || "none");
                                      setNewRouterSlavePort(router.slave_port || "ether2");
                                      setNewRouterIsActive(router.is_active);
                                      setChangePassword(false);
                                    }}
                                    className="!py-1 !px-2.5 text-[10px]"
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="danger"
                                    onClick={() => setDeletingRouter(router)}
                                    className="!py-1 !px-2.5 text-[10px]"
                                  >
                                    Hapus
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>

                    {/* Right: Add/Edit Account Router Form */}
                    <div className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/40 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 dark:border-slate-850 h-fit space-y-4">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 uppercase tracking-wider">
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
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 block mt-1">Gunakan port API MikroTik (default: 8728 atau 8729 untuk SSL).</span>
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

                        {newRouterRole === "slave" && (
                          <div className="mt-4">
                            <label className="block">
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">PPPoE Port (Interface)</span>
                              <div className="flex gap-2">
                                <select
                                  value={newRouterSlavePort}
                                  onChange={(e) => setNewRouterSlavePort(e.target.value)}
                                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs px-3 py-2"
                                >
                                  {routerInterfaces.map((iface) => (
                                    <option key={iface} value={iface}>{iface}</option>
                                  ))}
                                </select>
                                <Button variant="outline" type="button"
                                  onClick={() => void loadRouterInterfaces({
                                    id: editingRouterId || undefined,
                                    host: newRouterHost,
                                    username: newRouterUser,
                                    password: newRouterPass,
                                  })}
                                  disabled={fetchingInterfaces || !newRouterHost || !newRouterUser}
                                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 p-2 rounded-xl text-slate-650 dark:text-slate-300 disabled:opacity-50 flex items-center justify-center cursor-pointer"
                                  title="Ambil Port dari Router"
                                >
                                  <RefreshCw size={14} className={fetchingInterfaces ? "animate-spin" : ""} />
                                </Button>
                              </div>
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block mt-1">Interface yang digunakan untuk sumber PPPoE (dinonaktifkan otomatis saat Main online).</span>
                            </label>
                          </div>
                        )}

                        <label className="flex items-center gap-2 mb-2 pt-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newRouterIsActive}
                            onChange={(e) => setNewRouterIsActive(e.target.checked)}
                            className="accent-indigo-600 w-4 h-4 rounded border-gray-300 dark:border-slate-700"
                          />
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                            Aktifkan / Matikan Koneksi ke Server
                          </span>
                        </label>

                        <div className="flex gap-2 pt-2">
                          {editingRouterId && (
                            <Button variant="outline" type="button"
                              onClick={() => {
                                setEditingRouterId(null);
                                setNewRouterName("");
                                setNewRouterHost("");
                                setNewRouterUser("");
                                setNewRouterPass("");
                                setNewRouterRole("none");
                                setNewRouterSlavePort("ether2");
                                setNewRouterIsActive(true);
                                setChangePassword(false);
                              }}
                              className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 dark:text-slate-355 font-bold py-2 px-4 rounded-xl text-xs shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all cursor-pointer"
                            >
                              Batal
                            </Button>
                          )}
                          <Button variant="outline" type="button"
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
                                    slave_port: newRouterSlavePort,
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
                                    slave_port: newRouterSlavePort,
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
                          </Button>
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
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Pengaturan Global MikroTik</h3>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">Konfigurasi profile bandwidth default untuk status isolir dan suspended.</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                        <label className="flex flex-col gap-1.5 font-sans">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Nama PPPoE Profile Suspended</span>
                          <input
                            className={inputClassName()}
                            type="text"
                            value={settingsForm["mikrotik_inactive_profile"] ?? "nonaktif"}
                            onChange={(e) =>
                              onFormChange({ ...settingsForm, mikrotik_inactive_profile: e.target.value })
                            }
                            placeholder="nonaktif"
                          />
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">PPPoE Profile di MikroTik yang digunakan ketika pelanggan berstatus Suspended.</span>
                        </label>
                        <label className="flex flex-col gap-1.5 font-sans">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Auto-sync Main ke Slave (Jam)</span>
                          <input
                            className={inputClassName()}
                            type="number"
                            min="0"
                            value={settingsForm["mikrotik_auto_sync_hours"] ?? "0"}
                            onChange={(e) =>
                              onFormChange({ ...settingsForm, mikrotik_auto_sync_hours: e.target.value })
                            }
                            placeholder="0"
                          />
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">Interval auto-sync router Utama ke Slave dalam hitungan jam. Isi 0 untuk menonaktifkan.</span>
                        </label>
                        <label className="flex flex-col gap-1.5 font-sans">
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Hapus Akun Unregistered di MikroTik</span>
                          <select
                            className={inputClassName()}
                            value={settingsForm["mikrotik_delete_unregistered"] ?? "0"}
                            onChange={(e) =>
                              onFormChange({ ...settingsForm, mikrotik_delete_unregistered: e.target.value })
                            }
                          >
                            <option value="0">Nonaktif (Rekomendasi - Aman)</option>
                            <option value="1">Aktif (Bahaya - Menghapus akun non-dashboard)</option>
                          </select>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">Hapus akun PPPoE di MikroTik yang tidak terdaftar di database dashboard saat sinkronisasi/rekon.</span>
                        </label>
                      </div>
                      <div className="flex justify-end pt-3 border-t border-slate-50 dark:border-slate-800/60 mt-auto">
                        <Button variant="outline" type="button"
                          onClick={() => saveSection("MikroTik Global", ["mikrotik_isolir_profile", "mikrotik_inactive_profile", "mikrotik_auto_sync_hours", "mikrotik_delete_unregistered"])}
                          disabled={savingSection === "MikroTik Global"}
                          className="bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold py-2 px-5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {savingSection === "MikroTik Global" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Save MikroTik Settings
                        </Button>
                      </div>
                    </article>
                                      {/* Auto setup panel (shows up if profile Check detects missing profiles on MikroTik) */}
                    {profileCheck && (!profileCheck.isolir_exists || !profileCheck.inactive_exists) && (
                      <article className="col-span-full bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/40 rounded-3xl p-6 shadow-sm space-y-4 animate-in fade-in duration-200">
                        <div className="flex items-start gap-4">
                          <div className="p-2 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 rounded-xl">
                            <AlertCircle size={20} />
                          </div>
                          <div className="space-y-1 w-full">
                            <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">PPP Profile Hilang di MikroTik</h3>
                            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                              Sistem mendeteksi bahwa profile PPPoE berikut belum terkonfigurasi di MikroTik Anda:
                            </p>
                            <ul className="list-disc list-inside text-xs text-amber-600 dark:text-amber-400 mt-2 space-y-1 font-mono">
                              {!profileCheck.isolir_exists && (
                                <li>
                                  Profile Limit/Isolir: <span className="font-semibold">"{profileCheck.isolir_profile_name}"</span>
                                </li>
                              )}
                              {!profileCheck.inactive_exists && (
                                <li>
                                  Profile Suspended: <span className="font-semibold">"{profileCheck.inactive_profile_name}"</span>
                                </li>
                              )}
                            </ul>

                            {showSetupForm ? (
                              <div className="mt-4 p-5 bg-white dark:bg-slate-900 rounded-card border border-slate-200 dark:border-slate-800 space-y-6 text-slate-800 dark:text-slate-100">
                                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350 uppercase tracking-wider">Konfigurasi Setup Profile & Pool</h4>
                                
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                  {/* Isolir Profile Setup */}
                                  <div className="space-y-4 border-slate-100 dark:border-slate-800 dark:border-slate-800/80 lg:border-r pr-0 lg:pr-6">
                                    <div className="border-b pb-1 border-slate-100 dark:border-slate-800">
                                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">1. Konfigurasi Profil Limit (Isolir)</span>
                                    </div>
                                    <label className="block">
                                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">Nama Profile</span>
                                      <input
                                        type="text"
                                        value={setupIsolirName}
                                        onChange={(e) => setSetupIsolirName(e.target.value)}
                                        className={inputClassName()}
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">Local Address</span>
                                      <input
                                        type="text"
                                        value={setupIsolirLocal}
                                        onChange={(e) => setSetupIsolirLocal(e.target.value)}
                                        placeholder="Contoh: 192.168.0.254"
                                        className={inputClassName()}
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">Rate Limit Bandwidth</span>
                                      <input
                                        type="text"
                                        value={setupIsolirLimit}
                                        onChange={(e) => setSetupIsolirLimit(e.target.value)}
                                        placeholder="Contoh: 128k/128k"
                                        className={inputClassName()}
                                      />
                                    </label>
                                    
                                    <div className="space-y-2">
                                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">Koneksi Remote Address (IP Pool)</span>
                                      <div className="flex gap-4">
                                        <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                                          <input
                                            type="radio"
                                            checked={setupIsolirPoolMode === "new"}
                                            onChange={() => setSetupIsolirPoolMode("new")}
                                          />
                                          Buat IP Pool Baru
                                        </label>
                                        <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                                          <input
                                            type="radio"
                                            checked={setupIsolirPoolMode === "existing"}
                                            onChange={() => setSetupIsolirPoolMode("existing")}
                                            disabled={mikrotikPools.length === 0}
                                          />
                                          Gunakan IP Pool yang Ada
                                        </label>
                                      </div>
                                    </div>

                                    {setupIsolirPoolMode === "new" ? (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-950 dark:bg-slate-950/40 rounded-xl border border-slate-150 dark:border-slate-800">
                                        <label className="block">
                                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Nama IP Pool</span>
                                          <input
                                            type="text"
                                            value={setupIsolirPoolName}
                                            onChange={(e) => setSetupIsolirPoolName(e.target.value)}
                                            className={inputClassName()}
                                          />
                                        </label>
                                        <label className="block">
                                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">IP Range</span>
                                          <input
                                            type="text"
                                            value={setupIsolirPoolRange}
                                            onChange={(e) => setSetupIsolirPoolRange(e.target.value)}
                                            placeholder="192.168.3.2-192.168.3.254"
                                            className={inputClassName()}
                                          />
                                        </label>
                                      </div>
                                    ) : (
                                      <label className="block">
                                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Pilih IP Pool</span>
                                        <select
                                          value={setupIsolirPoolName}
                                          onChange={(e) => setSetupIsolirPoolName(e.target.value)}
                                          className={inputClassName()}
                                        >
                                          {mikrotikPools.map((p) => (
                                            <option key={p.id} value={p.name}>
                                              {p.name} ({p.ranges})
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    )}
                                  </div>

                                  {/* Suspended Profile Setup */}
                                  <div className="space-y-4">
                                    <div className="border-b pb-1 border-slate-100 dark:border-slate-800">
                                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">2. Konfigurasi Profil Suspended</span>
                                    </div>
                                    <label className="block">
                                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">Nama Profile</span>
                                      <input
                                        type="text"
                                        value={setupInactiveName}
                                        onChange={(e) => setSetupInactiveName(e.target.value)}
                                        className={inputClassName()}
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">Local Address</span>
                                      <input
                                        type="text"
                                        value={setupInactiveLocal}
                                        onChange={(e) => setSetupInactiveLocal(e.target.value)}
                                        placeholder="Contoh: 192.168.0.254"
                                        className={inputClassName()}
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">Rate Limit Bandwidth</span>
                                      <input
                                        type="text"
                                        value={setupInactiveLimit}
                                        onChange={(e) => setSetupInactiveLimit(e.target.value)}
                                        placeholder="Contoh: 8k/8k"
                                        className={inputClassName()}
                                      />
                                    </label>

                                    <div className="space-y-2">
                                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">Koneksi Remote Address (IP Pool)</span>
                                      <div className="flex gap-4">
                                        <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                                          <input
                                            type="radio"
                                            checked={setupInactivePoolMode === "new"}
                                            onChange={() => setSetupInactivePoolMode("new")}
                                          />
                                          Buat IP Pool Baru
                                        </label>
                                        <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                                          <input
                                            type="radio"
                                            checked={setupInactivePoolMode === "existing"}
                                            onChange={() => setSetupInactivePoolMode("existing")}
                                            disabled={mikrotikPools.length === 0}
                                          />
                                          Gunakan IP Pool yang Ada
                                        </label>
                                      </div>
                                    </div>

                                    {setupInactivePoolMode === "new" ? (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-950 dark:bg-slate-950/40 rounded-xl border border-slate-150 dark:border-slate-800">
                                        <label className="block">
                                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Nama IP Pool</span>
                                          <input
                                            type="text"
                                            value={setupInactivePoolName}
                                            onChange={(e) => setSetupInactivePoolName(e.target.value)}
                                            className={inputClassName()}
                                          />
                                        </label>
                                        <label className="block">
                                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">IP Range</span>
                                          <input
                                            type="text"
                                            value={setupInactivePoolRange}
                                            onChange={(e) => setSetupInactivePoolRange(e.target.value)}
                                            placeholder="192.168.4.2-192.168.4.254"
                                            className={inputClassName()}
                                          />
                                        </label>
                                      </div>
                                    ) : (
                                      <label className="block">
                                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mb-1">Pilih IP Pool</span>
                                        <select
                                          value={setupInactivePoolName}
                                          onChange={(e) => setSetupInactivePoolName(e.target.value)}
                                          className={inputClassName()}
                                        >
                                          {mikrotikPools.map((p) => (
                                            <option key={p.id} value={p.name}>
                                              {p.name} ({p.ranges})
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                                Tekan tombol di bawah untuk mengonfigurasi profile limit dan suspended, beserta IP Pool barunya pada MikroTik secara otomatis.
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end pt-3 border-t border-amber-100 dark:border-amber-900/30 gap-3">
                          {showSetupForm && (
                            <Button variant="outline" type="button"
                              onClick={() => setShowSetupForm(false)}
                              className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 dark:text-slate-200 text-xs font-bold py-2 px-5 rounded-xl shadow-sm transition-all flex items-center cursor-pointer border border-transparent"
                            >
                              Batal
                            </Button>
                          )}
                          <Button variant="outline" type="button"
                            onClick={() => {
                              if (!showSetupForm) {
                                setSetupIsolirName(settingsForm.mikrotik_isolir_profile || "isolir");
                                setSetupInactiveName(settingsForm.mikrotik_inactive_profile || "nonaktif");
                                setShowSetupForm(true);
                              } else {
                                void triggerSetupProfiles();
                              }
                            }}
                            disabled={settingUpProfiles}
                            className="bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white text-xs font-bold py-2 px-5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {settingUpProfiles ? <Loader2 size={12} className="animate-spin" /> : <Settings size={12} />}
                            {showSetupForm ? "Mulai Setup" : "Setup Profile Otomatis"}
                          </Button>
                        </div>
                      </article>
                    )}

                    {/* Router Main -> Slave Sync Panel (Full Width) */}
                    <article className="col-span-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4 animate-in fade-in duration-200">
                      <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <RefreshCw size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Sinkronisasi Router Utama ke Slave</h3>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">Salin otomatis IP Pool, PPP Profile, dan PPP Secret dari router Utama ke semua router Slave.</p>
                          </div>
                        </div>
                        <Button variant="outline" type="button"
                          onClick={handleRouterSync}
                          disabled={syncingRouters}
                          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm cursor-pointer"
                        >
                          {syncingRouters ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                          {syncingRouters ? "Menyinkronkan..." : "Sync Main -> Slave Sekarang"}
                        </Button>
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
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Sinkronisasi Pelanggan dari MikroTik</h3>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">Tarik daftar PPPoE secret dari router dan import yang belum terdaftar di dashboard.</p>
                          </div>
                        </div>
                        <Button variant="outline" type="button"
                          onClick={handleSyncPreview}
                          disabled={syncLoading}
                          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm cursor-pointer"
                        >
                          {syncLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                          {syncLoading ? "Memuat..." : "Preview Secrets"}
                        </Button>
                      </div>

                      {syncError && (
                        <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-955/20 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-450 text-xs rounded-xl px-4 py-3">
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
                            <Button variant="outline" type="button" onClick={toggleAll} className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer">
                              {selected.size === syncSecrets.filter((s) => !s.exists).length ? "Batalkan Semua" : "Pilih Semua Baru"}
                            </Button>
                          </div>

                          <div className="max-h-64 overflow-y-auto rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/85">
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
                                  <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-200 truncate">{secret.name}</span>
                                  <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">Profile: {secret.profile || "default"}{secret.disabled ? " • disabled" : ""}</span>
                                </label>
                                {secret.exists ? (
                                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium px-2.5 py-0.5 rounded-full">Ada</span>
                                ) : (
                                  <span className="text-[10px] bg-emerald-50 dark:bg-emerald-955/20 text-emerald-700 dark:text-emerald-455 font-medium px-2.5 py-0.5 rounded-full">Baru</span>
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
                                  className="w-16 text-center text-xs border border-slate-300 dark:border-slate-850 bg-white dark:bg-slate-900 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-slate-50 dark:text-slate-100 font-mono"
                                />
                              </div>
                              <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-2">
                                <input
                                  id="import-activate-trial"
                                  type="checkbox"
                                  checked={importActivateTrial}
                                  onChange={(e) => setImportActivateTrial(e.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-900"
                                />
                                <label htmlFor="import-activate-trial" className="text-xs text-slate-600 dark:text-slate-400 font-semibold cursor-pointer select-none">
                                  Aktifkan Trial
                                </label>
                              </div>
                              <Button variant="outline" type="button"
                                onClick={handleImport}
                                disabled={importLoading}
                                className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-60 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm cursor-pointer"
                              >
                                {importLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                {importLoading ? "Mengimport..." : `Import ${selected.size} Secret`}
                              </Button>
                            </div>
                          )}

                          {importResults && (
                            <div className="space-y-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                              <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Hasil Import:</p>
                              <div className="max-h-40 overflow-y-auto space-y-1">
                                {importResults.map((r) => (
                                  <div key={r.name} className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${r.status === "imported" ? "bg-emerald-50 dark:bg-emerald-955/20 text-emerald-700 dark:text-emerald-455" :
                                    r.status === "error" ? "bg-rose-50 dark:bg-rose-955/20 text-rose-700 dark:text-rose-455" :
                                      "bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 dark:text-slate-450"
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

                {/* Discord Alerts Sub-tab */}
                {appSubTab === "discord" && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in duration-200">
                    {/* Card 2: Discord Notifications */}
                    <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <Bell size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Discord Notifications</h3>
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

                      <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 dark:border-slate-805 rounded-card p-4 mt-auto">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Uji webhook Discord masukan di atas.</span>
                        <div className="flex items-center gap-2">
                          {discordResult && (
                            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${discordResult.success ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-455 dark:border-emerald-900/60" : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-955/20 dark:text-rose-455 dark:border-rose-900/60"
                              }`}>
                              {discordResult.success ? "Sukses" : "Gagal"}
                            </span>
                          )}
                          <Button variant="outline" type="button"
                            onClick={handleTestDiscord}
                            disabled={testingDiscord}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                          >
                            {testingDiscord ? <Loader2 size={12} className="animate-spin" /> : null}
                            {testingDiscord ? "Menguji..." : "Test Webhook"}
                          </Button>
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
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Discord Bot Settings</h3>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">Konfigurasi Discord Bot untuk menerima slash commands.</p>
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
                          </label>
                        </div>
                      </div>

                      <div className="flex justify-end pt-3 border-t border-slate-50 dark:border-slate-800/60 mt-auto">
                        <Button variant="outline" type="button"
                          onClick={() => saveSection("Discord & Bot", [
                            "discord_webhook_url", "discord_notify_payment", "discord_notify_generate",
                            "discord_notify_worker", "discord_bot_token", "discord_bot_application_id",
                            "discord_bot_guild_id", "discord_bot_enabled"
                          ])}
                          disabled={savingSection === "Discord & Bot"}
                          className="bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold py-2 px-5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {savingSection === "Discord & Bot" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Save Discord Settings
                        </Button>
                      </div>
                    </article>
                  </div>
                )}

                {/* SMTP Email Sub-tab */}
                {appSubTab === "smtp" && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <Mail size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">SMTP Email Notification</h3>
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

                      <div className="border-t border-slate-100 dark:border-slate-800 dark:border-slate-805 pt-5 space-y-4">
                        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Uji Pengiriman Email</h4>
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
                          <Button variant="outline" type="button"
                            onClick={handleTestSMTP}
                            disabled={testingSMTP}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer h-[42px]"
                          >
                            {testingSMTP ? <Loader2 size={14} className="animate-spin" /> : null}
                            {testingSMTP ? "Menguji..." : "Kirim Email Test"}
                          </Button>
                        </div>
                        {smtpResult && (
                          <div className={`flex items-start gap-2 border text-xs rounded-xl px-4 py-3 ${smtpResult.success
                            ? "bg-emerald-50 dark:bg-emerald-955/20 border-emerald-250 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-455"
                            : "bg-rose-50 dark:bg-rose-955/20 border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-455"
                            }`}>
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <span>{smtpResult.message}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end pt-3 border-t border-slate-50 dark:border-slate-800/60 mt-auto">
                        <Button variant="outline" type="button"
                          onClick={() => saveSection("SMTP Email", [
                            "smtp_enabled", "smtp_host", "smtp_port", "smtp_username", "smtp_password",
                            "smtp_from_email", "smtp_encryption"
                          ])}
                          disabled={savingSection === "SMTP Email"}
                          className="bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold py-2 px-5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {savingSection === "SMTP Email" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Save SMTP Settings
                        </Button>
                      </div>
                    </article>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* Tab 2: ACS & Vendor Settings */}
          {activeTab === "acs" && (
            <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in duration-200">
              {/* Sidebar Sub-tabs */}
              <aside className="w-full lg:w-64 shrink-0 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 lg:pr-4">
                {[
                  { id: "acs-config", label: "ACS Configuration", icon: Wifi },
                  { id: "vendor-management", label: "Vendor & WiFi", icon: Shield },
                ].map((sub) => {
                  const SubIcon = sub.icon;
                  const isSubActive = acsSubTab === sub.id;
                  return (
                    <Button variant="outline"
                      key={sub.id}
                      type="button"
                      onClick={() => setAcsSubTab(sub.id as any)}
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${isSubActive
                        ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-900/50"
                        }`}
                    >
                      <SubIcon size={16} />
                      {sub.label}
                    </Button>
                  );
                })}
              </aside>

              {/* ACS Sub-tab Content */}
              <div className="flex-1 min-w-0">

                {/* ACS Config Sub-tab */}
                {acsSubTab === "acs-config" && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* Card 1: GenieACS URL Configuration */}
                    <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                          <div className="p-2 bg-indigo-50 dark:bg-indigo-955/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <Wifi size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">GenieACS URL Configuration</h3>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">Configure connection details for your GenieACS server.</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">GenieACS URL *</span>
                            <input
                              className={inputClassName(settingsErrors.acs_url)}
                              type="text"
                              value={settingsForm["acs_url"] ?? ""}
                              onChange={(e) => onFormChange({ ...settingsForm, acs_url: e.target.value })}
                              placeholder="http://localhost:7557"
                            />
                            {renderInlineError(settingsErrors.acs_url)}
                            <span className="text-[10px] text-slate-400 dark:text-slate-500">
                              Enter the full URL to GenieACS devices endpoint (e.g. http://localhost:7557)
                            </span>
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
                          </label>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 dark:border-slate-805 rounded-card p-4 mt-auto">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Uji server GenieACS.</span>
                        <div className="flex items-center gap-2">
                          {acsResult && (
                            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${acsResult.success ? "bg-emerald-50 text-emerald-700 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-455 dark:border-emerald-900/60" : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-955/20 dark:text-rose-455 dark:border-rose-900/60"
                              }`}>
                              {acsResult.success ? "Sukses" : "Gagal"}
                            </span>
                          )}
                          <Button variant="outline" type="button"
                            onClick={handleTestGenieACS}
                            disabled={testingAcs}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                          >
                            {testingAcs ? <Loader2 size={12} className="animate-spin" /> : null}
                            {testingAcs ? "Menguji..." : "Test URL"}
                          </Button>
                          <Button variant="outline" type="button"
                            onClick={() => saveSection("GenieACS URL", ["acs_url", "acs_username", "acs_password"])}
                            disabled={savingSection === "GenieACS URL"}
                            className="bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold py-1.5 px-3.5 rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 font-sans"
                          >
                            {savingSection === "GenieACS URL" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            Save URL
                          </Button>
                        </div>
                      </div>
                    </article>

                    {/* Card 2: Virtual Parameters Configuration */}
                    <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                          <div className="p-2 bg-indigo-50 dark:bg-indigo-955/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <Sliders size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Virtual Parameters Configuration (Required)</h3>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">Configure the virtual parameter names used in your GenieACS setup.</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">PPPoE Username Parameter *</span>
                            <input
                              className={inputClassName()}
                              type="text"
                              value={settingsForm["vpPppoeUsername"] ?? "VirtualParameters.pppoeUsername"}
                              onChange={(e) => onFormChange({ ...settingsForm, vpPppoeUsername: e.target.value })}
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">WAN Bridge Parameter *</span>
                            <input
                              className={inputClassName()}
                              type="text"
                              value={settingsForm["vpWanBridge"] ?? "VirtualParameters.wanBridge"}
                              onChange={(e) => onFormChange({ ...settingsForm, vpWanBridge: e.target.value })}
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">RX Power Parameter *</span>
                            <input
                              className={inputClassName()}
                              type="text"
                              value={settingsForm["vpRxPower"] ?? "VirtualParameters.RXPower"}
                              onChange={(e) => onFormChange({ ...settingsForm, vpRxPower: e.target.value })}
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Temperature Parameter *</span>
                            <input
                              className={inputClassName()}
                              type="text"
                              value={settingsForm["vpTemperature"] ?? "VirtualParameters.gettemp"}
                              onChange={(e) => onFormChange({ ...settingsForm, vpTemperature: e.target.value })}
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Active Devices Parameter *</span>
                            <input
                              className={inputClassName()}
                              type="text"
                              value={settingsForm["vpActiveDevices"] ?? "VirtualParameters.activedevices"}
                              onChange={(e) => onFormChange({ ...settingsForm, vpActiveDevices: e.target.value })}
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Super Admin Parameter *</span>
                            <input
                              className={inputClassName()}
                              type="text"
                              value={settingsForm["vpSuperAdmin"] ?? "VirtualParameters.superAdmin"}
                              onChange={(e) => onFormChange({ ...settingsForm, vpSuperAdmin: e.target.value })}
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Super Password Parameter *</span>
                            <input
                              className={inputClassName()}
                              type="text"
                              value={settingsForm["vpSuperPassword"] ?? "VirtualParameters.superPassword"}
                              onChange={(e) => onFormChange({ ...settingsForm, vpSuperPassword: e.target.value })}
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">User Admin Parameter *</span>
                            <input
                              className={inputClassName()}
                              type="text"
                              value={settingsForm["vpUserAdmin"] ?? "VirtualParameters.userAdmin"}
                              onChange={(e) => onFormChange({ ...settingsForm, vpUserAdmin: e.target.value })}
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-1.5 col-span-full">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">User Password Parameter *</span>
                            <input
                              className={inputClassName()}
                              type="text"
                              value={settingsForm["vpUserPassword"] ?? "VirtualParameters.userPassword"}
                              onChange={(e) => onFormChange({ ...settingsForm, vpUserPassword: e.target.value })}
                              required
                            />
                          </label>
                        </div>
                      </div>

                      <div className="flex justify-end pt-3 border-t border-slate-50 dark:border-slate-800/60 mt-auto">
                        <Button variant="outline" type="button"
                          onClick={() => saveSection("Virtual Parameters", [
                            "vpPppoeUsername", "vpWanBridge", "vpRxPower", "vpTemperature",
                            "vpActiveDevices", "vpSuperAdmin", "vpSuperPassword", "vpUserAdmin", "vpUserPassword"
                          ])}
                          disabled={savingSection === "Virtual Parameters"}
                          className="bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold py-2 px-5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {savingSection === "Virtual Parameters" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Save Virtual Parameters
                        </Button>
                      </div>
                    </article>

                    {/* Card 3: Range RX Power Configuration */}
                    <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                          <div className="p-2 bg-indigo-50 dark:bg-indigo-955/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <Wifi size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Range RX Power Configuration</h3>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">Configure the RX Power signal quality thresholds in dBm.</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{"Excellent Signal (>= dBm) *"}</span>
                            <input
                              className={inputClassName()}
                              type="number"
                              value={settingsForm.gacs_rx_power_excellent || "-21"}
                              onChange={(e) => handleExcellentChange(e.target.value)}
                              required
                            />
                            <span className="text-[10px] text-emerald-600 font-semibold">
                              Excellent (Green): Signal &gt;= {settingsForm.gacs_rx_power_excellent || "-21"} dBm
                            </span>
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{"Fair Signal (>= dBm) *"}</span>
                            <input
                              className={inputClassName()}
                              type="number"
                              value={settingsForm.gacs_rx_power_fair || "-25"}
                              onChange={(e) => handleFairChange(e.target.value)}
                              required
                            />
                            <span className="text-[10px] text-amber-600 font-semibold">
                              Fair (Yellow): {settingsForm.gacs_rx_power_excellent || "-21"} dBm &gt; Signal &gt;= {settingsForm.gacs_rx_power_fair || "-25"} dBm
                            </span>
                          </label>

                          <div className="col-span-full bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 dark:border-slate-800/80 rounded-card p-4 text-xs space-y-2">
                            <p className="font-bold text-slate-850 dark:text-slate-200">How RX Power Thresholds Work:</p>
                            <ul className="list-disc pl-4 space-y-1 text-slate-500 dark:text-slate-400">
                              <li><span className="text-emerald-600 font-semibold">Excellent (Green):</span> Signal &gt;= {settingsForm.gacs_rx_power_excellent || "-21"} dBm</li>
                              <li><span className="text-amber-600 font-semibold">Fair (Yellow):</span> {settingsForm.gacs_rx_power_excellent || "-21"} dBm &gt; Signal &gt;= {settingsForm.gacs_rx_power_fair || "-25"} dBm</li>
                              <li><span className="text-rose-600 font-semibold">Poor (Red):</span> Signal &lt; {settingsForm.gacs_rx_power_fair || "-25"} dBm</li>
                              <li className="text-[10px] italic">Note: More negative values = weaker signal (e.g., -25 is weaker than -21)</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-3 border-t border-slate-50 dark:border-slate-800/60 mt-auto">
                        <Button variant="outline" type="button"
                          onClick={() => saveSection("RX Power Settings", ["gacs_rx_power_excellent", "gacs_rx_power_fair", "rxPowerThresholds"])}
                          disabled={savingSection === "RX Power Settings"}
                          className="bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold py-2 px-5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {savingSection === "RX Power Settings" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Save RX Power Settings
                        </Button>
                      </div>
                    </article>

                    {/* Card 4: Auto Refresh Intervals Configuration */}
                    <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-5">
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                          <div className="p-2 bg-indigo-50 dark:bg-indigo-955/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <RefreshCw size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Auto Refresh Intervals Configuration</h3>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">Configure how often the application refreshes data automatically.</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Device Data Refresh (min) *</span>
                            <input
                              className={inputClassName()}
                              type="number"
                              step="any"
                              value={getJsonValue(settingsForm.autoRefreshIntervals, "deviceDataRefresh", 5)}
                              onChange={(e) => setJsonValue("autoRefreshIntervals", "deviceDataRefresh", Number(e.target.value))}
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Mapping Data Refresh (min) *</span>
                            <input
                              className={inputClassName()}
                              type="number"
                              step="any"
                              value={getJsonValue(settingsForm.autoRefreshIntervals, "mappingDataRefresh", 5)}
                              onChange={(e) => setJsonValue("autoRefreshIntervals", "mappingDataRefresh", Number(e.target.value))}
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Dashboard Data Refresh (min) *</span>
                            <input
                              className={inputClassName()}
                              type="number"
                              step="any"
                              value={getJsonValue(settingsForm.autoRefreshIntervals, "dashboardDataRefresh", 5)}
                              onChange={(e) => setJsonValue("autoRefreshIntervals", "dashboardDataRefresh", Number(e.target.value))}
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Device Status Refresh (min) *</span>
                            <input
                              className={inputClassName()}
                              type="number"
                              step="any"
                              value={getJsonValue(settingsForm.autoRefreshIntervals, "deviceStatusRefresh", 0.5)}
                              onChange={(e) => setJsonValue("autoRefreshIntervals", "deviceStatusRefresh", Number(e.target.value))}
                              required
                            />
                          </label>

                          <label className="flex flex-col gap-1.5 col-span-full">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Device Online Threshold (min) *</span>
                            <input
                              className={inputClassName()}
                              type="number"
                              step="any"
                              value={getJsonValue(settingsForm.autoRefreshIntervals, "deviceOnlineThreshold", 10)}
                              onChange={(e) => setJsonValue("autoRefreshIntervals", "deviceOnlineThreshold", Number(e.target.value))}
                              required
                            />
                          </label>
                        </div>
                      </div>

                      <div className="flex justify-end pt-3 border-t border-slate-50 dark:border-slate-800/60 mt-auto">
                        <Button variant="outline" type="button"
                          onClick={() => saveSection("Auto Refresh Intervals", ["autoRefreshIntervals"])}
                          disabled={savingSection === "Auto Refresh Intervals"}
                          className="bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold py-2 px-5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {savingSection === "Auto Refresh Intervals" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                          Save RX Power Settings
                        </Button>
                      </div>
                    </article>
                  </div>
                )}

                {/* Vendor Management Sub-tab */}
                {acsSubTab === "vendor-management" && (
                  <div className="space-y-6">

                    {/* Sub-tab Navigation */}
                    <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800 pb-2">
                      <Button variant="outline" type="button"
                        onClick={() => setVendorSubTab("vendors")}
                        className={`text-xs font-bold pb-2 transition-all cursor-pointer border-b-2 px-1 ${vendorSubTab === "vendors"
                          ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                          : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300"
                          }`}
                      >
                        📦 Vendors
                      </Button>
                      <Button variant="outline" type="button"
                        onClick={() => setVendorSubTab("wifi")}
                        className={`text-xs font-bold pb-2 transition-all cursor-pointer border-b-2 px-1 ${vendorSubTab === "wifi"
                          ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                          : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300"
                          }`}
                      >
                        📡 WiFi Security Config
                      </Button>
                    </div>

                    {/* Vendors Sub-tab Content */}
                    {vendorSubTab === "vendors" && (
                      <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Vendors List</h3>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">Manage parameter path mapping configurations per ONT manufacturer.</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" type="button"
                              onClick={() => exportData(vendors, "vendors_export.json")}
                              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <Download size={14} />
                              Export
                            </Button>
                            <label className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer">
                              <Upload size={14} />
                              Import
                              <input
                                type="file"
                                accept=".json"
                                onChange={handleImportVendors}
                                className="hidden"
                              />
                            </label>
                            <Button variant="outline" type="button"
                              onClick={() => setEditingVendor({})}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Plus size={14} />
                              Add Vendor
                            </Button>
                          </div>
                        </div>

                        {loadingVendors ? (
                          <div className="flex justify-center py-12">
                            <Loader2 className="animate-spin text-indigo-650" />
                          </div>
                        ) : vendors.length === 0 ? (
                          <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-card">
                            <p className="text-xs text-slate-400 dark:text-slate-500">No vendor configurations found. Add one or import JSON to get started.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">
                                  <th className="py-3 px-4 font-bold">Vendor Information</th>
                                  <th className="py-3 px-4 font-bold">Configuration</th>
                                  <th className="py-3 px-4 font-bold">Detection Patterns</th>
                                  <th className="py-3 px-4 font-bold text-center">Priority</th>
                                  <th className="py-3 px-4 font-bold text-center">Status</th>
                                  <th className="py-3 px-4 font-bold text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                {vendors.map((vendor) => (
                                  <tr key={vendor.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                                    <td className="py-3 px-4">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-sm shrink-0">
                                          {vendor.name.charAt(0)}
                                        </div>
                                        <div>
                                          <p className="font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100">{vendor.name}</p>
                                          <p className="text-[10px] text-slate-450 mt-0.5 truncate max-w-[200px]" title={vendor.description}>{vendor.description}</p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-4 space-y-1 text-[10px] text-slate-650 dark:text-slate-400">
                                      <p><strong className="text-slate-500 dark:text-slate-400">Prefix:</strong> {vendor.parameter_prefix}</p>
                                      {vendor.service_list_path && <p><strong className="text-slate-500 dark:text-slate-400">Svc List:</strong> {vendor.service_list_path}</p>}
                                      {vendor.lan_binding_path && <p><strong className="text-slate-500 dark:text-slate-400">LAN Interf:</strong> {vendor.lan_binding_path}</p>}
                                    </td>
                                    <td className="py-3 px-4 space-y-1 text-[10px]">
                                      <p><strong className="text-slate-500 dark:text-slate-400">MFR:</strong> <code className="bg-slate-100 dark:bg-slate-800/80 px-1 py-0.5 rounded font-mono">{vendor.manufacturer_patterns}</code></p>
                                      <p><strong className="text-slate-500 dark:text-slate-400">PROD:</strong> <code className="bg-slate-100 dark:bg-slate-800/80 px-1 py-0.5 rounded font-mono">{vendor.product_patterns}</code></p>
                                    </td>
                                    <td className="py-3 px-4 text-center font-semibold text-slate-700 dark:text-slate-300">{vendor.priority}</td>
                                    <td className="py-3 px-4 text-center">
                                      {vendor.enabled === 1 ? (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/60 px-2 py-0.5 rounded-full">
                                          Active
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-slate-50 dark:bg-slate-950 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full">
                                          Disabled
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 text-right shrink-0">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <Button variant="outline" type="button"
                                          onClick={() => setEditingVendor(vendor)}
                                          className="p-1 hover:text-indigo-600 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                                          title="Edit Vendor"
                                        >
                                          <Edit size={14} />
                                        </Button>
                                        <Button variant="outline" type="button"
                                          onClick={() => setDeletingVendorItem(vendor)}
                                          className="p-1 hover:text-rose-600 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                                          title="Delete Vendor"
                                        >
                                          <Trash2 size={14} />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </article>
                    )}

                    {/* WiFi Security Sub-tab Content */}
                    {vendorSubTab === "wifi" && (
                      <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">WiFi Security Config</h3>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">Configure WiFi password paths per product class.</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" type="button"
                              onClick={() => exportData(wifiConfigs, "wifi_configs_export.json")}
                              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <Download size={14} />
                              Export
                            </Button>
                            <label className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer">
                              <Upload size={14} />
                              Import
                              <input
                                type="file"
                                accept=".json"
                                onChange={handleImportWifi}
                                className="hidden"
                              />
                            </label>
                            <Button variant="outline" type="button"
                              onClick={() => setEditingWifiConfig({})}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Plus size={14} />
                              Add WiFi Config
                            </Button>
                          </div>
                        </div>

                        {loadingWifi ? (
                          <div className="flex justify-center py-12">
                            <Loader2 className="animate-spin text-indigo-650" />
                          </div>
                        ) : wifiConfigs.length === 0 ? (
                          <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-card">
                            <p className="text-xs text-slate-400 dark:text-slate-500">No WiFi security configurations found. Add one or import JSON to get started.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">
                                  <th className="py-3 px-4 font-bold">Product Class</th>
                                  <th className="py-3 px-4 font-bold">Password Configuration</th>
                                  <th className="py-3 px-4 font-bold">Security Types</th>
                                  <th className="py-3 px-4 font-bold text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                {wifiConfigs.map((item) => (
                                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-50 dark:text-slate-100">
                                      {item.product_class}
                                    </td>
                                    <td className="py-3 px-4 space-y-1 text-[10px]">
                                      <p><strong className="text-slate-500 dark:text-slate-400">Path:</strong> <code className="bg-slate-100 dark:bg-slate-800/80 px-1 py-0.5 rounded font-mono">{item.password_param_path}</code></p>
                                    </td>
                                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 dark:text-slate-350">
                                      <div className="flex flex-wrap gap-1">
                                        {item.security_types.map((type) => (
                                          <span key={type} className="inline-flex text-[9px] font-semibold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                            {type.trim()}
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <Button variant="outline" type="button"
                                          onClick={() => setEditingWifiConfig(item)}
                                          className="p-1 hover:text-indigo-600 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                                          title="Edit Wifi Config"
                                        >
                                          <Edit size={14} />
                                        </Button>
                                        <Button variant="outline" type="button"
                                          onClick={() => setDeletingWifiItem(item)}
                                          className="p-1 hover:text-rose-600 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                                          title="Delete Wifi Config"
                                        >
                                          <Trash2 size={14} />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </article>
                    )}

                  </div>
                )}

              </div>
            </div>
          )}

          {/* Tab 4: User Account - REMOVED (use Manajemen Tim instead) */}
          {false && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in duration-200">
              {/* Card 1: Change Username */}
              <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-955/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <UserIcon size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Change Username</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Update username akun dashboard Anda.</p>
                  </div>
                </div>

                <form onSubmit={handleUpdateUsername} className="space-y-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Username Saat Ini *</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={currentUsername}
                      onChange={(e) => setCurrentUsername(e.target.value)}
                      placeholder="Masukkan username saat ini"
                      required
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Username Baru *</span>
                    <input
                      className={inputClassName()}
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Masukkan username baru"
                      required
                    />
                  </label>

                  <div className="flex justify-end pt-3">
                    <Button variant="primary" isLoading={userSubmitting === "username"} >
                      Update Username</Button>
                  </div>
                </form>
              </article>

              {/* Card 2: Change Password */}
              <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-955/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <Lock size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">Change Password</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Perbarui kata sandi akun keamanan Anda.</p>
                  </div>
                </div>

                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Password Saat Ini *</span>
                    <input
                      className={inputClassName()}
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Password Baru *</span>
                    <input
                      className={inputClassName()}
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Konfirmasi Password Baru *</span>
                    <input
                      className={inputClassName()}
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                  </label>

                  <div className="flex justify-end pt-3">
                    <Button variant="primary" isLoading={userSubmitting === "password"} >
                      Update Password</Button>
                  </div>
                </form>
              </article>
            </div>
          )}

        </div>

        {/* Bottom Actions Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
            Operasional backup manual dan histori file sekarang dipindahkan ke tab <strong>Monitoring</strong> agar tim bisa cek status sistem tanpa membuka form konfigurasi.
          </p>
          <Button variant="outline" type="submit"
            disabled={submitting}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold py-2.5 px-6 rounded-xl shadow-md hover:shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isBusy("save-settings") ? <Loader2 size={14} className="animate-spin" /> : null}
            {isBusy("save-settings") ? "Menyimpan..." : "Simpan Semua Pengaturan"}
          </Button>
        </div>
      </form>

      {/* Edit Vendor Modal */}
      {editingVendor !== null && (
        <Modal
          title={editingVendor.id ? "Edit Vendor" : "Add Vendor"}
          onClose={() => setEditingVendor(null)}
          actions={
            <>
              <Button variant="outline" type="button"
                onClick={() => setEditingVendor(null)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Cancel
              </Button>
              <Button variant="outline" type="button"
                onClick={async () => {
                  if (!editingVendor.name || !editingVendor.parameter_prefix) {
                    pushError("Vendor Name and Parameter Prefix are required.");
                    return;
                  }
                  try {
                    const payload = {
                      name: editingVendor.name || "",
                      parameter_prefix: editingVendor.parameter_prefix || "",
                      manufacturer_patterns: Array.isArray(editingVendor.manufacturer_patterns)
                        ? editingVendor.manufacturer_patterns
                        : (editingVendor.manufacturer_patterns ? (editingVendor.manufacturer_patterns as string).split(",").map(s => s.trim()) : []),
                      product_patterns: Array.isArray(editingVendor.product_patterns)
                        ? editingVendor.product_patterns
                        : (editingVendor.product_patterns ? (editingVendor.product_patterns as string).split(",").map(s => s.trim()) : []),
                      service_list_path: editingVendor.service_list_path || "",
                      lan_binding_path: editingVendor.lan_binding_path || "",
                      vlan_id_path: editingVendor.vlan_id_path || "",
                      http_wan_enable_path: editingVendor.http_wan_enable_path || "",
                      firewall_level_path: editingVendor.firewall_level_path || "",
                      priority: Number(editingVendor.priority ?? 10),
                      enabled: Number(editingVendor.enabled ?? 1),
                      description: editingVendor.description || "",
                    };
                    if (editingVendor.id) {
                      await updateVendor(editingVendor.id, payload);
                      pushSuccess("Vendor berhasil diperbarui.");
                    } else {
                      await createVendor(payload);
                      pushSuccess("Vendor baru berhasil ditambahkan.");
                    }
                    setEditingVendor(null);
                    void loadVendors();
                  } catch (err: any) {
                    pushError(err.message || "Gagal menyimpan vendor.");
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md hover:shadow-indigo-500/20 transition-all cursor-pointer"
              >
                Save
              </Button>
            </>
          }
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Vendor Name *</span>
                <input
                  type="text"
                  value={editingVendor.name || ""}
                  onChange={(e) => setEditingVendor({ ...editingVendor, name: e.target.value })}
                  placeholder="e.g. FiberHome"
                  className={inputClassName()}
                  required
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Parameter Prefix *</span>
                <input
                  type="text"
                  value={editingVendor.parameter_prefix || ""}
                  onChange={(e) => setEditingVendor({ ...editingVendor, parameter_prefix: e.target.value })}
                  placeholder="e.g. X_FH"
                  className={inputClassName()}
                  required
                />
              </label>

              <label className="block col-span-full">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Manufacturer Patterns (Comma-separated) *</span>
                <input
                  type="text"
                  value={Array.isArray(editingVendor.manufacturer_patterns) ? editingVendor.manufacturer_patterns.join(", ") : (editingVendor.manufacturer_patterns || "")}
                  onChange={(e) => setEditingVendor({ ...editingVendor, manufacturer_patterns: e.target.value.split(",").map(s => s.trim()) })}
                  placeholder="e.g. fh, fiberhome"
                  className={inputClassName()}
                  required
                />
              </label>

              <label className="block col-span-full">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Product Patterns (Comma-separated) *</span>
                <input
                  type="text"
                  value={Array.isArray(editingVendor.product_patterns) ? editingVendor.product_patterns.join(", ") : (editingVendor.product_patterns || "")}
                  onChange={(e) => setEditingVendor({ ...editingVendor, product_patterns: e.target.value.split(",").map(s => s.trim()) })}
                  placeholder="e.g. an5506, hg6145"
                  className={inputClassName()}
                  required
                />
              </label>

              <div className="col-span-full border-t border-slate-100 dark:border-slate-800 pt-3">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 mb-2">WAN Connection Parameters</h4>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Service List Path</span>
                <input
                  type="text"
                  value={editingVendor.service_list_path || ""}
                  onChange={(e) => setEditingVendor({ ...editingVendor, service_list_path: e.target.value })}
                  placeholder="e.g. X_FH_ServiceList"
                  className={inputClassName()}
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">LAN Binding Path</span>
                <input
                  type="text"
                  value={editingVendor.lan_binding_path || ""}
                  onChange={(e) => setEditingVendor({ ...editingVendor, lan_binding_path: e.target.value })}
                  placeholder="e.g. X_FH_LanInterface"
                  className={inputClassName()}
                />
              </label>

              <label className="block col-span-full">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">VLAN ID Path</span>
                <input
                  type="text"
                  value={editingVendor.vlan_id_path || ""}
                  onChange={(e) => setEditingVendor({ ...editingVendor, vlan_id_path: e.target.value })}
                  placeholder="e.g. VLANID"
                  className={inputClassName()}
                />
              </label>

              <div className="col-span-full border-t border-slate-100 dark:border-slate-800 pt-3">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 mb-2">Security Parameters</h4>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">HTTP WAN Enable Path</span>
                <input
                  type="text"
                  value={editingVendor.http_wan_enable_path || ""}
                  onChange={(e) => setEditingVendor({ ...editingVendor, http_wan_enable_path: e.target.value })}
                  placeholder="e.g. InternetGatewayDevice.X_FH_FireWall.REMOTEACCEnable"
                  className={inputClassName()}
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Firewall Level Path</span>
                <input
                  type="text"
                  value={editingVendor.firewall_level_path || ""}
                  onChange={(e) => setEditingVendor({ ...editingVendor, firewall_level_path: e.target.value })}
                  placeholder="e.g. InternetGatewayDevice.X_FH_FireWall.LEVEL"
                  className={inputClassName()}
                />
              </label>

              <div className="col-span-full border-t border-slate-100 dark:border-slate-800 pt-3">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 mb-2">Settings</h4>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Priority</span>
                <input
                  type="number"
                  value={editingVendor.priority ?? 10}
                  onChange={(e) => setEditingVendor({ ...editingVendor, priority: Number(e.target.value) })}
                  placeholder="10"
                  className={inputClassName()}
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Status</span>
                <select
                  value={editingVendor.enabled ?? 1}
                  onChange={(e) => setEditingVendor({ ...editingVendor, enabled: Number(e.target.value) })}
                  className={inputClassName()}
                >
                  <option value={1}>Enabled</option>
                  <option value={0}>Disabled</option>
                </select>
              </label>

              <label className="block col-span-full">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Description</span>
                <textarea
                  value={editingVendor.description || ""}
                  onChange={(e) => setEditingVendor({ ...editingVendor, description: e.target.value })}
                  placeholder="Description of ONT devices..."
                  className={inputClassName()}
                  rows={2}
                />
              </label>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Vendor Modal */}
      {deletingVendorItem && (
        <Modal
          title="Delete Vendor"
          onClose={() => setDeletingVendorItem(null)}
          actions={
            <>
              <Button variant="outline" type="button"
                onClick={() => setDeletingVendorItem(null)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Batal
              </Button>
              <Button variant="outline" type="button"
                onClick={async () => {
                  try {
                    await deleteVendor(deletingVendorItem.id);
                    pushSuccess("Vendor berhasil dihapus.");
                    setDeletingVendorItem(null);
                    void loadVendors();
                  } catch (err: any) {
                    pushError(err.message || "Gagal menghapus vendor");
                  }
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md hover:shadow-rose-500/20 transition-all cursor-pointer"
              >
                Hapus Vendor
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Apakah Anda yakin ingin menghapus vendor <strong>{deletingVendorItem.name}</strong>?
              </p>
              <p className="text-xs text-slate-450 mt-2 leading-relaxed">
                Tindakan ini tidak dapat dibatalkan. Pengaturan pencocokan parameter ONT untuk prefix <strong>{deletingVendorItem.parameter_prefix}</strong> akan dihapus secara permanen.
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit WiFi Security Config Modal */}
      {editingWifiConfig !== null && (
        <Modal
          title={editingWifiConfig.id ? "Edit WiFi Security Config" : "Add WiFi Security Config"}
          onClose={() => setEditingWifiConfig(null)}
          actions={
            <>
              <Button variant="outline" type="button"
                onClick={() => setEditingWifiConfig(null)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Cancel
              </Button>
              <Button variant="outline" type="button"
                onClick={async () => {
                  if (!editingWifiConfig.product_class || !editingWifiConfig.password_param_path) {
                    pushError("Product Class and Password Parameter Path are required.");
                    return;
                  }
                  try {
                    const payload = {
                      product_class: editingWifiConfig.product_class || "",
                      password_param_path: editingWifiConfig.password_param_path || "",
                      security_types: Array.isArray(editingWifiConfig.security_types)
                        ? editingWifiConfig.security_types
                        : (editingWifiConfig.security_types ? (editingWifiConfig.security_types as string).split(",").map(s => s.trim()) : []),
                    };
                    if (editingWifiConfig.id) {
                      await updateWifiSecurity(editingWifiConfig.id, payload);
                      pushSuccess("WiFi Security Config berhasil diperbarui.");
                    } else {
                      await createWifiSecurity(payload);
                      pushSuccess("WiFi Security Config baru berhasil ditambahkan.");
                    }
                    setEditingWifiConfig(null);
                    void loadWifiConfigs();
                  } catch (err: any) {
                    pushError(err.message || "Gagal menyimpan WiFi Security Config.");
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md hover:shadow-indigo-500/20 transition-all cursor-pointer"
              >
                Save
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Product Class *</span>
              <input
                type="text"
                value={editingWifiConfig.product_class || ""}
                onChange={(e) => setEditingWifiConfig({ ...editingWifiConfig, product_class: e.target.value })}
                placeholder="e.g. F477V2 EPON, ZXHN F477"
                className={inputClassName()}
                required
              />
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-1">
                Enter multiple product classes separated by commas
              </span>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Password Parameter Path *</span>
              <input
                type="text"
                value={editingWifiConfig.password_param_path || ""}
                onChange={(e) => setEditingWifiConfig({ ...editingWifiConfig, password_param_path: e.target.value })}
                placeholder="e.g. PreSharedKey.1.KeyPassphrase"
                className={inputClassName()}
                required
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Security Types Mapping *</span>
              <input
                type="text"
                value={Array.isArray(editingWifiConfig.security_types) ? editingWifiConfig.security_types.join(", ") : (editingWifiConfig.security_types || "")}
                onChange={(e) => setEditingWifiConfig({ ...editingWifiConfig, security_types: e.target.value.split(",").map(s => s.trim()) })}
                placeholder="e.g. WPAand11i, None"
                className={inputClassName()}
                required
              />
              <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-1">
                Security types mapping (JSON or comma-separated)
              </span>
            </label>
          </div>
        </Modal>
      )}

      {/* Delete WiFi Security Config Modal */}
      {deletingWifiItem && (
        <Modal
          title="Delete WiFi Config"
          onClose={() => setDeletingWifiItem(null)}
          actions={
            <>
              <Button variant="outline" type="button"
                onClick={() => setDeletingWifiItem(null)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Batal
              </Button>
              <Button variant="outline" type="button"
                onClick={async () => {
                  try {
                    await deleteWifiSecurity(deletingWifiItem.id);
                    pushSuccess("WiFi Security Config berhasil dihapus.");
                    setDeletingWifiItem(null);
                    void loadWifiConfigs();
                  } catch (err: any) {
                    pushError(err.message || "Gagal menghapus WiFi Security Config");
                  }
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow-md hover:shadow-rose-500/20 transition-all cursor-pointer"
              >
                Hapus WiFi Config
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Apakah Anda yakin ingin menghapus konfigurasi WiFi untuk <strong>{deletingWifiItem.product_class}</strong>?
              </p>
              <p className="text-xs text-slate-450 mt-2 leading-relaxed">
                Tindakan ini tidak dapat dibatalkan. Pengaturan path password untuk tipe ONT ini akan dihapus secara permanen.
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Router Modal */}
      {deletingRouter && (
        <Modal
          title="Hapus Router"
          onClose={() => setDeletingRouter(null)}
          actions={
            <>
              <Button variant="outline" type="button"
                onClick={() => setDeletingRouter(null)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs font-bold py-2 px-4 rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Batal
              </Button>
              <Button variant="outline" type="button"
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
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
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

