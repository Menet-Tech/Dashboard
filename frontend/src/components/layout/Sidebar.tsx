import type { User, ViewKey } from "../../types";

export type NavItem = {
  key: ViewKey;
  label: string;
  caption: string;
};

type SidebarProps = {
  navOpen: boolean;
  navItems: NavItem[];
  view: ViewKey;
  switchView: (view: ViewKey) => void;
  user: User;
  onLogout: () => void;
  submitting: boolean;
  isBusy: (action: string) => boolean;
};

export function Sidebar({
  navOpen,
  navItems,
  view,
  switchView,
  user,
  onLogout,
  submitting,
  isBusy,
}: SidebarProps) {
  return (
    <aside className={`app-sidebar ${navOpen ? "is-open" : ""}`} aria-label="Navigasi utama">
      <div className="sidebar-brand">
        <p className="eyebrow">go-dev rewrite</p>
        <h1>Menet-Tech Dashboard</h1>
        <p className="hero-copy">Backend Go, worker billing, dan panel operasional baru untuk tim ISP.</p>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            className={item.key === view ? "tab-button active" : "tab-button"}
            onClick={() => switchView(item.key)}
            type="button"
            aria-label={`Buka menu ${item.label}`}
          >
            <span className="nav-label">{item.label}</span>
            <span className="nav-caption">{item.caption}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="user-chip">
          <strong>{user.username}</strong>
          <span>{user.role}</span>
        </div>
        <button className="secondary-button" onClick={onLogout} disabled={submitting}>
          {isBusy("logout") ? "Keluar..." : "Logout"}
        </button>
      </div>
    </aside>
  );
}
