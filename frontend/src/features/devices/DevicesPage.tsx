import { useEffect, useState, useCallback, useMemo } from "react";
import { apiRequest, checkWAN, checkGponEpon, type GacsDevice, type GacsDeviceDetail, type GacsFault } from "../../lib/api";
import { formatDateTime } from "../../utils/format";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { useDialog } from "../../context/DialogContext";
import {
  Cpu,
  Activity,
  Wifi,
  WifiOff,
  HelpCircle,
  Search,
  RefreshCw,
  User,
  Shield,
  Lock,
  Unlock,
  AlertTriangle,
  MapPin,
  MessageSquare,
  Globe,
  Database,
  ChevronUp,
  ChevronDown,
  ArrowUpDown
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function deviceLabel(d: GacsDevice) {
  const m = d._deviceId._Manufacturer ?? "Unknown";
  const p = d._deviceId._ProductClass ?? "Unknown";
  return `${m} ${p}`;
}

function onlineStatus(lastInform?: string): "online" | "offline" | "unknown" {
  if (!lastInform) return "unknown";
  const ago = Date.now() - new Date(lastInform).getTime();
  return ago < 6 * 60 * 1000 ? "online" : "offline"; // < 6 min = online
}

function StatusBadge({ status }: { status: "online" | "offline" | "unknown" }) {
  const colors: Record<string, string> = {
    online: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    offline: "bg-red-100 text-red-700 border border-red-200",
    unknown: "bg-slate-100 text-slate-500 border border-slate-200",
  };
  const dots: Record<string, string> = {
    online: "bg-emerald-500",
    offline: "bg-red-500",
    unknown: "bg-slate-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${colors[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      {status}
    </span>
  );
}

// ─── Device Detail Modal ─────────────────────────────────────────────────────

type DeviceDetailModalProps = {
  deviceId: string;
  onClose: () => void;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
};

function DeviceDetailModal({ deviceId, onClose, pushSuccess, pushError }: DeviceDetailModalProps) {
  const { showConfirm } = useDialog();
  const [detail, setDetail] = useState<GacsDeviceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [summoning, setSummoning] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "wan" | "wifi" | "mikrotik" | "params">("info");

  // WAN and Mode info states
  const [wanLoading, setWanLoading] = useState(false);
  const [wanData, setWanData] = useState<{
    wanIPConnections: string[];
    wanPPPConnections: string[];
    availableSlots: Record<string, string[]>;
  } | null>(null);
  const [modeLoading, setModeLoading] = useState(false);
  const [deviceMode, setDeviceMode] = useState<"GPON" | "EPON" | "UNKNOWN" | null>(null);

  const loadWanInfo = useCallback(async () => {
    if (wanData || deviceMode) return;
    setWanLoading(true);
    setModeLoading(true);
    try {
      const wanRes = await checkWAN(deviceId);
      setWanData(wanRes);
    } catch {
      pushError("Gagal memeriksa status WAN.");
    } finally {
      setWanLoading(false);
    }

    try {
      const modeRes = await checkGponEpon(deviceId);
      setDeviceMode(modeRes.mode);
    } catch {
      pushError("Gagal mendeteksi mode GPON/EPON.");
    } finally {
      setModeLoading(false);
    }
  }, [deviceId, wanData, deviceMode, pushError]);

  useEffect(() => {
    if (activeTab === "wan") {
      void loadWanInfo();
    }
  }, [activeTab, loadWanInfo]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<GacsDeviceDetail>(`/api/v1/gacs/devices/${encodeURIComponent(deviceId)}`);
      setDetail(res);
    } catch {
      pushError("Gagal memuat detail perangkat.");
    } finally {
      setLoading(false);
    }
  }, [deviceId, pushError]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  const handleSummon = async () => {
    setSummoning(true);
    try {
      await apiRequest(`/api/v1/gacs/devices/${encodeURIComponent(deviceId)}/summon`, { method: "POST" });
      pushSuccess("Perangkat berhasil di-summon. Memuat ulang data...");
      setTimeout(() => void loadDetail(), 3000);
    } catch {
      pushError("Gagal summon perangkat.");
    } finally {
      setSummoning(false);
    }
  };

  const handleReboot = async () => {
    if (!(await showConfirm("Yakin ingin me-reboot perangkat ini?"))) return;
    setRebooting(true);
    try {
      await apiRequest(`/api/reboot-device`, {
        method: "POST",
        body: JSON.stringify({ deviceId }),
        headers: { "Content-Type": "application/json" },
      });
      pushSuccess("Perintah reboot berhasil dikirim.");
    } catch {
      pushError("Gagal mengirim perintah reboot.");
    } finally {
      setRebooting(false);
    }
  };

  const getFlatParams = (obj: any): { path: string; value: string; type: string }[] => {
    const list: { path: string; value: string; type: string }[] = [];
    const seenPaths = new Set<string>();

    if (!obj) return list;

    // Manually push deviceInfo fields
    if (obj.deviceInfo) {
      const info = obj.deviceInfo;
      const paths: Record<string, string> = {
        manufacturer: "InternetGatewayDevice.DeviceInfo.Manufacturer",
        productclass: "InternetGatewayDevice.DeviceInfo.ProductClass",
        serialNumber: "InternetGatewayDevice.DeviceInfo.SerialNumber",
        oui: "InternetGatewayDevice.DeviceInfo.OUI",
        hardwareVersion: "InternetGatewayDevice.DeviceInfo.HardwareVersion",
        softwareVersion: "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
        upTime: "InternetGatewayDevice.DeviceInfo.UpTime",
        macAddress: "InternetGatewayDevice.DeviceInfo.MacAddress"
      };
      for (const [key, path] of Object.entries(paths)) {
        const val = info[key];
        if (val !== undefined && val !== null) {
          list.push({ path, value: String(val), type: "string" });
          seenPaths.add(path.toLowerCase());
        }
      }
    }

    // Manually push connectionInfo fields
    if (obj.connectionInfo) {
      const conn = obj.connectionInfo;
      const paths: Record<string, string> = {
        _lastInform: "_lastInform",
        _lastBoot: "_lastBoot",
        _registered: "_registered"
      };
      for (const [key, path] of Object.entries(paths)) {
        const val = conn[key];
        if (val !== undefined && val !== null) {
          list.push({ path, value: String(val), type: "string" });
          seenPaths.add(path.toLowerCase());
        }
      }
    }

    const traverse = (current: any) => {
      if (!current || typeof current !== "object") return;

      // If it looks like a parameter node
      if (
        "path" in current &&
        ( "value" in current || "rawValue" in current || "normalizedValue" in current )
      ) {
        if (typeof current.path === "string" && current.path) {
          const pathLower = current.path.toLowerCase();
          if (!seenPaths.has(pathLower)) {
            seenPaths.add(pathLower);
            let val = current.value;
            if (val === undefined || val === null) {
              val = current.rawValue !== undefined ? current.rawValue : current.normalizedValue;
            }
            list.push({
              path: current.path,
              value: val === null || val === undefined ? "—" : String(val),
              type: current.type || typeof val,
            });
          }
        }
      }

      // Recursively traverse
      if (Array.isArray(current)) {
        for (const item of current) {
          traverse(item);
        }
      } else {
        for (const key of Object.keys(current)) {
          if (key === "path" || key === "value") continue;
          traverse(current[key]);
        }
      }
    };

    traverse(obj);
    return list.sort((a, b) => a.path.localeCompare(b.path));
  };

  const allParams = detail ? getFlatParams(detail) : [];
  const flatParams = allParams.slice(0, 500);

  const getRaw = (path: string): string => {
    const found = allParams.find(p => p.path.toLowerCase() === path.toLowerCase());
    return found ? found.value : "";
  };

  const getExternalIp = () => {
    if (!detail) return "";
    const pppConns = detail.wanConnections?.wanPPPConnections || [];
    for (const c of pppConns) {
      if (c.externalIPAddress?.value) return String(c.externalIPAddress.value);
    }
    const ipConns = detail.wanConnections?.wanIPConnections || [];
    for (const c of ipConns) {
      if (c.externalIPAddress?.value) return String(c.externalIPAddress.value);
    }
    return "";
  };

  const getDnsServers = () => {
    if (!detail) return "";
    const pppConns = detail.wanConnections?.wanPPPConnections || [];
    for (const c of pppConns) {
      if (c.dnsServers?.value) return String(c.dnsServers.value);
    }
    const ipConns = detail.wanConnections?.wanIPConnections || [];
    for (const c of ipConns) {
      if (c.dnsServers?.value) return String(c.dnsServers.value);
    }
    return "";
  };

  const getRxPower = () => {
    if (!detail) return "";
    
    // 1. Try normalized rxpower virtual parameter
    const rx = detail.virtualParameters?.rxpower?.value;
    if (rx !== undefined && rx !== null && rx !== "" && rx !== "0" && rx !== 0) {
      return `${rx} dBm`;
    }

    // 2. Try raw virtual parameters keys in case the name is slightly different (e.g. getRX)
    const possibleVpKeys = ["getRX", "getrx", "getRx", "rxPower", "rxpower", "getRXPower", "rx_power"];
    for (const key of possibleVpKeys) {
      const v = detail.virtualParameters?.[key]?.value;
      if (v !== undefined && v !== null && v !== "" && v !== "0" && v !== 0) {
        return `${v} dBm`;
      }
    }

    // 3. Common raw paths
    const rawRx = getRaw("InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower") || 
                  getRaw("InternetGatewayDevice.X_CMCC_ONU_INFO.RxOpticalPower") ||
                  getRaw("InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RxPower") ||
                  getRaw("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_CT-COM_RxPower") ||
                  getRaw("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_CT-COM_RxOpticalPower");
    if (rawRx) {
      return `${rawRx} dBm`;
    }

    // 4. Case-insensitive search on all parameters list
    const foundPower = allParams.find(p => {
      const pathLower = p.path.toLowerCase();
      return (pathLower.includes("rxpower") || 
              pathLower.includes("rxoptical") || 
              pathLower.includes("opticalpower") || 
              pathLower.endsWith(".rx") || 
              pathLower.endsWith(".getrx")) && 
             p.value && 
             p.value !== "—" && 
             p.value !== "0";
    });
    if (foundPower) {
      return `${foundPower.value} dBm`;
    }

    return "";
  };

  const getTxPower = () => {
    if (!detail) return "";
    const tx = getRaw("InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TXPower");
    return tx ? `${tx} dBm` : "";
  };

  return (
    <Modal
      title="Detail Perangkat ONT"
      onClose={onClose}
      actions={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="primary"
            className="bg-indigo-600 hover:bg-indigo-700"
            onClick={() => void handleSummon()}
            disabled={summoning || loading}
            isLoading={summoning}
            loadingText="Menyummon..."
          >
            ⟳ Refresh Data
          </Button>
          <Button
            type="button"
            variant="primary"
            className="bg-amber-500 hover:bg-amber-600"
            onClick={() => void handleReboot()}
            disabled={rebooting || loading}
            isLoading={rebooting}
            loadingText="Rebooting..."
          >
            ↺ Reboot
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            Tutup
          </Button>
        </div>
      }
    >
      <div className="min-h-[420px]">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400 dark:text-slate-500 text-sm animate-pulse">
            Memuat detail perangkat...
          </div>
        ) : !detail ? (
          <div className="flex items-center justify-center h-48 text-red-500 text-sm">
            Data tidak tersedia.
          </div>
        ) : (
          <>
            {detail.vendorDetection && detail.vendorDetection.vendorName && (
              <div className="mb-4 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700 font-medium">
                Vendor: <strong>{detail.vendorDetection.vendorName}</strong>
                {detail.vendorDetection.parameterPrefix && (
                  <span className="ml-2 text-indigo-500 font-mono text-xs">({detail.vendorDetection.parameterPrefix})</span>
                )}
              </div>
            )}

            {/* Tab switcher */}
            <div className="flex gap-1 mb-5 border-b border-slate-150">
              {(["info", "wan", "wifi", "mikrotik", "params"] as const).map((tab) => (
                <Button variant="outline"
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-indigo-600 text-indigo-750"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-705"
                  }`}
                >
                  {tab === "info" ? "Informasi Utama" 
                    : tab === "wan" ? "Status WAN & Mode" 
                    : tab === "wifi" ? "WiFi & Klien"
                    : tab === "mikrotik" ? "Pelanggan & MikroTik" 
                    : "Semua Parameter"}
                </Button>
              ))}
            </div>

            {activeTab === "info" && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm animate-in fade-in duration-200">
                {[
                  ["Manufacturer", detail.deviceInfo?.manufacturer || getRaw("InternetGatewayDevice.DeviceInfo.Manufacturer") || getRaw("Device.DeviceInfo.Manufacturer")],
                  ["Product Class", detail.deviceInfo?.productclass || getRaw("InternetGatewayDevice.DeviceInfo.ProductClass") || getRaw("Device.DeviceInfo.ProductClass")],
                  ["Serial Number", detail.deviceInfo?.serialNumber || getRaw("InternetGatewayDevice.DeviceInfo.SerialNumber") || getRaw("Device.DeviceInfo.SerialNumber")],
                  ["Hardware Version", detail.deviceInfo?.hardwareVersion || getRaw("InternetGatewayDevice.DeviceInfo.HardwareVersion") || getRaw("Device.DeviceInfo.HardwareVersion")],
                  ["Software Version", detail.deviceInfo?.softwareVersion || getRaw("InternetGatewayDevice.DeviceInfo.SoftwareVersion") || getRaw("Device.DeviceInfo.SoftwareVersion")],
                  ["Uptime", detail.deviceInfo?.upTime ? `${detail.deviceInfo.upTime}s` : ""],
                  ["MAC Address", detail.deviceInfo?.macAddress],
                  ["External IP", getExternalIp()],
                  ["DNS Servers", getDnsServers()],
                  ["RX Power", getRxPower()],
                  ["TX Power", getTxPower()],
                  ["Temperature", detail.virtualParameters?.temperature?.value ? `${detail.virtualParameters.temperature.value} °C` : ""],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="py-2 border-b border-slate-100 dark:border-slate-800">
                    <dt className="text-slate-500 dark:text-slate-400 font-medium mb-0.5">{label}</dt>
                    <dd className="text-slate-900 dark:text-slate-50 font-semibold font-mono text-xs break-all">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {activeTab === "mikrotik" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* 1. Customer Database Matching */}
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">
                    <User size={18} className="text-indigo-500" />
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Database Pelanggan
                    </h4>
                  </div>
                  {detail.customer ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Nama Lengkap</span>
                        <strong className="text-slate-800 dark:text-slate-100 text-sm mt-0.5 block">{detail.customer.name}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Status Pelanggan</span>
                        <span className="mt-1 block">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            detail.customer.status === "active"  ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                            detail.customer.status === "limit"   ? "bg-rose-50 text-rose-700 border border-rose-200" :
                            detail.customer.status === "pending" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                            "bg-slate-100 text-slate-650 border border-slate-200 dark:border-slate-800"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              detail.customer.status === "active"  ? "bg-emerald-500" :
                              detail.customer.status === "limit"   ? "bg-rose-500" :
                              detail.customer.status === "pending" ? "bg-amber-500" :
                              "bg-slate-400"
                            }`} />
                            {detail.customer.status === "active"   ? "Aktif" :
                             detail.customer.status === "limit"    ? "Isolir" :
                             detail.customer.status === "pending"  ? "Perpanjangan" :
                             detail.customer.status === "inactive" ? "Nonaktif" :
                             detail.customer.status}
                          </span>
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Username PPPoE</span>
                        <code className="text-indigo-600 font-mono text-xs font-semibold bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 block mt-0.5 w-max">
                          {detail.customer.user_pppoe || "-"}
                        </code>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Nomor WhatsApp</span>
                        {detail.customer.whatsapp ? (
                          <a
                            href={`https://wa.me/+${detail.customer.whatsapp.replace(/[+\-\s]/g, "").replace(/^0/, "62")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 hover:underline font-semibold block mt-0.5"
                          >
                            {detail.customer.whatsapp}
                          </a>
                        ) : "-"}
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Alamat</span>
                        <p className="text-slate-600 mt-1 leading-relaxed bg-white dark:bg-slate-900 border border-slate-150 p-2.5 rounded-xl">{detail.customer.address || "Belum ada alamat."}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs">
                      <AlertTriangle size={16} className="shrink-0 text-amber-600" />
                      <span>CPE ini belum dihubungkan dengan pelanggan terdaftar di database lokal.</span>
                    </div>
                  )}
                </div>

                {/* 2. MikroTik Router PPP Secret details */}
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">
                    <Shield size={18} className="text-indigo-500" />
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      MikroTik PPP Secret
                    </h4>
                  </div>
                  {detail.mikrotikSecret ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">PPP Secret Username</span>
                        <strong className="text-slate-800 dark:text-slate-100 font-mono block mt-0.5">{detail.mikrotikSecret.username}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Profile Paket</span>
                        <span className="bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 border border-indigo-150 rounded block mt-0.5 w-max">
                          {detail.mikrotikSecret.profile}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Status Akun (Disabled)</span>
                        <span className="mt-1 block">
                          {detail.mikrotikSecret.disabled ? (
                            <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 w-max">
                              <Lock size={12} />
                              Disabled / Isolir
                            </span>
                          ) : (
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 w-max">
                              <Unlock size={12} />
                              Active / Enabled
                            </span>
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Last Caller ID (MAC)</span>
                        <code className="text-slate-700 dark:text-slate-300 font-mono block mt-0.5">{detail.mikrotikSecret.last_caller_id || "-"}</code>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Last Logged Out</span>
                        <span className="text-slate-750 block mt-0.5">{detail.mikrotikSecret.last_logged_out || "-"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Last Disconnect Reason</span>
                        <span className="text-slate-750 font-medium block mt-0.5">{detail.mikrotikSecret.last_disconnect_reason || "-"}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs">
                      <AlertTriangle size={16} className="shrink-0 text-red-600" />
                      <span>Username PPPoE tidak terdaftar di MikroTik Secrets.</span>
                    </div>
                  )}
                </div>

                {/* 3. MikroTik Router PPP Active Session details */}
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">
                    <Activity size={18} className="text-indigo-500" />
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Sesi Aktif PPP MikroTik
                    </h4>
                  </div>
                  {detail.mikrotikActiveConn ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Status Sesi PPPoE</span>
                        <span className="mt-1 block">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-250 px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1.5 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Online / Connected
                          </span>
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Alamat IP Sesi</span>
                        <code className="text-slate-700 dark:text-slate-300 font-mono text-xs font-semibold block mt-0.5">{detail.mikrotikActiveConn.address}</code>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Uptime Sesi</span>
                        <strong className="text-slate-800 dark:text-slate-100 font-semibold block mt-0.5">{detail.mikrotikActiveConn.uptime}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Active Caller ID</span>
                        <code className="text-slate-700 dark:text-slate-300 font-mono block mt-0.5">{detail.mikrotikActiveConn.caller_id || "-"}</code>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-slate-100 border border-slate-200 dark:border-slate-800 text-slate-600 rounded-xl text-xs">
                      <WifiOff size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
                      <span>Pelanggan ini sedang tidak memiliki sesi aktif di MikroTik (Offline).</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "wan" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* 1. Fiber Mode */}
                <div className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">
                    <Activity size={18} className="text-indigo-500" />
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Mode Sambungan GPON/EPON
                    </h4>
                  </div>
                  {modeLoading ? (
                    <div className="text-slate-400 dark:text-slate-500 text-xs animate-pulse">Mendeteksi GPON/EPON...</div>
                  ) : (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Mode Deteksi ONT:</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        deviceMode === "GPON" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400" :
                        deviceMode === "EPON" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" :
                        "bg-slate-100 text-slate-700 dark:text-slate-300 dark:bg-slate-800 dark:text-slate-400"
                      }`}>
                        {deviceMode || "UNKNOWN"}
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. WAN Connection Details */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                    Detail Koneksi WAN
                  </h4>

                  {detail.wanConnections && 
                   ((detail.wanConnections.wanPPPConnections?.length || 0) > 0 || 
                    (detail.wanConnections.wanIPConnections?.length || 0) > 0) ? (
                    <div className="grid grid-cols-1 gap-4">
                      {[
                        ...(detail.wanConnections.wanPPPConnections || []),
                        ...(detail.wanConnections.wanIPConnections || [])
                      ].map((conn, idx) => {
                        const isPPP = conn.type === "WANPPPConnection";
                        const connStatus = conn.connectionStatus?.value || "Disconnected";
                        const isActive = connStatus === "Connected";
                        
                        return (
                          <div 
                            key={`${conn.path}-${idx}`} 
                            className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden"
                          >
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600" />
                            
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-3 mb-4">
                              <div>
                                <h5 className="font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 text-sm flex items-center gap-2">
                                  {conn.name?.value || "Connection"} 
                                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded font-mono font-medium">
                                    {isPPP ? "PPP" : "IP"}
                                  </span>
                                </h5>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block mt-0.5 truncate max-w-xs sm:max-w-md">
                                  {conn.path}
                                </span>
                              </div>
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold w-max ${
                                isActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60" :
                                "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60"
                              }`}>
                                {connStatus}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs mb-4">
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">IP Address WAN</span>
                                <code className="text-slate-700 dark:text-slate-300 font-mono font-semibold block mt-0.5">
                                  {conn.externalIPAddress?.value || "—"}
                                </code>
                              </div>
                              {isPPP && (
                                <div>
                                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Username PPPoE</span>
                                  <code className="text-indigo-600 dark:text-indigo-400 font-mono font-semibold block mt-0.5">
                                    {conn.username || "—"}
                                  </code>
                                </div>
                              )}
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">DNS Servers</span>
                                <code className="text-slate-700 dark:text-slate-300 font-mono block mt-0.5 truncate">
                                  {conn.dnsServers?.value || "—"}
                                </code>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">VLAN ID</span>
                                <code className="text-slate-700 dark:text-slate-300 font-mono block mt-0.5">
                                  {conn.vlanInfo?.value !== undefined && conn.vlanInfo?.value !== null ? String(conn.vlanInfo.value) : "Untagged / None"}
                                </code>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">Service List</span>
                                <span className="text-slate-800 dark:text-slate-100 dark:text-slate-200 font-medium block mt-0.5">
                                  {conn.serviceList?.serviceList?.value || "—"}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block">NAT Status</span>
                                <span className="text-slate-800 dark:text-slate-100 dark:text-slate-200 font-medium block mt-0.5">
                                  {conn.natEnabled?.value !== undefined ? (conn.natEnabled.value ? "Enabled" : "Disabled") : "—"}
                                </span>
                              </div>
                            </div>

                            {/* LAN Port / SSID Bindings */}
                            {conn.lanBinding?.normalized && (
                              <div className="bg-white dark:bg-slate-900 dark:bg-slate-950 p-3 rounded-xl border border-slate-150 dark:border-slate-800/60">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-2">Interface Port Bindings</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {Object.entries(conn.lanBinding.normalized).map(([key, enabled]) => (
                                    <span 
                                      key={key} 
                                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold ${
                                        enabled 
                                          ? "bg-indigo-650 text-indigo-100" 
                                          : "bg-slate-150 text-slate-400 dark:text-slate-500 dark:bg-slate-850 dark:text-slate-600"
                                      }`}
                                    >
                                      {key}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-950 dark:bg-slate-900 rounded-2xl border border-dashed">
                      Tidak ada koneksi WAN aktif.
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "wifi" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* WiFi SSIDs configuration list */}
                <div>
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-1.5">
                    <Wifi size={14} className="text-indigo-500" />
                    Konfigurasi SSID nirkabel (Wireless)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {detail.wifiInfo && Object.keys(detail.wifiInfo).length > 0 ? (
                      Object.entries(detail.wifiInfo)
                        .filter(([, config]) => config.ssid?.value || config.enabled?.value)
                        .map(([wlanKey, config]) => {
                          const isEnabled = config.enabled?.value === true || config.enabled?.value === "true" || config.enabled?.value === "1";
                          return (
                            <div 
                              key={wlanKey} 
                              className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm relative overflow-hidden"
                            >
                              <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2.5 mb-3">
                                <div>
                                  <strong className="text-slate-800 dark:text-slate-100 dark:text-slate-200 text-sm font-bold">
                                    {config.ssid?.value || "Unknown SSID"}
                                  </strong>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block mt-0.5 uppercase">
                                    Interface {wlanKey}
                                  </span>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isEnabled 
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" 
                                    : "bg-slate-200 text-slate-500 dark:text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                                }`}>
                                  {isEnabled ? "Aktif" : "Nonaktif"}
                                </span>
                              </div>

                              <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400 dark:text-slate-500">Keamanan (Security)</span>
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                                    {config.security?.normalizedValue || config.security?.rawValue || "Open/None"}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400 dark:text-slate-500">Jumlah Client Terkoneksi</span>
                                  <span className="font-mono font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200">
                                    {config.stations?.value !== undefined && config.stations?.value !== null ? String(config.stations.value) : "0"}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400 dark:text-slate-500">Kanal (Channel)</span>
                                  <span className="font-mono text-slate-700 dark:text-slate-300 dark:text-slate-355">
                                    {config.channel?.value !== undefined && config.channel?.value !== null ? String(config.channel.value) : "Auto"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div className="col-span-2 p-8 text-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-950 dark:bg-slate-900 rounded-2xl border border-dashed">
                        Informasi WiFi tidak tersedia.
                      </div>
                    )}
                  </div>
                </div>

                {/* WiFi / LAN Connected Client list (Hosts) */}
                <div>
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-1.5">
                    <Database size={14} className="text-indigo-500" />
                    Klien Terhubung (Daftar Host Aktif)
                  </h4>
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/60 border-b border-slate-250 dark:border-slate-850 text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">Nama Host (Device)</th>
                          <th className="px-4 py-2.5 font-semibold font-mono">Alamat IP</th>
                          <th className="px-4 py-2.5 font-semibold font-mono">Alamat MAC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-900 text-slate-700 dark:text-slate-300 dark:text-slate-350">
                        {detail.wifiClients && detail.wifiClients.length > 0 ? (
                          detail.wifiClients.map((client, idx) => (
                            <tr key={`${client.mac}-${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors">
                              <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-200">
                                {client.hostname || <span className="text-slate-400 dark:text-slate-500 italic">No Hostname</span>}
                              </td>
                              <td className="px-4 py-2 font-mono">{client.ip || "—"}</td>
                              <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400">{client.mac || "—"}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500 italic">
                              Tidak ada host/klien aktif yang terdeteksi.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "params" && (
              <div className="overflow-auto max-h-96 rounded-xl border border-slate-100 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Parameter</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Nilai</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400">Tipe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {flatParams.length === 0 ? (
                      <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400 dark:text-slate-500">Tidak ada parameter tersedia. Lakukan Refresh Data terlebih dahulu.</td></tr>
                    ) : (
                      flatParams.map((p) => (
                        <tr key={p.path} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-3 py-1.5 font-mono text-slate-600 break-all max-w-xs">{p.path}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-900 dark:text-slate-50 break-all max-w-xs">{p.value}</td>
                          <td className="px-3 py-1.5 text-slate-400 dark:text-slate-500">{p.type}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Faults Panel ────────────────────────────────────────────────────────────

function FaultsPanel({ pushError }: { pushError: (msg: string) => void }) {
  const [faults, setFaults] = useState<GacsFault[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiRequest<{ success: boolean; data: GacsFault[] }>("/api/faults");
        setFaults(res.data ?? []);
      } catch {
        pushError("Gagal memuat data faults.");
      } finally {
        setLoading(false);
      }
    })();
  }, [pushError]);

  const handleDeleteFault = async (faultId: string) => {
    try {
      await apiRequest(`/api/faults/${encodeURIComponent(faultId)}`, { method: "DELETE" });
      setFaults((prev) => prev.filter((f) => f._id !== faultId));
    } catch {
      pushError("Gagal menghapus fault.");
    }
  };

  if (loading) {
    return <div className="text-center text-sm text-slate-400 dark:text-slate-500 py-8 animate-pulse">Memuat fault data...</div>;
  }

  return (
    <div className="overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
      <table className="w-full text-left border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-800 text-gray-500 dark:text-slate-400">
          <tr>
            <th className="px-5 py-3 font-medium">Device ID</th>
            <th className="px-5 py-3 font-medium">Channel</th>
            <th className="px-5 py-3 font-medium">Kode</th>
            <th className="px-5 py-3 font-medium">Pesan</th>
            <th className="px-5 py-3 font-medium">Waktu</th>
            <th className="px-5 py-3 font-medium">Retries</th>
            <th className="px-5 py-3 font-medium">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {faults.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-5 py-8 text-center text-slate-400 dark:text-slate-500 text-sm">
                ✅ Tidak ada fault aktif.
              </td>
            </tr>
          ) : (
            faults.map((f) => (
              <tr key={f._id} className="hover:bg-red-50 transition-colors">
                <td className="px-5 py-3 font-mono text-xs text-slate-600 max-w-[180px] truncate">{f.device_id}</td>
                <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{f.channel}</td>
                <td className="px-5 py-3">
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded">{f.code}</span>
                </td>
                <td className="px-5 py-3 text-slate-700 dark:text-slate-300 max-w-[240px] truncate" title={f.message}>{f.message}</td>
                <td className="px-5 py-3 text-slate-500 dark:text-slate-400 text-xs">{formatDateTime(f.timestamp)}</td>
                <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{f.retries ?? 0}x</td>
                <td className="px-5 py-3">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => void handleDeleteFault(f._id)}
                  >
                    Hapus
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main DevicesPage ────────────────────────────────────────────────────────

type DevicesPageProps = {
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
};

export function DevicesPage({ pushSuccess, pushError }: DevicesPageProps) {
  const [devices, setDevices] = useState<GacsDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"registered" | "all" | "faults">("registered");
  const [detailId, setDetailId] = useState<string | null>(null);

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Reset sorting state when activeTab changes
  useEffect(() => {
    setSortField(null);
    setSortDirection("asc");
  }, [activeTab]);

  const requestSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortableHeader = (label: string, field: string) => {
    const isSorted = sortField === field;
    return (
      <th 
        className="px-5 py-3 text-left font-semibold select-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
        onClick={() => requestSort(field)}
      >
        <div className="inline-flex items-center gap-1.5">
          <span>{label}</span>
          {isSorted ? (
            sortDirection === "asc" ? (
              <ChevronUp size={12} className="text-indigo-600 dark:text-indigo-400 stroke-[3]" />
            ) : (
              <ChevronDown size={12} className="text-indigo-600 dark:text-indigo-400 stroke-[3]" />
            )
          ) : (
            <ArrowUpDown size={12} className="text-slate-300 dark:text-slate-600 opacity-50 transition-opacity" />
          )}
        </div>
      </th>
    );
  };

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<any>("/api/getdevice?limit=200");
      let rawList: any[] = [];
      if (Array.isArray(res)) {
        rawList = res;
      } else if (res && typeof res === "object" && Array.isArray(res.data)) {
        rawList = res.data;
      }

      const mapped = rawList.map((d: any) => {
        const baseDevice = d && typeof d === "object" && d._deviceId
          ? (d as GacsDevice)
          : (() => {
              const manufacturer = d.productclass ? d.productclass.split("-")[0].split(" ")[0] : "CIOT";
              const serial = d.SerialNumber || d._id?.split("-").pop() || "";
              const oui = d._id?.split("-")[0] || "";
              return {
                _id: d._id || "",
                _deviceId: {
                  _Manufacturer: manufacturer,
                  _ProductClass: d.productclass || "Unknown",
                  _SerialNumber: serial,
                  _OUI: oui,
                },
                _lastInform: d._lastInform,
                _tag: d.tags || [],
                _summary: {
                  ssid: d.ssid1 || undefined,
                  pppoe_username: d.pppoe || undefined,
                  rx_power: d.rxpower ? `${d.rxpower} dBm` : undefined,
                }
              } as GacsDevice;
            })();

        return {
          ...baseDevice,
          customer_id: d.customer_id,
          customer_name: d.customer_name,
          is_registered: d.is_registered === true || d.is_registered === "true"
        };
      });

      setDevices(mapped);
    } catch {
      pushError("Gagal memuat daftar perangkat ONT. Pastikan GenieACS terhubung di Pengaturan.");
    } finally {
      setLoading(false);
    }
  }, [pushError]);

  useEffect(() => { void loadDevices(); }, [loadDevices]);

  const filtered = devices.filter((d) => {
    // Tab filtering: Only show registered ONTs if activeTab is registered
    if (activeTab === "registered" && !d.is_registered) return false;

    // Search filtering
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d._id.toLowerCase().includes(q) ||
      d._deviceId._Manufacturer?.toLowerCase().includes(q) ||
      d._deviceId._ProductClass?.toLowerCase().includes(q) ||
      d._deviceId._SerialNumber?.toLowerCase().includes(q) ||
      d._summary?.ssid?.toLowerCase().includes(q) ||
      d._summary?.pppoe_username?.toLowerCase().includes(q) ||
      d.customer_name?.toLowerCase().includes(q)
    );
  });

  const sortedDevices = useMemo(() => {
    if (!sortField) return filtered;
    return [...filtered].sort((a, b) => {
      let aVal: any = null;
      let bVal: any = null;

      if (sortField === "device") {
        aVal = deviceLabel(a);
        bVal = deviceLabel(b);
      } else if (sortField === "serial") {
        aVal = a._deviceId._SerialNumber || "";
        bVal = b._deviceId._SerialNumber || "";
      } else if (sortField === "status") {
        aVal = onlineStatus(a._lastInform);
        bVal = onlineStatus(b._lastInform);
      } else if (sortField === "last_inform") {
        aVal = a._lastInform || "";
        bVal = b._lastInform || "";
      } else if (sortField === "rx_power") {
        aVal = parseFloat(a._summary?.rx_power ?? "") || -99;
        bVal = parseFloat(b._summary?.rx_power ?? "") || -99;
      }

      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";

      const isNumericField = sortField === "rx_power";
      if (isNumericField) {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).trim().toLowerCase();
      const bStr = String(bVal).trim().toLowerCase();
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: "base" })
        : bStr.localeCompare(aStr, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [filtered, sortField, sortDirection]);

  const onlineCount = devices.filter((d) => onlineStatus(d._lastInform) === "online").length;
  const offlineCount = devices.filter((d) => onlineStatus(d._lastInform) === "offline").length;

  return (
    <section className="grid gap-6 animate-in fade-in duration-300">
      {/* Header Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Perangkat", value: devices.length, color: "text-slate-800", icon: <Cpu className="text-indigo-500 shrink-0" size={20} /> },
          { label: "Online", value: onlineCount, color: "text-emerald-700", icon: <Activity className="text-emerald-500 shrink-0" size={20} /> },
          { label: "Offline", value: offlineCount, color: "text-rose-700", icon: <WifiOff className="text-rose-500 shrink-0" size={20} /> },
          { label: "Tidak Diketahui", value: devices.length - onlineCount - offlineCount, color: "text-slate-500", icon: <HelpCircle className="text-slate-400 dark:text-slate-500 shrink-0" size={20} /> },
        ].map(({ label, value, color, icon }) => (
          <article key={label} className="bg-white dark:bg-slate-900 border border-slate-150 rounded-2xl p-5 shadow-sm flex items-center justify-between hover:shadow-md hover:border-slate-200 transition-all duration-300">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
              <p className={`text-2xl font-black ${color}`}>{loading ? "—" : value}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
              {icon}
            </div>
          </article>
        ))}
      </div>

      {/* Main Card */}
      <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Tabs & Actions */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0 border-b border-slate-150 bg-slate-50/50">
          <div className="flex gap-1">
            {(["registered", "all", "faults"] as const).map((tab) => (
              <Button variant="outline"
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeTab === tab
                    ? "border-indigo-600 text-indigo-750"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-705"
                }`}
              >
                {tab === "registered" ? "Perangkat Terdaftar" : tab === "all" ? "Seluruh Perangkat" : "Fault Log"}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="link"
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 pb-3 flex items-center gap-1.5 cursor-pointer transition-colors px-0 hover:no-underline"
            onClick={() => void loadDevices()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing..." : "Refresh Perangkat"}
          </Button>
        </div>

        <div className="p-6">
          {(activeTab === "registered" || activeTab === "all") && (
            <>
              <div className="mb-5 relative w-full md:w-96">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="search"
                  className="w-full border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
                  placeholder="Cari SN, ProductClass, SSID, PPPoE username..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500 text-sm gap-2">
                  <RefreshCw className="animate-spin text-indigo-600" size={24} />
                  <p className="animate-pulse font-medium">Sinkronisasi perangkat dengan GenieACS...</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-150 rounded-xl">
                  <table className="compact-table w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-slate-650 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        {renderSortableHeader("Perangkat", "device")}
                        {renderSortableHeader("Serial Number", "serial")}
                        {renderSortableHeader("Status", "status")}
                        {renderSortableHeader("Last Inform", "last_inform")}
                        <th className="px-5 py-3 text-left text-slate-500 dark:text-slate-400 font-semibold">SSID / PPPoE</th>
                        {renderSortableHeader("RX Power", "rx_power")}
                        <th className="px-5 py-3 text-left text-slate-500 dark:text-slate-400 font-semibold">Tag</th>
                        <th className="px-5 py-3 text-left text-slate-500 dark:text-slate-400 font-semibold">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-250 bg-white dark:bg-slate-900">
                      {sortedDevices.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-5 py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                            {search ? "Tidak ada perangkat yang cocok." : "Tidak ada perangkat terdaftar di GenieACS."}
                          </td>
                        </tr>
                      ) : (
                        sortedDevices.map((d) => {
                          const status = onlineStatus(d._lastInform);
                          const rxPowerFloat = parseFloat(d._summary?.rx_power ?? "");
                          const rxPowerColor = isNaN(rxPowerFloat) ? "text-slate-400" :
                                               rxPowerFloat < -27 ? "text-rose-600 bg-rose-50 border border-rose-100 font-extrabold" :
                                               rxPowerFloat < -25 ? "text-amber-600 bg-amber-50 border border-amber-100 font-extrabold" :
                                               "text-emerald-600 bg-emerald-50 border border-emerald-100 font-extrabold";
                          return (
                            <tr key={d._id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-3.5">
                                <p className="font-bold text-slate-800 dark:text-slate-100">{deviceLabel(d)}</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5 truncate max-w-[180px]" title={d._id}>{d._id}</p>
                                {d.customer_name ? (
                                  <span className="inline-flex items-center gap-1 mt-1.5 bg-indigo-55 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                    👤 {d.customer_name}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 mt-1.5 bg-slate-100 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full text-[10px] font-medium">
                                    Belum Terhubung
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 font-mono text-slate-600 font-semibold">{d._deviceId._SerialNumber ?? "—"}</td>
                              <td className="px-5 py-3.5">
                                <StatusBadge status={status} />
                              </td>
                              <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 font-medium">{formatDateTime(d._lastInform)}</td>
                              <td className="px-5 py-3.5">
                                {d._summary?.ssid && (
                                  <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 border border-sky-100 px-1.5 py-0.5 rounded font-medium mb-1">
                                    📶 {d._summary.ssid}
                                  </span>
                                )}
                                {d._summary?.pppoe_username && (
                                  <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded font-mono font-semibold block w-max">
                                    👤 {d._summary.pppoe_username}
                                  </span>
                                )}
                                {!d._summary?.ssid && !d._summary?.pppoe_username && <span className="text-slate-400 dark:text-slate-500">—</span>}
                              </td>
                              <td className="px-5 py-3.5">
                                {d._summary?.rx_power ? (
                                  <span className={`px-2 py-0.5 rounded ${rxPowerColor}`}>
                                    {d._summary.rx_power}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 dark:text-slate-500">—</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex flex-wrap gap-1">
                                  {(d._tag ?? []).map((tag) => (
                                    <span key={tag} className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-100">
                                      {tag}
                                    </span>
                                  ))}
                                  {!(d._tag ?? []).length && <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>}
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  className="bg-indigo-600 hover:bg-indigo-700"
                                  onClick={() => setDetailId(d._id)}
                                >
                                  Detail
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 font-medium">{filtered.length} dari {devices.length} perangkat terdeteksi</p>
            </>
          )}

          {activeTab === "faults" && (
            <FaultsPanel pushError={pushError} />
          )}
        </div>
      </article>

      {/* Device Detail Modal */}
      {detailId && (
        <DeviceDetailModal
          deviceId={detailId}
          onClose={() => setDetailId(null)}
          pushSuccess={pushSuccess}
          pushError={pushError}
        />
      )}
    </section>
  );
}
