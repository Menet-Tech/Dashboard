import type { User } from "../../types";
import { StatusPill } from "../StatusPill";
import { statusTone } from "../../utils/status";
import type { HealthPayload } from "../../lib/api";

type TopbarProps = {
  navOpen: boolean;
  onToggleNav: () => void;
  health: HealthPayload | null;
  user: User;
};

export function Topbar({ navOpen, onToggleNav, health, user }: TopbarProps) {
  const appTone = statusTone(health?.status);
  const workerTone = statusTone(health?.services.worker);
  const backupTone = statusTone(health?.services.backup);

  return (
    <section className="topbar">
      <div>
        <button
          type="button"
          className="ghost-button mobile-nav-toggle"
          onClick={onToggleNav}
          aria-label={navOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
          aria-expanded={navOpen}
        >
          {navOpen ? "Tutup Menu" : "Buka Menu"}
        </button>
        <p className="eyebrow">go-dev rewrite</p>
        <h1>Menet-Tech Dashboard</h1>
        <p className="hero-copy">
          Rewrite sekarang sudah masuk ke alur billing yang lebih lengkap: status tagihan,
          invoice, bukti bayar, template WA, dan fondasi worker automasi.
        </p>
        <div className="topbar-status-strip">
          <StatusPill label={health?.status ?? "checking"} tone={appTone} />
          <StatusPill label={`worker ${health?.services.worker ?? "unknown"}`} tone={workerTone} />
          <StatusPill label={`backup ${health?.services.backup ?? "unknown"}`} tone={backupTone} />
        </div>
      </div>
      <div className="topbar-actions">
        <div className="user-chip compact-user-chip">
          <strong>{user.username}</strong>
          <span>{user.role}</span>
        </div>
      </div>
    </section>
  );
}
