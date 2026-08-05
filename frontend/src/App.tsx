import { Button } from "./components/ui";
import { FormEvent, lazy, Suspense, startTransition, useEffect, useMemo, useState } from "react";
import { StatusPill } from "./components/ui";
import {
  ApiError,
  fetchCurrentUser,
  fetchHealth,
  fetchSummary,
  fetchRevenue,
  fetchAging,
  fetchAuditLogs,
  login,
  logout,
  registerOnUnauthorized,
  createCustomer,
  type SummaryPayload,
} from "./lib/api";
import type {
  AuditLogItem,
  User,
  RevenueItem,
  AgingReport,
  ViewKey,
  CustomerItem,
} from "./types";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

import { toErrorMessage } from "./utils/format";
import { statusTone } from "./utils/status";
import { validateLogin, type FieldErrors } from "./utils/validation";
import { buildCustomerLifecycleMap } from "./lib/lifecycle";
import { Modal } from "./components/ui/Modal";
import { SkeletonCard } from "./components/ui/SkeletonCard";
import { ToastStack, type ToastItem } from "./components/ui/Toast";
import { inputClassName, renderInlineError, ErrorState } from "./components/ui";

import { DashboardPage } from "./features/dashboard/DashboardPage";
import { PackagesPage } from "./features/packages/PackagesPage";
import { CustomersPage, defaultCustomerForm } from "./features/customers/CustomersPage";
import { DiscountsPage } from "./features/discounts/DiscountsPage";
import { BillsPage } from "./features/bills/BillsPage";
import { TemplatesPage, defaultTemplateForm } from "./features/templates/TemplatesPage";
import { EmailTemplatesPage } from "./features/templates/EmailTemplatesPage";
import { MonitoringPage } from "./features/monitoring/MonitoringPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { AuditLogsPage } from "./features/audit/AuditLogsPage";
import { UsersPage } from "./features/users/UsersPage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { LoginPage } from "./features/auth/LoginPage";
import { OdpPage } from "./features/odp/OdpPage";
import { CustomerDetailModal } from "./features/customers/components/CustomerDetailModal";
import { DevicesPage } from "./features/devices/DevicesPage";
import { NetworkMapPage } from "./features/network-map/NetworkMapPage";
import { Sidebar } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { FeedbackProvider, useAppFeedback } from "./context/FeedbackContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";


import type { ConfirmDialogState } from "./hooks/types";
import { useCustomers } from "./hooks/useCustomers";
import { useBills } from "./hooks/useBills";
import { usePackages } from "./hooks/usePackages";
import { useTemplates } from "./hooks/useTemplates";
import { useUsers } from "./hooks/useUsers";
import { useSettings } from "./hooks/useSettings";
import { useMonitoring } from "./hooks/useMonitoring";
import { defaultPackageForm } from "./features/packages/PackagesPage";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const TicketsPage = lazy(() =>
  import("./features/tickets/TicketsPage").then((module) => ({ default: module.TicketsPage }))
);
const RegistrationPage = lazy(() =>
  import("./features/registration/RegistrationPage").then((module) => ({ default: module.RegistrationPage }))
);
const WhatsAppPage = lazy(() =>
  import("./features/whatsapp/WhatsAppPage").then((module) => ({ default: module.WhatsAppPage }))
);
const PaymentConfirmationsPage = lazy(() =>
  import("./features/bills/PaymentConfirmationsPage").then((module) => ({ default: module.PaymentConfirmationsPage }))
);

const TrafficPage = lazy(() =>
  import("./features/traffic/TrafficPage").then((module) => ({ default: module.TrafficPage }))
);

const InventoryPage = lazy(() =>
  import("./features/inventory/InventoryPage").then((module) => ({ default: module.default }))
);

type NavItem = {
  key: ViewKey;
  label: string;
  caption: string;
};

const navItems: NavItem[] = [
  // === Utama ===
  { key: "dashboard", label: "Dashboard", caption: "Overview & metrik" },
  { key: "bills", label: "Tagihan", caption: "Generate & bukti bayar" },
  { key: "payment-confirmations", label: "Konfirmasi Bayar", caption: "Review bukti transfer WA" },
  { key: "customers", label: "Pelanggan", caption: "Data & status isolir" },
  { key: "packages", label: "Paket Internet", caption: "Kecepatan & harga" },
  { key: "discounts", label: "Diskon & Referral", caption: "MGM & voucher khusus" },
  // === Operasional ===
  { key: "inventory", label: "Inventaris Gudang", caption: "Kelola stok barang" },
  { key: "odp", label: "Data ODP", caption: "Status & maintenance node" },
  { key: "network-map", label: "Peta Jaringan", caption: "Topologi fiber & ODP" },
  { key: "devices", label: "Perangkat ONT", caption: "Kelola CPE via GenieACS" },
  { key: "traffic", label: "Traffic Monitor", caption: "Tx/Rx real-time pelanggan" },
  { key: "tickets", label: "Tiket Support", caption: "Bantuan & keluhan" },
  { key: "registration", label: "Registrasi List", caption: "Review & tambah pendaftaran" },
  // === Komunikasi ===
  { key: "whatsapp", label: "WhatsApp Gateway", caption: "Multi-akun & status" },
  { key: "templates", label: "Template & Chatbot WA", caption: "Pesan & otomatisasi" },
  { key: "email-templates", label: "Template Email", caption: "Draft email notif" },
  // === Admin ===
  { key: "reports", label: "Laporan Keuangan", caption: "Analisis & proyeksi omset" },
  { key: "audit", label: "Audit Log", caption: "Jejak aktivitas tim" },
  { key: "users", label: "Manajemen Tim", caption: "Akses login admin" },
  // === Pengaturan (paling bawah) ===
  { key: "monitoring", label: "System", caption: "Status node & backup" },
  { key: "settings", label: "Pengaturan", caption: "Konfigurasi sistem" },
];

function AppRouter() {
  const { user } = useAuth();
  const [view, setView] = useState<ViewKey>(() => {
    const stored = localStorage.getItem("active_view");
    if (stored) return stored as ViewKey;
    return "dashboard";
  });
  const [activeDetailCustomer, setActiveDetailCustomer] = useState<CustomerItem | null>(null);
  const [booting, setBooting] = useState(true);

  const { theme, toggleTheme } = useTheme();

  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [revenue, setRevenue] = useState<RevenueItem[]>([]);
  const [aging, setAging] = useState<AgingReport | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  const feedback = useAppFeedback();

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginErrors, setLoginErrors] = useState<FieldErrors>({});
  const [loginApiError, setLoginApiError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const [navOpen, setNavOpen] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);

  const monitoringHook = useMonitoring({ withFeedback: feedback.withFeedback, askForConfirmation: feedback.askForConfirmation, onSuccess: feedback.pushSuccess, userRole: user?.role, setAuditLogs });
  const customersHook = useCustomers({ withFeedback: feedback.withFeedback, askForConfirmation: feedback.askForConfirmation, onSuccess: feedback.pushSuccess });
  const billsHook = useBills({ withFeedback: feedback.withFeedback, askForConfirmation: feedback.askForConfirmation, onSuccess: feedback.pushSuccess, onError: feedback.pushError });
  const packagesHook = usePackages({ withFeedback: feedback.withFeedback, askForConfirmation: feedback.askForConfirmation, onSuccess: feedback.pushSuccess });
  const templatesHook = useTemplates({ withFeedback: feedback.withFeedback, askForConfirmation: feedback.askForConfirmation, onSuccess: feedback.pushSuccess });
  const usersHook = useUsers({ withFeedback: feedback.withFeedback, onSuccess: feedback.pushSuccess });
  const settingsHook = useSettings({ withFeedback: feedback.withFeedback, onSuccess: feedback.pushSuccess, refreshHealth: monitoringHook.handlers.refreshHealth });

  const { authLoading, handleLogin, handleLogout } = useAuth();

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const healthPayload = await fetchHealth();
        if (!cancelled) monitoringHook.handlers.setHealth(healthPayload);
      } catch (caughtError) {
        if (!cancelled) feedback.pushError(toErrorMessage(caughtError));
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void boot();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadProtectedData() {
    setPageLoading(true);
    try {
      const [summaryPayload, revenuePayload, agingPayload, auditPayload] = await Promise.all([
        fetchSummary(),
        user?.role === "admin" ? fetchRevenue().catch(() => ({ data: [] as RevenueItem[] })) : Promise.resolve({ data: [] as RevenueItem[] }),
        user?.role === "admin" ? fetchAging().catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        user?.role === "admin" ? fetchAuditLogs(50) : Promise.resolve({ data: [] as AuditLogItem[] })
      ]);
      setSummary(summaryPayload);
      if (user?.role === "admin") {
        setRevenue(revenuePayload.data || []);
        setAging(agingPayload.data);
      }
      setAuditLogs(auditPayload.data);

      await Promise.all([
        customersHook.handlers.refreshCustomers(),
        billsHook.handlers.refreshBills(),
        packagesHook.handlers.refreshPackages(),
        templatesHook.handlers.refreshTemplates(),
        user?.role === "admin" ? usersHook.handlers.refreshUsers() : Promise.resolve(),
        user?.role === "admin" ? settingsHook.handlers.refreshSettings() : Promise.resolve(),
        monitoringHook.handlers.refreshMonitoringData()
      ]);
      setLoadFailure(null);
    } catch (caughtError) {
      setLoadFailure(toErrorMessage(caughtError));
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void reloadProtectedData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const visibleNavItems = useMemo(
    () =>
      navItems.filter((item) => {
        if (["reports", "audit", "users", "settings", "packages", "templates", "email-templates"].includes(item.key)) {
          return user?.role === "admin";
        }
        if (["devices", "traffic", "payment-confirmations"].includes(item.key)) {
          return user?.role === "admin" || user?.role === "petugas";
        }
        return true;
      }),
    [user?.role],
  );

  const customerLifecycleMap = useMemo(
    () => buildCustomerLifecycleMap(customersHook.state.customers, billsHook.state.bills, settingsHook.state.settingsForm),
    [billsHook.state.bills, customersHook.state.customers, settingsHook.state.settingsForm],
  );

  const filteredCustomers = useMemo(
    () =>
      customersHook.state.customers.filter((customer) => {
        const filter = customersHook.state.customerLifecycleFilter;
        if (filter === "exclude_inactive") {
          return customer.status !== "inactive" && customer.status !== "wifi_umum";
        }
        if (filter === "all") return true;
        const lifecycle = customerLifecycleMap[customer.id]?.key ?? "lunas";
        return lifecycle === filter;
      }),
    [customersHook.state.customerLifecycleFilter, customerLifecycleMap, customersHook.state.customers],
  );

  const databaseTone = statusTone(monitoringHook.state.health?.services.database);
  const workerTone = statusTone(monitoringHook.state.health?.services.worker);
  const backupTone = statusTone(monitoringHook.state.health?.services.backup);
  const schedulerTone = statusTone(
    monitoringHook.state.health?.scheduler.billing_last_error
      ? "error"
      : monitoringHook.state.health?.scheduler.billing_auto_enabled
        ? "ok"
        : "unknown",
  );
  const appTone = statusTone(monitoringHook.state.health?.status);

  const rawWaGatewayUrl = settingsHook.state.settingsForm.wa_gateway_url;
  const waGatewayUrl = useMemo(() => {
    const trimmed = rawWaGatewayUrl?.trim() || "http://localhost:3001";
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        if (trimmed.includes("localhost") || trimmed.includes("127.0.0.1")) {
          return `${window.location.protocol}//${window.location.host}/wa`;
        }
      }
    }
    return trimmed;
  }, [rawWaGatewayUrl]);

  function switchView(nextView: ViewKey) {
    localStorage.setItem("active_view", nextView);
    startTransition(() => setView(nextView));
    setNavOpen(false);
    if (nextView === "monitoring") {
      void monitoringHook.handlers.refreshMonitoringData();
    }
    if (nextView === "audit") {
      void feedback.withFeedback(async () => {
        const payload = await fetchAuditLogs(100);
        setAuditLogs(payload.data);
      });
    }
  }

  const handleShowCustomerDetails = (customerId: number) => {
    const customer = customersHook.state.customers.find((c) => c.id === customerId);
    if (customer) {
      setActiveDetailCustomer(customer);
    }
  };

  async function doLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateLogin(loginForm);
    setLoginErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setLoginApiError(null);
    setLoginSubmitting(true);
    try {
      const response = await login(loginForm.username, loginForm.password);
      setLoginErrors({});
      handleLogin(response.user);
      feedback.pushSuccess("Login berhasil. Fondasi admin panel Go sekarang sudah aktif.");
    } catch (caughtError) {
      setLoginApiError(toErrorMessage(caughtError));
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function doLogout() {
    await handleLogout();
    setSummary(null);
    packagesHook.handlers.setPackages([]);
    customersHook.handlers.setCustomers([]);
    billsHook.handlers.setBills([]);
    templatesHook.handlers.setTemplates([]);
    setAuditLogs([]);
    setRevenue([]);
    usersHook.handlers.setManagedUsers([]);
    startTransition(() => setView("dashboard"));
    localStorage.setItem("active_view", "dashboard");
  }

  if (booting || authLoading) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center" aria-label="Memuat aplikasi">
        <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <svg className="w-6 h-6 text-white animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Memuat Menet-Tech Dashboard...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <LoginPage
        loginForm={loginForm}
        loginErrors={loginErrors}
        loginApiError={loginApiError}
        submitting={loginSubmitting}
        onLogin={doLogin}
        isBusy={(key) => key === "login" && loginSubmitting}
        onFormChange={(field, value) => {
          setLoginForm((current) => ({ ...current, [field]: value }));
          setLoginApiError(null);
        }}
      />
    );
  }

  return (
    <main className="flex min-h-screen bg-slate-50 text-slate-900 dark:text-slate-50 dark:bg-slate-950 dark:text-slate-100 max-w-[1600px] mx-auto transition-colors duration-300">
      {/* Skip navigation link — WCAG 2.4.1 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[200] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Langsung ke konten utama
      </a>
      <Sidebar
        navOpen={navOpen}
        navItems={visibleNavItems}
        view={view}
        switchView={switchView}
        user={user}
        onLogout={() => void doLogout()}
        submitting={feedback.submitting}
        isBusy={feedback.isBusy}
      />

      {navOpen ? (
        <button type="button" className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 lg:hidden" onClick={() => setNavOpen(false)} aria-label="Tutup navigasi" />
      ) : null}

      <div id="main-content" className="flex-1 flex flex-col min-w-0 px-4 py-6 md:px-8 lg:px-12 max-w-full overflow-x-hidden">
        <Topbar
          navOpen={navOpen}
          onToggleNav={() => setNavOpen((current) => !current)}
          health={monitoringHook.state.health}
          user={user}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {loadFailure ? (
          <div className="mb-6">
            <ErrorState
              title="Data panel belum berhasil dimuat penuh"
              message={loadFailure}
              onRetry={() => void feedback.withFeedback(reloadProtectedData, "retry-load")}
            />
          </div>
        ) : null}

        <div key={view} className="fade-in-slide-up flex-1 flex flex-col gap-6">
          {view === "dashboard" ? (
            <DashboardPage
              pageLoading={pageLoading}
              summary={summary}
              health={monitoringHook.state.health}
              user={user}
              revenue={revenue}
              aging={aging}
              appTone={appTone}
              workerTone={workerTone}
              backupTone={backupTone}
              onSwitchView={switchView}
            />
          ) : null}

          {view === "packages" ? (
            <PackagesPage
              packages={packagesHook.state.packages}
              packageForm={packagesHook.state.packageForm}
              packageErrors={packagesHook.state.packageErrors}
              editingPackageId={packagesHook.state.editingPackageId}
              submitting={feedback.submitting}
              busyAction={feedback.busyAction}
              onFormChange={packagesHook.handlers.setPackageForm}
              onSubmit={packagesHook.handlers.handlePackageSubmit}
              onEdit={(pkg) => {
                packagesHook.handlers.setEditingPackageId(pkg.id);
                packagesHook.handlers.setPackageForm({
                  name: pkg.name,
                  rate_limit: pkg.rate_limit || "",
                  speed_mbps: pkg.speed_mbps,
                  price: pkg.price,
                  description: pkg.description,
                  ip_pool: pkg.ip_pool || "",
                  ip_pool_range: "",
                });
              }}
              onCancelEdit={() => {
                packagesHook.handlers.setEditingPackageId(null);
                packagesHook.handlers.setPackageForm(defaultPackageForm());
              }}
              onDelete={(id, deletePool) => void packagesHook.handlers.handlePackageDelete(id, deletePool)}
            />
          ) : null}

          {view === "customers" ? (
            <CustomersPage
              user={user}
              packages={packagesHook.state.packages}
              customers={customersHook.state.customers}
              filteredCustomers={filteredCustomers}
              customerForm={customersHook.state.customerForm}
              customerErrors={customersHook.state.customerErrors}
              editingCustomerId={customersHook.state.editingCustomerId}
              customerLifecycleFilter={customersHook.state.customerLifecycleFilter}
              customerLifecycleMap={customerLifecycleMap}
              submitting={feedback.submitting}
              busyAction={feedback.busyAction}
              isFormOpen={customersHook.state.isFormOpen}
              onSetFormOpen={customersHook.handlers.setIsFormOpen}
              onFormChange={customersHook.handlers.setCustomerForm}
              onFilterChange={(filter) => customersHook.handlers.setCustomerLifecycleFilter(filter)}
              onSubmit={customersHook.handlers.handleCustomerSubmit}
              onStatusChange={(id, status) => void customersHook.handlers.handleStatusChange(id, status)}
              onEdit={(customer) => {
                customersHook.handlers.setEditingCustomerId(customer.id);
                customersHook.handlers.setCustomerForm({
                  name: customer.name,
                  package_id: customer.package_id,
                  user_pppoe: customer.user_pppoe,
                  password_pppoe: customer.password_pppoe,
                  whatsapp: customer.whatsapp,
                  email: customer.email || "",
                  sn_ont: customer.sn_ont,
                  due_day: customer.due_day,
                  status: customer.status,
                  address: customer.address,
                  diskon: customer.diskon ?? 0,
                  tipe_diskon: customer.tipe_diskon || "flat",
                  referred_by_id: customer.referred_by_id ?? 0,
                  referral_balance: customer.referral_balance ?? 0,
                  odp_id: customer.odp_id ?? 0,
                  odp_port: customer.odp_port ?? undefined,
                  is_trial: customer.is_trial ?? false,
                  trial_days: customer.trial_days ?? 3,
                });
              }}
              onCancelEdit={() => {
                customersHook.handlers.setEditingCustomerId(null);
                customersHook.handlers.setCustomerForm(defaultCustomerForm());
              }}
              pushSuccess={feedback.pushSuccess}
              pushError={feedback.pushError}
              onRefresh={reloadProtectedData}
              onDelete={(id) => void customersHook.handlers.handleCustomerDelete(id)}
              onDeleteBulk={(ids) => void customersHook.handlers.handleBulkDelete(ids)}
              onEndTrial={(id) => void customersHook.handlers.handleEndTrial(id)}
            />
          ) : null}


          {view === "discounts" ? (
            <DiscountsPage
              user={user}
              customers={customersHook.state.customers}
              pushSuccess={feedback.pushSuccess}
              pushError={feedback.pushError}
              onRefresh={reloadProtectedData}
            />
          ) : null}

          {view === "odp" ? (
            <OdpPage
              user={user}
              pushSuccess={feedback.pushSuccess}
              pushError={feedback.pushError}
              onEndTrial={(id) => void customersHook.handlers.handleEndTrial(id)}
            />
          ) : null}


          {view === "devices" ? (
            <DevicesPage
              pushSuccess={feedback.pushSuccess}
              pushError={feedback.pushError}
            />
          ) : null}

          {view === "network-map" ? (
            <NetworkMapPage
              pushSuccess={feedback.pushSuccess}
              pushError={feedback.pushError}
            />
          ) : null}

          {view === "inventory" ? (
            <InventoryPage />
          ) : null}

          {view === "traffic" ? (
            <TrafficPage
              customers={customersHook.state.customers}
              packages={packagesHook.state.packages}
            />
          ) : null}

          {view === "bills" ? (
            <BillsPage
              user={user}
              bills={billsHook.state.bills}
              billPeriod={billsHook.state.billPeriod}
              filterPeriod={billsHook.state.filterPeriod}
              billErrors={billsHook.state.billErrors}
              submitting={feedback.submitting}
              busyAction={feedback.busyAction}
              expandedBillId={billsHook.state.expandedBillId}
              notificationLogs={billsHook.state.notificationLogs}
              proofFiles={billsHook.state.proofFiles}
              search={billsHook.state.search}
              status={billsHook.state.status}
              page={billsHook.state.page}
              total={billsHook.state.total}
              limit={billsHook.state.limit}
              onBillPeriodChange={billsHook.handlers.setBillPeriod}
              onFilterPeriodChange={billsHook.handlers.handleFilterPeriodChange}
              onGenerateBills={billsHook.handlers.handleGenerateBills}
              onMarkBillPaid={(id) => void billsHook.handlers.handleMarkBillPaid(id)}
              onToggleNotifications={(id) => void billsHook.handlers.handleToggleNotifications(id)}
              onSearchChange={billsHook.handlers.handleSearchChange}
              onStatusChange={billsHook.handlers.handleStatusChange}
              onPageChange={billsHook.handlers.handlePageChange}
              onProofFileChange={(id, file) =>
                billsHook.handlers.setProofFiles((current) => ({
                  ...current,
                  [id]: file,
                }))
              }
              onUploadProof={(id) => void billsHook.handlers.handleUploadProof(id)}
              pushToast={feedback.pushToast}
              pushSuccess={feedback.pushSuccess}
              pushError={feedback.pushError}
              onShowCustomerDetails={handleShowCustomerDetails}
              onGrantExtension={(id) => void billsHook.handlers.handleGrantExtension(id)}
              onCancelPendingAction={(id) => void billsHook.handlers.handleCancelPendingAction(id)}
              askForConfirmation={feedback.askForConfirmation}
            />

          ) : null}

          {view === "payment-confirmations" ? (
            <Suspense fallback={<SkeletonCard />}>
              <PaymentConfirmationsPage
                pushSuccess={feedback.pushSuccess}
                pushError={feedback.pushError}
                withFeedback={feedback.withFeedback}
              />
            </Suspense>
          ) : null}

          {view === "templates" ? (
            <TemplatesPage
              templates={templatesHook.state.templates}
              templateForm={templatesHook.state.templateForm}
              templateErrors={templatesHook.state.templateErrors}
              editingTemplateId={templatesHook.state.editingTemplateId}
              submitting={feedback.submitting}
              busyAction={feedback.busyAction}
              onFormChange={templatesHook.handlers.setTemplateForm}
              onSubmit={templatesHook.handlers.handleTemplateSubmit}
              onEdit={(item) => {
                templatesHook.handlers.setEditingTemplateId(item.id);
                templatesHook.handlers.setTemplateForm({
                  name: item.name,
                  trigger_key: item.trigger_key,
                  content: item.content,
                  trigger_keywords: item.trigger_keywords || "",
                  is_active: item.is_active,
                });
              }}
              onCancelEdit={() => {
                templatesHook.handlers.setEditingTemplateId(null);
                templatesHook.handlers.setTemplateForm(defaultTemplateForm());
              }}
              onDelete={(id) => void templatesHook.handlers.handleTemplateDelete(id)}
              user={user}
              waGatewayUrl={waGatewayUrl}
              waApiKey={settingsHook.state.settingsForm.wa_api_key}
              pushSuccess={feedback.pushSuccess}
              pushError={feedback.pushError}
              withFeedback={feedback.withFeedback}
              askForConfirmation={feedback.askForConfirmation}
            />
          ) : null}

          {view === "email-templates" ? (
            <EmailTemplatesPage
              pushSuccess={feedback.pushSuccess}
              pushError={feedback.pushError}
              withFeedback={feedback.withFeedback}
            />
          ) : null}

          {view === "monitoring" ? (
            <MonitoringPage
              health={monitoringHook.state.health}
              backups={monitoringHook.state.backups}
              restoreSimulation={monitoringHook.state.restoreSimulation}
              submitting={feedback.submitting}
              busyAction={feedback.busyAction}
              appTone={appTone}
              databaseTone={databaseTone}
              workerTone={workerTone}
              backupTone={backupTone}
              schedulerTone={schedulerTone}
              onRefresh={() => void feedback.withFeedback(monitoringHook.handlers.refreshMonitoringData)}
              onCreateBackup={() => void monitoringHook.handlers.handleCreateBackup()}
              onVerifyBackup={(filename) => void monitoringHook.handlers.handleVerifyBackup(filename)}
              onSimulateRestore={(filename) => void monitoringHook.handlers.handleSimulateRestore(filename)}
              onApplyRestore={() => void monitoringHook.handlers.handleApplyRestore()}
              onCancelRestore={monitoringHook.handlers.cancelRestore}
              onCheckIntegrations={async () => {
                await feedback.withFeedback(async () => {
                  await monitoringHook.handlers.checkExternalIntegrations();
                }, "check-integrations");
              }}
              pushSuccess={feedback.pushSuccess}
              pushError={feedback.pushError}
            />
          ) : null}

          {view === "settings" ? (
            <SettingsPage
              settingsForm={settingsHook.state.settingsForm}
              settingsErrors={settingsHook.state.settingsErrors}
              submitting={feedback.submitting}
              busyAction={feedback.busyAction}
              onFormChange={settingsHook.handlers.setSettingsForm}
              onSubmit={settingsHook.handlers.handleSettingsSubmit}
              pushSuccess={feedback.pushSuccess}
              pushError={feedback.pushError}
            />
          ) : null}

          {view === "audit" ? (
            <AuditLogsPage
              auditLogs={auditLogs}
              submitting={feedback.submitting}
              onRefresh={() => {
                void feedback.withFeedback(async () => {
                  const payload = await fetchAuditLogs(100);
                  setAuditLogs(payload.data);
                });
              }}
            />
          ) : null}

          {view === "reports" ? (
            <ReportsPage
              customers={customersHook.state.customers}
              revenue={revenue}
              aging={aging}
              submitting={feedback.submitting}
            />
          ) : null}

          {view === "users" ? (
            <UsersPage
              managedUsers={usersHook.state.managedUsers}
              managedUserForm={usersHook.state.managedUserForm}
              managedUserErrors={usersHook.state.managedUserErrors}
              submitting={feedback.submitting}
              busyAction={feedback.busyAction}
              onFormChange={usersHook.handlers.setManagedUserForm}
              onSubmit={usersHook.handlers.handleManagedUserSubmit}
              onUpdateRole={(item, role) => void usersHook.handlers.handleManagedUserUpdate(item, { role })}
              onUpdateStatus={(item, isActive) => void usersHook.handlers.handleManagedUserUpdate(item, { is_active: isActive })}
              onResetPassword={(item) => void usersHook.handlers.handleResetUserPassword(item)}
            />
          ) : null}

          {view === "tickets" ? (
            <Suspense fallback={<SkeletonCard />}>
              <TicketsPage
                waGatewayUrl={waGatewayUrl}
                waApiKey={settingsHook.state.settingsForm.wa_api_key}
                pushSuccess={feedback.pushSuccess}
                pushError={feedback.pushError}
                user={user}
              />
            </Suspense>
          ) : null}
          {view === "registration" ? (
            <Suspense fallback={<SkeletonCard />}>
              <RegistrationPage
                waGatewayUrl={waGatewayUrl}
                waAccountId={settingsHook.state.settingsForm.wa_account_id}
                waApiKey={settingsHook.state.settingsForm.wa_api_key}
                packages={packagesHook.state.packages}
                customers={customersHook.state.customers}
                pushSuccess={feedback.pushSuccess}
                pushError={feedback.pushError}
                withFeedback={feedback.withFeedback}
                askForConfirmation={feedback.askForConfirmation}
                onConvert={async (leadData) => {
                  const notes = [];
                  if (leadData.ssid) notes.push(`WiFi: ${leadData.ssid}`);
                  if (leadData.password) notes.push(`Pass: ${leadData.password}`);
                  if (leadData.referral) notes.push(`Referral: ${leadData.referral}`);
                  const extra = notes.length > 0 ? ` [${notes.join(", ")}]` : "";

                  let referredById = 0;
                  if (leadData.referral) {
                    const refClean = leadData.referral.trim().toLowerCase();
                    const matchedCustomer = customersHook.state.customers.find(
                      (c) =>
                        (c.referral_code && c.referral_code.trim().toLowerCase() === refClean) ||
                        (c.name && c.name.trim().toLowerCase() === refClean)
                    );
                    if (matchedCustomer) {
                      referredById = matchedCustomer.id;
                    }
                  }

                  // Find matched package ID by name
                  let pkgId = 0;
                  if (leadData.paket) {
                    const matchedPkg = packagesHook.state.packages.find(
                      (p) => p.name.trim().toLowerCase() === leadData.paket?.trim().toLowerCase()
                    );
                    if (matchedPkg) {
                      pkgId = matchedPkg.id;
                    }
                  }

                  const customerInput = {
                    name: leadData.name || "",
                    package_id: pkgId,
                    user_pppoe: leadData.user_pppoe || "",
                    password_pppoe: leadData.password_pppoe || "",
                    whatsapp: leadData.whatsapp || "",
                    email: "",
                    sn_ont: leadData.sn_ont || "",
                    due_day: leadData.due_day !== undefined ? leadData.due_day : 8,
                    status: "active" as const,
                    address: (leadData.address || "") + extra,
                    diskon: 0,
                    tipe_diskon: "flat" as const,
                    referred_by_id: referredById,
                    referral_balance: 0,
                    odp_id: leadData.odp_id ? Number(leadData.odp_id) : 0,
                    odp_port: leadData.odp_port ? Number(leadData.odp_port) : undefined,
                  };

                  await createCustomer(customerInput);
                  await customersHook.handlers.refreshCustomers();
                  switchView("customers");
                }}
              />
            </Suspense>
          ) : null}
          {view === "whatsapp" ? (
            <Suspense fallback={<SkeletonCard />}>
              <WhatsAppPage
                user={user}
                waGatewayUrl={waGatewayUrl}
                waAccountId={settingsHook.state.settingsForm.wa_account_id}
                waApiKey={settingsHook.state.settingsForm.wa_api_key}
                pushSuccess={feedback.pushSuccess}
                pushError={feedback.pushError}
                withFeedback={feedback.withFeedback}
                askForConfirmation={feedback.askForConfirmation}
                settingsForm={settingsHook.state.settingsForm}
                setSettingsForm={settingsHook.handlers.setSettingsForm}
                refreshSettings={settingsHook.handlers.refreshSettings}
                templates={templatesHook.state.templates}
                refreshTemplates={templatesHook.handlers.refreshTemplates}
              />
            </Suspense>
          ) : null}
        </div>
      </div>

      {activeDetailCustomer && (
        <CustomerDetailModal
          customer={activeDetailCustomer}
          onClose={() => setActiveDetailCustomer(null)}
          user={user}
          pushSuccess={feedback.pushSuccess}
          pushError={feedback.pushError}
          onRefresh={reloadProtectedData}
          onEndTrial={(id) => void customersHook.handlers.handleEndTrial(id)}
        />
      )}

      

      {usersHook.state.passwordResetState ? (
        <Modal
          title={`Reset password ${usersHook.state.passwordResetState.user.username}`}
          onClose={() => usersHook.handlers.setPasswordResetState(null)}
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => usersHook.handlers.setPasswordResetState(null)}>
                Batal
              </Button>
              <Button type="submit" form="password-reset-form" variant="primary" disabled={feedback.submitting}>
                Simpan Password Baru
              </Button>
            </>
          }
        >
          <form id="password-reset-form" className="flex flex-col gap-5" onSubmit={usersHook.handlers.handlePasswordResetSubmit}>
            <label>
              <span>Password Baru</span>
              <input
                type="password"
                minLength={8}
                className={inputClassName(usersHook.state.passwordResetErrors.password)}
                autoFocus
                value={usersHook.state.passwordResetState.password}
                onChange={(event) =>
                  usersHook.handlers.setPasswordResetState((current) =>
                    current ? { ...current, password: event.target.value } : current,
                  )
                }
              />
              {renderInlineError(usersHook.state.passwordResetErrors.password)}
            </label>
            <p className="muted">Minimal 8 karakter. Password lama akan langsung digantikan setelah disimpan.</p>
          </form>
        </Modal>
      ) : null}

    </main>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <FeedbackProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </FeedbackProvider>
    </ThemeProvider>
  );
}

