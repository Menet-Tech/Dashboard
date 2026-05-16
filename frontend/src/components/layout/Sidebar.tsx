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
    <aside className={`sticky top-6 w-72 bg-white border-r border-slate-200 flex flex-col shadow-sm shrink-0 h-[calc(100vh-3rem)] transition-transform z-40 ${navOpen ? "translate-x-0 fixed inset-y-4 left-4 shadow-xl" : "hidden lg:flex"}`} aria-label="Navigasi utama">
      <div className="p-6 border-b border-slate-100">
        <p className="text-xs font-bold tracking-wider text-indigo-500 uppercase mb-2">go-dev rewrite</p>
        <h1 className="text-xl font-bold text-slate-900 leading-tight">Menet-Tech<br/>Dashboard</h1>
      </div>
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = item.key === view;
          return (
            <button
              key={item.key}
              className={`w-full text-left px-4 py-3 rounded-xl transition-all flex flex-col ${isActive ? "bg-indigo-50 text-indigo-700 shadow-sm" : "hover:bg-slate-50 text-slate-600"}`}
              onClick={() => switchView(item.key)}
              type="button"
              aria-label={`Buka menu ${item.label}`}
            >
              <span className="font-semibold text-sm">{item.label}</span>
              <span className={`text-xs mt-0.5 ${isActive ? "text-indigo-500" : "text-slate-400"}`}>{item.caption}</span>
            </button>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-indigo-600 font-bold uppercase shrink-0">
            {user.username.charAt(0)}
          </div>
          <div className="min-w-0">
            <strong className="block text-sm font-semibold text-slate-900 truncate">{user.username}</strong>
            <span className="block text-xs text-slate-500 truncate">{user.role}</span>
          </div>
        </div>
        <button className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={onLogout} disabled={submitting}>
          {isBusy("logout") ? "Keluar..." : "Logout"}
        </button>
      </div>
    </aside>
  );
}
