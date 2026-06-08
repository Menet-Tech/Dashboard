import { useEffect, useState, useCallback } from "react";
import { apiRequest, checkWAN, checkGponEpon, type GacsDevice, type GacsDeviceDetail, type GacsFault } from "../../lib/api";
import { formatDateTime } from "../../utils/format";
import { Modal } from "../../components/ui/Modal";

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
  const [activeTab, setActiveTab] = useState<"info" | "wan" | "params">("info");

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

  // Flatten raw device params for display
  const flatParams = detail?.data
    ? Object.entries(detail.data).flatMap(([k, v]) => {
        if (typeof v === "object" && v !== null && "_value" in (v as object)) {
          const param = v as { _value?: unknown; _type?: string };
          return [{ path: k, value: String(param._value ?? ""), type: param._type ?? "" }];
        }
        return [];
      }).slice(0, 200)
    : [];

  // Extract key info from raw data
  const getRaw = (path: string): string => {
    const parts = path.split(".");
    let cur: unknown = detail?.data;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as object)) {
        cur = (cur as Record<string, unknown>)[p];
      } else return "";
    }
    if (cur && typeof cur === "object" && "_value" in (cur as object)) {
      return String((cur as { _value: unknown })._value ?? "");
    }
    return String(cur ?? "");
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
            {detail.vendor && (
              <div className="mb-4 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700 font-medium">
                Vendor: <strong>{detail.vendor.name}</strong>
                {detail.vendor.parameter_prefix && (
                  <span className="ml-2 text-indigo-500 font-mono text-xs">({detail.vendor.parameter_prefix})</span>
                )}
              </div>
            )}

            {/* Tab switcher */}
            <div className="flex gap-1 mb-5 border-b border-slate-100">
              {(["info", "wan", "params"] as const).map((tab) => (
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
                  {tab === "info" ? "Informasi Utama" : tab === "wan" ? "Status WAN & Mode" : "Semua Parameter"}
                </button>
              ))}
            </div>

            {activeTab === "info" && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                {[
                  ["Manufacturer", getRaw("InternetGatewayDevice.DeviceInfo.Manufacturer") || getRaw("Device.DeviceInfo.Manufacturer")],
                  ["Product Class", getRaw("InternetGatewayDevice.DeviceInfo.ProductClass") || getRaw("Device.DeviceInfo.ProductClass")],
                  ["Serial Number", getRaw("InternetGatewayDevice.DeviceInfo.SerialNumber") || getRaw("Device.DeviceInfo.SerialNumber")],
                  ["Hardware Version", getRaw("InternetGatewayDevice.DeviceInfo.HardwareVersion") || getRaw("Device.DeviceInfo.HardwareVersion")],
                  ["Software Version", getRaw("InternetGatewayDevice.DeviceInfo.SoftwareVersion") || getRaw("Device.DeviceInfo.SoftwareVersion")],
                  ["Uptime", getRaw("InternetGatewayDevice.DeviceInfo.UpTime") || getRaw("Device.DeviceInfo.UpTime")],
                  ["External IP", getRaw("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress")],
                  ["DNS Servers", getRaw("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.DNSServers")],
                  ["RX Power", getRaw("InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower") || getRaw("InternetGatewayDevice.X_CMCC_ONU_INFO.RxOpticalPower")],
                  ["TX Power", getRaw("InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TXPower")],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="py-2 border-b border-slate-50">
                    <dt className="text-slate-500 font-medium mb-0.5">{label}</dt>
                    <dd className="text-slate-900 font-semibold font-mono text-xs break-all">{value}</dd>
                  </div>
                ))}
              </dl>
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
      const res = await apiRequest<{ success: boolean; data: GacsDevice[] }>("/api/getdevice?limit=200");
      setDevices(res.data ?? []);
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
    <section className="grid gap-6">
      {/* Header Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Perangkat", value: devices.length, color: "text-slate-900", bg: "bg-white" },
          { label: "Online", value: onlineCount, color: "text-emerald-700", bg: "bg-emerald-50" },
          { label: "Offline", value: offlineCount, color: "text-red-700", bg: "bg-red-50" },
          { label: "Tidak Diketahui", value: devices.length - onlineCount - offlineCount, color: "text-slate-500", bg: "bg-slate-50" },
        ].map(({ label, value, color, bg }) => (
          <article key={label} className={`${bg} border border-slate-200 rounded-2xl p-5 shadow-sm`}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{loading ? "—" : value}</p>
          </article>
        ))}
      </div>

      {/* Main Card */}
      <article className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Tabs & Actions */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0 border-b border-slate-100">
          <div className="flex gap-1">
            {(["devices", "faults"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
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
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 pb-3"
            onClick={() => void loadDevices()}
            disabled={loading}
          >
            {loading ? "Memuat..." : "⟳ Refresh"}
          </button>
        </div>

        <div className="p-6">
          {activeTab === "devices" && (
            <>
              <div className="mb-5">
                <input
                  type="search"
                  className="w-full md:w-96 border border-slate-200 rounded-xl px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
                  placeholder="Cari SN, Manufacturer, SSID, PPPoE username..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm animate-pulse">
                  Memuat perangkat dari GenieACS...
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-100 rounded-2xl">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                      <tr>
                        <th className="px-5 py-3 font-medium">Perangkat</th>
                        <th className="px-5 py-3 font-medium">Serial Number</th>
                        <th className="px-5 py-3 font-medium">Status</th>
                        <th className="px-5 py-3 font-medium">Last Inform</th>
                        <th className="px-5 py-3 font-medium">SSID / PPPoE</th>
                        <th className="px-5 py-3 font-medium">RX Power</th>
                        <th className="px-5 py-3 font-medium">Tag</th>
                        <th className="px-5 py-3 font-medium">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                            {search ? "Tidak ada perangkat yang cocok." : "Tidak ada perangkat terdaftar di GenieACS."}
                          </td>
                        </tr>
                      ) : (
                        filtered.map((d) => {
                          const status = onlineStatus(d._lastInform);
                          return (
                            <tr key={d._id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-5 py-3">
                                <p className="font-semibold text-slate-800">{deviceLabel(d)}</p>
                                <p className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-[180px]">{d._id}</p>
                              </td>
                              <td className="px-5 py-3 font-mono text-xs text-slate-600">{d._deviceId._SerialNumber ?? "—"}</td>
                              <td className="px-5 py-3">
                                <StatusBadge status={status} />
                              </td>
                              <td className="px-5 py-3 text-slate-500 text-xs">{formatDateTime(d._lastInform)}</td>
                              <td className="px-5 py-3 text-xs">
                                {d._summary?.ssid && <p className="font-semibold text-slate-700">📶 {d._summary.ssid}</p>}
                                {d._summary?.pppoe_username && <p className="text-slate-500">👤 {d._summary.pppoe_username}</p>}
                                {!d._summary?.ssid && !d._summary?.pppoe_username && <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-5 py-3 text-xs font-mono text-slate-700">
                                {d._summary?.rx_power ?? "—"}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {(d._tag ?? []).map((tag) => (
                                    <span key={tag} className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-indigo-100">
                                      {tag}
                                    </span>
                                  ))}
                                  {!(d._tag ?? []).length && <span className="text-slate-400 text-xs">—</span>}
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <button
                                  type="button"
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors shadow-sm"
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
              <p className="mt-3 text-xs text-slate-400">{filtered.length} dari {devices.length} perangkat ditampilkan</p>
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
