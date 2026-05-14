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
import { Bar, Pie } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

type ViewKey =
  | "dashboard"
  | "packages"
  | "customers"
  | "bills"
  | "templates"
  | "monitoring"
  | "audit"
  | "users"
  | "settings";

type PackageFormState = {
  name: string;
  speed_mbps: number;
  price: number;
  description: string;
};

type CustomerFormState = {
  name: string;
  package_id: number;
  user_pppoe: string;
  password_pppoe: string;
  whatsapp: string;
  sn_ont: string;
  due_day: number;
  status: CustomerItem["status"];
  address: string;
};

type TemplateFormState = {
  name: string;
  trigger_key: string;
  content: string;
  is_active: boolean;
};

type ManagedUserFormState = {
  username: string;
  password: string;
  role: string;
};

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

type FieldErrors = Record<string, string>;

type ToastItem = {
  id: number;
  tone: "success" | "error" | "warning";
  message: string;
};

type CustomerTrialFilter = "all" | "active" | "completed" | "none";

const summaryCards = [
  { key: "total_pelanggan", label: "Total Pelanggan", note: "Basis pelanggan yang tercatat di database operasional." },
  { key: "total_active", label: "Status Active", note: "Layanan normal yang bisa dipantau tanpa tindakan isolir." },
  { key: "total_limit", label: "Status Limit", note: "Pelanggan yang perlu follow-up karena pembatasan layanan." },
  { key: "total_tagihan_belum_bayar", label: "Tagihan Belum Bayar", note: "Piutang berjalan yang masih perlu ditagih." },
] as const;

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

const defaultPackageForm = (): PackageFormState => ({
  name: "",
  speed_mbps: 10,
  price: 150000,
  description: "",
});

const defaultCustomerForm = (): CustomerFormState => ({
  name: "",
  package_id: 0,
  user_pppoe: "",
  password_pppoe: "",
  whatsapp: "",
  sn_ont: "",
  due_day: 8,
  status: "active",
  address: "",
});

const defaultTemplateForm = (): TemplateFormState => ({
  name: "",
  trigger_key: "",
  content: "",
  is_active: true,
});

const defaultManagedUserForm = (): ManagedUserFormState => ({
  username: "",
  password: "",
  role: "petugas",
});

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
  const [backups, setBackups] = useState<Array<{ filename: string; size: number; mod_time: string }>>([]);
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
  const [customerTrialFilter, setCustomerTrialFilter] = useState<CustomerTrialFilter>(() => readCustomerTrialFilter());
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
  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        const trialState = getCustomerTrialState(customer);
        if (customerTrialFilter === "active") {
          return trialState === "active";
        }
        if (customerTrialFilter === "completed") {
          return trialState === "completed";
        }
        if (customerTrialFilter === "none") {
          return trialState === "none";
        }
        return true;
      }),
    [customerTrialFilter, customers],
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
    window.localStorage.setItem("customers.trialFilter", customerTrialFilter);
  }, [customerTrialFilter]);

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
        <>
          <section className="grid stats-grid">
            {pageLoading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : (
              summaryCards.map((card) => (
                <article key={card.key} className="stat-card">
                  <span>{card.label}</span>
                  <strong>{summary?.[card.key] ?? 0}</strong>
                  <p className="stat-note">{card.note}</p>
                </article>
              ))
            )}
          </section>

          <section className="grid quick-actions-grid">
            <article className="surface action-card">
              <div>
                <p className="eyebrow">Aksi Cepat</p>
                <h2>Operasional Hari Ini</h2>
                <p className="muted">Lihat kesehatan sistem, generate tagihan, dan pantau tunggakan dari satu area.</p>
              </div>
              <div className="button-row">
                <button type="button" className="primary-button" onClick={() => switchView("bills")}>
                  Buka Tagihan
                </button>
                <button type="button" className="ghost-button" onClick={() => switchView("monitoring")}>
                  Buka Monitoring
                </button>
              </div>
            </article>
            <article className="surface action-card">
              <div>
                <p className="eyebrow">Scheduler</p>
                <h2>Run Berikutnya</h2>
                <p className="muted">
                  {health?.scheduler.billing_next_run
                    ? `Auto billing berikutnya dijadwalkan pada ${formatDateTime(health.scheduler.billing_next_run)}.`
                    : "Jadwal billing otomatis belum tercatat."}
                </p>
              </div>
              <StatusPill
                label={health?.scheduler.billing_last_error ? "attention" : "scheduled"}
                tone={health?.scheduler.billing_last_error ? "gold" : "green"}
              />
            </article>
          </section>

          <section className="grid detail-grid">
            <article className="surface">
              <div className="section-heading">
                <h2>Service Snapshot</h2>
                <StatusPill label={health?.status ?? "checking"} tone={appTone} />
              </div>
              <dl className="meta-list">
                <div>
                  <dt>App Name</dt>
                  <dd>{health?.app.name ?? "-"}</dd>
                </div>
                <div>
                  <dt>Environment</dt>
                  <dd>{health?.app.environment ?? "-"}</dd>
                </div>
                <div>
                  <dt>Last Health Check</dt>
                  <dd>{health?.timestamp ?? "-"}</dd>
                </div>
                <div>
                  <dt>Worker Heartbeat</dt>
                  <dd>{formatDateTime(health?.worker.last_heartbeat)}</dd>
                </div>
              </dl>
            </article>

            {user?.role === "admin" && (
              <article className="surface" style={{ gridColumn: "1 / -1" }}>
                <div className="section-heading">
                  <h2>Laporan Tagihan</h2>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
                  <div>
                    <h3>Pendapatan Bulanan</h3>
                    {revenue.length > 0 ? (
                      <Bar
                        data={{
                          labels: [...revenue].reverse().map((r) => r.period),
                          datasets: [
                            {
                              label: "Total Tagihan",
                              data: [...revenue].reverse().map((r) => r.total_billed),
                              backgroundColor: "rgba(99, 102, 241, 0.5)",
                              borderColor: "rgba(99, 102, 241, 1)",
                              borderWidth: 1,
                            },
                            {
                              label: "Total Lunas",
                              data: [...revenue].reverse().map((r) => r.total_paid),
                              backgroundColor: "rgba(34, 197, 94, 0.5)",
                              borderColor: "rgba(34, 197, 94, 1)",
                              borderWidth: 1,
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          plugins: { legend: { position: "bottom" } },
                        }}
                      />
                    ) : (
                      <p className="muted">Belum ada data pendapatan.</p>
                    )}
                  </div>
                  <div>
                    <h3>Aging Piutang (Belum Bayar)</h3>
                    {aging && (aging.current > 0 || aging.days_1_30 > 0 || aging.days_31_60 > 0 || aging.over_60 > 0) ? (
                      <div style={{ maxWidth: "300px", margin: "0 auto" }}>
                        <Pie
                          data={{
                            labels: ["Current", "1-30 Hari", "31-60 Hari", ">60 Hari"],
                            datasets: [
                              {
                                data: [aging.current, aging.days_1_30, aging.days_31_60, aging.over_60],
                                backgroundColor: [
                                  "rgba(59, 130, 246, 0.7)",
                                  "rgba(234, 179, 8, 0.7)",
                                  "rgba(249, 115, 22, 0.7)",
                                  "rgba(239, 68, 68, 0.7)",
                                ],
                                borderWidth: 1,
                              },
                            ],
                          }}
                          options={{
                            responsive: true,
                            plugins: { legend: { position: "bottom" } },
                          }}
                        />
                      </div>
                    ) : (
                      <p className="muted" style={{ textAlign: "center", paddingTop: "2rem" }}>
                        Tidak ada tunggakan berjalan.
                      </p>
                    )}
                  </div>
                </div>
              </article>
            )}
          </section>
        </>
      ) : null}

      {view === "packages" ? (
        <section className="grid feature-grid">
          <article className="surface">
            <div className="section-heading">
              <h2>{editingPackageId ? "Edit Paket" : "Tambah Paket"}</h2>
            </div>
            <form className="form-grid" onSubmit={handlePackageSubmit}>
              <label>
                <span>Nama Paket</span>
                <input
                  className={inputClassName(packageErrors.name)}
                  value={packageForm.name}
                  onChange={(event) =>
                    setPackageForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
                {renderInlineError(packageErrors.name)}
              </label>
              <label>
                <span>Kecepatan (Mbps)</span>
                <input
                  className={inputClassName(packageErrors.speed_mbps)}
                  type="number"
                  min={1}
                  value={packageForm.speed_mbps}
                  onChange={(event) =>
                    setPackageForm((current) => ({
                      ...current,
                      speed_mbps: Number(event.target.value),
                    }))
                  }
                />
                {renderInlineError(packageErrors.speed_mbps)}
              </label>
              <label>
                <span>Harga</span>
                <input
                  className={inputClassName(packageErrors.price)}
                  type="number"
                  min={0}
                  value={packageForm.price}
                  onChange={(event) =>
                    setPackageForm((current) => ({
                      ...current,
                      price: Number(event.target.value),
                    }))
                  }
                />
                {renderInlineError(packageErrors.price)}
              </label>
              <label>
                <span>Deskripsi</span>
                <textarea
                  rows={4}
                  value={packageForm.description}
                  onChange={(event) =>
                    setPackageForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="button-row">
                <button className="primary-button" disabled={submitting}>
                  {isBusy("save-package") ? "Menyimpan..." : editingPackageId ? "Update Paket" : "Simpan Paket"}
                </button>
                {editingPackageId ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingPackageId(null);
                      setPackageForm(defaultPackageForm());
                    }}
                  >
                    Batal Edit
                  </button>
                ) : null}
              </div>
            </form>
          </article>

          <article className="surface">
            <div className="section-heading">
              <h2>Daftar Paket</h2>
              <StatusPill label={`${packages.length} item`} tone="slate" />
            </div>
            <DataPackageTable
              packages={packages}
              onEdit={(pkg) => {
                setEditingPackageId(pkg.id);
                setPackageForm({
                  name: pkg.name,
                  speed_mbps: pkg.speed_mbps,
                  price: pkg.price,
                  description: pkg.description,
                });
              }}
              onDelete={(id) => void handlePackageDelete(id)}
            />
          </article>
        </section>
      ) : null}

      {view === "customers" ? (
        <section className="grid feature-grid">
          {user?.role !== "viewer" && (
            <article className="surface">
              <div className="section-heading">
              <h2>{editingCustomerId ? "Edit Pelanggan" : "Tambah Pelanggan"}</h2>
            </div>
            <form className="form-grid" onSubmit={handleCustomerSubmit}>
              <label>
                <span>Nama</span>
                <input
                  className={inputClassName(customerErrors.name)}
                  value={customerForm.name}
                  onChange={(event) =>
                    setCustomerForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
                {renderInlineError(customerErrors.name)}
              </label>
              <label>
                <span>Paket</span>
                <select
                  className={inputClassName(customerErrors.package_id)}
                  value={customerForm.package_id}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      package_id: Number(event.target.value),
                    }))
                  }
                >
                  <option value={0}>Pilih paket</option>
                  {packageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {renderInlineError(customerErrors.package_id)}
              </label>
              <label>
                <span>User PPPoE</span>
                <input
                  className={inputClassName(customerErrors.user_pppoe)}
                  value={customerForm.user_pppoe}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      user_pppoe: event.target.value,
                    }))
                  }
                />
                {renderInlineError(customerErrors.user_pppoe)}
              </label>
              <label>
                <span>Password PPPoE</span>
                <input
                  className={inputClassName(customerErrors.password_pppoe)}
                  value={customerForm.password_pppoe}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      password_pppoe: event.target.value,
                    }))
                  }
                />
                {renderInlineError(customerErrors.password_pppoe)}
              </label>
              <label>
                <span>Nomor WhatsApp</span>
                <input
                  value={customerForm.whatsapp}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      whatsapp: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>SN ONT</span>
                <input
                  value={customerForm.sn_ont}
                  onChange={(event) =>
                    setCustomerForm((current) => ({ ...current, sn_ont: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Tanggal Jatuh Tempo Bulanan</span>
                <input
                  className={inputClassName(customerErrors.due_day)}
                  type="number"
                  min={1}
                  max={31}
                  value={customerForm.due_day}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      due_day: Number(event.target.value),
                    }))
                  }
                />
                {renderInlineError(customerErrors.due_day)}
              </label>
              <label>
                <span>Status</span>
                <select
                  value={customerForm.status}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      status: event.target.value as CustomerItem["status"],
                    }))
                  }
                >
                  <option value="active">Active</option>
                  <option value="limit">Limit</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label className="full-width">
                <span>Alamat</span>
                <textarea
                  rows={4}
                  value={customerForm.address}
                  onChange={(event) =>
                    setCustomerForm((current) => ({ ...current, address: event.target.value }))
                  }
                />
              </label>
              <div className="button-row">
                <button className="primary-button" disabled={submitting}>
                  {isBusy("save-customer") ? "Menyimpan..." : editingCustomerId ? "Update Pelanggan" : "Simpan Pelanggan"}
                </button>
                {editingCustomerId ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingCustomerId(null);
                      setCustomerForm(defaultCustomerForm());
                    }}
                  >
                    Batal Edit
                  </button>
                ) : null}
              </div>
            </form>
          </article>
          )}

          <article className="surface">
            <div className="section-heading">
              <div>
                <h2>Daftar Pelanggan</h2>
                <p className="section-copy">Pantau trial aktif, trial selesai, dan pelanggan reguler tanpa buka detail satu per satu.</p>
              </div>
              <div className="section-heading-actions">
                <label className="toolbar-field">
                  <span>Filter Trial</span>
                  <select
                    value={customerTrialFilter}
                    onChange={(event) => setCustomerTrialFilter(event.target.value as CustomerTrialFilter)}
                    aria-label="Filter status trial pelanggan"
                  >
                    <option value="all">Semua</option>
                    <option value="active">Trial Aktif</option>
                    <option value="completed">Trial Selesai</option>
                    <option value="none">Non-Trial</option>
                  </select>
                </label>
                <StatusPill label={`${filteredCustomers.length} item`} tone="slate" />
              </div>
            </div>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Paket</th>
                    <th>Jatuh Tempo</th>
                    <th>Trial</th>
                    <th>Status</th>
                    <th>WA</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <span className="muted">
                          {customers.length === 0
                            ? "Belum ada pelanggan terdaftar."
                            : "Tidak ada pelanggan yang cocok dengan filter trial saat ini."}
                        </span>
                      </td>
                    </tr>
                  ) : filteredCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.name}</td>
                      <td>{customer.package_name ?? "-"}</td>
                      <td>Tanggal {customer.due_day}</td>
                      <td>
                        <div className="meta-stack">
                          <StatusPill
                            label={trialStatusLabel(customer)}
                            tone={trialStatusTone(customer)}
                          />
                          <span className="muted">
                            {trialDateCopy(customer)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <select
                          value={customer.status}
                          onChange={(event) =>
                            void handleStatusChange(
                              customer.id,
                              event.target.value as CustomerItem["status"],
                            )
                          }
                        >
                          <option value="active">Active</option>
                          <option value="limit">Limit</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </td>
                      <td>{customer.whatsapp || "-"}</td>
                      <td>
                        {user?.role !== "viewer" && (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => {
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
                        >
                          Edit
                        </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {view === "bills" ? (
        <section className="grid feature-grid">
          {user?.role !== "viewer" && (
            <article className="surface">
              <div className="section-heading">
                <h2>Generate Tagihan</h2>
              </div>
              <form className="form-grid" onSubmit={handleGenerateBills}>
                <label>
                  <span>Periode (YYYY-MM)</span>
                  <input
                    className={inputClassName(billErrors.period)}
                    value={billPeriod}
                    onChange={(event) => setBillPeriod(event.target.value)}
                    placeholder="2026-04"
                  />
                  {renderInlineError(billErrors.period)}
                </label>
                <div className="button-row">
                  <button className="primary-button" disabled={submitting}>
                    {isBusy("generate-bills") ? "Menghasilkan..." : "Generate Sekarang"}
                  </button>
                </div>
              </form>
              <p className="muted top-gap">
                Generate hanya akan membuat tagihan untuk pelanggan `active` dan `limit`
                yang belum punya tagihan di periode tersebut.
              </p>
            </article>
          )}

          <article className="surface">
            <div className="section-heading">
              <h2>Daftar Tagihan</h2>
              <StatusPill label={`${bills.length} item`} tone="slate" />
            </div>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Pelanggan</th>
                    <th>Periode</th>
                    <th>Jatuh Tempo</th>
                    <th>Nominal</th>
                    <th>Status</th>
                    <th>Bukti</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <span className="muted">Belum ada tagihan untuk ditampilkan pada database ini.</span>
                      </td>
                    </tr>
                  ) : bills.map((bill) => (
                    <Fragment key={bill.id}>
                      <tr>
                        <td>{bill.invoice_number}</td>
                        <td>{bill.customer_name}</td>
                        <td>{bill.period}</td>
                        <td>{bill.due_date}</td>
                        <td>{formatCurrency(bill.amount)}</td>
                        <td>
                          <StatusPill
                            label={displayStatusLabel(bill.display_status)}
                            tone={displayStatusTone(bill.display_status)}
                          />
                        </td>
                        <td>
                          {bill.proof_path ? (
                            <a href={bill.proof_path} target="_blank" rel="noreferrer">
                              Lihat bukti
                            </a>
                          ) : (
                            <span className="muted">Belum ada</span>
                          )}
                        </td>
                        <td>
                          <div className="stack-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => window.open(`/api/v1/bills/${bill.id}/invoice`, "_blank")}
                            >
                              Invoice
                            </button>
                            {user?.role !== "viewer" && bill.status === "belum_bayar" ? (
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => void handleMarkBillPaid(bill.id)}
                              >
                                Tandai Lunas
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => void handleToggleNotifications(bill.id)}
                            >
                              Log WA
                            </button>
                            {user?.role !== "viewer" && (
                              <>
                                <input
                                  type="file"
                                  accept=".jpg,.jpeg,.png,.pdf,.webp"
                                  onChange={(event) =>
                                    setProofFiles((current) => ({
                                      ...current,
                                      [bill.id]: event.target.files?.[0] ?? null,
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => void handleUploadProof(bill.id)}
                                >
                                  {isBusy("upload-proof") ? "Mengunggah..." : "Upload Bukti"}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedBillId === bill.id && (
                        <tr className="expanded-row">
                          <td colSpan={8}>
                            <div className="expanded-content p-4">
                              <h4>Riwayat Notifikasi</h4>
                              {notificationLogs[bill.id]?.length ? (
                                <table className="compact-table mt-2" style={{width: '100%'}}>
                                  <thead>
                                    <tr>
                                      <th style={{textAlign: 'left'}}>Waktu</th>
                                      <th style={{textAlign: 'left'}}>Tujuan</th>
                                      <th style={{textAlign: 'left'}}>Trigger</th>
                                      <th style={{textAlign: 'left'}}>Status</th>
                                      <th style={{textAlign: 'left'}}>Response</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {notificationLogs[bill.id].map((log) => (
                                      <tr key={log.id}>
                                        <td>{new Date(log.created_at).toLocaleString()}</td>
                                        <td>{log.sent_to}</td>
                                        <td>{log.trigger_key}</td>
                                        <td><StatusPill label={log.status} tone={log.status === "sent" ? "green" : "slate"} /></td>
                                        <td>{log.response_message}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="muted mt-2">Belum ada riwayat notifikasi WhatsApp.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {view === "templates" ? (
        <section className="grid feature-grid">
          <article className="surface">
            <div className="section-heading">
              <h2>{editingTemplateId ? "Edit Template" : "Tambah Template"}</h2>
            </div>
            <form className="form-grid" onSubmit={handleTemplateSubmit}>
              <label>
                <span>Nama Template</span>
                <input
                  className={inputClassName(templateErrors.name)}
                  value={templateForm.name}
                  onChange={(event) =>
                    setTemplateForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
                {renderInlineError(templateErrors.name)}
              </label>
              <label>
                <span>Trigger Key</span>
                <input
                  className={inputClassName(templateErrors.trigger_key)}
                  value={templateForm.trigger_key}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      trigger_key: event.target.value,
                    }))
                  }
                  placeholder="contoh: reminder_custom"
                />
                {renderInlineError(templateErrors.trigger_key)}
              </label>
              <label className="full-width">
                <span>Isi Template</span>
                <textarea
                  className={inputClassName(templateErrors.content)}
                  rows={8}
                  value={templateForm.content}
                  onChange={(event) =>
                    setTemplateForm((current) => ({ ...current, content: event.target.value }))
                  }
                />
                {renderInlineError(templateErrors.content)}
              </label>
              <label>
                <span>Status</span>
                <select
                  value={templateForm.is_active ? "1" : "0"}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      is_active: event.target.value === "1",
                    }))
                  }
                >
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </label>
              <div className="button-row">
                <button className="primary-button" disabled={submitting}>
                  {isBusy("save-template") ? "Menyimpan..." : editingTemplateId ? "Update Template" : "Simpan Template"}
                </button>
                {editingTemplateId ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingTemplateId(null);
                      setTemplateForm(defaultTemplateForm());
                    }}
                  >
                    Batal Edit
                  </button>
                ) : null}
              </div>
            </form>
            <p className="muted top-gap">
              Placeholder dasar yang didukung: `{"{nama}"}`, `{"{periode}"}`, `{"{jatuh_tempo}"}`,
              `{"{invoice_number}"}`, `{"{nominal}"}`, `{"{hari_limit}"}`.
            </p>
          </article>

          <article className="surface">
            <div className="section-heading">
              <h2>Daftar Template</h2>
              <StatusPill label={`${templates.length} item`} tone="slate" />
            </div>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Isi</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <span className="muted">Belum ada template WhatsApp yang tersimpan.</span>
                      </td>
                    </tr>
                  ) : templates.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.trigger_key}</td>
                      <td>
                        <StatusPill label={item.is_active ? "active" : "inactive"} tone={item.is_active ? "green" : "slate"} />
                      </td>
                      <td>{item.content}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => {
                              setEditingTemplateId(item.id);
                              setTemplateForm({
                                name: item.name,
                                trigger_key: item.trigger_key,
                                content: item.content,
                                is_active: item.is_active,
                              });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ghost-button danger-button"
                            onClick={() => void handleTemplateDelete(item.id)}
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {view === "monitoring" ? (
        <section className="grid">
          <article className="surface">
            <div className="section-heading">
              <h2>Monitoring Sistem</h2>
              <div className="table-actions">
                <StatusPill label={health?.status ?? "checking"} tone={appTone} />
                <button
                  type="button"
                  className="ghost-button"
                  disabled={submitting}
                  onClick={() => void withFeedback(refreshMonitoringData)}
                >
                  {submitting && !busyAction ? "Memproses..." : "Refresh Status"}
                </button>
              </div>
            </div>
            <div className="monitor-grid">
              <article className="monitor-card">
                <span>Database</span>
                <strong>{health?.services.database ?? "unknown"}</strong>
                <StatusPill label={health?.services.database ?? "unknown"} tone={databaseTone} />
              </article>
              <article className="monitor-card">
                <span>Worker</span>
                <strong>{health?.services.worker ?? "unknown"}</strong>
                <StatusPill label={health?.services.worker ?? "unknown"} tone={workerTone} />
              </article>
              <article className="monitor-card">
                <span>Backup Otomatis</span>
                <strong>{health?.services.backup ?? "unknown"}</strong>
                <StatusPill label={health?.services.backup ?? "unknown"} tone={backupTone} />
              </article>
              <article className="monitor-card">
                <span>Scheduler Billing</span>
                <strong>{health?.scheduler.billing_auto_enabled ? "aktif" : "nonaktif"}</strong>
                <StatusPill
                  label={health?.scheduler.billing_last_error ? "error" : health?.scheduler.billing_auto_enabled ? "scheduled" : "disabled"}
                  tone={schedulerTone}
                />
              </article>
              <article className="monitor-card">
                <span>Integrasi</span>
                <strong>{integrationSummary(health)}</strong>
                <StatusPill
                  label={
                    health?.integrations.whatsapp_configured ||
                    health?.integrations.discord_configured ||
                    health?.integrations.mikrotik_configured
                      ? "configured"
                      : "pending"
                  }
                  tone={
                    health?.integrations.whatsapp_configured ||
                    health?.integrations.discord_configured ||
                    health?.integrations.mikrotik_configured
                      ? "green"
                      : "gold"
                  }
                />
              </article>
            </div>
          </article>

          <section className="grid detail-grid">
            <article className="surface">
              <div className="section-heading">
                <h2>Worker Detail</h2>
              </div>
              <dl className="meta-list">
                <div>
                  <dt>Last Heartbeat</dt>
                  <dd>{formatDateTime(health?.worker.last_heartbeat)}</dd>
                </div>
                <div>
                  <dt>Worker Interval</dt>
                  <dd>{health?.worker.interval_seconds ?? 0} detik</dd>
                </div>
                <div>
                  <dt>Last Health Check</dt>
                  <dd>{formatDateTime(health?.timestamp)}</dd>
                </div>
                <div>
                  <dt>Last Cycle</dt>
                  <dd>{formatDateTime(health?.worker.last_cycle_at)}</dd>
                </div>
                <div>
                  <dt>Cycle Error</dt>
                  <dd>{health?.worker.last_cycle_error || "Tidak ada"}</dd>
                </div>
              </dl>
            </article>

            <article className="surface">
              <div className="section-heading">
                <h2>Backup Policy</h2>
              </div>
              <dl className="meta-list">
                <div>
                  <dt>Status</dt>
                  <dd>{health?.backup.enabled ? "Aktif" : "Nonaktif"}</dd>
                </div>
                <div>
                  <dt>Jadwal Harian</dt>
                  <dd>{health?.backup.scheduled_time ?? "-"}</dd>
                </div>
                <div>
                  <dt>Retensi</dt>
                  <dd>{health?.backup.retention_count ?? 0} file</dd>
                </div>
                <div>
                  <dt>Backup Terakhir</dt>
                  <dd>{health?.backup.last_filename ? `${health.backup.last_filename} (${health.backup.last_run_date})` : "Belum ada"}</dd>
                </div>
              </dl>
            </article>
          </section>

          <section className="grid detail-grid">
            <article className="surface">
              <div className="section-heading">
                <h2>Scheduler Billing</h2>
              </div>
              <dl className="meta-list">
                <div>
                  <dt>Status</dt>
                  <dd>{health?.scheduler.billing_auto_enabled ? "Aktif" : "Nonaktif"}</dd>
                </div>
                <div>
                  <dt>Jadwal Generate</dt>
                  <dd>
                    Tanggal {health?.scheduler.billing_generate_day ?? 1} pukul {health?.scheduler.billing_generate_time ?? "00:05"}
                  </dd>
                </div>
                <div>
                  <dt>Next Run</dt>
                  <dd>{formatDateTime(health?.scheduler.billing_next_run)}</dd>
                </div>
                <div>
                  <dt>Last Attempt</dt>
                  <dd>{formatDateTime(health?.scheduler.billing_last_attempt_at)}</dd>
                </div>
                <div>
                  <dt>Last Success</dt>
                  <dd>
                    {health?.scheduler.billing_last_success_period
                      ? `${health.scheduler.billing_last_success_period} (${formatDateTime(health.scheduler.billing_last_run_at)})`
                      : "Belum ada"}
                  </dd>
                </div>
                <div>
                  <dt>Tagihan Dibuat Terakhir</dt>
                  <dd>{health?.scheduler.billing_last_generated_count ?? 0}</dd>
                </div>
                <div>
                  <dt>Retry Policy</dt>
                  <dd>
                    {health?.scheduler.billing_retry_attempts ?? 0} percobaan / backoff {health?.scheduler.billing_retry_backoff_seconds ?? 0} detik
                  </dd>
                </div>
                <div>
                  <dt>Last Error</dt>
                  <dd>{health?.scheduler.billing_last_error || "Tidak ada"}</dd>
                </div>
              </dl>
            </article>

            <article className="surface">
              <div className="section-heading">
                <h2>Database Integrity</h2>
              </div>
              <dl className="meta-list">
                <div>
                  <dt>Quick Check</dt>
                  <dd>{health?.database.quick_check.status ?? "unknown"}</dd>
                </div>
                <div>
                  <dt>Pesan</dt>
                  <dd>{health?.database.quick_check.message ?? "-"}</dd>
                </div>
              </dl>
            </article>
          </section>

          <article className="surface">
            <div className="section-heading">
              <h2>Backup Database</h2>
              <StatusPill label={`${backups.length} backup tersedia`} tone="slate" />
            </div>
            <div className="button-row" style={{ marginBottom: "1rem" }}>
                <button
                  type="button"
                  className="primary-button"
                  disabled={submitting}
                  onClick={() => void handleCreateBackup()}
                >
                {isBusy("create-backup") ? "Membuat backup..." : "Backup Sekarang"}
                </button>
            </div>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Ukuran</th>
                    <th>Waktu</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.length === 0 ? (
                    <tr><td colSpan={4}><span className="muted">Belum ada backup.</span></td></tr>
                  ) : backups.map((b) => (
                    <tr key={b.filename}>
                      <td>{b.filename}</td>
                      <td>{(b.size / 1024).toFixed(1)} KB</td>
                      <td>{formatDateTime(b.mod_time)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => void handleVerifyBackup(b.filename)}
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => void handleSimulateRestore(b.filename)}
                          >
                            Simulasi Restore
                          </button>
                          <a className="ghost-button" href={getBackupDownloadUrl(b.filename)} download>
                            Download
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {restoreSimulation && (
              <div className="top-gap" style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", backgroundColor: "var(--surface)" }}>
                <h3>Simulasi Restore: {restoreSimulation.filename}</h3>
                <p>Status: {restoreSimulation.result.valid ? <span style={{ color: "var(--success)" }}>Valid</span> : "Invalid"}</p>
                <p>Pesan: {restoreSimulation.result.message}</p>
                <ul>
                  <li>Total Users: {restoreSimulation.result.total_users}</li>
                  <li>Total Pelanggan: {restoreSimulation.result.total_pelanggan}</li>
                  <li>Total Tagihan: {restoreSimulation.result.total_tagihan}</li>
                </ul>
                <div className="button-row top-gap">
                  <button type="button" className="danger-button" onClick={() => void handleApplyRestore()}>
                    Apply to Live (Restart)
                  </button>
                  <button type="button" className="ghost-button" onClick={() => setRestoreSimulation(null)}>
                    Batal
                  </button>
                </div>
              </div>
            )}
          </article>

          <article className="surface">
            <div className="section-heading">
              <h2>Alert Operasional</h2>
              <StatusPill label={`${health?.alerts?.length ?? 0} alert`} tone={health?.alerts?.length ? "gold" : "green"} />
            </div>
            {!health?.alerts?.length ? (
              <p className="muted">Tidak ada alert operasional dari health check saat ini.</p>
            ) : (
              <ul className="simple-list">
                {health.alerts.map((alert, idx) => (
                  <li key={`${idx}-${alert}`}>{alert}</li>
                ))}
              </ul>
            )}
          </article>
        </section>
      ) : null}

      {view === "settings" ? (
        <section className="grid">
          <article className="surface">
            <div className="section-heading">
              <h2>Pengaturan Sistem</h2>
              <p>Konfigurasi WhatsApp, Discord, billing rule, worker, dan kebijakan backup.</p>
            </div>
            <form className="form-grid" onSubmit={handleSettingsSubmit}>
              <div className="form-group-title"><h4>WhatsApp Gateway</h4></div>

              <label>
                <span>Gateway URL</span>
                <input
                  type="text"
                  value={settingsForm["wa_gateway_url"] ?? ""}
                  onChange={(e) => setSettingsForm({ ...settingsForm, wa_gateway_url: e.target.value })}
                  placeholder="https://api.gateway.com/v1/messages"
                />
              </label>
              <label>
                <span>API Key</span>
                <input
                  type="text"
                  value={settingsForm["wa_api_key"] ?? ""}
                  onChange={(e) => setSettingsForm({ ...settingsForm, wa_api_key: e.target.value })}
                />
              </label>
              <label>
                <span>Account ID / Device ID</span>
                <input
                  type="text"
                  value={settingsForm["wa_account_id"] ?? ""}
                  onChange={(e) => setSettingsForm({ ...settingsForm, wa_account_id: e.target.value })}
                />
              </label>

              <div className="form-group-title" style={{ marginTop: "1rem" }}><h4>Discord Notifications</h4></div>

              <label className="full-width">
                <span>Webhook URL</span>
                <input
                  type="text"
                  value={settingsForm["discord_webhook_url"] ?? ""}
                  onChange={(e) => setSettingsForm({ ...settingsForm, discord_webhook_url: e.target.value })}
                  placeholder="https://discord.com/api/webhooks/..."
                />
              </label>
              <label>
                <span>Notif Pembayaran Lunas</span>
                <select
                  value={settingsForm["discord_notify_payment"] ?? "1"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, discord_notify_payment: e.target.value })}
                >
                  <option value="1">Aktif</option>
                  <option value="0">Nonaktif</option>
                </select>
              </label>
              <label>
                <span>Notif Generate Tagihan</span>
                <select
                  value={settingsForm["discord_notify_generate"] ?? "1"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, discord_notify_generate: e.target.value })}
                >
                  <option value="1">Aktif</option>
                  <option value="0">Nonaktif</option>
                </select>
              </label>
              <label>
                <span>Notif Worker (Reminder / Limit / Backup)</span>
                <select
                  value={settingsForm["discord_notify_worker"] ?? "1"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, discord_notify_worker: e.target.value })}
                >
                  <option value="1">Aktif</option>
                  <option value="0">Nonaktif</option>
                </select>
              </label>

              <div className="form-group-title" style={{ marginTop: "1rem" }}><h4>Billing Rules & Worker</h4></div>

              <label>
                <span>Reminder Days (Hari sebelum jatuh tempo)</span>
                <input
                  type="number"
                  value={settingsForm["billing_reminder_days"] ?? "3"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, billing_reminder_days: e.target.value })}
                />
              </label>
              <label>
                <span>Limit Days (Batas bayar sebelum isolir)</span>
                <input
                  type="number"
                  value={settingsForm["billing_limit_days"] ?? "5"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, billing_limit_days: e.target.value })}
                />
              </label>
              <label>
                <span>Menunggak Days (Hari untuk status menunggak)</span>
                <input
                  type="number"
                  value={settingsForm["billing_menunggak_days"] ?? "30"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, billing_menunggak_days: e.target.value })}
                />
              </label>
              <label>
                <span>Auto Generate Tagihan</span>
                <select
                  value={settingsForm["billing_auto_generate_enabled"] ?? "1"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, billing_auto_generate_enabled: e.target.value })}
                >
                  <option value="1">Aktif</option>
                  <option value="0">Nonaktif</option>
                </select>
              </label>
              <label>
                <span>Tanggal Generate Bulanan</span>
                <input
                  className={inputClassName(settingsErrors.billing_generate_day)}
                  type="number"
                  min="1"
                  max="28"
                  value={settingsForm["billing_generate_day"] ?? "1"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, billing_generate_day: e.target.value })}
                />
                {renderInlineError(settingsErrors.billing_generate_day)}
              </label>
              <label>
                <span>Jam Generate Bulanan</span>
                <input
                  className={inputClassName(settingsErrors.billing_generate_time)}
                  type="time"
                  value={settingsForm["billing_generate_time"] ?? "00:05"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, billing_generate_time: e.target.value })}
                />
                {renderInlineError(settingsErrors.billing_generate_time)}
              </label>
              <label>
                <span>Retry Generate</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={settingsForm["billing_generate_retry_attempts"] ?? "3"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, billing_generate_retry_attempts: e.target.value })}
                />
              </label>
              <label>
                <span>Backoff Retry (Detik)</span>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={settingsForm["billing_generate_retry_backoff_seconds"] ?? "2"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, billing_generate_retry_backoff_seconds: e.target.value })}
                />
              </label>
              <label>
                <span>Worker Interval (Detik)</span>
                <input
                  className={inputClassName(settingsErrors.worker_interval_seconds)}
                  type="number"
                  value={settingsForm["worker_interval_seconds"] ?? "60"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, worker_interval_seconds: e.target.value })}
                />
                {renderInlineError(settingsErrors.worker_interval_seconds)}
              </label>
              <label>
                <span>Auto Backup</span>
                <select
                  value={settingsForm["backup_auto_enabled"] ?? "1"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, backup_auto_enabled: e.target.value })}
                >
                  <option value="1">Aktif</option>
                  <option value="0">Nonaktif</option>
                </select>
              </label>
              <label>
                <span>Jadwal Backup Harian</span>
                <input
                  type="time"
                  value={settingsForm["backup_auto_time"] ?? "02:00"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, backup_auto_time: e.target.value })}
                />
              </label>
              <label>
                <span>Retensi Backup</span>
                <input
                  type="number"
                  min="1"
                  value={settingsForm["backup_retention_count"] ?? "7"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, backup_retention_count: e.target.value })}
                />
              </label>

              <div className="form-group-title" style={{ marginTop: "1rem" }}><h4>MikroTik</h4></div>
              <label>
                <span>Host Router</span>
                <input
                  type="text"
                  value={settingsForm["mikrotik_host"] ?? ""}
                  onChange={(e) => setSettingsForm({ ...settingsForm, mikrotik_host: e.target.value })}
                  placeholder="192.168.88.1"
                />
              </label>
              <label>
                <span>Username Router</span>
                <input
                  type="text"
                  value={settingsForm["mikrotik_user"] ?? ""}
                  onChange={(e) => setSettingsForm({ ...settingsForm, mikrotik_user: e.target.value })}
                  placeholder="admin"
                />
              </label>
              <label>
                <span>Password Router</span>
                <input
                  type="password"
                  value={settingsForm["mikrotik_pass"] ?? ""}
                  onChange={(e) => setSettingsForm({ ...settingsForm, mikrotik_pass: e.target.value })}
                  placeholder="••••••••"
                />
              </label>
              <label>
                <span>Username PPPoE Test</span>
                <input
                  type="text"
                  value={settingsForm["mikrotik_test_username"] ?? ""}
                  onChange={(e) => setSettingsForm({ ...settingsForm, mikrotik_test_username: e.target.value })}
                  placeholder="test-user"
                />
              </label>

              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={submitting}>
                  {isBusy("save-settings") ? "Menyimpan..." : "Simpan Pengaturan"}
                </button>
              </div>
            </form>
            <p className="muted top-gap">
              Operasional backup manual dan histori file sekarang dipindahkan ke tab Monitoring agar tim bisa cek status sistem tanpa membuka form konfigurasi.
            </p>
          </article>
        </section>
      ) : null}

      {view === "audit" ? (
        <section className="grid">
          <article className="surface">
            <div className="section-heading">
              <h2>Audit Log Operasional</h2>
              <div className="table-actions">
                <StatusPill label={`${auditLogs.length} event`} tone="slate" />
                <button
                  type="button"
                  className="ghost-button"
                  disabled={submitting}
                  onClick={() =>
                    void withFeedback(async () => {
                      const payload = await fetchAuditLogs(100);
                      setAuditLogs(payload.data);
                    })
                  }
                >
                  Refresh Audit
                </button>
              </div>
            </div>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>User</th>
                    <th>IP</th>
                    <th>Aksi</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <span className="muted">Belum ada audit log.</span>
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDateTime(log.created_at)}</td>
                        <td>{log.username ?? (log.user_id ? `#${log.user_id}` : "-")}</td>
                        <td><span className="muted" style={{fontSize:'0.85em'}}>{log.ip_address || "-"}</span></td>
                        <td>{log.action}</td>
                        <td>{log.message || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {view === "users" ? (
        <section className="grid feature-grid">
          <article className="surface">
            <div className="section-heading">
              <h2>Tambah User Tim</h2>
            </div>
            <form className="form-grid" onSubmit={handleManagedUserSubmit}>
              <label>
                <span>Username</span>
                <input
                  className={inputClassName(managedUserErrors.username)}
                  value={managedUserForm.username}
                  onChange={(event) =>
                    setManagedUserForm((current) => ({ ...current, username: event.target.value }))
                  }
                />
                {renderInlineError(managedUserErrors.username)}
              </label>
              <label>
                <span>Password Awal</span>
                <input
                  className={inputClassName(managedUserErrors.password)}
                  type="password"
                  value={managedUserForm.password}
                  onChange={(event) =>
                    setManagedUserForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
                {renderInlineError(managedUserErrors.password)}
              </label>
              <label>
                <span>Role</span>
                <select
                  value={managedUserForm.role}
                  onChange={(event) =>
                    setManagedUserForm((current) => ({ ...current, role: event.target.value }))
                  }
                >
                  <option value="petugas">Petugas</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <div className="button-row">
                <button className="primary-button" disabled={submitting}>
                  {isBusy("save-user") ? "Menyimpan..." : "Simpan User"}
                </button>
              </div>
            </form>
            <p className="muted top-gap">
              Gunakan akun `petugas` untuk operasional harian dan sisakan `admin` hanya untuk konfigurasi dan audit.
            </p>
          </article>

          <article className="surface">
            <div className="section-heading">
              <h2>Daftar User</h2>
              <StatusPill label={`${managedUsers.length} user`} tone="slate" />
            </div>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Terakhir Login</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {managedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <span className="muted">Belum ada user tim tambahan.</span>
                      </td>
                    </tr>
                  ) : managedUsers.map((item) => (
                    <tr key={item.id}>
                      <td>{item.username}</td>
                      <td>
                        <select
                          value={item.role}
                          onChange={(event) =>
                            void handleManagedUserUpdate(item, { role: event.target.value })
                          }
                        >
                          <option value="petugas">Petugas</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={item.is_active ? "1" : "0"}
                          onChange={(event) =>
                            void handleManagedUserUpdate(item, {
                              is_active: event.target.value === "1",
                            })
                          }
                        >
                          <option value="1">Aktif</option>
                          <option value="0">Nonaktif</option>
                        </select>
                      </td>
                      <td>
                        {item.last_login_at ? (
                          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85em' }}>
                            <span>{new Date(item.last_login_at).toLocaleString('id-ID')}</span>
                            <span className="muted">{item.last_login_ip || '-'}</span>
                          </div>
                        ) : (
                          <span className="muted">Belum pernah</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => void handleResetUserPassword(item)}
                        >
                          Reset Password
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}
      </div>

      {confirmDialog ? (
        <ModalShell
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
        </ModalShell>
      ) : null}

      {passwordResetState ? (
        <ModalShell
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
        </ModalShell>
      ) : null}

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-${toast.tone}`}>
            <strong>{toast.tone === "success" ? "Berhasil" : toast.tone === "warning" ? "Perhatian" : "Error"}</strong>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

function DataPackageTable(props: {
  packages: PackageItem[];
  onEdit: (item: PackageItem) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Nama</th>
            <th>Speed</th>
            <th>Harga</th>
            <th>Pelanggan</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {props.packages.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <span className="muted">Belum ada master paket. Tambahkan paket pertama untuk mulai operasional.</span>
              </td>
            </tr>
          ) : props.packages.map((pkg) => (
            <tr key={pkg.id}>
              <td>{pkg.name}</td>
              <td>{pkg.speed_mbps} Mbps</td>
              <td>{formatCurrency(pkg.price)}</td>
              <td>{pkg.customer_count}</td>
              <td>
                <div className="table-actions">
                  <button type="button" className="ghost-button" onClick={() => props.onEdit(pkg)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ghost-button danger-button"
                    onClick={() => props.onDelete(pkg.id)}
                  >
                    Hapus
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonCard() {
  return (
    <article className="stat-card skeleton-card" aria-hidden="true">
      <span className="skeleton-line skeleton-line-short" />
      <strong className="skeleton-line skeleton-line-large" />
    </article>
  );
}

function ModalShell(props: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={props.onClose}>
      <section
        className="modal-card surface"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2>{props.title}</h2>
          <button type="button" className="ghost-button" onClick={props.onClose} aria-label="Tutup dialog">
            Tutup
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
        <div className="modal-actions">{props.actions}</div>
      </section>
    </div>
  );
}

function displayStatusLabel(status: BillItem["display_status"]) {
  switch (status) {
    case "lunas":
      return "lunas";
    case "menunggak":
      return "menunggak";
    case "jatuh_tempo":
      return "jatuh tempo";
    default:
      return "belum bayar";
  }
}

function inputClassName(error?: string) {
  return error ? "input-invalid" : undefined;
}

function renderInlineError(error?: string) {
  if (!error) {
    return null;
  }
  return <span className="field-error">{error}</span>;
}

function validateLogin(form: { username: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.username.trim()) errors.username = "Username wajib diisi.";
  if (!form.password.trim()) errors.password = "Password wajib diisi.";
  return errors;
}

function validatePackage(form: PackageFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = "Nama paket wajib diisi.";
  if (form.speed_mbps <= 0) errors.speed_mbps = "Kecepatan harus lebih dari 0 Mbps.";
  if (form.price <= 0) errors.price = "Harga harus lebih dari 0.";
  return errors;
}

function validateCustomer(form: CustomerFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = "Nama pelanggan wajib diisi.";
  if (!form.package_id) errors.package_id = "Pilih paket pelanggan.";
  if (!form.user_pppoe.trim()) errors.user_pppoe = "Username PPPoE wajib diisi.";
  if (!form.password_pppoe.trim()) errors.password_pppoe = "Password PPPoE wajib diisi.";
  if (form.due_day < 1 || form.due_day > 28) errors.due_day = "Jatuh tempo bulanan harus antara 1-28.";
  return errors;
}

function validateTemplate(form: TemplateFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = "Nama template wajib diisi.";
  if (!form.trigger_key.trim()) errors.trigger_key = "Trigger key wajib diisi.";
  if (!form.content.trim()) errors.content = "Isi template wajib diisi.";
  return errors;
}

function validateManagedUser(form: ManagedUserFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.username.trim()) errors.username = "Username user wajib diisi.";
  if (form.password.trim().length < 8) errors.password = "Password awal minimal 8 karakter.";
  return errors;
}

function validateSettings(form: Record<string, string>): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^\d+$/.test(form["billing_generate_day"] ?? "1")) {
    errors.billing_generate_day = "Tanggal generate harus berupa angka.";
  }
  if (!/^\d{2}:\d{2}$/.test(form["billing_generate_time"] ?? "00:05")) {
    errors.billing_generate_time = "Jam generate harus format HH:MM.";
  }
  if (!/^\d+$/.test(form["worker_interval_seconds"] ?? "60")) {
    errors.worker_interval_seconds = "Interval worker harus berupa angka.";
  }
  return errors;
}

function validateBillPeriod(period: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^\d{4}-\d{2}$/.test(period.trim())) {
    errors.period = "Periode harus memakai format YYYY-MM.";
  }
  return errors;
}

function validatePasswordReset(password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (password.trim().length < 8) {
    errors.password = "Password baru minimal 8 karakter.";
  }
  return errors;
}

function readCustomerTrialFilter(): CustomerTrialFilter {
  if (typeof window === "undefined") {
    return "all";
  }
  const stored = window.localStorage.getItem("customers.trialFilter");
  if (stored === "active" || stored === "completed" || stored === "none" || stored === "all") {
    return stored;
  }
  return "all";
}

function getCustomerTrialState(customer: CustomerItem): "active" | "completed" | "none" {
  if (customer.is_trial) {
    return "active";
  }
  if (customer.trial_started_at || customer.trial_days) {
    return "completed";
  }
  return "none";
}

function trialStatusLabel(customer: CustomerItem) {
  switch (getCustomerTrialState(customer)) {
    case "active":
      return "Trial Aktif";
    case "completed":
      return "Trial Selesai";
    default:
      return "Non-Trial";
  }
}

function trialStatusTone(customer: CustomerItem): "green" | "gold" | "slate" {
  switch (getCustomerTrialState(customer)) {
    case "active":
      return "gold";
    case "completed":
      return "green";
    default:
      return "slate";
  }
}

function trialDateCopy(customer: CustomerItem) {
  const trialEndsAt = resolveTrialEndsAt(customer);
  if (getCustomerTrialState(customer) === "none") {
    return "Pelanggan reguler.";
  }
  if (trialEndsAt) {
    return `Berakhir ${formatDateId(trialEndsAt)}${customer.trial_days ? ` (${customer.trial_days} hari)` : ""}`;
  }
  if (customer.trial_days) {
    return `Durasi trial ${customer.trial_days} hari.`;
  }
  return "Riwayat trial tersedia.";
}

function resolveTrialEndsAt(customer: CustomerItem) {
  if (!customer.trial_started_at || !customer.trial_days) {
    return null;
  }
  const startedAt = new Date(customer.trial_started_at);
  if (Number.isNaN(startedAt.getTime())) {
    return null;
  }
  const endsAt = new Date(startedAt);
  endsAt.setDate(endsAt.getDate() + customer.trial_days);
  return endsAt;
}

function formatDateId(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function displayStatusTone(status: BillItem["display_status"]) {
  switch (status) {
    case "lunas":
      return "green" as const;
    case "menunggak":
      return "red" as const;
    case "jatuh_tempo":
      return "gold" as const;
    default:
      return "slate" as const;
  }
}

function statusTone(status?: string) {
  switch (status) {
    case "ok":
      return "green" as const;
    case "error":
    case "disabled":
      return "red" as const;
    case "degraded":
    case "idle":
    case "pending":
      return "gold" as const;
    default:
      return "slate" as const;
  }
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("id-ID");
}

function integrationSummary(health: HealthPayload | null) {
  if (!health) {
    return "Belum diperiksa";
  }

  const items: string[] = [];
  if (health.integrations.whatsapp_configured) {
    items.push("WA siap");
  }
  if (health.integrations.discord_configured) {
    items.push("Discord siap");
  }
  if (health.integrations.mikrotik_configured) {
    items.push("MikroTik siap");
  }

  return items.length > 0 ? items.join(" • ") : "Belum dikonfigurasi";
}

function toErrorMessage(caughtError: unknown) {
  if (caughtError instanceof ApiError) {
    return caughtError.message;
  }

  if (caughtError instanceof Error) {
    return caughtError.message;
  }

  return "Unknown error";
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function currentPeriod() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}
