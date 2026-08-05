import { Button } from "../ui/Button";
import { useState } from "react";
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
  BarChart3,
  BadgePercent,
  Network,
  Cpu,
  ClipboardCheck,
  Map,
  ChevronDown,
  TrendingUp,
  FolderOpen,
  Box,
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
  discounts: BadgePercent,
  monitoring: Activity,
  traffic: TrendingUp,
  templates: FileText,
  "email-templates": FileText,
  audit: ShieldCheck,
  users: UserCog,
  settings: Settings,
  tickets: LifeBuoy,
  registration: UserPlus,
  whatsapp: MessageSquare,
  reports: BarChart3,
  odp: Network,
  devices: Cpu,
  "network-map": Map,
  "payment-confirmations": ClipboardCheck,
  inventory: Box,
};

const groups = [
  {
    id: "utama",
    title: "Utama & Billing",
    icon: FolderOpen,
    gradient: "from-blue-600/10 via-indigo-600/5 to-transparent dark:from-blue-500/20 dark:via-indigo-500/10",
    keys: ["dashboard", "bills", "payment-confirmations", "customers", "packages", "discounts", "registration"] as ViewKey[],
  },
  {
    id: "infrastruktur",
    title: "Infrastruktur",
    icon: Network,
    gradient: "from-purple-600/10 via-pink-600/5 to-transparent dark:from-purple-500/20 dark:via-pink-500/10",
    keys: ["inventory", "odp", "network-map", "devices", "traffic", "tickets"] as ViewKey[],
  },
  {
    id: "komunikasi",
    title: "Komunikasi",
    icon: MessageSquare,
    gradient: "from-emerald-600/10 via-teal-600/5 to-transparent dark:from-emerald-500/20 dark:via-teal-500/10",
    keys: ["whatsapp", "templates", "email-templates"] as ViewKey[],
  },
  {
    id: "laporan",
    title: "Analisis & Tim",
    icon: BarChart3,
    gradient: "from-amber-600/10 via-orange-600/5 to-transparent dark:from-amber-500/20 dark:via-orange-500/10",
    keys: ["reports", "audit", "users"] as ViewKey[],
  },
  {
    id: "sistem",
    title: "Pengaturan",
    icon: Settings,
    gradient: "from-slate-600/10 via-zinc-600/5 to-transparent dark:from-slate-500/20 dark:via-zinc-500/10",
    keys: ["monitoring", "settings"] as ViewKey[],
  },
];

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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem("sidebar_collapsed_groups");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      localStorage.setItem("sidebar_collapsed_groups", JSON.stringify(next));
      return next;
    });
  };

  return (
    <aside
      className={`sticky top-0 w-72 bg-white dark:bg-slate-900 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 dark:border-slate-900 flex flex-col shadow-xl shrink-0 h-screen transition-all duration-300 z-40 ${navOpen ? "translate-x-0 fixed inset-y-0 left-0 shadow-2xl" : "hidden lg:flex"
        }`}
      aria-label="Navigasi utama"
    >
      {/* Sidebar Header — branding, not a page heading */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 dark:border-slate-800/60 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-extrabold tracking-widest text-indigo-600 dark:text-indigo-400 uppercase mb-0.5">v2.1.0-stable</p>
          <p className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-200 dark:via-purple-200 dark:to-pink-200 leading-tight">
            Menet-Tech
            <span className="block text-indigo-600 dark:text-indigo-400 font-semibold text-[10px] mt-0.5 font-sans">Control Panel</span>
          </p>
        </div>
      </div>

      {/* Nav List - Group Cards Layout */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
        {groups.map((group) => {
          const groupItems = navItems.filter((item) => group.keys.includes(item.key));
          if (groupItems.length === 0) return null;

          const isCollapsed = !!collapsedGroups[group.id];
          const GroupIcon = group.icon;
          const isGroupActive = groupItems.some(item => item.key === view);

          return (
            <div
              key={group.id}
              className={`border rounded-2xl overflow-hidden transition-all duration-300 ${isGroupActive
                  ? "border-indigo-500/35 bg-indigo-50/5 dark:bg-indigo-950/5 shadow-sm shadow-indigo-500/5"
                  : "border-slate-100 dark:border-slate-800 dark:border-slate-900 bg-white dark:bg-slate-900 dark:bg-slate-950/20"
                }`}
            >
              {/* Group Card Header */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!isCollapsed}
                aria-controls={`nav-group-${group.id}`}
                className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all duration-200 bg-gradient-to-br ${group.gradient}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-1.5 rounded-lg border transition-colors ${isGroupActive
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-slate-50 dark:bg-slate-950 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                      }`}
                  >
                    <GroupIcon size={14} aria-hidden="true" />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-100 dark:text-slate-200 font-sans tracking-wide">
                      {group.title}
                    </span>
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                      {groupItems.length} Fitur
                    </span>
                  </div>
                </div>
                <ChevronDown
                  size={14}
                  className={`text-slate-400 dark:text-slate-500 transition-transform duration-300 ${isCollapsed ? "-rotate-90" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {/* Group Card Features */}
              <div
                id={`nav-group-${group.id}`}
                className={`transition-all duration-300 ${isCollapsed ? "max-h-0 opacity-0 pointer-events-none" : "max-h-[800px] opacity-100 p-2 space-y-1 bg-slate-50/30 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800 dark:border-slate-900/60"
                  }`}
              >
                {groupItems.map((item) => {
                  const isActive = item.key === view;
                  const IconComponent = iconMap[item.key] || LayoutDashboard;
                  return (
                    <button
                      key={item.key}
                      className={`w-full text-left px-3 py-2 rounded-xl transition-all duration-200 flex items-center gap-3 group/item cursor-pointer ${isActive
                          ? "bg-indigo-600 text-white shadow shadow-indigo-600/25"
                          : "hover:bg-slate-100/70 dark:hover:bg-slate-900/65 text-slate-650 dark:text-slate-350 hover:text-indigo-600 dark:hover:text-slate-100"
                        }`}
                      onClick={() => switchView(item.key)}
                      type="button"
                      aria-label={`Buka menu ${item.label}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <IconComponent
                        className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 group-hover/item:scale-110 ${isActive ? "text-white" : "text-slate-400 dark:text-slate-500 group-hover/item:text-indigo-600 dark:group-hover/item:text-slate-200"
                          }`}
                        aria-hidden="true"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-xs font-sans tracking-wide leading-none">{item.label}</span>
                        <span
                          className={`text-xs mt-0.5 truncate transition-colors leading-normal ${isActive ? "text-indigo-100" : "text-slate-450 dark:text-slate-500 group-hover/item:text-indigo-500/80 dark:group-hover/item:text-slate-400"
                            }`}
                        >
                          {item.caption}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Profile & Logout Section */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/20">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold uppercase shrink-0 text-sm">
            {user.username.charAt(0)}
          </div>
          <div className="min-w-0">
            <strong className="block text-xs font-bold text-slate-800 dark:text-slate-100 dark:text-slate-250 truncate">{user.username}</strong>
            <span className="block text-[8px] uppercase font-black tracking-wider text-indigo-600 dark:text-indigo-450 truncate">
              {user.role}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onLogout}
          disabled={submitting}
          isLoading={isBusy("logout")}
          loadingText="Keluar..."
          icon={<LogOut size={13} />}
        >
          Logout
        </Button>
      </div>
    </aside>
  );
}
