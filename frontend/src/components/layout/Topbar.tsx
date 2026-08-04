import { Sun, Moon } from "lucide-react";
import type { User } from "../../types";
import type { HealthPayload } from "../../lib/api";

type TopbarProps = {
  navOpen: boolean;
  onToggleNav: () => void;
  health: HealthPayload | null;
  user: User;
  theme: "light" | "dark";
  onToggleTheme: () => void;
};

export function Topbar({ navOpen, onToggleNav, health, user, theme, onToggleTheme }: TopbarProps) {
  return (
    <header className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200 dark:border-slate-800/60">
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="lg:hidden text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 p-2 -ml-2 rounded-lg"
          onClick={onToggleNav}
          aria-label={navOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
          aria-expanded={navOpen}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 hidden lg:block" role="heading" aria-level={1}>Menet-Tech Dashboard</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleTheme}
          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/80 shadow-sm transition-all duration-200 flex items-center justify-center"
          aria-label={theme === "light" ? "Aktifkan Mode Gelap" : "Aktifkan Mode Terang"}
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
          <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-bold uppercase shrink-0">
            {user.username.charAt(0)}
          </div>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{user.username}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded-full hidden sm:inline-block">{user.role}</span>
        </div>
      </div>
    </header>
  );
}
