import { FormEvent, lazy, Suspense, startTransition, useEffect, useMemo, useState } from "react";
import { StatusPill } from "./components/StatusPill";
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
import { useAppFeedback } from "./hooks/useAppFeedback";

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

type NavItem = {
  key: ViewKey;
  label: string;
  caption: string;
};

const navItems: NavItem[] = [
  // === Utama ===
  { key: "dashboard", label: "Dashboard", caption: "Overview & metrik" },
  { key: "bills", label: "Tagihan", caption: "Generate & bukti bayar" },
  { key: "customers", label: "Pelanggan", caption: "Data & status isolir" },
  { key: "packages", label: "Paket Internet", caption: "Kecepatan & harga" },
  { key: "discounts", label: "Diskon & Referral", caption: "MGM & voucher khusus" },
  // === Operasional ===
  { key: "odp", label: "Data ODP", caption: "Status & maintenance node" },
  { key: "network-map", label: "Peta Jaringan", caption: "Topologi fiber & ODP" },
  { key: "devices", label: "Perangkat ONT", caption: "Kelola CPE via GenieACS" },
  { key: "monitoring", label: "Monitoring", caption: "Status node & backup" },
  { key: "tickets", label: "Tiket Support", caption: "Bantuan & keluhan" },
  { key: "registration", label: "Registrasi", caption: "Daftar mandiri" },
  // === Komunikasi ===
  { key: "whatsapp", label: "WhatsApp Gateway", caption: "Multi-akun & Chatbot" },
  { key: "templates", label: "Template WA", caption: "Draft pesan notif" },
  // === Admin ===
  { key: "reports", label: "Laporan Keuangan", caption: "Analisis & proyeksi omset" },
  { key: "audit", label: "Audit Log", caption: "Jejak aktivitas tim" },
  { key: "users", label: "Manajemen Tim", caption: "Akses login admin" },
  // === Pengaturan (paling bawah) ===
  { key: "settings", label: "Pengaturan", caption: "Konfigurasi sistem" },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewKey>(() => {
    const stored = localStorage.getItem("active_view");
    if (stored) return stored as ViewKey;
    return "dashboard";
  });
  const [activeDetailCustomer, setActiveDetailCustomer] = useState<CustomerItem | null>(null);
  const [booting, setBooting] = useState(true);

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;
    return "light";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));
  
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [revenue, setRevenue] = useState<RevenueItem[]>([]);
  const [aging, setAging] = useState<AgingReport | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  
  const feedback = useAppFeedback();
  
  const [loginForm, setLoginForm] = useState({ username: "admin", password: "password" });
  const [loginErrors, setLoginErrors] = useState<FieldErrors>({});
  
  const [navOpen, setNavOpen] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);

  const monitoringHook = useMonitoring({ withFeedback: feedback.withFeedback, askForConfirmation: feedback.askForConfirmation, onSuccess: feedback.pushSuccess, userRole: user?.role, setAuditLogs });
  const customersHook = useCustomers({ withFeedback: feedback.withFeedback, onSuccess: feedback.pushSuccess });
  const billsHook = useBills({ withFeedback: feedback.withFeedback, askForConfirmation: feedback.askForConfirmation, onSuccess: feedback.pushSuccess, onError: feedback.pushError });
  const packagesHook = usePackages({ withFeedback: feedback.withFeedback, askForConfirmation: feedback.askForConfirmation, onSuccess: feedback.pushSuccess });
  const templatesHook = useTemplates({ withFeedback: feedback.withFeedback, askForConfirmation: feedback.askForConfirmation, onSuccess: feedback.pushSuccess });
  const usersHook = useUsers({ withFeedback: feedback.withFeedback, onSuccess: feedback.pushSuccess });
  const settingsHook = useSettings({ withFeedback: feedback.withFeedback, onSuccess: feedback.pushSuccess, refreshHealth: monitoringHook.handlers.refreshHealth });

  useEffect(() => {
    registerOnUnauthorized(() => {
      setUser(null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const healthPayload = await fetchHealth();
        if (!cancelled) monitoringHook.handlers.setHealth(healthPayload);
        try {
          const current = await fetchCurrentUser();
          if (!cancelled) setUser(current.user);
        } catch (caughtError) {
          if (!cancelled && !(caughtError instanceof ApiError && caughtError.status === 401)) throw caughtError;
        }
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
        setRevenue(revenuePayload.data);
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
        if (["reports", "audit", "users", "settings", "packages", "templates"].includes(item.key)) {
          return user?.role === "admin";
        }
        if (item.key === "devices") {
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
        const lifecycle = customerLifecycleMap[customer.id]?.key ?? "lunas";
        const filter = customersHook.state.customerLifecycleFilter;
        if (filter === "all") return true;
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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateLogin(loginForm);
    setLoginErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await feedback.withFeedback(async () => {
      const response = await login(loginForm.username, loginForm.password);
      setLoginErrors({});
      setUser(response.user);
      feedback.pushSuccess("Login berhasil. Fondasi admin panel Go sekarang sudah aktif.");
    }, "login");
  }

  async function handleLogout() {
    await feedback.withFeedback(async () => {
      await logout();
      setUser(null);
      setSummary(null);
      packagesHook.handlers.setPackages([]);
      customersHook.handlers.setCustomers([]);
      billsHook.handlers.setBills([]);
      templatesHook.handlers.setTemplates([]);
      setAuditLogs([]);
      usersHook.handlers.setManagedUsers([]);
      startTransition(() => setView("dashboard"));
      localStorage.setItem("active_view", "dashboard");
      feedback.pushSuccess("Sesi berhasil ditutup.");
    }, "logout");
  }

  if (booting) {
    return (
      <main className="page-shell centered-shell">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm loading-state">Memuat sistem...</div>
      </main>
    );
  }

  if (!user) {
    return (
      <LoginPage
        loginForm={loginForm}
        loginErrors={loginErrors}
        submitting={feedback.submitting}
        isBusy={feedback.isBusy}
        onFormChange={(field, value) =>
          setLoginForm((current) => ({ ...current, [field]: value }))
        }
        onLogin={handleLogin}
      />
    );
  }

  return (
    <main className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 max-w-[1600px] mx-auto transition-colors duration-300">
      <Sidebar
        navOpen={navOpen}
        navItems={visibleNavItems}
        view={view}
        switchView={switchView}
        user={user}
        onLogout={() => void handleLogout()}
        submitting={feedback.submitting}
        isBusy={feedback.isBusy}
      />

      {navOpen ? (
        <button type="button" className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 lg:hidden" onClick={() => setNavOpen(false)} aria-label="Tutup navigasi" />
      ) : null}

      <div className="flex-1 flex flex-col min-w-0 px-4 py-6 md:px-8 lg:px-12 max-w-full overflow-x-hidden">
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
              speed_mbps: pkg.speed_mbps,
              price: pkg.price,
              description: pkg.description,
            });
          }}
          onCancelEdit={() => {
            packagesHook.handlers.setEditingPackageId(null);
            packagesHook.handlers.setPackageForm(defaultPackageForm());
          }}
          onDelete={(id) => void packagesHook.handlers.handlePackageDelete(id)}
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
              sn_ont: customer.sn_ont,
              due_day: customer.due_day,
              status: customer.status,
              address: customer.address,
              diskon: customer.diskon ?? 0,
              referred_by_id: customer.referred_by_id ?? 0,
              referral_balance: customer.referral_balance ?? 0,
              odp_id: customer.odp_id ?? 0,
            });
          }}
          onCancelEdit={() => {
            customersHook.handlers.setEditingCustomerId(null);
            customersHook.handlers.setCustomerForm(defaultCustomerForm());
          }}
          pushSuccess={feedback.pushSuccess}
          pushError={feedback.pushError}
          onRefresh={reloadProtectedData}
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

      {view === "bills" ? (
        <BillsPage
          user={user}
          bills={billsHook.state.bills}
          billPeriod={billsHook.state.billPeriod}
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
        />
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
              is_active: item.is_active,
            });
          }}
          onCancelEdit={() => {
            templatesHook.handlers.setEditingTemplateId(null);
            templatesHook.handlers.setTemplateForm(defaultTemplateForm());
          }}
          onDelete={(id) => void templatesHook.handlers.handleTemplateDelete(id)}
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
          <TicketsPage />
        </Suspense>
      ) : null}
      {view === "registration" ? (
        <Suspense fallback={<SkeletonCard />}>
          <RegistrationPage />
        </Suspense>
      ) : null}
      {view === "whatsapp" ? (
        <Suspense fallback={<SkeletonCard />}>
          <WhatsAppPage
            user={user}
            waGatewayUrl={settingsHook.state.settingsForm.wa_gateway_url}
            waAccountId={settingsHook.state.settingsForm.wa_account_id}
            waApiKey={settingsHook.state.settingsForm.wa_api_key}
            pushSuccess={feedback.pushSuccess}
            pushError={feedback.pushError}
            withFeedback={feedback.withFeedback}
            askForConfirmation={feedback.askForConfirmation}
          />
        </Suspense>
      ) : null}
      </div>
      </div>

      <ToastStack toasts={feedback.toasts} />

      {feedback.confirmDialog ? (
        <Modal
          title={feedback.confirmDialog.title}
          onClose={feedback.dismissConfirmDialog}
          actions={
            <>
              <button type="button" className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={feedback.dismissConfirmDialog}>
                Batal
              </button>
              <button
                type="button"
                className={feedback.confirmDialog.tone === "danger" ? "text-red-600 hover:bg-red-50 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50" : "bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50"}
                onClick={() => void feedback.confirmAndRun()}
                disabled={feedback.submitting}
              >
                {feedback.confirmDialog.confirmLabel}
              </button>
            </>
          }
        >
          <p className="muted">{feedback.confirmDialog.body}</p>
        </Modal>
      ) : null}

      {usersHook.state.passwordResetState ? (
        <Modal
          title={`Reset password ${usersHook.state.passwordResetState.user.username}`}
          onClose={() => usersHook.handlers.setPasswordResetState(null)}
          actions={
            <>
              <button type="button" className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={() => usersHook.handlers.setPasswordResetState(null)}>
                Batal
              </button>
              <button type="submit" form="password-reset-form" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" disabled={feedback.submitting}>
                Simpan Password Baru
              </button>
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

      {activeDetailCustomer && (
        <CustomerDetailModal
          customer={activeDetailCustomer}
          onClose={() => setActiveDetailCustomer(null)}
          user={user}
          pushSuccess={feedback.pushSuccess}
          pushError={feedback.pushError}
          onRefresh={reloadProtectedData}
        />
      )}

    </main>
  );
}
