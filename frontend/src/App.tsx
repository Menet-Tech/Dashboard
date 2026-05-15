import { FormEvent, ReactNode, startTransition, useEffect, useMemo, useState, Fragment } from "react";
import { StatusPill } from "./components/StatusPill";
import {
  ApiError,
  createBackup,
  createCustomer,
  createPackage,
  createTemplate,
  createUser,
  deletePackage,
  deleteTemplate,
  fetchBills,
  fetchBillNotifications,
  fetchBackups,
  fetchCurrentUser,
  fetchCustomers,
  fetchHealth,
  fetchPackages,
  fetchAuditLogs,
  fetchSettings,
  fetchSummary,
  fetchRevenue,
  fetchAging,
  fetchTemplates,
  fetchUsers,
  generateBills,
  getBackupDownloadUrl,
  login,
  markBillPaid,
  resetUserPassword,
  logout,
  updateCustomer,
  updateCustomerStatus,
  updatePackage,
  updateSettings,
  updateTemplate,
  updateUser,
  uploadBillProof,
  verifyBackup,
  simulateRestore,
  applyRestore,
  type HealthPayload,
  type SummaryPayload,
  type RestoreSimulationResult,
} from "./lib/api";
import type {
  AuditLogItem,
  BillItem,
  CustomerItem,
  ManagedUserItem,
  NotificationLog,
  PackageItem,
  TemplateItem,
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

import { formatCurrency, formatDateTime, currentPeriod, toErrorMessage } from "./utils/format";
import { statusTone, displayStatusLabel, displayStatusTone, integrationSummary } from "./utils/status";
import {
  validateLogin,
  validatePackage,
  validateCustomer,
  validateTemplate,
  validateManagedUser,
  validateSettings,
  validateBillPeriod,
  validatePasswordReset,
  type FieldErrors,
} from "./utils/validation";
import {
  buildCustomerLifecycleMap,
  readCustomerLifecycleFilter,
  type CustomerLifecycleKey,
} from "./lib/lifecycle";
import { Modal } from "./components/ui/Modal";
import { SkeletonCard } from "./components/ui/SkeletonCard";
import { ToastStack, type ToastItem } from "./components/ui/Toast";
import { inputClassName, renderInlineError } from "./components/ui";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { PackagesPage, defaultPackageForm, type PackageFormState } from "./features/packages/PackagesPage";
import { CustomersPage, defaultCustomerForm, type CustomerFormState } from "./features/customers/CustomersPage";
import { BillsPage } from "./features/bills/BillsPage";
import { TemplatesPage, defaultTemplateForm, type TemplateFormState } from "./features/templates/TemplatesPage";
import { MonitoringPage, type BackupItem } from "./features/monitoring/MonitoringPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { AuditLogsPage } from "./features/audit/AuditLogsPage";
import { UsersPage, defaultManagedUserForm, type ManagedUserFormState } from "./features/users/UsersPage";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);







type ConfirmDialogState = {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => Promise<void> | void;
};

type PasswordResetState = {
  user: ManagedUserItem;
  password: string;
};


type CustomerLifecycleFilter = CustomerLifecycleKey;



const navItems: Array<{ key: ViewKey; label: string; caption: string }> = [
  { key: "dashboard", label: "Dashboard", caption: "ringkasan bisnis dan status sistem" },
  { key: "packages", label: "Master Paket", caption: "katalog produk internet" },
  { key: "customers", label: "Pelanggan", caption: "data layanan dan jatuh tempo" },
  { key: "bills", label: "Tagihan", caption: "invoice, pembayaran, bukti bayar" },
  { key: "templates", label: "Template WA", caption: "notifikasi dan automation copy" },
  { key: "monitoring", label: "Monitoring", caption: "health, backup, scheduler" },
  { key: "audit", label: "Audit Log", caption: "jejak operasional dan keamanan" },
  { key: "users", label: "Users", caption: "akun admin dan operator" },
  { key: "settings", label: "Pengaturan", caption: "billing rules dan integrasi" },
];








export default function App() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [revenue, setRevenue] = useState<RevenueItem[]>([]);
  const [aging, setAging] = useState<AgingReport | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [booting, setBooting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [bills, setBills] = useState<BillItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [restoreSimulation, setRestoreSimulation] = useState<{ filename: string; result: RestoreSimulationResult } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUserItem[]>([]);
  const [packageForm, setPackageForm] = useState<PackageFormState>(defaultPackageForm);
  const [editingPackageId, setEditingPackageId] = useState<number | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(defaultCustomerForm);
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(defaultTemplateForm);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [managedUserForm, setManagedUserForm] = useState<ManagedUserFormState>(defaultManagedUserForm);
  const [loginForm, setLoginForm] = useState({ username: "admin", password: "password" });
  const [billPeriod, setBillPeriod] = useState(currentPeriod());
  const [proofFiles, setProofFiles] = useState<Record<number, File | null>>({});
  const [notificationLogs, setNotificationLogs] = useState<Record<number, NotificationLog[]>>({});
  const [expandedBillId, setExpandedBillId] = useState<number | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [customerLifecycleFilter, setCustomerLifecycleFilter] = useState<CustomerLifecycleFilter>(() => readCustomerLifecycleFilter());
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [passwordResetState, setPasswordResetState] = useState<PasswordResetState | null>(null);
  const [loginErrors, setLoginErrors] = useState<FieldErrors>({});
  const [packageErrors, setPackageErrors] = useState<FieldErrors>({});
  const [customerErrors, setCustomerErrors] = useState<FieldErrors>({});
  const [templateErrors, setTemplateErrors] = useState<FieldErrors>({});
  const [managedUserErrors, setManagedUserErrors] = useState<FieldErrors>({});
  const [settingsErrors, setSettingsErrors] = useState<FieldErrors>({});
  const [billErrors, setBillErrors] = useState<FieldErrors>({});
  const [passwordResetErrors, setPasswordResetErrors] = useState<FieldErrors>({});
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pageLoading, setPageLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const healthPayload = await fetchHealth();
        if (!cancelled) {
          setHealth(healthPayload);
        }

        try {
          const current = await fetchCurrentUser();
          if (!cancelled) {
            setUser(current.user);
          }
        } catch (caughtError) {
          if (!cancelled && !(caughtError instanceof ApiError && caughtError.status === 401)) {
            throw caughtError;
          }
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(toErrorMessage(caughtError));
        }
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const isAdmin = user.role === "admin";
    let cancelled = false;

    async function loadProtectedData() {
      setPageLoading(true);
      try {
        const [
          summaryPayload,
          packagesPayload,
          customersPayload,
          billsPayload,
          templatesPayload,
          settingsPayload,
          auditPayload,
          usersPayload,
          revenuePayload,
          agingPayload,
        ] = await Promise.all([
          fetchSummary(),
          fetchPackages(),
          fetchCustomers(),
          fetchBills(),
          fetchTemplates(),
          isAdmin ? fetchSettings() : Promise.resolve({ data: {} }),
          isAdmin ? fetchAuditLogs(50) : Promise.resolve({ data: [] as AuditLogItem[] }),
          isAdmin ? fetchUsers() : Promise.resolve({ data: [] as ManagedUserItem[] }),
          isAdmin ? fetchRevenue().catch(() => ({ data: [] as RevenueItem[] })) : Promise.resolve({ data: [] as RevenueItem[] }),
          isAdmin ? fetchAging().catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        ]);

        if (!cancelled) {
          startTransition(() => {
            setSummary(summaryPayload);
            setPackages(packagesPayload.data);
            setCustomers(customersPayload.data);
            setBills(billsPayload.data);
            setTemplates(templatesPayload.data);
            if (isAdmin) {
              setSettingsForm(settingsPayload.data as Record<string, string>);
              setAuditLogs(auditPayload.data);
              setManagedUsers(usersPayload.data);
              setRevenue(revenuePayload.data);
              setAging(agingPayload.data);
            }
            setLoadFailure(null);
          });
        }
      } catch (caughtError) {
        if (!cancelled) {
          setLoadFailure(toErrorMessage(caughtError));
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    }

    void loadProtectedData();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const packageOptions = useMemo(
    () => packages.map((pkg) => ({ value: pkg.id, label: `${pkg.name} - ${pkg.speed_mbps} Mbps` })),
    [packages],
  );
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
    () => buildCustomerLifecycleMap(customers, bills, settingsForm),
    [bills, customers, settingsForm],
  );
  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        const lifecycle = customerLifecycleMap[customer.id]?.key ?? "lunas";
        if (customerLifecycleFilter === "trial") {
          return lifecycle === "trial";
        }
        if (customerLifecycleFilter === "tertagih") {
          return lifecycle === "tertagih";
        }
        if (customerLifecycleFilter === "jatuh_tempo") {
          return lifecycle === "jatuh_tempo";
        }
        if (customerLifecycleFilter === "menunggak") {
          return lifecycle === "menunggak";
        }
        if (customerLifecycleFilter === "lunas") {
          return lifecycle === "lunas";
        }
        return true;
      }),
    [customerLifecycleFilter, customerLifecycleMap, customers],
  );

  const databaseTone = statusTone(health?.services.database);
  const workerTone = statusTone(health?.services.worker);
  const backupTone = statusTone(health?.services.backup);
  const schedulerTone = statusTone(
    health?.scheduler.billing_last_error
      ? "error"
      : health?.scheduler.billing_auto_enabled
        ? "ok"
        : "unknown",
  );
  const appTone = statusTone(health?.status);

  useEffect(() => {
    if (!message) {
      return;
    }
    pushToast("success", message);
    setMessage(null);
  }, [message]);

  useEffect(() => {
    if (!error) {
      return;
    }
    pushToast("error", error);
    setError(null);
  }, [error]);

  useEffect(() => {
    window.localStorage.setItem("customers.lifecycleFilter", customerLifecycleFilter);
  }, [customerLifecycleFilter]);

  async function reloadProtectedData() {
    setPageLoading(true);
    try {
      const [summaryPayload, packagesPayload, customersPayload, billsPayload, templatesPayload, settingsPayload, auditPayload, usersPayload, revenuePayload, agingPayload] =
        await Promise.all([
          fetchSummary(),
          fetchPackages(),
          fetchCustomers(),
          fetchBills(),
          fetchTemplates(),
          fetchSettings(),
          user?.role === "admin" ? fetchAuditLogs(50) : Promise.resolve({ data: [] as AuditLogItem[] }),
          user?.role === "admin" ? fetchUsers() : Promise.resolve({ data: [] as ManagedUserItem[] }),
          user?.role === "admin" ? fetchRevenue().catch(() => ({ data: [] as RevenueItem[] })) : Promise.resolve({ data: [] as RevenueItem[] }),
          user?.role === "admin" ? fetchAging().catch(() => ({ data: null })) : Promise.resolve({ data: null }),
        ]);

      setSummary(summaryPayload);
      setPackages(packagesPayload.data);
      setCustomers(customersPayload.data);
      setBills(billsPayload.data);
      setTemplates(templatesPayload.data);
      setSettingsForm(settingsPayload.data);
      setAuditLogs(auditPayload.data);
      setManagedUsers(usersPayload.data);
      if (user?.role === "admin") {
        setRevenue(revenuePayload.data);
        setAging(agingPayload.data);
      }
      setLoadFailure(null);
    } catch (caughtError) {
      setLoadFailure(toErrorMessage(caughtError));
      throw caughtError;
    } finally {
      setPageLoading(false);
    }
  }

  function pushToast(tone: ToastItem["tone"], toastMessage: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, tone, message: toastMessage }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }

  function isBusy(actionKey: string) {
    return submitting && busyAction === actionKey;
  }

  function switchView(nextView: ViewKey) {
    startTransition(() => setView(nextView));
    setNavOpen(false);
    if (nextView === "monitoring") {
      void refreshMonitoringData();
    }
    if (nextView === "audit") {
      void withFeedback(async () => {
        const payload = await fetchAuditLogs(100);
        setAuditLogs(payload.data);
      });
    }
  }

  function askForConfirmation(config: ConfirmDialogState) {
    setConfirmDialog(config);
  }

  async function confirmAndRun() {
    if (!confirmDialog) {
      return;
    }
    const action = confirmDialog.onConfirm;
    setConfirmDialog(null);
    await action();
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateLogin(loginForm);
    setLoginErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
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
      setPackages([]);
      setCustomers([]);
      setBills([]);
      setTemplates([]);
      setAuditLogs([]);
      setManagedUsers([]);
      startTransition(() => setView("dashboard"));
      setMessage("Sesi berhasil ditutup.");
    }, "logout");
  }

  async function handlePackageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validatePackage(packageForm);
    setPackageErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    await withFeedback(async () => {
      if (editingPackageId) {
        await updatePackage(editingPackageId, packageForm);
        setMessage("Paket berhasil diperbarui.");
      } else {
        await createPackage(packageForm);
        setMessage("Paket baru berhasil ditambahkan.");
      }
      setPackageErrors({});
      setPackageForm(defaultPackageForm());
      setEditingPackageId(null);
      await reloadProtectedData();
    }, "save-package");
  }

  async function handlePackageDelete(id: number) {
    askForConfirmation({
      title: "Hapus paket internet",
      body: "Paket akan dihapus dari daftar master. Pastikan tidak ada pelanggan aktif yang masih bergantung pada paket ini.",
      confirmLabel: "Ya, hapus paket",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          await deletePackage(id);
          if (editingPackageId === id) {
            setPackageForm(defaultPackageForm());
            setEditingPackageId(null);
          }
          setMessage("Paket berhasil dihapus.");
          await reloadProtectedData();
        }, "delete-package");
      },
    });
  }

  async function handleCustomerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateCustomer(customerForm);
    setCustomerErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    await withFeedback(async () => {
      if (editingCustomerId) {
        await updateCustomer(editingCustomerId, customerForm);
        setMessage("Pelanggan berhasil diperbarui.");
      } else {
        await createCustomer(customerForm);
        setMessage("Pelanggan baru berhasil ditambahkan.");
      }
      setCustomerErrors({});
      setCustomerForm(defaultCustomerForm());
      setEditingCustomerId(null);
      await reloadProtectedData();
    }, "save-customer");
  }

  async function handleStatusChange(id: number, status: CustomerItem["status"]) {
    await withFeedback(async () => {
      await updateCustomerStatus(id, status);
      setMessage("Status pelanggan berhasil diperbarui.");
      await reloadProtectedData();
    });
  }

  async function handleGenerateBills(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateBillPeriod(billPeriod);
    setBillErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    askForConfirmation({
      title: "Generate tagihan bulanan",
      body: `Sistem akan membuat tagihan untuk periode ${billPeriod} hanya untuk pelanggan aktif/limit yang belum memiliki invoice pada periode tersebut.`,
      confirmLabel: "Generate sekarang",
      tone: "primary",
      onConfirm: async () => {
        await withFeedback(async () => {
          const response = await generateBills(billPeriod);
          setBillErrors({});
          setMessage(
            `Generate tagihan periode ${response.data.period} selesai. ${response.data.generated} tagihan baru dibuat.`,
          );
          await reloadProtectedData();
        }, "generate-bills");
      },
    });
  }

  async function handleMarkBillPaid(id: number) {
    askForConfirmation({
      title: "Tandai tagihan lunas",
      body: "Apakah Anda yakin? Tindakan ini akan mencatat pembayaran, memicu notifikasi lunas, dan tidak dirancang untuk dibatalkan dari UI operator.",
      confirmLabel: "Ya, tandai lunas",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          await markBillPaid(id, "transfer");
          setMessage("Tagihan berhasil ditandai lunas.");
          await reloadProtectedData();
        }, "mark-paid");
      },
    });
  }

  async function handleUploadProof(id: number) {
    const file = proofFiles[id];
    if (!file) {
      setError("Pilih file bukti bayar terlebih dahulu.");
      return;
    }

    await withFeedback(async () => {
      await uploadBillProof(id, file);
      setProofFiles((current) => ({ ...current, [id]: null }));
      setMessage("Bukti bayar berhasil diunggah.");
      await reloadProtectedData();
    }, "upload-proof");
  }

  async function handleTemplateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateTemplate(templateForm);
    setTemplateErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    await withFeedback(async () => {
      if (editingTemplateId) {
        await updateTemplate(editingTemplateId, templateForm);
        setMessage("Template berhasil diperbarui.");
      } else {
        await createTemplate(templateForm);
        setMessage("Template baru berhasil ditambahkan.");
      }
      setTemplateErrors({});
      setTemplateForm(defaultTemplateForm());
      setEditingTemplateId(null);
      await reloadProtectedData();
    }, "save-template");
  }

  async function handleTemplateDelete(id: number) {
    askForConfirmation({
      title: "Hapus template WhatsApp",
      body: "Template yang dihapus tidak lagi tersedia untuk trigger notifikasi. Pastikan template ini memang tidak dibutuhkan di automation.",
      confirmLabel: "Ya, hapus template",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          await deleteTemplate(id);
          if (editingTemplateId === id) {
            setTemplateForm(defaultTemplateForm());
            setEditingTemplateId(null);
          }
          setMessage("Template berhasil dihapus.");
          await reloadProtectedData();
        }, "delete-template");
      },
    });
  }

  async function handleManagedUserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateManagedUser(managedUserForm);
    setManagedUserErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    await withFeedback(async () => {
      await createUser(managedUserForm);
      setManagedUserErrors({});
      setManagedUserForm(defaultManagedUserForm());
      setMessage("User baru berhasil ditambahkan.");
      await reloadProtectedData();
    }, "save-user");
  }

  async function handleManagedUserUpdate(item: ManagedUserItem, patch: Partial<ManagedUserItem>) {
    await withFeedback(async () => {
      await updateUser(item.id, {
        role: patch.role ?? item.role,
        is_active: patch.is_active ?? item.is_active,
      });
      setMessage("User berhasil diperbarui.");
      await reloadProtectedData();
    });
  }

  async function handleResetUserPassword(item: ManagedUserItem) {
    setPasswordResetErrors({});
    setPasswordResetState({ user: item, password: "" });
  }

  async function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateSettings(settingsForm);
    setSettingsErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    await withFeedback(async () => {
      await updateSettings(settingsForm);
      setSettingsErrors({});
      setMessage("Pengaturan berhasil disimpan.");
      await reloadProtectedData();
      await refreshHealth();
    }, "save-settings");
  }

  async function handleCreateBackup() {
    await withFeedback(async () => {
      const res = await createBackup();
      setMessage(`Backup berhasil dibuat: ${res.data.filename}`);
      await refreshMonitoringData();
    }, "create-backup");
  }

  async function refreshHealth() {
    const payload = await fetchHealth();
    setHealth(payload);
  }

  async function refreshMonitoringData() {
    setPageLoading(true);
    try {
      const [healthPayload, backupsPayload, auditPayload] = await Promise.all([
        fetchHealth(),
        fetchBackups(),
        user?.role === "admin" ? fetchAuditLogs(25) : Promise.resolve({ data: [] as AuditLogItem[] }),
      ]);
      setHealth(healthPayload);
      setBackups(backupsPayload.data ?? []);
      setAuditLogs(auditPayload.data ?? []);
      setLoadFailure(null);
    } catch (caughtError) {
      setLoadFailure(toErrorMessage(caughtError));
      throw caughtError;
    } finally {
      setPageLoading(false);
    }
  }

  async function handleVerifyBackup(filename: string) {
    await withFeedback(async () => {
      const response = await verifyBackup(filename);
      setMessage(
        response.data.valid
          ? `Backup ${filename} valid. Integrity check: ${response.data.message}`
          : `Backup ${filename} bermasalah: ${response.data.message}`,
      );
    });
  }

  async function handleSimulateRestore(filename: string) {
    await withFeedback(async () => {
      const response = await simulateRestore(filename);
      if (response.data.valid) {
        setRestoreSimulation({ filename, result: response.data });
      } else {
        setMessage(`Simulasi gagal: ${response.data.message}`);
      }
    });
  }

  async function handleApplyRestore() {
    if (!restoreSimulation) return;
    askForConfirmation({
      title: "Terapkan backup ke sistem live",
      body: `Backup ${restoreSimulation.filename} akan menimpa database aktif dan menyebabkan service restart. Jalankan hanya saat maintenance window sudah disetujui.`,
      confirmLabel: "Terapkan restore",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          const response = await applyRestore();
          setMessage(response.message);
          setRestoreSimulation(null);
          setTimeout(() => {
            window.location.reload();
          }, 3000);
        });
      },
    });
  }

  async function handlePasswordResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordResetState) {
      return;
    }
    const nextErrors = validatePasswordReset(passwordResetState.password);
    setPasswordResetErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const target = passwordResetState.user;
    await withFeedback(async () => {
      await resetUserPassword(target.id, passwordResetState.password.trim());
      setPasswordResetErrors({});
      setPasswordResetState(null);
      setMessage(`Password untuk ${target.username} berhasil direset.`);
    });
  }

  async function handleToggleNotifications(billId: number) {
    if (expandedBillId === billId) {
      setExpandedBillId(null);
      return;
    }
    setExpandedBillId(billId);
    
    // Fetch logs if not already loaded
    if (!notificationLogs[billId]) {
      try {
        const res = await fetchBillNotifications(billId);
        setNotificationLogs((prev) => ({ ...prev, [billId]: res.data }));
      } catch (err) {
        console.error("Failed to fetch logs", err);
      }
    }
  }

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
              <StatusPill label={health?.status ?? "offline"} tone={appTone} />
            </div>
            <div className="panel-row">
              <span>Database</span>
              <StatusPill label={health?.services.database ?? "offline"} tone={databaseTone} />
            </div>
            <div className="panel-row">
              <span>Worker</span>
              <StatusPill label={health?.services.worker ?? "unknown"} tone={workerTone} />
            </div>
            <div className="panel-row">
              <span>Environment</span>
              <strong>{health?.app.environment ?? "development"}</strong>
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
              <StatusPill label={health?.status ?? "checking"} tone={appTone} />
              <StatusPill label={`worker ${health?.services.worker ?? "unknown"}`} tone={workerTone} />
              <StatusPill label={`backup ${health?.services.backup ?? "unknown"}`} tone={backupTone} />
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
          health={health}
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
          packages={packages}
          packageForm={packageForm}
          packageErrors={packageErrors}
          editingPackageId={editingPackageId}
          submitting={submitting}
          busyAction={busyAction}
          onFormChange={setPackageForm}
          onSubmit={handlePackageSubmit}
          onEdit={(pkg) => {
            setEditingPackageId(pkg.id);
            setPackageForm({
              name: pkg.name,
              speed_mbps: pkg.speed_mbps,
              price: pkg.price,
              description: pkg.description,
            });
          }}
          onCancelEdit={() => {
            setEditingPackageId(null);
            setPackageForm(defaultPackageForm());
          }}
          onDelete={(id) => void handlePackageDelete(id)}
        />
      ) : null}

      {view === "customers" ? (
        <CustomersPage
          user={user}
          packages={packages}
          customers={customers}
          filteredCustomers={filteredCustomers}
          customerForm={customerForm}
          customerErrors={customerErrors}
          editingCustomerId={editingCustomerId}
          customerLifecycleFilter={customerLifecycleFilter}
          customerLifecycleMap={customerLifecycleMap}
          submitting={submitting}
          busyAction={busyAction}
          onFormChange={setCustomerForm}
          onFilterChange={(filter) => setCustomerLifecycleFilter(filter as CustomerLifecycleFilter)}
          onSubmit={handleCustomerSubmit}
          onStatusChange={(id, status) => void handleStatusChange(id, status)}
          onEdit={(customer) => {
            setEditingCustomerId(customer.id);
            setCustomerForm({
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
            setEditingCustomerId(null);
            setCustomerForm(defaultCustomerForm());
          }}
        />
      ) : null}

      {view === "bills" ? (
        <BillsPage
          user={user}
          bills={bills}
          billPeriod={billPeriod}
          billErrors={billErrors}
          submitting={submitting}
          busyAction={busyAction}
          expandedBillId={expandedBillId}
          notificationLogs={notificationLogs}
          proofFiles={proofFiles}
          onBillPeriodChange={setBillPeriod}
          onGenerateBills={handleGenerateBills}
          onMarkBillPaid={(id) => void handleMarkBillPaid(id)}
          onToggleNotifications={(id) => void handleToggleNotifications(id)}
          onProofFileChange={(id, file) =>
            setProofFiles((current) => ({
              ...current,
              [id]: file,
            }))
          }
          onUploadProof={(id) => void handleUploadProof(id)}
        />
      ) : null}

      {view === "templates" ? (
        <TemplatesPage
          templates={templates}
          templateForm={templateForm}
          templateErrors={templateErrors}
          editingTemplateId={editingTemplateId}
          submitting={submitting}
          busyAction={busyAction}
          onFormChange={setTemplateForm}
          onSubmit={handleTemplateSubmit}
          onEdit={(item) => {
            setEditingTemplateId(item.id);
            setTemplateForm({
              name: item.name,
              trigger_key: item.trigger_key,
              content: item.content,
              is_active: item.is_active,
            });
          }}
          onCancelEdit={() => {
            setEditingTemplateId(null);
            setTemplateForm(defaultTemplateForm());
          }}
          onDelete={(id) => void handleTemplateDelete(id)}
        />
      ) : null}

      {view === "monitoring" ? (
        <MonitoringPage
          health={health}
          backups={backups}
          restoreSimulation={restoreSimulation}
          submitting={submitting}
          busyAction={busyAction}
          appTone={appTone}
          databaseTone={databaseTone}
          workerTone={workerTone}
          backupTone={backupTone}
          schedulerTone={schedulerTone}
          onRefresh={() => void withFeedback(refreshMonitoringData)}
          onCreateBackup={() => void handleCreateBackup()}
          onVerifyBackup={(filename) => void handleVerifyBackup(filename)}
          onSimulateRestore={(filename) => void handleSimulateRestore(filename)}
          onApplyRestore={() => void handleApplyRestore()}
          onCancelRestore={() => setRestoreSimulation(null)}
        />
      ) : null}

      {view === "settings" ? (
        <SettingsPage
          settingsForm={settingsForm}
          settingsErrors={settingsErrors}
          submitting={submitting}
          busyAction={busyAction}
          onFormChange={setSettingsForm}
          onSubmit={handleSettingsSubmit}
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
          managedUsers={managedUsers}
          managedUserForm={managedUserForm}
          managedUserErrors={managedUserErrors}
          submitting={submitting}
          busyAction={busyAction}
          onFormChange={setManagedUserForm}
          onSubmit={handleManagedUserSubmit}
          onUpdateRole={(item, role) => void handleManagedUserUpdate(item, { role })}
          onUpdateStatus={(item, isActive) => void handleManagedUserUpdate(item, { is_active: isActive })}
          onResetPassword={(item) => void handleResetUserPassword(item)}
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

      {passwordResetState ? (
        <Modal
          title={`Reset password ${passwordResetState.user.username}`}
          onClose={() => setPasswordResetState(null)}
          actions={
            <>
              <button type="button" className="secondary-button" onClick={() => setPasswordResetState(null)}>
                Batal
              </button>
              <button type="submit" form="password-reset-form" className="primary-button" disabled={submitting}>
                Simpan Password Baru
              </button>
            </>
          }
        >
          <form id="password-reset-form" className="form-grid single-column-grid" onSubmit={handlePasswordResetSubmit}>
            <label>
              <span>Password Baru</span>
              <input
                type="password"
                minLength={8}
                className={inputClassName(passwordResetErrors.password)}
                autoFocus
                value={passwordResetState.password}
                onChange={(event) =>
                  setPasswordResetState((current) =>
                    current ? { ...current, password: event.target.value } : current,
                  )
                }
              />
              {renderInlineError(passwordResetErrors.password)}
            </label>
            <p className="muted">Minimal 8 karakter. Password lama akan langsung digantikan setelah disimpan.</p>
          </form>
        </Modal>
      ) : null}

      <ToastStack toasts={toasts} />
    </main>
  );
}



