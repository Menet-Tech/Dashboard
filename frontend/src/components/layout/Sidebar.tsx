import type { User, ViewKey } from "../../types";
import {
  LayoutDashboard,
  ReceiptText,
  Users,
  Wifi,
  Activity,
  FileText,
  ShieldCheck,
  UserCog,
  Settings,
  LifeBuoy,
  UserPlus,
  MessageSquare,
  LogOut,
} from "lucide-react";

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

const iconMap: Record<ViewKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  bills: ReceiptText,
  customers: Users,
  packages: Wifi,
  monitoring: Activity,
  templates: FileText,
  audit: ShieldCheck,
  users: UserCog,
  settings: Settings,
  tickets: LifeBuoy,
  registration: UserPlus,
  whatsapp: MessageSquare,
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
    <aside
      className={`sticky top-0 w-72 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-900 flex flex-col shadow-xl shrink-0 h-screen transition-all duration-300 z-40 ${
        navOpen ? "translate-x-0 fixed inset-y-0 left-0 shadow-2xl" : "hidden lg:flex"
      }`}
      aria-label="Navigasi utama"
    >
      {/* Sidebar Header */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800/60">
        <p className="text-[10px] font-extrabold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase mb-1">go-dev rewrite</p>
        <h1 className="text-lg font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-200 dark:via-purple-200 dark:to-pink-200 leading-tight">
          Menet-Tech
          <span className="block text-indigo-600 dark:text-indigo-400 font-medium text-xs mt-0.5 font-sans">Control Panel</span>
        </h1>
      </div>

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
        {navItems.map((item) => {
          const isActive = item.key === view;
          const IconComponent = iconMap[item.key] || LayoutDashboard;
          return (
            <button
              key={item.key}
              className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center gap-3.5 group ${
                isActive
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                  : "hover:bg-slate-50 dark:hover:bg-slate-900/60 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-slate-100"
              }`}
              onClick={() => switchView(item.key)}
              type="button"
              aria-label={`Buka menu ${item.label}`}
            >
              <IconComponent
                className={`w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? "text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-slate-200"
                }`}
              />
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-sm leading-none">{item.label}</span>
                <span
                  className={`text-[10px] mt-1.5 truncate transition-colors ${
                    isActive ? "text-indigo-100" : "text-slate-400 dark:text-slate-500 group-hover:text-indigo-500 dark:group-hover:text-slate-450"
                  }`}
                >
                  {item.caption}
                </span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Profile & Logout Section */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800/60">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold uppercase shrink-0">
            {user.username.charAt(0)}
          </div>
          <div className="min-w-0">
            <strong className="block text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{user.username}</strong>
            <span className="block text-[9px] uppercase font-extrabold tracking-wider text-indigo-600 dark:text-indigo-400/80 truncate">
              {user.role}
            </span>
          </div>
        </div>
        <button
          className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 dark:hover:border-slate-700 font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-all duration-200 flex items-center justify-center gap-2 text-xs"
          onClick={onLogout}
          disabled={submitting}
        >
          <LogOut size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          {isBusy("logout") ? "Keluar..." : "Logout"}
        </button>
      </div>
    </aside>
  );
}
