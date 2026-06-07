import { Bar, Pie } from "react-chartjs-2";
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
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <StatusPill label={health?.status ?? "checking"} tone={appTone} />
        <StatusPill label={`worker ${health?.services.worker ?? "unknown"}`} tone={workerTone} />
        <StatusPill label={`backup ${health?.services.backup ?? "unknown"}`} tone={backupTone} />
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
              className={`bg-white border-x border-b border-slate-200 ${card.color} border-t-4 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between`}
            >
              <span className="text-sm font-semibold text-slate-500 mb-2">{card.label}</span>
              <strong className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {card.isCurrency
                  ? formatCurrency(summary?.[card.key] as number ?? 0)
                  : (summary?.[card.key] as number ?? 0)}
              </strong>
              <p className="text-xs text-slate-400 mt-4 leading-relaxed">{card.note}</p>
            </article>
          ))
        )}
      </section>

      {user?.role === "admin" && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Pendapatan Bulanan</h3>
            {revenue.length > 0 ? (
              <Bar
                data={{
                  labels: [...revenue].reverse().map((r) => r.period),
                  datasets: [
                    {
                      label: "Total Tagihan",
                      data: [...revenue].reverse().map((r) => r.total_billed),
                      backgroundColor: "rgba(99, 102, 241, 0.5)",
                      borderColor: "rgba(99, 102, 241, 1)",
                      borderWidth: 1,
                    },
                    {
                      label: "Total Lunas",
                      data: [...revenue].reverse().map((r) => r.total_paid),
                      backgroundColor: "rgba(34, 197, 94, 0.5)",
                      borderColor: "rgba(34, 197, 94, 1)",
                      borderWidth: 1,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  plugins: { legend: { position: "bottom" } },
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-48 border-2 border-dashed border-slate-100 rounded-xl">
                <p className="text-slate-400 text-sm">Belum ada data pendapatan.</p>
              </div>
            )}
          </article>
          <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Aging Piutang (Belum Bayar)</h3>
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
              <div className="flex items-center justify-center h-48 border-2 border-dashed border-slate-100 rounded-xl">
                <p className="text-slate-400 text-sm">Tidak ada tunggakan berjalan.</p>
              </div>
            )}
          </article>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow hover:shadow-md transition-shadow flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold tracking-wider text-indigo-500 uppercase mb-1">Aksi Cepat</p>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Operasional Hari Ini</h2>
            <p className="text-sm text-slate-500 mb-4">Lihat kesehatan sistem, generate tagihan, dan pantau tunggakan.</p>
            <div className="flex gap-2">
              <button type="button" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors" onClick={() => onSwitchView("bills")}>
                Buka Tagihan
              </button>
              <button type="button" className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-2 px-4 rounded-lg transition-colors" onClick={() => onSwitchView("monitoring")}>
                Buka Monitoring
              </button>
            </div>
          </div>
        </article>
        <article className="bg-white border border-slate-200 rounded-2xl p-6 shadow hover:shadow-md transition-shadow flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold tracking-wider text-amber-600 uppercase">Scheduler</p>
              <StatusPill
                label={health?.scheduler.billing_last_error ? "attention" : "scheduled"}
                tone={health?.scheduler.billing_last_error ? "gold" : "green"}
              />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Run Berikutnya</h2>
            <p className="text-sm text-slate-500">
              {health?.scheduler.billing_next_run
                ? `Auto billing dijadwalkan pada ${formatDateTime(health.scheduler.billing_next_run)}.`
                : "Jadwal billing otomatis belum tercatat."}
            </p>
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1">
        <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">5 Pembayaran Terbaru</h2>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">Realisasi Kas</span>
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-550">
                <tr>
                  <th className="px-6 py-4 font-medium">Tanggal</th>
                  <th className="px-6 py-4 font-medium">Invoice</th>
                  <th className="px-6 py-4 font-medium">Pelanggan</th>
                  <th className="px-6 py-4 font-medium">Nominal</th>
                  <th className="px-6 py-4 font-medium">Metode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {!summary?.pembayaran_terbaru || summary.pembayaran_terbaru.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                      Belum ada riwayat pembayaran terbaru.
                    </td>
                  </tr>
                ) : (
                  summary.pembayaran_terbaru.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-slate-500">{formatDateTime(p.paid_at)}</td>
                      <td className="px-6 py-4 text-slate-900 font-semibold">{p.invoice_number}</td>
                      <td className="px-6 py-4 text-slate-700">{p.customer_name}</td>
                      <td className="px-6 py-4 text-emerald-600 font-bold">{formatCurrency(p.amount)}</td>
                      <td className="px-6 py-4">
                        <span className="uppercase tracking-wider text-[10px] font-extrabold bg-slate-100 text-slate-700 px-2 py-1 rounded-lg">
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
        <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Service Snapshot</h2>
            <StatusPill label={health?.status ?? "checking"} tone={appTone} />
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <dt>App Name</dt>
              <dd>{health?.app.name ?? "-"}</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>{health?.app.environment ?? "-"}</dd>
            </div>
            <div>
              <dt>Last Health Check</dt>
              <dd>{health?.timestamp ?? "-"}</dd>
            </div>
            <div>
              <dt>Worker Heartbeat</dt>
              <dd>{formatDateTime(health?.worker.last_heartbeat)}</dd>
            </div>
          </dl>
        </article>
      </section>
    </div>
  );
}
