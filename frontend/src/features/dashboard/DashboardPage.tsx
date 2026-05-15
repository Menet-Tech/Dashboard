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
    <>
      <section className="grid stats-grid">
        {pageLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          summaryCards.map((card) => (
            <article key={card.key} className="stat-card">
              <span>{card.label}</span>
              <strong>{summary?.[card.key] ?? 0}</strong>
              <p className="stat-note">{card.note}</p>
            </article>
          ))
        )}
      </section>

      <section className="grid quick-actions-grid">
        <article className="surface action-card">
          <div>
            <p className="eyebrow">Aksi Cepat</p>
            <h2>Operasional Hari Ini</h2>
            <p className="muted">Lihat kesehatan sistem, generate tagihan, dan pantau tunggakan dari satu area.</p>
          </div>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => onSwitchView("bills")}>
              Buka Tagihan
            </button>
            <button type="button" className="ghost-button" onClick={() => onSwitchView("monitoring")}>
              Buka Monitoring
            </button>
          </div>
        </article>
        <article className="surface action-card">
          <div>
            <p className="eyebrow">Scheduler</p>
            <h2>Run Berikutnya</h2>
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
        <article className="surface">
          <div className="section-heading">
            <h2>Service Snapshot</h2>
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
          <article className="surface" style={{ gridColumn: "1 / -1" }}>
            <div className="section-heading">
              <h2>Laporan Tagihan</h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
              <div>
                <h3>Pendapatan Bulanan</h3>
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
                <h3>Aging Piutang (Belum Bayar)</h3>
                {aging && (aging.current > 0 || aging.days_1_30 > 0 || aging.days_31_60 > 0 || aging.over_60 > 0) ? (
                  <div style={{ maxWidth: "300px", margin: "0 auto" }}>
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
                  <p className="muted" style={{ textAlign: "center", paddingTop: "2rem" }}>
                    Tidak ada tunggakan berjalan.
                  </p>
                )}
              </div>
            </div>
          </article>
        )}
      </section>
    </>
  );
}
