import { FormEvent, startTransition, useEffect, useMemo, useState, Fragment } from "react";
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
  type HealthPayload,
  type SummaryPayload,
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
} from "./types";

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

const summaryCards = [
  { key: "total_pelanggan", label: "Total Pelanggan" },
  { key: "total_active", label: "Status Active" },
  { key: "total_limit", label: "Status Limit" },
  { key: "total_tagihan_belum_bayar", label: "Tagihan Belum Bayar" },
] as const;

const navItems: Array<{ key: ViewKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "packages", label: "Master Paket" },
  { key: "customers", label: "Pelanggan" },
  { key: "bills", label: "Tagihan" },
  { key: "templates", label: "Template WA" },
  { key: "monitoring", label: "Monitoring" },
  { key: "audit", label: "Audit Log" },
  { key: "users", label: "Users" },
  { key: "settings", label: "Pengaturan" },
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
      try {
        const [summaryPayload, packagesPayload, customersPayload, billsPayload, templatesPayload, settingsPayload, auditPayload, usersPayload] =
          await Promise.all([
            fetchSummary(),
            fetchPackages(),
            fetchCustomers(),
            fetchBills(),
            fetchTemplates(),
            fetchSettings(),
            isAdmin ? fetchAuditLogs(50) : Promise.resolve({ data: [] as AuditLogItem[] }),
            isAdmin ? fetchUsers() : Promise.resolve({ data: [] as ManagedUserItem[] }),
          ]);

        if (!cancelled) {
          setSummary(summaryPayload);
          setPackages(packagesPayload.data);
          setCustomers(customersPayload.data);
          setBills(billsPayload.data);
          setTemplates(templatesPayload.data);
          setSettingsForm(settingsPayload.data);
          setAuditLogs(auditPayload.data);
          setManagedUsers(usersPayload.data);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(toErrorMessage(caughtError));
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

  const databaseTone = statusTone(health?.services.database);
  const workerTone = statusTone(health?.services.worker);
  const backupTone = statusTone(health?.services.backup);
  const appTone = statusTone(health?.status);

  async function reloadProtectedData() {
    const [summaryPayload, packagesPayload, customersPayload, billsPayload, templatesPayload, settingsPayload, auditPayload, usersPayload] =
      await Promise.all([
        fetchSummary(),
        fetchPackages(),
        fetchCustomers(),
        fetchBills(),
        fetchTemplates(),
        fetchSettings(),
        user?.role === "admin" ? fetchAuditLogs(50) : Promise.resolve({ data: [] as AuditLogItem[] }),
        user?.role === "admin" ? fetchUsers() : Promise.resolve({ data: [] as ManagedUserItem[] }),
      ]);

    setSummary(summaryPayload);
    setPackages(packagesPayload.data);
    setCustomers(customersPayload.data);
    setBills(billsPayload.data);
    setTemplates(templatesPayload.data);
    setSettingsForm(settingsPayload.data);
    setAuditLogs(auditPayload.data);
    setManagedUsers(usersPayload.data);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withFeedback(async () => {
      const response = await login(loginForm.username, loginForm.password);
      setUser(response.user);
      setMessage("Login berhasil. Fondasi admin panel Go sekarang sudah aktif.");
    });
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
    });
  }

  async function handlePackageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withFeedback(async () => {
      if (editingPackageId) {
        await updatePackage(editingPackageId, packageForm);
        setMessage("Paket berhasil diperbarui.");
      } else {
        await createPackage(packageForm);
        setMessage("Paket baru berhasil ditambahkan.");
      }
      setPackageForm(defaultPackageForm());
      setEditingPackageId(null);
      await reloadProtectedData();
    });
  }

  async function handlePackageDelete(id: number) {
    await withFeedback(async () => {
      await deletePackage(id);
      if (editingPackageId === id) {
        setPackageForm(defaultPackageForm());
        setEditingPackageId(null);
      }
      setMessage("Paket berhasil dihapus.");
      await reloadProtectedData();
    });
  }

  async function handleCustomerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withFeedback(async () => {
      if (editingCustomerId) {
        await updateCustomer(editingCustomerId, customerForm);
        setMessage("Pelanggan berhasil diperbarui.");
      } else {
        await createCustomer(customerForm);
        setMessage("Pelanggan baru berhasil ditambahkan.");
      }
      setCustomerForm(defaultCustomerForm());
      setEditingCustomerId(null);
      await reloadProtectedData();
    });
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
    await withFeedback(async () => {
      const response = await generateBills(billPeriod);
      setMessage(
        `Generate tagihan periode ${response.data.period} selesai. ${response.data.generated} tagihan baru dibuat.`,
      );
      await reloadProtectedData();
    });
  }

  async function handleMarkBillPaid(id: number) {
    await withFeedback(async () => {
      await markBillPaid(id, "transfer");
      setMessage("Tagihan berhasil ditandai lunas.");
      await reloadProtectedData();
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
    });
  }

  async function handleTemplateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withFeedback(async () => {
      if (editingTemplateId) {
        await updateTemplate(editingTemplateId, templateForm);
        setMessage("Template berhasil diperbarui.");
      } else {
        await createTemplate(templateForm);
        setMessage("Template baru berhasil ditambahkan.");
      }
      setTemplateForm(defaultTemplateForm());
      setEditingTemplateId(null);
      await reloadProtectedData();
    });
  }

  async function handleTemplateDelete(id: number) {
    await withFeedback(async () => {
      await deleteTemplate(id);
      if (editingTemplateId === id) {
        setTemplateForm(defaultTemplateForm());
        setEditingTemplateId(null);
      }
      setMessage("Template berhasil dihapus.");
      await reloadProtectedData();
    });
  }

  async function handleManagedUserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withFeedback(async () => {
      await createUser(managedUserForm);
      setManagedUserForm(defaultManagedUserForm());
      setMessage("User baru berhasil ditambahkan.");
      await reloadProtectedData();
    });
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
    const password = window.prompt(`Masukkan password baru untuk ${item.username} (minimal 8 karakter):`, "");
    if (!password) {
      return;
    }

    await withFeedback(async () => {
      await resetUserPassword(item.id, password);
      setMessage(`Password untuk ${item.username} berhasil direset.`);
    });
  }

  async function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await withFeedback(async () => {
      await updateSettings(settingsForm);
      setMessage("Pengaturan berhasil disimpan.");
      await reloadProtectedData();
      await refreshHealth();
    });
  }

  async function handleCreateBackup() {
    await withFeedback(async () => {
      const res = await createBackup();
      setMessage(`Backup berhasil dibuat: ${res.data.filename}`);
      await refreshMonitoringData();
    });
  }

  async function refreshHealth() {
    const payload = await fetchHealth();
    setHealth(payload);
  }

  async function refreshMonitoringData() {
    const [healthPayload, backupsPayload, auditPayload] = await Promise.all([
      fetchHealth(),
      fetchBackups(),
      user?.role === "admin" ? fetchAuditLogs(25) : Promise.resolve({ data: [] as AuditLogItem[] }),
    ]);
    setHealth(healthPayload);
    setBackups(backupsPayload.data ?? []);
    setAuditLogs(auditPayload.data ?? []);
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

  async function withFeedback(action: () => Promise<void>) {
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await action();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
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
                value={loginForm.username}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, username: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            </label>
            <button className="primary-button" disabled={submitting}>
              {submitting ? "Masuk..." : "Masuk"}
            </button>
          </form>
          {error ? <p className="feedback error-text">{error}</p> : null}
          {message ? <p className="feedback success-text">{message}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">go-dev rewrite</p>
          <h1>Menet-Tech Dashboard</h1>
          <p className="hero-copy">
            Rewrite sekarang sudah masuk ke alur billing yang lebih lengkap: status tagihan,
            invoice, bukti bayar, template WA, dan fondasi worker automasi.
          </p>
        </div>
        <div className="topbar-actions">
          <div className="user-chip">
            <strong>{user.username}</strong>
            <span>{user.role}</span>
          </div>
          <button className="secondary-button" onClick={() => void handleLogout()} disabled={submitting}>
            Logout
          </button>
        </div>
      </section>

      <nav className="tabbar">
        {navItems
          .filter((item) => (item.key === "audit" || item.key === "users" ? user.role === "admin" : true))
          .map((item) => (
          <button
            key={item.key}
            className={item.key === view ? "tab-button active" : "tab-button"}
            onClick={() => {
              startTransition(() => setView(item.key));
              if (item.key === "monitoring") {
                void refreshMonitoringData();
              }
              if (item.key === "audit") {
                void withFeedback(async () => {
                  const payload = await fetchAuditLogs(100);
                  setAuditLogs(payload.data);
                });
              }
            }}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? <p className="feedback error-text">{error}</p> : null}
      {message ? <p className="feedback success-text">{message}</p> : null}

      {view === "dashboard" ? (
        <>
          <section className="grid stats-grid">
            {summaryCards.map((card) => (
              <article key={card.key} className="stat-card">
                <span>{card.label}</span>
                <strong>{summary?.[card.key] ?? 0}</strong>
              </article>
            ))}
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

            <article className="surface">
              <div className="section-heading">
                <h2>Current Scope</h2>
              </div>
              <ul className="step-list">
                <li>Computed status tagihan `jatuh_tempo` dan `menunggak`</li>
                <li>Invoice print view backend</li>
                <li>Upload bukti bayar</li>
                <li>Template WA dan worker automation foundation</li>
              </ul>
            </article>
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
                  value={packageForm.name}
                  onChange={(event) =>
                    setPackageForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Kecepatan (Mbps)</span>
                <input
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
              </label>
              <label>
                <span>Harga</span>
                <input
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
                  {editingPackageId ? "Update Paket" : "Simpan Paket"}
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
          <article className="surface">
            <div className="section-heading">
              <h2>{editingCustomerId ? "Edit Pelanggan" : "Tambah Pelanggan"}</h2>
            </div>
            <form className="form-grid" onSubmit={handleCustomerSubmit}>
              <label>
                <span>Nama</span>
                <input
                  value={customerForm.name}
                  onChange={(event) =>
                    setCustomerForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Paket</span>
                <select
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
              </label>
              <label>
                <span>User PPPoE</span>
                <input
                  value={customerForm.user_pppoe}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      user_pppoe: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Password PPPoE</span>
                <input
                  value={customerForm.password_pppoe}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      password_pppoe: event.target.value,
                    }))
                  }
                />
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
                  {editingCustomerId ? "Update Pelanggan" : "Simpan Pelanggan"}
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

          <article className="surface">
            <div className="section-heading">
              <h2>Daftar Pelanggan</h2>
              <StatusPill label={`${customers.length} item`} tone="slate" />
            </div>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Paket</th>
                    <th>Jatuh Tempo</th>
                    <th>Status</th>
                    <th>WA</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.name}</td>
                      <td>{customer.package_name ?? "-"}</td>
                      <td>Tanggal {customer.due_day}</td>
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
          <article className="surface">
            <div className="section-heading">
              <h2>Generate Tagihan</h2>
            </div>
            <form className="form-grid" onSubmit={handleGenerateBills}>
              <label>
                <span>Periode (YYYY-MM)</span>
                <input
                  value={billPeriod}
                  onChange={(event) => setBillPeriod(event.target.value)}
                  placeholder="2026-04"
                />
              </label>
              <div className="button-row">
                <button className="primary-button" disabled={submitting}>
                  Generate Sekarang
                </button>
              </div>
            </form>
            <p className="muted top-gap">
              Generate hanya akan membuat tagihan untuk pelanggan `active` dan `limit`
              yang belum punya tagihan di periode tersebut.
            </p>
          </article>

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
                  {bills.map((bill) => (
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
                            {bill.status === "belum_bayar" ? (
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
                              Upload Bukti
                            </button>
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
                  value={templateForm.name}
                  onChange={(event) =>
                    setTemplateForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Trigger Key</span>
                <input
                  value={templateForm.trigger_key}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      trigger_key: event.target.value,
                    }))
                  }
                  placeholder="contoh: reminder_custom"
                />
              </label>
              <label className="full-width">
                <span>Isi Template</span>
                <textarea
                  rows={8}
                  value={templateForm.content}
                  onChange={(event) =>
                    setTemplateForm((current) => ({ ...current, content: event.target.value }))
                  }
                />
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
                  {editingTemplateId ? "Update Template" : "Simpan Template"}
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
                  {templates.map((item) => (
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
                  Refresh Status
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
                Backup Sekarang
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
                <span>Worker Interval (Detik)</span>
                <input
                  type="number"
                  value={settingsForm["worker_interval_seconds"] ?? "60"}
                  onChange={(e) => setSettingsForm({ ...settingsForm, worker_interval_seconds: e.target.value })}
                />
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
                  Simpan Pengaturan
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
                    <th>User ID</th>
                    <th>Aksi</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <span className="muted">Belum ada audit log.</span>
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDateTime(log.created_at)}</td>
                        <td>{log.user_id ?? "-"}</td>
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
                  value={managedUserForm.username}
                  onChange={(event) =>
                    setManagedUserForm((current) => ({ ...current, username: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Password Awal</span>
                <input
                  type="password"
                  value={managedUserForm.password}
                  onChange={(event) =>
                    setManagedUserForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
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
                  Simpan User
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
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {managedUsers.map((item) => (
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
          {props.packages.map((pkg) => (
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
