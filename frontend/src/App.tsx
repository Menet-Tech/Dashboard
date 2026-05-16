import { FormEvent, startTransition, useEffect, useMemo, useState } from "react";
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
  type SummaryPayload,
} from "./lib/api";
import type {
  AuditLogItem,
  User,
  RevenueItem,
  AgingReport,
  ViewKey,
} from "./types";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

import { toErrorMessage } from "./utils/format";
import { statusTone } from "./utils/status";
import { validateLogin, type FieldErrors } from "./utils/validation";
import { buildCustomerLifecycleMap } from "./lib/lifecycle";
import { Modal } from "./components/ui/Modal";
import { SkeletonCard } from "./components/ui/SkeletonCard";
import { ToastStack, type ToastItem } from "./components/ui/Toast";
import { inputClassName, renderInlineError } from "./components/ui";

import { DashboardPage } from "./features/dashboard/DashboardPage";
import { PackagesPage } from "./features/packages/PackagesPage";
import { CustomersPage, defaultCustomerForm } from "./features/customers/CustomersPage";
import { BillsPage } from "./features/bills/BillsPage";
import { TemplatesPage, defaultTemplateForm } from "./features/templates/TemplatesPage";
import { MonitoringPage } from "./features/monitoring/MonitoringPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { AuditLogsPage } from "./features/audit/AuditLogsPage";
import { UsersPage } from "./features/users/UsersPage";

import type { ConfirmDialogState } from "./hooks/types";
import { useCustomers } from "./hooks/useCustomers";
import { useBills } from "./hooks/useBills";
import { usePackages } from "./hooks/usePackages";
import { useTemplates } from "./hooks/useTemplates";
import { useUsers } from "./hooks/useUsers";
import { useSettings } from "./hooks/useSettings";
import { useMonitoring } from "./hooks/useMonitoring";
import { defaultPackageForm } from "./features/packages/PackagesPage";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

type NavItem = {
  key: ViewKey;
  label: string;
  caption: string;
};

const navItems: NavItem[] = [
  { key: "dashboard", label: "Dashboard", caption: "Overview & metrik" },
  { key: "bills", label: "Tagihan", caption: "Generate & bukti bayar" },
  { key: "customers", label: "Pelanggan", caption: "Data & status isolir" },
  { key: "packages", label: "Paket Internet", caption: "Kecepatan & harga" },
  { key: "monitoring", label: "Monitoring", caption: "Status node & backup" },
  { key: "templates", label: "Template WA", caption: "Draft pesan notif" },
  { key: "audit", label: "Audit Log", caption: "Jejak aktivitas tim" },
  { key: "users", label: "Manajemen Tim", caption: "Akses login admin" },
  { key: "settings", label: "Pengaturan", caption: "Konfigurasi sistem" },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [booting, setBooting] = useState(true);
  
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [revenue, setRevenue] = useState<RevenueItem[]>([]);
  const [aging, setAging] = useState<AgingReport | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  
  const [submitting, setSubmitting] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  
  const [loginForm, setLoginForm] = useState({ username: "admin", password: "password" });
  const [loginErrors, setLoginErrors] = useState<FieldErrors>({});
  
  const [navOpen, setNavOpen] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);

  function pushToast(tone: ToastItem["tone"], toastMessage: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, tone, message: toastMessage }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }

  function pushSuccess(msg: string) { pushToast("success", msg); }
  function pushError(msg: string) { pushToast("error", msg); }
  function askForConfirmation(config: ConfirmDialogState) { setConfirmDialog(config); }

  async function withFeedback(action: () => Promise<void>, actionKey?: string) {
    setSubmitting(true);
    setBusyAction(actionKey ?? null);
    setMessage(null);
    setError(null);
    try {
      await action();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
      setBusyAction(null);
    }
  }

  const monitoringHook = useMonitoring({ withFeedback, askForConfirmation, onSuccess: pushSuccess, userRole: user?.role, setAuditLogs });
  const customersHook = useCustomers({ withFeedback, onSuccess: pushSuccess });
  const billsHook = useBills({ withFeedback, askForConfirmation, onSuccess: pushSuccess, onError: pushError });
  const packagesHook = usePackages({ withFeedback, askForConfirmation, onSuccess: pushSuccess });
  const templatesHook = useTemplates({ withFeedback, askForConfirmation, onSuccess: pushSuccess });
  const usersHook = useUsers({ withFeedback, onSuccess: pushSuccess });
  const settingsHook = useSettings({ withFeedback, onSuccess: pushSuccess, refreshHealth: monitoringHook.handlers.refreshHealth });

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
        if (!cancelled) setError(toErrorMessage(caughtError));
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
        if (["audit", "users", "settings", "packages", "templates"].includes(item.key)) {
          return user?.role === "admin";
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

  useEffect(() => {
    if (!message) return;
    pushToast("success", message);
    setMessage(null);
  }, [message]);

  useEffect(() => {
    if (!error) return;
    pushToast("error", error);
    setError(null);
  }, [error]);

  function isBusy(actionKey: string) { return submitting && busyAction === actionKey; }

  function switchView(nextView: ViewKey) {
    startTransition(() => setView(nextView));
    setNavOpen(false);
    if (nextView === "monitoring") {
      void monitoringHook.handlers.refreshMonitoringData();
    }
    if (nextView === "audit") {
      void withFeedback(async () => {
        const payload = await fetchAuditLogs(100);
        setAuditLogs(payload.data);
      });
    }
  }

  async function confirmAndRun() {
    if (!confirmDialog) return;
    const action = confirmDialog.onConfirm;
    setConfirmDialog(null);
    await action();
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateLogin(loginForm);
    setLoginErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await withFeedback(async () => {
      const response = await login(loginForm.username, loginForm.password);
      setLoginErrors({});
      setUser(response.user);
      setMessage("Login berhasil. Fondasi admin panel Go sekarang sudah aktif.");
    }, "login");
  }

  async function handleLogout() {
    await withFeedback(async () => {
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
      setMessage("Sesi berhasil ditutup.");
    }, "logout");
  }

  if (booting) {
    return (
      <main className="page-shell centered-shell">
        <div className="surface loading-state">Menyiapkan fondasi go-dev...</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page-shell auth-shell">
        <section className="hero">
          <div>
            <p className="eyebrow">go-dev rewrite</p>
            <h1>Masuk ke Menet-Tech Dashboard</h1>
            <p className="hero-copy">
              Backend Go, frontend React, dan SQLite sekarang sudah mulai membentuk
              admin panel baru. Login default bootstrap tetap `admin / password`
              sampai nanti kita pindah ke user management penuh.
            </p>
          </div>
          <div className="hero-panel">
            <div className="panel-row">
              <span>Backend</span>
              <StatusPill label={monitoringHook.state.health?.status ?? "offline"} tone={appTone} />
            </div>
            <div className="panel-row">
              <span>Database</span>
              <StatusPill label={monitoringHook.state.health?.services.database ?? "offline"} tone={databaseTone} />
            </div>
            <div className="panel-row">
              <span>Worker</span>
              <StatusPill label={monitoringHook.state.health?.services.worker ?? "unknown"} tone={workerTone} />
            </div>
            <div className="panel-row">
              <span>Environment</span>
              <strong>{monitoringHook.state.health?.app.environment ?? "development"}</strong>
            </div>
          </div>
        </section>

        <section className="surface auth-card">
          <div className="section-heading">
            <h2>Login</h2>
            <StatusPill label="session cookie" tone="slate" />
          </div>
          <form className="form-grid" onSubmit={handleLogin}>
            <label>
              <span>Username</span>
              <input
                className={inputClassName(loginErrors.username)}
                value={loginForm.username}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, username: event.target.value }))
                }
              />
              {renderInlineError(loginErrors.username)}
            </label>
            <label>
              <span>Password</span>
              <input
                className={inputClassName(loginErrors.password)}
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, password: event.target.value }))
                }
              />
              {renderInlineError(loginErrors.password)}
            </label>
            <button className="primary-button" disabled={submitting}>
              {isBusy("login") ? "Masuk..." : "Masuk"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell app-shell">
      <aside className={`app-sidebar ${navOpen ? "is-open" : ""}`} aria-label="Navigasi utama">
        <div className="sidebar-brand">
          <p className="eyebrow">go-dev rewrite</p>
          <h1>Menet-Tech Dashboard</h1>
          <p className="hero-copy">Backend Go, worker billing, dan panel operasional baru untuk tim ISP.</p>
        </div>
        <nav className="sidebar-nav">
          {visibleNavItems.map((item) => (
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
          <button className="secondary-button" onClick={() => void handleLogout()} disabled={submitting}>
            {isBusy("logout") ? "Keluar..." : "Logout"}
          </button>
        </div>
      </aside>

      {navOpen ? (
        <button type="button" className="sidebar-backdrop" onClick={() => setNavOpen(false)} aria-label="Tutup navigasi" />
      ) : null}

      <div className="main-panel">
        <section className="topbar">
          <div>
            <button
              type="button"
              className="ghost-button mobile-nav-toggle"
              onClick={() => setNavOpen((current) => !current)}
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
              <StatusPill label={monitoringHook.state.health?.status ?? "checking"} tone={appTone} />
              <StatusPill label={`worker ${monitoringHook.state.health?.services.worker ?? "unknown"}`} tone={workerTone} />
              <StatusPill label={`backup ${monitoringHook.state.health?.services.backup ?? "unknown"}`} tone={backupTone} />
            </div>
          </div>
          <div className="topbar-actions">
            <div className="user-chip compact-user-chip">
              <strong>{user.username}</strong>
              <span>{user.role}</span>
            </div>
            <button className="secondary-button" onClick={() => void handleLogout()} disabled={submitting}>
              {isBusy("logout") ? "Keluar..." : "Logout"}
            </button>
          </div>
        </section>

        {loadFailure ? (
          <section className="surface retry-panel">
            <div>
              <p className="eyebrow">load failure</p>
              <h2>Data panel belum berhasil dimuat penuh</h2>
              <p className="hero-copy">{loadFailure}</p>
            </div>
            <div className="button-row">
              <button type="button" className="primary-button" onClick={() => void withFeedback(reloadProtectedData, "retry-load")} disabled={submitting}>
                {isBusy("retry-load") ? "Memuat ulang..." : "Coba Muat Ulang"}
              </button>
            </div>
          </section>
        ) : null}

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
          submitting={submitting}
          busyAction={busyAction}
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
          submitting={submitting}
          busyAction={busyAction}
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
            });
          }}
          onCancelEdit={() => {
            customersHook.handlers.setEditingCustomerId(null);
            customersHook.handlers.setCustomerForm(defaultCustomerForm());
          }}
        />
      ) : null}

      {view === "bills" ? (
        <BillsPage
          user={user}
          bills={billsHook.state.bills}
          billPeriod={billsHook.state.billPeriod}
          billErrors={billsHook.state.billErrors}
          submitting={submitting}
          busyAction={busyAction}
          expandedBillId={billsHook.state.expandedBillId}
          notificationLogs={billsHook.state.notificationLogs}
          proofFiles={billsHook.state.proofFiles}
          onBillPeriodChange={billsHook.handlers.setBillPeriod}
          onGenerateBills={billsHook.handlers.handleGenerateBills}
          onMarkBillPaid={(id) => void billsHook.handlers.handleMarkBillPaid(id)}
          onToggleNotifications={(id) => void billsHook.handlers.handleToggleNotifications(id)}
          onProofFileChange={(id, file) =>
            billsHook.handlers.setProofFiles((current) => ({
              ...current,
              [id]: file,
            }))
          }
          onUploadProof={(id) => void billsHook.handlers.handleUploadProof(id)}
        />
      ) : null}

      {view === "templates" ? (
        <TemplatesPage
          templates={templatesHook.state.templates}
          templateForm={templatesHook.state.templateForm}
          templateErrors={templatesHook.state.templateErrors}
          editingTemplateId={templatesHook.state.editingTemplateId}
          submitting={submitting}
          busyAction={busyAction}
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
          submitting={submitting}
          busyAction={busyAction}
          appTone={appTone}
          databaseTone={databaseTone}
          workerTone={workerTone}
          backupTone={backupTone}
          schedulerTone={schedulerTone}
          onRefresh={() => void withFeedback(monitoringHook.handlers.refreshMonitoringData)}
          onCreateBackup={() => void monitoringHook.handlers.handleCreateBackup()}
          onVerifyBackup={(filename) => void monitoringHook.handlers.handleVerifyBackup(filename)}
          onSimulateRestore={(filename) => void monitoringHook.handlers.handleSimulateRestore(filename)}
          onApplyRestore={() => void monitoringHook.handlers.handleApplyRestore()}
          onCancelRestore={monitoringHook.handlers.cancelRestore}
        />
      ) : null}

      {view === "settings" ? (
        <SettingsPage
          settingsForm={settingsHook.state.settingsForm}
          settingsErrors={settingsHook.state.settingsErrors}
          submitting={submitting}
          busyAction={busyAction}
          onFormChange={settingsHook.handlers.setSettingsForm}
          onSubmit={settingsHook.handlers.handleSettingsSubmit}
        />
      ) : null}

      {view === "audit" ? (
        <AuditLogsPage
          auditLogs={auditLogs}
          submitting={submitting}
          onRefresh={() =>
            void withFeedback(async () => {
              const payload = await fetchAuditLogs(100);
              setAuditLogs(payload.data);
            })
          }
        />
      ) : null}

      {view === "users" ? (
        <UsersPage
          managedUsers={usersHook.state.managedUsers}
          managedUserForm={usersHook.state.managedUserForm}
          managedUserErrors={usersHook.state.managedUserErrors}
          submitting={submitting}
          busyAction={busyAction}
          onFormChange={usersHook.handlers.setManagedUserForm}
          onSubmit={usersHook.handlers.handleManagedUserSubmit}
          onUpdateRole={(item, role) => void usersHook.handlers.handleManagedUserUpdate(item, { role })}
          onUpdateStatus={(item, isActive) => void usersHook.handlers.handleManagedUserUpdate(item, { is_active: isActive })}
          onResetPassword={(item) => void usersHook.handlers.handleResetUserPassword(item)}
        />
      ) : null}
      </div>

      {confirmDialog ? (
        <Modal
          title={confirmDialog.title}
          onClose={() => setConfirmDialog(null)}
          actions={
            <>
              <button type="button" className="secondary-button" onClick={() => setConfirmDialog(null)}>
                Batal
              </button>
              <button
                type="button"
                className={confirmDialog.tone === "danger" ? "ghost-button danger-button" : "primary-button"}
                onClick={() => void confirmAndRun()}
                disabled={submitting}
              >
                {confirmDialog.confirmLabel}
              </button>
            </>
          }
        >
          <p className="muted">{confirmDialog.body}</p>
        </Modal>
      ) : null}

      {usersHook.state.passwordResetState ? (
        <Modal
          title={`Reset password ${usersHook.state.passwordResetState.user.username}`}
          onClose={() => usersHook.handlers.setPasswordResetState(null)}
          actions={
            <>
              <button type="button" className="secondary-button" onClick={() => usersHook.handlers.setPasswordResetState(null)}>
                Batal
              </button>
              <button type="submit" form="password-reset-form" className="primary-button" disabled={submitting}>
                Simpan Password Baru
              </button>
            </>
          }
        >
          <form id="password-reset-form" className="form-grid single-column-grid" onSubmit={usersHook.handlers.handlePasswordResetSubmit}>
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

      <ToastStack toasts={toasts} />
    </main>
  );
}
