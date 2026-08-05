import { Sun, Moon } from "lucide-react";
import type { User } from "../../types";
import type { HealthPayload } from "../../lib/api";
import { Button } from "../ui/Button";
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
    <header className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200 dark:border-slate-800 dark:border-slate-800/60">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden -ml-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          onClick={onToggleNav}
          aria-label={navOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
          aria-expanded={navOpen}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </Button>
        <div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 hidden lg:block" role="heading" aria-level={1}>Menet-Tech Dashboard</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleTheme}
          aria-label={theme === "light" ? "Aktifkan Mode Gelap" : "Aktifkan Mode Terang"}
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </Button>
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
