import { Bar, Pie } from "react-chartjs-2";
import { formatDateTime } from "../../utils/format";
import { StatusPill, SkeletonCard } from "../../components/ui";
import type { StatusTone } from "../../utils/status";
import type { HealthPayload, SummaryPayload } from "../../lib/api";
import type { User, RevenueItem, AgingReport, ViewKey } from "../../types";

const summaryCards = [
  { key: "total_pelanggan", label: "Total Pelanggan", note: "Basis pelanggan yang tercatat di database operasional." },
  { key: "total_active", label: "Status Active", note: "Layanan normal yang bisa dipantau tanpa tindakan isolir." },
  { key: "total_limit", label: "Status Limit", note: "Pelanggan yang perlu follow-up karena pembatasan layanan." },
  { key: "total_tagihan_belum_bayar", label: "Tagihan Belum Bayar", note: "Piutang berjalan yang masih perlu ditagih." },
] as const;

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
          </>
        ) : (
          summaryCards.map((card) => (
            <article key={card.key} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
              <span className="text-sm font-semibold text-slate-500 mb-2">{card.label}</span>
              <strong className="text-3xl font-bold text-slate-900">{summary?.[card.key] ?? 0}</strong>
              <p className="text-xs text-slate-400 mt-4 leading-relaxed">{card.note}</p>
            </article>
          ))
        )}
      </section>

      <section className="grid quick-actions-grid">
        <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm action-card">
          <div>
            <p className="text-xs font-bold tracking-wider text-indigo-500 uppercase mb-2">Aksi Cepat</p>
            <h2 className="text-lg font-bold text-slate-900">Operasional Hari Ini</h2>
            <p className="muted">Lihat kesehatan sistem, generate tagihan, dan pantau tunggakan dari satu area.</p>
          </div>
          <div className="button-row">
            <button type="button" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={() => onSwitchView("bills")}>
              Buka Tagihan
            </button>
            <button type="button" className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50" onClick={() => onSwitchView("monitoring")}>
              Buka Monitoring
            </button>
          </div>
        </article>
        <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm action-card">
          <div>
            <p className="text-xs font-bold tracking-wider text-indigo-500 uppercase mb-2">Scheduler</p>
            <h2 className="text-lg font-bold text-slate-900">Run Berikutnya</h2>
            <p className="muted">
              {health?.scheduler.billing_next_run
                ? `Auto billing berikutnya dijadwalkan pada ${formatDateTime(health.scheduler.billing_next_run)}.`
                : "Jadwal billing otomatis belum tercatat."}
            </p>
          </div>
          <StatusPill
            label={health?.scheduler.billing_last_error ? "attention" : "scheduled"}
            tone={health?.scheduler.billing_last_error ? "gold" : "green"}
          />
        </article>
      </section>

      <section className="grid detail-grid">
        <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Service Snapshot</h2>
            <StatusPill label={health?.status ?? "checking"} tone={appTone} />
          </div>
          <dl className="meta-list">
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

        {user?.role === "admin" && (
          <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm col-span-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">Laporan Tagihan</h2>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div>
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
                  <p className="muted">Belum ada data pendapatan.</p>
                )}
              </div>
              <div>
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
                  <p className="muted text-center pt-8">
                    Tidak ada tunggakan berjalan.
                  </p>
                )}
              </div>
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
