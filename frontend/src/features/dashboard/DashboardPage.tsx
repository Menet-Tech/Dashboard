import { Button } from "../../components/ui/Button";
import { useMemo, useState, useEffect } from "react";
import { Line, Pie } from "react-chartjs-2";
import { formatDateTime, formatCurrency } from "../../utils/format";
import { StatusPill, SkeletonCard } from "../../components/ui";
import type { StatusTone } from "../../utils/status";
import type { HealthPayload, SummaryPayload } from "../../lib/api";
import type { User, RevenueItem, AgingReport, ViewKey } from "../../types";

type SummaryCard = {
  key: keyof SummaryPayload;
  label: string;
  note: string;
  color: string;
  isCurrency?: boolean;
};

const summaryCards: SummaryCard[] = [
  { key: "total_pelanggan", label: "Total Pelanggan", note: "Basis pelanggan yang tercatat di database operasional.", color: "border-t-indigo-500" },
  { key: "total_active", label: "Status Active", note: "Layanan normal yang bisa dipantau tanpa tindakan isolir.", color: "border-t-emerald-500" },
  { key: "total_limit", label: "Status Limit", note: "Pelanggan yang perlu follow-up karena pembatasan layanan.", color: "border-t-rose-500" },
  { key: "total_inactive", label: "Status Inactive", note: "Pelanggan dengan status dinonaktifkan.", color: "border-t-slate-500" },
  { key: "total_tagihan_belum_bayar", label: "Tagihan Belum Bayar", note: "Piutang berjalan yang masih perlu ditagih.", color: "border-t-amber-500" },
  { key: "total_jatuh_tempo", label: "Jatuh Tempo", note: "Tagihan belum lunas yang telah melewati batas pembayaran.", color: "border-t-orange-500" },
  { key: "total_menunggak", label: "Menunggak (>30 Hari)", note: "Tagihan menunggak lama yang memerlukan tindakan isolir.", color: "border-t-red-500" },
  { key: "pendapatan_bulan_ini", label: "Realisasi Bulan Ini", note: "Total pembayaran tagihan yang diterima bulan ini.", color: "border-t-teal-500", isCurrency: true },
];

export type DashboardPageProps = {
  pageLoading: boolean;
  summary: SummaryPayload | null;
  health: HealthPayload | null;
  user: User | null;
  revenue: RevenueItem[];
  aging: AgingReport | null;
  appTone: StatusTone;
  workerTone: StatusTone;
  backupTone: StatusTone;
  onSwitchView: (view: ViewKey) => void;
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

export function DashboardPage({
  pageLoading,
  summary,
  health,
  user,
  revenue,
  aging,
  appTone,
  workerTone,
  backupTone,
  onSwitchView,
}: DashboardPageProps) {
  const safeRevenue = revenue || [];

  // Reactive dark mode detection — updates when user toggles theme
  // Avoids reading DOM during render (anti-pattern)
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const revenueChartData = useMemo(() => {
    const sortedRevenue = [...safeRevenue].reverse();
    return {
      labels: sortedRevenue.map((r) => r.period),
      datasets: [
        {
          label: "Total Tagihan",
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
          label: "Total Lunas",
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
  }, [safeRevenue]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <StatusPill label={health?.status ?? "checking"} tone={appTone} />
        <StatusPill label={`worker ${health?.services.worker ?? "unknown"}`} tone={workerTone} />
        <StatusPill label={`backup ${health?.services.backup ?? "unknown"}`} tone={backupTone} />
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {pageLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          summaryCards.map((card) => (
            <article
              key={card.key}
              className={`bg-white dark:bg-slate-900 border-x border-b border-slate-200 dark:border-slate-800 ${card.color} border-t-4 rounded-card p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between`}
            >
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 dark:text-slate-550 uppercase tracking-wider mb-2">{card.label}</span>
              <strong className="text-xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">
                {card.isCurrency
                  ? formatCurrency(summary?.[card.key] as number ?? 0)
                  : (summary?.[card.key] as number ?? 0)}
              </strong>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3 leading-normal">{card.note}</p>
            </article>
          ))
        )}
      </section>

      {user?.role === "admin" && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-card p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider mb-4">Pendapatan Bulanan</h3>
            {safeRevenue.length > 0 ? (
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
                        backgroundColor: isDark ? "#1e293b" : "#ffffff",
                        titleColor: isDark ? "#f8fafc" : "#1e293b",
                        bodyColor: isDark ? "#cbd5e1" : "#475569",
                        borderColor: isDark ? "#334155" : "#e2e8f0",
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
                          color: () => isDark
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
              <div className="flex items-center justify-center h-72 border-2 border-dashed border-slate-150 dark:border-slate-800 rounded-xl">
                <p className="text-slate-400 dark:text-slate-500 text-sm">Belum ada data pendapatan.</p>
              </div>
            )}
          </article>
          <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-card p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider mb-4">Aging Piutang (Belum Bayar)</h3>
            {aging && (aging.current > 0 || aging.days_1_30 > 0 || aging.days_31_60 > 0 || aging.over_60 > 0) ? (
              <div className="max-w-xs mx-auto">
                <Pie
                  data={{
                    labels: ["Current", "1-30 Hari", "31-60 Hari", ">60 Hari"],
                    datasets: [
                      {
                        data: [aging.current, aging.days_1_30, aging.days_31_60, aging.over_60],
                        backgroundColor: [
                          "rgba(59, 130, 246, 0.7)",
                          "rgba(234, 179, 8, 0.7)",
                          "rgba(249, 115, 22, 0.7)",
                          "rgba(239, 68, 68, 0.7)",
                        ],
                        borderWidth: 1,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: { legend: { position: "bottom" } },
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 border-2 border-dashed border-slate-150 dark:border-slate-800 rounded-xl">
                <p className="text-slate-400 dark:text-slate-500 text-sm">Tidak ada tunggakan berjalan.</p>
              </div>
            )}
          </article>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-card p-5 shadow hover:shadow-md transition-shadow flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold tracking-wider text-indigo-500 uppercase mb-1">Aksi Cepat</p>
            <h2 className="text-base font-bold text-slate-850 dark:text-slate-150 mb-2">Operasional Hari Ini</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">Lihat kesehatan sistem, generate tagihan, dan pantau tunggakan.</p>
            <div className="flex gap-2">
              <Button type="button" variant="primary" onClick={() => onSwitchView("bills")}>
                Buka Tagihan
              </Button>
              <Button type="button" variant="outline" onClick={() => onSwitchView("monitoring")}>
                Buka Monitoring
              </Button>
            </div>
          </div>
        </article>
        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-card p-5 shadow hover:shadow-md transition-shadow flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-100 dark:border-amber-900">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold tracking-wider text-amber-600 uppercase">Scheduler</p>
              <StatusPill
                label={health?.scheduler.billing_last_error ? "attention" : "scheduled"}
                tone={health?.scheduler.billing_last_error ? "gold" : "green"}
              />
            </div>
            <h2 className="text-base font-bold text-slate-850 dark:text-slate-150 mb-2">Run Berikutnya</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {health?.scheduler.billing_next_run
                ? `Auto billing dijadwalkan pada ${formatDateTime(health.scheduler.billing_next_run)}.`
                : "Jadwal billing otomatis belum tercatat."}
            </p>
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1">
        <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 uppercase tracking-wider">5 Pembayaran Terbaru</h2>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full uppercase tracking-wider">Realisasi Kas</span>
          </div>
          <div className="overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-card bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full text-left border-collapse text-sm min-w-[600px]">
              <thead className="bg-gray-50 dark:bg-slate-800 dark:bg-slate-950 border-b border-gray-250 dark:border-slate-850 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">
                <tr>
                  <th className="px-6 py-4 font-semibold">Tanggal</th>
                  <th className="px-6 py-4 font-semibold">Invoice</th>
                  <th className="px-6 py-4 font-semibold">Pelanggan</th>
                  <th className="px-6 py-4 font-semibold">Nominal</th>
                  <th className="px-6 py-4 font-semibold">Metode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {!summary?.pembayaran_terbaru || summary.pembayaran_terbaru.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400 dark:text-slate-500">
                      Belum ada riwayat pembayaran terbaru.
                    </td>
                  </tr>
                ) : (
                  summary.pembayaran_terbaru.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/40 transition-colors">
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">{formatDateTime(p.paid_at)}</td>
                      <td className="px-6 py-4 text-slate-900 dark:text-slate-50 dark:text-slate-100 font-bold font-mono text-xs">{p.invoice_number}</td>
                      <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-medium">{p.customer_name}</td>
                      <td className="px-6 py-4 text-emerald-600 dark:text-emerald-400 font-bold">{formatCurrency(p.amount)}</td>
                      <td className="px-6 py-4">
                        <span className="uppercase tracking-wider text-[9px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 dark:text-slate-350 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 dark:border-slate-700">
                          {p.payment_method}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1">
        <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 uppercase tracking-wider">Service Snapshot</h2>
            <StatusPill label={health?.status ?? "checking"} tone={appTone} />
          </div>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850">
              <dt className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">App Name</dt>
              <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-200 mt-1 font-mono">{health?.app.name ?? "-"}</dd>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850">
              <dt className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Environment</dt>
              <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-200 mt-1 uppercase font-mono">{health?.app.environment ?? "-"}</dd>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850">
              <dt className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Last Health Check</dt>
              <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-200 mt-1 text-xs">{health?.timestamp ?? "-"}</dd>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-150 dark:border-slate-850">
              <dt className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Worker Heartbeat</dt>
              <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-200 mt-1 text-xs">{formatDateTime(health?.worker.last_heartbeat)}</dd>
            </div>
          </dl>
        </article>
      </section>
    </div>
  );
}
