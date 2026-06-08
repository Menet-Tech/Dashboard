import { useMemo } from "react";
import { Line, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { formatCurrency } from "../../utils/format";
import { Download, TrendingUp, DollarSign, Users, Percent } from "lucide-react";
import type { CustomerItem, RevenueItem, AgingReport } from "../../types";

// Register ChartJS modules locally
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

type ReportsPageProps = {
  customers: CustomerItem[];
  revenue: RevenueItem[];
  aging: AgingReport | null;
  submitting: boolean;
};

function formatCurrencyShort(value: number): string {
  if (value === 0) return "Rp 0k";
  if (value >= 1000000) {
    const val = value / 1000000;
    return `Rp ${Number(val.toFixed(1))}jt`;
  }
  if (value >= 1000) {
    const val = value / 1000;
    return `Rp ${Number(val.toFixed(0))}k`;
  }
  return `Rp ${value}`;
}

export function ReportsPage({
  customers,
  revenue,
  aging,
  submitting,
}: ReportsPageProps) {
  // 1. Proyeksi Omset (MRR)
  const activeCustomers = useMemo(() => {
    return customers.filter((c) => c.status === "active" || c.is_trial);
  }, [customers]);

  const projectedMRR = useMemo(() => {
    return activeCustomers.reduce((acc, c) => {
      const price = c.package_price || 0;
      const disc = c.diskon || 0;
      return acc + Math.max(0, price - disc);
    }, 0);
  }, [activeCustomers]);

  // 2. Ringkasan Bulan Ini
  const currentMonthReport = revenue[0] || null;
  const billedThisMonth = currentMonthReport?.total_billed ?? 0;
  const paidThisMonth = currentMonthReport?.total_paid ?? 0;
  const collectionRate = billedThisMonth > 0 ? (paidThisMonth / billedThisMonth) * 100 : 0;

  // 3. Proyeksi tahunan / rata-rata
  const averageMonthlyCollection = useMemo(() => {
    if (revenue.length === 0) return 0;
    const total = revenue.reduce((acc, r) => acc + r.total_paid, 0);
    return total / revenue.length;
  }, [revenue]);

  // 4. Data untuk Grafik Pendapatan
  const revenueChartData = useMemo(() => {
    const sortedRevenue = [...revenue].reverse();
    return {
      labels: sortedRevenue.map((r) => r.period),
      datasets: [
        {
          label: "Total Tagihan (Billed)",
          data: sortedRevenue.map((r) => r.total_billed),
          borderColor: "rgba(99, 102, 241, 1)",
          backgroundColor: (context: any) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return "rgba(99, 102, 241, 0.05)";
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, "rgba(99, 102, 241, 0.4)");
            gradient.addColorStop(1, "rgba(99, 102, 241, 0.01)");
            return gradient;
          },
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHitRadius: 12,
          pointBackgroundColor: "rgba(99, 102, 241, 1)",
          tension: 0.35,
          fill: true,
        },
        {
          label: "Realisasi Lunas (Paid)",
          data: sortedRevenue.map((r) => r.total_paid),
          borderColor: "#8b5cf6",
          backgroundColor: (context: any) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return "rgba(139, 92, 246, 0.1)";
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0.05, "rgba(139, 92, 246, 0.8)");
            gradient.addColorStop(0.95, "rgba(139, 92, 246, 0)");
            return gradient;
          },
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHitRadius: 12,
          pointBackgroundColor: "#8b5cf6",
          tension: 0.35,
          fill: true,
        },
      ],
    };
  }, [revenue]);

  // 5. Data untuk Grafik Aging
  const agingChartData = useMemo(() => {
    if (!aging) return null;
    return {
      labels: ["Current (Belum Tempo)", "1-30 Hari", "31-60 Hari", ">60 Hari"],
      datasets: [
        {
          data: [aging.current, aging.days_1_30, aging.days_31_60, aging.over_60],
          backgroundColor: [
            "rgba(59, 130, 246, 0.85)", // Blue
            "rgba(234, 179, 8, 0.85)",  // Yellow
            "rgba(249, 115, 22, 0.85)",  // Orange
            "rgba(239, 68, 68, 0.85)",   // Red
          ],
          borderColor: [
            "rgba(59, 130, 246, 1)",
            "rgba(234, 179, 8, 1)",
            "rgba(249, 115, 22, 1)",
            "rgba(239, 68, 68, 1)",
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [aging]);

  return (
    <section className="grid gap-6">
      {/* Header Info */}
      <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Analisis Laporan Keuangan</h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">Pantau tren omset bulanan, status tagihan aktif, serta piutang menunggak.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
            Role: Admin
          </span>
        </div>
      </article>

      {/* Stats Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Proyeksi Omset */}
        <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
            <TrendingUp size={22} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Proyeksi Omset (MRR)</span>
            <strong className="text-xl font-extrabold text-slate-900 dark:text-slate-100 block mt-1 tracking-tight">
              {formatCurrency(projectedMRR)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-1">
              Dari {activeCustomers.length} pelanggan status aktif
            </span>
          </div>
        </article>

        {/* Card 2: Billed Bulan Ini */}
        <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <DollarSign size={22} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Tagihan Tergenerate</span>
            <strong className="text-xl font-extrabold text-slate-900 dark:text-slate-100 block mt-1 tracking-tight">
              {formatCurrency(billedThisMonth)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-1">
              Untuk tagihan periode berjalan
            </span>
          </div>
        </article>

        {/* Card 3: Realisasi Lunas */}
        <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <Users size={22} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Realisasi Lunas</span>
            <strong className="text-xl font-extrabold text-slate-900 dark:text-slate-100 block mt-1 tracking-tight">
              {formatCurrency(paidThisMonth)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-1">
              Total kas masuk bulan ini
            </span>
          </div>
        </article>

        {/* Card 4: Collection Rate */}
        <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <Percent size={22} />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Collection Rate</span>
            <strong className="text-xl font-extrabold text-slate-900 dark:text-slate-100 block mt-1 tracking-tight">
              {collectionRate.toFixed(1)}%
            </strong>
            <span className="text-[10px] text-slate-500 block mt-1">
              Rasio lunas dari total tagihan
            </span>
          </div>
        </article>
      </section>

      {/* Charts Section */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Keuangan */}
        <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-6">Tren Keuangan Bulanan</h3>
          {revenue.length > 0 ? (
            <div className="h-72">
              <Line
                data={revenueChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: "bottom",
                      labels: { color: "rgba(100, 116, 139, 1)" },
                    },
                    tooltip: {
                      backgroundColor: document.documentElement.classList.contains("dark") ? "#1e293b" : "#ffffff",
                      titleColor: document.documentElement.classList.contains("dark") ? "#f8fafc" : "#1e293b",
                      bodyColor: document.documentElement.classList.contains("dark") ? "#cbd5e1" : "#475569",
                      borderColor: document.documentElement.classList.contains("dark") ? "#334155" : "#e2e8f0",
                      borderWidth: 1,
                      padding: 12,
                      cornerRadius: 12,
                      displayColors: true,
                      callbacks: {
                        label: (context: any) => {
                          const label = context.dataset.label || "";
                          const val = context.parsed.y || 0;
                          return ` ${label}: ${formatCurrency(val)}`;
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
                      border: { display: false },
                      ticks: {
                        color: "rgba(100, 116, 139, 1)",
                        callback: (value) => formatCurrencyShort(Number(value)),
                      },
                      grid: {
                        color: () => document.documentElement.classList.contains("dark")
                          ? "rgba(51, 65, 85, 0.4)"
                          : "rgba(241, 245, 249, 1)",
                        borderDash: [3, 3],
                      } as any,
                    },
                    x: {
                      border: { display: false },
                      ticks: { color: "rgba(100, 116, 139, 1)" },
                      grid: { display: false },
                    },
                  },
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-72 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
              <p className="text-slate-400 dark:text-slate-500 text-sm">Belum ada data pendapatan bulanan.</p>
            </div>
          )}
        </article>

        {/* Aging piutang */}
        <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-4">Rasio Aging Piutang</h3>
          {aging && (aging.current > 0 || aging.days_1_30 > 0 || aging.days_31_60 > 0 || aging.over_60 > 0) ? (
            <div className="h-72 flex flex-col justify-between">
              <div className="max-w-[200px] mx-auto flex-1 flex items-center justify-center">
                <Doughnut
                  data={agingChartData!}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                    },
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 rounded bg-blue-500 shrink-0"></span>
                  <span className="truncate">Current: {formatCurrency(aging.current)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 rounded bg-yellow-500 shrink-0"></span>
                  <span className="truncate">1-30 hari: {formatCurrency(aging.days_1_30)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 rounded bg-orange-500 shrink-0"></span>
                  <span className="truncate">31-60 hari: {formatCurrency(aging.days_31_60)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <span className="w-2.5 h-2.5 rounded bg-red-500 shrink-0"></span>
                  <span className="truncate">&gt;60 hari: {formatCurrency(aging.over_60)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-72 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
              <p className="text-slate-400 dark:text-slate-500 text-sm">Tidak ada tunggakan berjalan.</p>
            </div>
          )}
        </article>
      </section>

      {/* CSV Export & Actions Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">Eksport Laporan Cepat</h4>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 leading-relaxed">
              Unduh salinan data tagihan pelanggan dan rekapitulasi data pelanggan utama langsung dalam format CSV untuk kebutuhan pelaporan eksternal atau spreadsheet Excel.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/api/v1/reports/bills/csv"
              download
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Download size={14} />
              Export Rekap Tagihan
            </a>
            <a
              href="/api/v1/reports/customers/csv"
              download
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Download size={14} />
              Export Data Pelanggan
            </a>
          </div>
        </article>

        <article className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">Metrik Proyeksi Bisnis</h4>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 leading-relaxed">
              Statistik rata-rata bulanan yang diserap kas dan target collection rate untuk menjaga stabilitas operasional.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Rata-rata Kas Bulanan</span>
              <strong className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-1 block">
                {formatCurrency(averageMonthlyCollection)}
              </strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Target Rasio Lunas</span>
              <strong className="text-sm font-bold text-emerald-600 dark:text-emerald-450 mt-1 block">
                &gt; 90.0%
              </strong>
            </div>
          </div>
        </article>
      </section>
    </section>
  );
}
