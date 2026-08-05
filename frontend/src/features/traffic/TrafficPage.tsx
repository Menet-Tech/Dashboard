import { useState, useEffect, useMemo } from "react";
import { Line } from "react-chartjs-2";
import { Search, Activity, ArrowUp, ArrowDown, X, Info, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import type { CustomerItem, PackageItem } from "../../types";
import { fetchTrafficStats, type TrafficStats } from "../../lib/api";
import { Button } from "../../components/ui/Button";

type TrafficPageProps = {
  customers: CustomerItem[];
  packages: PackageItem[];
};

type HistoryPoint = {
  time: string;
  tx: number; // in Mbps
  rx: number; // in Mbps
};

function formatBps(bps: number): string {
  if (!bps || bps <= 0) return "0 bps";
  if (bps >= 1000000000) {
    return `${(bps / 1000000000).toFixed(2)} Gbps`;
  }
  if (bps >= 1000000) {
    return `${(bps / 1000000).toFixed(2)} Mbps`;
  }
  if (bps >= 1000) {
    return `${(bps / 1000).toFixed(1)} Kbps`;
  }
  return `${bps} bps`;
}

export function TrafficPage({ customers, packages }: TrafficPageProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [trafficData, setTrafficData] = useState<Record<string, TrafficStats>>({});
  const [selectedCust, setSelectedCust] = useState<CustomerItem | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  const [sortField, setSortField] = useState<string | null>("usagePercent");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const requestSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortableHeader = (label: string, field: string, align: "left" | "center" = "left") => {
    const isSorted = sortField === field;
    return (
      <th 
        className={`px-6 py-4 font-semibold select-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-550 dark:text-slate-400 ${align === "center" ? "text-center" : "text-left"}`}
        onClick={() => requestSort(field)}
      >
        <div className={`inline-flex items-center gap-1.5 ${align === "center" ? "justify-center w-full" : ""}`}>
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

  // Polling loop for traffic stats (every 2.5s)
  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetchTrafficStats();
        if (active && res && res.data) {
          setTrafficData(res.data);

          // If a modal is open, append the new statistics to the chart history
          if (selectedCust) {
            const username = selectedCust.user_pppoe.toLowerCase();
            const stats = res.data[username] || { tx_rate: 0, rx_rate: 0 };
            
            const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const newPoint: HistoryPoint = {
              time: nowTime,
              tx: stats.tx_rate / 1000000, // convert to Mbps
              rx: stats.rx_rate / 1000000, // convert to Mbps
            };

            setHistory((prev) => {
              const next = [...prev, newPoint];
              if (next.length > 24) { // keep 60 seconds of history (24 * 2.5s)
                next.shift();
              }
              return next;
            });
          }
        }
      } catch (err) {
        console.error("Gagal mengambil status traffic", err);
      }
    }

    // Run once immediately
    void poll();

    const interval = setInterval(() => {
      void poll();
    }, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedCust]);

  // Open modal and prepopulate history
  const handleOpenDetails = (cust: CustomerItem) => {
    setSelectedCust(cust);
    const now = new Date();
    const initialHistory: HistoryPoint[] = [];
    const username = cust.user_pppoe.toLowerCase();
    const stats = trafficData[username] || { tx_rate: 0, rx_rate: 0 };

    for (let i = 9; i >= 0; i--) {
      const timeStr = new Date(now.getTime() - i * 2500).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      initialHistory.push({
        time: timeStr,
        tx: stats.tx_rate / 1000000,
        rx: stats.rx_rate / 1000000,
      });
    }
    setHistory(initialHistory);
  };

  const handleCloseDetails = () => {
    setSelectedCust(null);
    setHistory([]);
  };

  // Helper to resolve speed limit of customer package
  const getCustomerPackageSpeed = (cust: CustomerItem) => {
    const pkg = packages.find((p) => p.id === cust.package_id);
    return pkg ? pkg.speed_mbps : 10; // default to 10 Mbps
  };

  // Filter PPPoE active customers
  const activeCustomers = useMemo(() => {
    return customers.filter(c => c.user_pppoe && c.status !== "inactive");
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    return activeCustomers.filter((c) => {
      const term = searchTerm.toLowerCase();
      return (
        c.name.toLowerCase().includes(term) ||
        c.user_pppoe.toLowerCase().includes(term) ||
        (c.package_name && c.package_name.toLowerCase().includes(term))
      );
    });
  }, [activeCustomers, searchTerm]);

  // Threshold computations for row styling and statistics
  const processedCustomers = useMemo(() => {
    return filteredCustomers.map((cust) => {
      const username = cust.user_pppoe.toLowerCase();
      const stats = trafficData[username] || { tx_rate: 0, rx_rate: 0 };
      const limitMbps = getCustomerPackageSpeed(cust);
      const limitBps = limitMbps * 1000000;

      // Rx (Download) is Tx from router perspective, Tx (Upload) is Rx from router perspective.
      // Already reversed inside backend poller, so tx_rate is customer Upload and rx_rate is customer Download.
      const maxRate = Math.max(stats.rx_rate, stats.tx_rate);
      const usagePercent = limitBps > 0 ? (maxRate / limitBps) * 100 : 0;

      let statusColor = "text-slate-500 dark:text-slate-400";
      let statusBg = "bg-slate-100 dark:bg-slate-900";
      let statusText = "Normal";
      let isWarning = false;
      let isCritical = false;

      if (usagePercent >= 100) {
        statusColor = "text-rose-600 dark:text-rose-400 font-bold";
        statusBg = "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60";
        statusText = "Over Limit";
        isCritical = true;
      } else if (usagePercent >= 90) {
        statusColor = "text-amber-600 dark:text-amber-400 font-semibold";
        statusBg = "bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60";
        statusText = "Near Limit";
        isWarning = true;
      }

      return {
        ...cust,
        stats,
        limitMbps,
        usagePercent,
        statusColor,
        statusBg,
        statusText,
        isWarning,
        isCritical,
      };
    });
  }, [filteredCustomers, trafficData, packages]);

  const sortedCustomers = useMemo(() => {
    const list = processedCustomers;
    if (!sortField) return list;
    return [...list].sort((a, b) => {
      let aVal: any = null;
      let bVal: any = null;

      if (sortField === "rx_rate") {
        aVal = a.stats?.rx_rate || 0;
        bVal = b.stats?.rx_rate || 0;
      } else if (sortField === "tx_rate") {
        aVal = a.stats?.tx_rate || 0;
        bVal = b.stats?.tx_rate || 0;
      } else {
        aVal = (a as any)[sortField];
        bVal = (b as any)[sortField];
      }

      const isNumericField = sortField === "limitMbps" || sortField === "usagePercent" || sortField === "rx_rate" || sortField === "tx_rate";
      if (aVal === null || aVal === undefined) aVal = isNumericField ? 0 : "";
      if (bVal === null || bVal === undefined) bVal = isNumericField ? 0 : "";

      if (isNumericField) {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).trim().toLowerCase();
      const bStr = String(bVal).trim().toLowerCase();
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: "base" })
        : bStr.localeCompare(aStr, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [processedCustomers, sortField, sortDirection]);

  // Overall page stats
  const totals = useMemo(() => {
    let totalTx = 0;
    let totalRx = 0;
    let overLimitCount = 0;
    let nearLimitCount = 0;

    activeCustomers.forEach((cust) => {
      const username = cust.user_pppoe.toLowerCase();
      const stats = trafficData[username] || { tx_rate: 0, rx_rate: 0 };
      const limitMbps = getCustomerPackageSpeed(cust);
      const limitBps = limitMbps * 1000000;

      totalTx += stats.tx_rate;
      totalRx += stats.rx_rate;

      const maxRate = Math.max(stats.rx_rate, stats.tx_rate);
      const percent = limitBps > 0 ? (maxRate / limitBps) * 100 : 0;

      if (percent >= 100) {
        overLimitCount++;
      } else if (percent >= 90) {
        nearLimitCount++;
      }
    });

    return {
      tx: totalTx,
      rx: totalRx,
      overLimit: overLimitCount,
      nearLimit: nearLimitCount,
      activeUsers: activeCustomers.length,
    };
  }, [activeCustomers, trafficData, packages]);

  // Chart data for selected user modal
  const chartData = useMemo(() => {
    return {
      labels: history.map((h) => h.time),
      datasets: [
        {
          label: "Download (Rx)",
          data: history.map((h) => h.rx),
          borderColor: "rgba(99, 102, 241, 1)",
          backgroundColor: "rgba(99, 102, 241, 0.08)",
          fill: true,
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
        },
        {
          label: "Upload (Tx)",
          data: history.map((h) => h.tx),
          borderColor: "rgba(236, 72, 153, 1)",
          backgroundColor: "rgba(236, 72, 153, 0.08)",
          fill: true,
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
        },
      ],
    };
  }, [history]);

  // Modal active user details
  const activeStats = selectedCust ? trafficData[selectedCust.user_pppoe.toLowerCase()] || { tx_rate: 0, rx_rate: 0 } : null;
  const activeLimit = selectedCust ? getCustomerPackageSpeed(selectedCust) : 10;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Traffic Monitor</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Pantau Tx/Rx real-time seluruh koneksi PPPoE aktif.</p>
        </div>
        
        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          </span>
          <input
            type="text"
            placeholder="Cari nama, PPPoE, atau paket..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 dark:border-slate-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 dark:text-slate-100 dark:text-slate-200"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Activity size={20} />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Aktif PPPoE</span>
            <strong className="text-lg font-extrabold text-slate-800 dark:text-slate-100 dark:text-slate-200">{totals.activeUsers} User</strong>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <ArrowDown size={20} />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Download (Rx)</span>
            <strong className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{formatBps(totals.rx)}</strong>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-pink-50 dark:bg-pink-950/40 rounded-xl flex items-center justify-center text-pink-600 dark:text-pink-400 shrink-0">
            <ArrowUp size={20} />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Upload (Tx)</span>
            <strong className="text-lg font-extrabold text-pink-600 dark:text-pink-400">{formatBps(totals.tx)}</strong>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-amber-50 dark:bg-amber-950/40 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Info size={20} />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Mendekati Limit (&ge;90%)</span>
            <strong className="text-lg font-extrabold text-amber-600 dark:text-amber-400">{totals.nearLimit} User</strong>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 dark:border-slate-800/80 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-rose-50 dark:bg-rose-950/40 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
            <Info size={20} />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Melebihi Limit (&ge;100%)</span>
            <strong className="text-lg font-extrabold text-rose-600 dark:text-rose-400">{totals.overLimit} User</strong>
          </div>
        </div>
      </div>

      {/* Main Customers Traffic Table */}
      <div className="bg-white dark:bg-slate-900 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 dark:border-slate-850 rounded-2xl shadow-sm overflow-hidden backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-slate-55/60 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 dark:border-slate-850/80 text-slate-500 dark:text-slate-400 text-xs uppercase font-extrabold tracking-wider">
              <tr>
                {renderSortableHeader("Nama Pelanggan", "name")}
                {renderSortableHeader("PPPoE Username", "user_pppoe")}
                {renderSortableHeader("Paket / Profil", "package_name")}
                {renderSortableHeader("Limit Kecepatan", "limitMbps")}
                {renderSortableHeader("Download (Rx)", "rx_rate")}
                {renderSortableHeader("Upload (Tx)", "tx_rate")}
                {renderSortableHeader("Utilisasi", "usagePercent")}
                <th className="px-6 py-4 font-semibold text-center text-slate-500 dark:text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-850/40">
              {sortedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                    Tidak ada pelanggan PPPoE aktif yang cocok dengan pencarian.
                  </td>
                </tr>
              ) : (
                sortedCustomers.map((cust) => {
                  const isRed = cust.isCritical;
                  const isYellow = cust.isWarning;

                  return (
                    <tr
                      key={cust.id}
                      onClick={() => handleOpenDetails(cust)}
                      className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer transition-colors duration-150 ${
                        isRed
                          ? "bg-rose-50/20 hover:bg-rose-50/40 dark:bg-rose-950/10 dark:hover:bg-rose-950/20"
                          : isYellow
                            ? "bg-amber-50/20 hover:bg-amber-50/40 dark:bg-amber-950/10 dark:hover:bg-amber-950/20"
                            : ""
                      }`}
                    >
                      <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200">{cust.name}</td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs">{cust.user_pppoe}</td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{cust.package_name || "-"}</td>
                      <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 dark:text-slate-350">
                        {cust.limitMbps === 0 ? "Bypass" : `${cust.limitMbps} Mbps`}
                      </td>
                      <td className={`px-6 py-4 font-bold ${isRed ? "text-rose-600 dark:text-rose-450" : isYellow ? "text-amber-600 dark:text-amber-450" : "text-emerald-600 dark:text-emerald-450"}`}>
                        {formatBps(cust.stats.rx_rate)}
                      </td>
                      <td className={`px-6 py-4 font-bold ${isRed ? "text-rose-600 dark:text-rose-450" : isYellow ? "text-amber-600 dark:text-amber-450" : "text-pink-600 dark:text-pink-450"}`}>
                        {formatBps(cust.stats.tx_rate)}
                      </td>
                      <td className="px-6 py-4 w-40">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isRed
                                  ? "bg-rose-500"
                                  : isYellow
                                    ? "bg-amber-500"
                                    : "bg-indigo-500"
                              }`}
                              style={{ width: `${Math.min(cust.usagePercent, 100)}%` }}
                            />
                          </div>
                          <span className={`text-[11px] font-bold shrink-0 ${isRed ? "text-rose-600" : isYellow ? "text-amber-600" : "text-slate-500 dark:text-slate-400"}`}>
                            {cust.usagePercent.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-block px-3 py-1 rounded-full text-[10px] uppercase font-bold leading-none ${cust.statusBg} ${cust.statusColor}`}>
                          {cust.statusText}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Real-time statistics modal chart */}
      {selectedCust && activeStats && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-300 fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden transform scale-in">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="inline-block bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg mb-1.5">
                  Statistik Real-Time
                </span>
                <h3 className="text-lg font-extrabold text-slate-850 dark:text-slate-100">
                  {selectedCust.name}
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                  PPPoE User: {selectedCust.user_pppoe} • Limit: {activeLimit === 0 ? "Bypass" : `${activeLimit} Mbps`}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCloseDetails}
                className="w-8 h-8 rounded-full p-0 flex items-center justify-center bg-slate-50 dark:bg-slate-950 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X size={16} />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Active Badges */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800 dark:border-slate-850 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <ArrowDown size={18} />
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Download</span>
                    <strong className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                      {formatBps(activeStats.rx_rate)}
                    </strong>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800 dark:border-slate-850 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0">
                    <ArrowUp size={18} />
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Upload</span>
                    <strong className="text-base font-extrabold text-pink-600 dark:text-pink-400">
                      {formatBps(activeStats.tx_rate)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Line Chart */}
              <div className="h-72 border border-slate-100 dark:border-slate-800 dark:border-slate-850 p-3 rounded-xl bg-slate-50/50 dark:bg-slate-950/30">
                <Line
                  data={chartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 0 }, // disable chart.js standard anims to make updates snappy
                    plugins: {
                      legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 10 } } },
                      tooltip: {
                        cornerRadius: 8,
                        callbacks: {
                          label: (context: any) => {
                            const val = context.parsed.y || 0;
                            return ` ${context.dataset.label}: ${val.toFixed(2)} Mbps`;
                          }
                        }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: { display: true, text: "Bandwidth (Mbps)", font: { size: 10 } },
                        grid: {
                          color: () => document.documentElement.classList.contains("dark")
                            ? "rgba(51, 65, 85, 0.3)"
                            : "rgba(241, 245, 249, 1)"
                        }
                      },
                      x: {
                        grid: { display: false },
                        ticks: { maxTicksLimit: 6, font: { size: 9 } }
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-55 dark:bg-slate-950 px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDetails}
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
