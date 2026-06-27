import { useEffect, useState, useCallback } from "react";
import { apiRequest, checkWAN, checkGponEpon, type GacsDevice, type GacsDeviceDetail, type GacsFault } from "../../lib/api";
import { formatDateTime } from "../../utils/format";
import { Modal } from "../../components/ui/Modal";
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
  Database
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
  const [detail, setDetail] = useState<GacsDeviceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [summoning, setSummoning] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "wan" | "mikrotik" | "params">("info");

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
    if (!confirm("Yakin ingin me-reboot perangkat ini?")) return;
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
    const rx = detail.virtualParameters?.rxpower?.value;
    if (rx !== undefined && rx !== null && rx !== "") {
      return `${rx} dBm`;
    }
    const rawRx = getRaw("InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower") || 
                  getRaw("InternetGatewayDevice.X_CMCC_ONU_INFO.RxOpticalPower");
    return rawRx ? `${rawRx} dBm` : "";
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
          <button
            type="button"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            onClick={() => void handleSummon()}
            disabled={summoning || loading}
          >
            {summoning ? "Menyummon..." : "⟳ Refresh Data"}
          </button>
          <button
            type="button"
            className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            onClick={() => void handleReboot()}
            disabled={rebooting || loading}
          >
            {rebooting ? "Rebooting..." : "↺ Reboot"}
          </button>
          <button
            type="button"
            className="text-gray-600 hover:bg-gray-100 text-sm font-semibold py-2 px-4 rounded-lg transition-colors"
            onClick={onClose}
          >
            Tutup
          </button>
        </div>
      }
    >
      <div className="min-h-[420px]">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm animate-pulse">
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
              {(["info", "wan", "mikrotik", "params"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab === "info" ? "Informasi Utama" : tab === "wan" ? "Status WAN & Mode" : tab === "mikrotik" ? "Pelanggan & MikroTik" : "Semua Parameter"}
                </button>
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
                  <div key={label} className="py-2 border-b border-slate-100">
                    <dt className="text-slate-500 font-medium mb-0.5">{label}</dt>
                    <dd className="text-slate-900 font-semibold font-mono text-xs break-all">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {activeTab === "mikrotik" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* 1. Customer Database Matching */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
                    <User size={18} className="text-indigo-500" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Database Pelanggan
                    </h4>
                  </div>
                  {detail.customer ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Nama Lengkap</span>
                        <strong className="text-slate-800 text-sm mt-0.5 block">{detail.customer.name}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Status Pelanggan</span>
                        <span className="mt-1 block">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            detail.customer.status === "active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                            detail.customer.status === "limit" ? "bg-rose-50 text-rose-700 border border-rose-200" :
                            "bg-slate-100 text-slate-650"
                          }`}>
                            {detail.customer.status}
                          </span>
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Username PPPoE</span>
                        <code className="text-indigo-600 font-mono text-xs font-semibold bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 block mt-0.5 w-max">
                          {detail.customer.user_pppoe || "-"}
                        </code>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Nomor WhatsApp</span>
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
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Alamat</span>
                        <p className="text-slate-600 mt-1 leading-relaxed bg-white border border-slate-150 p-2.5 rounded-xl">{detail.customer.address || "Belum ada alamat."}</p>
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
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
                    <Shield size={18} className="text-indigo-500" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      MikroTik PPP Secret
                    </h4>
                  </div>
                  {detail.mikrotikSecret ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">PPP Secret Username</span>
                        <strong className="text-slate-800 font-mono block mt-0.5">{detail.mikrotikSecret.username}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Profile Paket</span>
                        <span className="bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 border border-indigo-150 rounded block mt-0.5 w-max">
                          {detail.mikrotikSecret.profile}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Status Akun (Disabled)</span>
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
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Last Caller ID (MAC)</span>
                        <code className="text-slate-700 font-mono block mt-0.5">{detail.mikrotikSecret.last_caller_id || "-"}</code>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Last Logged Out</span>
                        <span className="text-slate-750 block mt-0.5">{detail.mikrotikSecret.last_logged_out || "-"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Last Disconnect Reason</span>
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
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
                    <Activity size={18} className="text-indigo-500" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Sesi Aktif PPP MikroTik
                    </h4>
                  </div>
                  {detail.mikrotikActiveConn ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Status Sesi PPPoE</span>
                        <span className="mt-1 block">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-250 px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1.5 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Online / Connected
                          </span>
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Alamat IP Sesi</span>
                        <code className="text-slate-700 font-mono text-xs font-semibold block mt-0.5">{detail.mikrotikActiveConn.address}</code>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Uptime Sesi</span>
                        <strong className="text-slate-800 font-semibold block mt-0.5">{detail.mikrotikActiveConn.uptime}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Active Caller ID</span>
                        <code className="text-slate-700 font-mono block mt-0.5">{detail.mikrotikActiveConn.caller_id || "-"}</code>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs">
                      <WifiOff size={16} className="shrink-0 text-slate-400" />
                      <span>Pelanggan ini sedang tidak memiliki sesi aktif di MikroTik (Offline).</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "wan" && (
              <div className="space-y-4">
                <div className="bg-slate-50 border rounded-2xl p-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Mode Sambungan Serat</h4>
                  {modeLoading ? (
                    <div className="text-slate-400 text-xs animate-pulse">Mendeteksi GPON/EPON...</div>
                  ) : (
                    <p className="text-slate-900 font-bold text-sm">
                      Mode ONT:{" "}
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        deviceMode === "GPON" ? "bg-indigo-100 text-indigo-700" :
                        deviceMode === "EPON" ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {deviceMode || "UNKNOWN"}
                      </span>
                    </p>
                  )}
                </div>

                <div className="bg-white border rounded-2xl p-4 space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase">Koneksi WAN Aktif</h4>
                  {wanLoading ? (
                    <div className="text-slate-400 text-xs animate-pulse">Memeriksa status WAN...</div>
                  ) : !wanData ? (
                    <div className="text-slate-400 text-xs">Gagal memuat status WAN.</div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <h5 className="text-[11px] font-bold text-slate-400 uppercase mb-1">IP Connection</h5>
                        {wanData.wanIPConnections.length === 0 ? (
                          <p className="text-slate-500 text-xs">Tidak ada koneksi IP WAN aktif.</p>
                        ) : (
                          <ul className="list-disc list-inside space-y-0.5">
                            {wanData.wanIPConnections.map((conn) => (
                              <li key={conn} className="font-mono text-xs text-slate-700 truncate" title={conn}>
                                {conn.split("WANConnectionDevice.").pop()}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="border-t pt-3">
                        <h5 className="text-[11px] font-bold text-slate-400 uppercase mb-1">PPP Connection</h5>
                        {wanData.wanPPPConnections.length === 0 ? (
                          <p className="text-slate-500 text-xs">Tidak ada koneksi PPP WAN aktif.</p>
                        ) : (
                          <ul className="list-disc list-inside space-y-0.5">
                            {wanData.wanPPPConnections.map((conn) => (
                              <li key={conn} className="font-mono text-xs text-slate-700 truncate" title={conn}>
                                {conn.split("WANConnectionDevice.").pop()}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="border-t pt-3 bg-slate-50/50 p-2.5 rounded-xl">
                        <h5 className="text-[11px] font-bold text-slate-400 uppercase mb-1">Slot PPPoE Tersedia</h5>
                        {wanData.availableSlots?.wanPPPConnections?.length > 0 ? (
                          <ul className="list-disc list-inside space-y-0.5 text-xs text-indigo-600">
                            {wanData.availableSlots.wanPPPConnections.slice(0, 2).map((slot) => (
                              <li key={slot} className="font-mono text-[10px] truncate" title={slot}>
                                {slot.split("InternetGatewayDevice.").pop()}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-slate-500 text-xs">Tidak ada slot koneksi baru yang terdeteksi.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "params" && (
              <div className="overflow-auto max-h-96 rounded-xl border border-slate-100">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Parameter</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Nilai</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Tipe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {flatParams.length === 0 ? (
                      <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">Tidak ada parameter tersedia. Lakukan Refresh Data terlebih dahulu.</td></tr>
                    ) : (
                      flatParams.map((p) => (
                        <tr key={p.path} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 font-mono text-slate-600 break-all max-w-xs">{p.path}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-900 break-all max-w-xs">{p.value}</td>
                          <td className="px-3 py-1.5 text-slate-400">{p.type}</td>
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
    return <div className="text-center text-sm text-slate-400 py-8 animate-pulse">Memuat fault data...</div>;
  }

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
      <table className="w-full text-left border-collapse text-sm">
        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
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
              <td colSpan={7} className="px-5 py-8 text-center text-slate-400 text-sm">
                ✅ Tidak ada fault aktif.
              </td>
            </tr>
          ) : (
            faults.map((f) => (
              <tr key={f._id} className="hover:bg-red-50 transition-colors">
                <td className="px-5 py-3 font-mono text-xs text-slate-600 max-w-[180px] truncate">{f.device_id}</td>
                <td className="px-5 py-3 text-slate-700">{f.channel}</td>
                <td className="px-5 py-3">
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded">{f.code}</span>
                </td>
                <td className="px-5 py-3 text-slate-700 max-w-[240px] truncate" title={f.message}>{f.message}</td>
                <td className="px-5 py-3 text-slate-500 text-xs">{formatDateTime(f.timestamp)}</td>
                <td className="px-5 py-3 text-slate-700">{f.retries ?? 0}x</td>
                <td className="px-5 py-3">
                  <button
                    type="button"
                    className="text-red-600 hover:bg-red-50 text-xs font-bold py-1 px-2.5 rounded-lg transition-colors border border-red-200"
                    onClick={() => void handleDeleteFault(f._id)}
                  >
                    Hapus
                  </button>
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
  const [activeTab, setActiveTab] = useState<"devices" | "faults">("devices");
  const [detailId, setDetailId] = useState<string | null>(null);

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
        if (d && typeof d === "object" && d._deviceId) {
          return d as GacsDevice;
        }

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
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d._id.toLowerCase().includes(q) ||
      d._deviceId._Manufacturer?.toLowerCase().includes(q) ||
      d._deviceId._ProductClass?.toLowerCase().includes(q) ||
      d._deviceId._SerialNumber?.toLowerCase().includes(q) ||
      d._summary?.ssid?.toLowerCase().includes(q) ||
      d._summary?.pppoe_username?.toLowerCase().includes(q)
    );
  });

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
          { label: "Tidak Diketahui", value: devices.length - onlineCount - offlineCount, color: "text-slate-500", icon: <HelpCircle className="text-slate-400 shrink-0" size={20} /> },
        ].map(({ label, value, color, icon }) => (
          <article key={label} className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm flex items-center justify-between hover:shadow-md hover:border-slate-200 transition-all duration-300">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
              <p className={`text-2xl font-black ${color}`}>{loading ? "—" : value}</p>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              {icon}
            </div>
          </article>
        ))}
      </div>

      {/* Main Card */}
      <article className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Tabs & Actions */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0 border-b border-slate-150 bg-slate-50/50">
          <div className="flex gap-1">
            {(["devices", "faults"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeTab === tab
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "devices" ? "Daftar Perangkat" : "Fault Log"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 pb-3 flex items-center gap-1.5 cursor-pointer transition-colors"
            onClick={() => void loadDevices()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing..." : "Refresh Perangkat"}
          </button>
        </div>

        <div className="p-6">
          {activeTab === "devices" && (
            <>
              <div className="mb-5 relative w-full md:w-96">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
                  placeholder="Cari SN, ProductClass, SSID, PPPoE username..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2">
                  <RefreshCw className="animate-spin text-indigo-600" size={24} />
                  <p className="animate-pulse font-medium">Sinkronisasi perangkat dengan GenieACS...</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-150 rounded-xl">
                  <table className="compact-table w-full text-xs">
                    <thead className="bg-slate-50 text-slate-650 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3 text-left">Perangkat</th>
                        <th className="px-5 py-3 text-left">Serial Number</th>
                        <th className="px-5 py-3 text-left">Status</th>
                        <th className="px-5 py-3 text-left">Last Inform</th>
                        <th className="px-5 py-3 text-left">SSID / PPPoE</th>
                        <th className="px-5 py-3 text-left">RX Power</th>
                        <th className="px-5 py-3 text-left">Tag</th>
                        <th className="px-5 py-3 text-left">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-250 bg-white">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-5 py-12 text-center text-slate-400 font-medium">
                            {search ? "Tidak ada perangkat yang cocok." : "Tidak ada perangkat terdaftar di GenieACS."}
                          </td>
                        </tr>
                      ) : (
                        filtered.map((d) => {
                          const status = onlineStatus(d._lastInform);
                          const rxPowerFloat = parseFloat(d._summary?.rx_power ?? "");
                          const rxPowerColor = isNaN(rxPowerFloat) ? "text-slate-400" :
                                               rxPowerFloat < -27 ? "text-rose-600 bg-rose-50 border border-rose-100 font-extrabold" :
                                               rxPowerFloat < -25 ? "text-amber-600 bg-amber-50 border border-amber-100 font-extrabold" :
                                               "text-emerald-600 bg-emerald-50 border border-emerald-100 font-extrabold";
                          return (
                            <tr key={d._id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-3.5">
                                <p className="font-bold text-slate-800">{deviceLabel(d)}</p>
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[180px]" title={d._id}>{d._id}</p>
                              </td>
                              <td className="px-5 py-3.5 font-mono text-slate-600 font-semibold">{d._deviceId._SerialNumber ?? "—"}</td>
                              <td className="px-5 py-3.5">
                                <StatusBadge status={status} />
                              </td>
                              <td className="px-5 py-3.5 text-slate-500 font-medium">{formatDateTime(d._lastInform)}</td>
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
                                {!d._summary?.ssid && !d._summary?.pppoe_username && <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-5 py-3.5">
                                {d._summary?.rx_power ? (
                                  <span className={`px-2 py-0.5 rounded ${rxPowerColor}`}>
                                    {d._summary.rx_power}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex flex-wrap gap-1">
                                  {(d._tag ?? []).map((tag) => (
                                    <span key={tag} className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-100">
                                      {tag}
                                    </span>
                                  ))}
                                  {!(d._tag ?? []).length && <span className="text-slate-400 text-xs">—</span>}
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <button
                                  type="button"
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 px-3 rounded-xl transition-colors shadow-sm cursor-pointer"
                                  onClick={() => setDetailId(d._id)}
                                >
                                  Detail
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-[11px] text-slate-400 font-medium">{filtered.length} dari {devices.length} perangkat terdeteksi</p>
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
