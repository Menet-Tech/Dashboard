import type { User } from "../../types";
import type { HealthPayload } from "../../lib/api";

type TopbarProps = {
  navOpen: boolean;
  onToggleNav: () => void;
  health: HealthPayload | null;
  user: User;
};

export function Topbar({ navOpen, onToggleNav, health, user }: TopbarProps) {


  return (
    <header className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="lg:hidden text-slate-500 hover:text-slate-700 p-2 -ml-2 rounded-lg"
          onClick={onToggleNav}
          aria-label={navOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
          aria-expanded={navOpen}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 hidden lg:block">Menet-Tech Dashboard</h1>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold uppercase shrink-0">
            {user.username.charAt(0)}
          </div>
          <span className="text-sm font-semibold text-slate-700">{user.username}</span>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full hidden sm:inline-block">{user.role}</span>
        </div>
      </div>
    </header>
  );
}
