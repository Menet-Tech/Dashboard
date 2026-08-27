import { useState, useEffect, useMemo, type FormEvent } from "react";
import { formatCurrency } from "../../utils/format";
import { StatusPill, inputClassName, renderInlineError, EmptyTableRow, RupiahInput } from "../../components/ui";
import { Modal } from "../../components/ui/Modal";
import { Loader2, Plus, RefreshCw, Check, AlertTriangle, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import type { PackageItem } from "../../types";
import type { FieldErrors } from "../../utils/validation";
import { fetchMikrotikIPPools, type MikrotikIPPoolItem, apiRequest } from "../../lib/api";
import { useDialog } from "../../context/DialogContext";
import { Button } from "../../components/ui/Button";

export type PackageFormState = {
  name: string;
  rate_limit: string;
  speed_mbps: number;
  price: number;
  description: string;
  ip_pool?: string;
  ip_pool_range?: string;
};

export const defaultPackageForm = (): PackageFormState => ({
  name: "",
  rate_limit: "",
  speed_mbps: 0,
  price: 150000,
  description: "",
  ip_pool: "",
  ip_pool_range: "",
});

type PackagesPageProps = {
  packages: PackageItem[];
  packageForm: PackageFormState;
  packageErrors: FieldErrors;
  editingPackageId: number | null;
  submitting: boolean;
  busyAction: string | null;
  onFormChange: (updater: (current: PackageFormState) => PackageFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (pkg: PackageItem) => void;
  onCancelEdit: () => void;
  onDelete: (id: number, deletePool?: boolean) => void;
  onRefresh?: () => void;
};

type MikrotikProfileSync = {
  name: string;
  rate_limit: string;
  exists: boolean;
  parsed_speed: number;
};

export function PackagesPage({
  packages,
  packageForm,
  packageErrors,
  editingPackageId,
  submitting,
  busyAction,
  onFormChange,
  onSubmit,
  onEdit,
  onCancelEdit,
  onDelete,
  onRefresh,
}: PackagesPageProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const { showAlert } = useDialog();

  const [sortField, setSortField] = useState<string | null>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const requestSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedPackages = useMemo(() => {
    if (!sortField) return packages;
    return [...packages].sort((a, b) => {
      let aVal = (a as any)[sortField];
      let bVal = (b as any)[sortField];

      const isNumericField = sortField === "price" || sortField === "speed_mbps" || sortField === "customer_count";
      if (aVal === null || aVal === undefined) aVal = isNumericField ? 0 : "";
      if (bVal === null || bVal === undefined) bVal = isNumericField ? 0 : "";

      if (isNumericField) {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).trim().toLowerCase();
      const bStr = String(bVal).trim().toLowerCase();
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: "base" })
        : bStr.localeCompare(aStr, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [packages, sortField, sortDirection]);

  const renderSortableHeader = (label: string, field: string, align: "left" | "center" = "left") => {
    const isSorted = sortField === field;
    return (
      <th 
        className={`px-6 py-4 font-semibold select-none cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 ${align === "center" ? "text-center" : "text-left"}`}
        onClick={() => requestSort(field)}
      >
        <div className={`inline-flex items-center gap-1.5 ${align === "center" ? "justify-center w-full" : ""}`}>
          <span>{label}</span>
          {isSorted ? (
            sortDirection === "asc" ? (
              <ChevronUp size={12} className="text-indigo-660 dark:text-indigo-400 stroke-[3]" />
            ) : (
              <ChevronDown size={12} className="text-indigo-660 dark:text-indigo-400 stroke-[3]" />
            )
          ) : (
            <ArrowUpDown size={12} className="text-slate-350 dark:text-slate-600 opacity-50 transition-opacity" />
          )}
        </div>
      </th>
    );
  };

  // IP Pools list
  const [ipPools, setIpPools] = useState<MikrotikIPPoolItem[]>([]);
  const [loadingPools, setLoadingPools] = useState(false);
  const [newPoolName, setNewPoolName] = useState("");
  const [isCreatingNewPool, setIsCreatingNewPool] = useState(false);

  // MikroTik sync state
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncProfiles, setSyncProfiles] = useState<MikrotikProfileSync[]>([]);
  const [selectedSyncNames, setSelectedSyncNames] = useState<Record<string, boolean>>({});
  const [syncError, setSyncError] = useState<string | null>(null);

  // Delete package states
  const [deletingPkg, setDeletingPkg] = useState<PackageItem | null>(null);
  const [deletePoolChecked, setDeletePoolChecked] = useState(false);

  // Fetch IP Pools on modal open
  useEffect(() => {
    if (isFormOpen || editingPackageId !== null) {
      setLoadingPools(true);
      fetchMikrotikIPPools()
        .then((res) => {
          setIpPools(res.data || []);
        })
        .catch((err) => {
          console.error("Gagal memuat IP Pool", err);
        })
        .finally(() => {
          setLoadingPools(false);
        });
    }
  }, [isFormOpen, editingPackageId]);

  // Close form modal on successful save/update
  useEffect(() => {
    if (!submitting && Object.keys(packageErrors).length === 0 && !editingPackageId) {
      setIsFormOpen(false);
    }
  }, [submitting, packageErrors, editingPackageId]);

  const loadSyncProfiles = async () => {
    setSyncLoading(true);
    setSyncError(null);
    try {
      const data = await apiRequest<{ profiles: MikrotikProfileSync[] }>("/api/v1/integration/mikrotik/sync-packages-preview");
      const unsynced = (data.profiles || []).filter((p) => !p.exists);
      setSyncProfiles(unsynced);
      
      // Auto select ones that do not exist yet
      const initialSelection: Record<string, boolean> = {};
      unsynced.forEach((p: MikrotikProfileSync) => {
        initialSelection[p.name] = true;
      });
      setSelectedSyncNames(initialSelection);
    } catch (err: any) {
      setSyncError(err.message || String(err));
    } finally {
      setSyncLoading(false);
    }
  };

  useEffect(() => {
    if (isSyncOpen) {
      void loadSyncProfiles();
    }
  }, [isSyncOpen]);

  const handleToggleSyncSelect = (name: string, checked: boolean) => {
    setSelectedSyncNames((prev) => ({ ...prev, [name]: checked }));
  };

  const handleToggleSelectAllSync = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) {
      syncProfiles.forEach((p) => {
        next[p.name] = true;
      });
    }
    setSelectedSyncNames(next);
  };

  const handleImportSync = async () => {
    const selectedNames = Object.entries(selectedSyncNames)
      .filter(([_, checked]) => checked)
      .map(([name]) => name);

    if (selectedNames.length === 0) {
      await showAlert("Pilih minimal satu profil untuk diimpor.");
      return;
    }

    setSyncLoading(true);
    try {
      const data = await apiRequest<{ imported: number }>("/api/v1/integration/mikrotik/sync-packages-import", {
        method: "POST",
        body: JSON.stringify({ names: selectedNames }),
      });

      await showAlert(`Berhasil mengimpor ${data.imported} paket internet.`);
      setIsSyncOpen(false);
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      await showAlert(err.message || String(err));
    } finally {
      setSyncLoading(false);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setIsCreatingNewPool(false);
    onCancelEdit();
  };

  const showForm = isFormOpen || editingPackageId !== null;
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;
  const anySyncSelected = Object.values(selectedSyncNames).some(Boolean);

  return (
    <section className="flex flex-col gap-6 w-full">
      {/* Table Header and Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 font-sans">Paket Internet</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Definisikan profil paket kecepatan dan harga bulanan yang akan diterapkan pada data pelanggan dan router MikroTik.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" type="button"
            onClick={loadSyncProfiles}
            className="font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center gap-1.5"
            onClickCapture={() => setIsSyncOpen(true)}
          >
            <RefreshCw size={14} />
            Sinkronisasi MikroTik
          </Button>
          <Button variant="primary" type="button"
            onClick={() => {
              onCancelEdit();
              setIsCreatingNewPool(false);
              setIsFormOpen(true);
            }}
          >
            <Plus size={14} />
            Tambah Paket
          </Button>
        </div>
      </div>

      {/* Packages Table Card (Full Width) */}
      <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm overflow-hidden flex flex-col w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider font-sans">Daftar Master Paket</h3>
          <StatusPill label={`${packages.length} Item`} tone="slate" />
        </div>

        <div className="overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-card bg-white dark:bg-slate-900 shadow-sm scrollbar-thin">
          <table className="w-full text-left border-collapse text-sm min-w-[600px]">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-800 text-gray-500 dark:text-slate-400 font-sans">
              <tr>
                {renderSortableHeader("Nama Paket / Profile MikroTik", "name")}
                {renderSortableHeader("Kecepatan bandwidth", "speed_mbps")}
                {renderSortableHeader("Harga Bulanan", "price")}
                {renderSortableHeader("Pelanggan Aktif", "customer_count", "center")}
                <th className="px-6 py-4 font-semibold text-center text-slate-500 dark:text-slate-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedPackages.length === 0 ? (
                <EmptyTableRow message="Belum ada master paket. Tambahkan paket pertama untuk mulai operasional." colSpan={5} />
              ) : (
                sortedPackages.map((pkg) => (
                  <tr key={pkg.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100">{pkg.name}</td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-medium">
                      {pkg.rate_limit
                        ? <span className="font-mono text-xs">{pkg.rate_limit}</span>
                        : pkg.speed_mbps === 0
                          ? "Bypass / Tanpa Limit"
                          : `${pkg.speed_mbps} Mbps`}
                    </td>
                    <td className="px-6 py-4 text-slate-950 dark:text-slate-150 font-bold">{formatCurrency(pkg.price)}</td>
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-100 dark:text-slate-200 font-bold text-center">
                      <span className="bg-slate-100 px-2.5 py-1 rounded-full text-xs font-semibold">
                        {pkg.customer_count} Pelanggan
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700 dark:text-slate-300">
                      <div className="flex gap-2 justify-center">
                        <Button variant="outline" type="button"
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors"
                          onClick={() => {
                            setIsCreatingNewPool(false);
                            onEdit(pkg);
                            setIsFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="outline" type="button"
                          className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
                          onClick={() => {
                            setDeletingPkg(pkg);
                            setDeletePoolChecked(false);
                          }}
                          disabled={pkg.customer_count > 0}
                          title={pkg.customer_count > 0 ? "Tidak bisa menghapus paket yang memiliki pelanggan aktif" : ""}
                        >
                          Hapus
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Package Form Modal */}
      {showForm && (
        <Modal
          title={editingPackageId ? "Edit Paket Internet" : "Tambah Paket Internet"}
          onClose={handleCloseForm}
          actions={
            <>
              <Button variant="outline" type="button"
                className="bg-white dark:bg-slate-900 border border-gray-300 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/40 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                onClick={handleCloseForm}
              >
                Batal
              </Button>
              <Button variant="outline" type="submit"
                form="package-form"
                className="hover:font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                disabled={submitting}
              >
                {isBusy("save-package") ? "Menyimpan..." : editingPackageId ? "Update Paket" : "Simpan Paket"}
              </Button>
            </>
          }
        >
          <form id="package-form" className="flex flex-col gap-5" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Nama Paket (Wajib Sama dengan Profil MikroTik)</span>
              <input
                autoFocus={true}
                className={inputClassName(packageErrors.name)}
                value={packageForm.name}
                onChange={(e) => onFormChange((curr) => ({ ...curr, name: e.target.value }))}
                placeholder="contoh: 10 Mbps"
                required
              />
              {renderInlineError(packageErrors.name)}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Rate Limit Bandwidth (Format MikroTik)</span>
              <input
                className={inputClassName(packageErrors.rate_limit ?? packageErrors.speed_mbps)}
                type="text"
                value={packageForm.rate_limit}
                onChange={(e) =>
                  onFormChange((curr) => ({ ...curr, rate_limit: e.target.value }))
                }
                placeholder="contoh: 10M/10M atau 10M/10M 50M/50M 10M/10M 10/10"
              />
              {/* Format reference card */}
              <div className="bg-slate-50 dark:bg-slate-950 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-[10px] text-slate-500 dark:text-slate-400 space-y-1 font-mono leading-relaxed">
                <p className="font-sans font-bold text-slate-700 dark:text-slate-300 text-[11px] mb-1.5">📡 Format Rate-Limit MikroTik:</p>
                <p><span className="text-indigo-600 dark:text-indigo-400">rx/tx</span> — basic: <span className="text-slate-800 dark:text-slate-100 dark:text-slate-200">10M/10M</span></p>
                <p><span className="text-indigo-600 dark:text-indigo-400">rate burst-rate threshold time</span> — burst: <span className="text-slate-800 dark:text-slate-100 dark:text-slate-200">10M/10M 50M/50M 10M/10M 10/10</span></p>
                <p className="text-[9px] text-slate-400 dark:text-slate-500 font-sans mt-1">Kosongkan untuk bypass (unlimited). Satuan: K=Kbps, M=Mbps, G=Gbps</p>
              </div>
              {renderInlineError(packageErrors.rate_limit ?? packageErrors.speed_mbps)}
            </label>

            {/* Rupiah Price Input */}
            <RupiahInput
              label="Harga Berlangganan Bulanan"
              value={packageForm.price}
              onChange={(val) => onFormChange((curr) => ({ ...curr, price: val }))}
              error={packageErrors.price}
            />

            {/* IP Pool selection */}
            {!isCreatingNewPool ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">IP Pool MikroTik</span>
                {loadingPools ? (
                  <div className="text-xs text-slate-400 dark:text-slate-500 italic">Memuat IP Pool dari MikroTik...</div>
                ) : (
                  <select
                    className={inputClassName(packageErrors.ip_pool)}
                    value={packageForm.ip_pool || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "new") {
                        setIsCreatingNewPool(true);
                        onFormChange((curr) => ({ ...curr, ip_pool: "", ip_pool_range: "" }));
                      } else {
                        onFormChange((curr) => ({ ...curr, ip_pool: val, ip_pool_range: "" }));
                      }
                    }}
                  >
                    <option value="">-- Tanpa IP Pool (Gunakan default MikroTik) --</option>
                    {ipPools.map((pool) => (
                      <option key={pool.id} value={pool.name}>
                        {pool.name} ({pool.ranges})
                      </option>
                    ))}
                    <option value="new">+ Buat IP Pool Baru...</option>
                  </select>
                )}
                {renderInlineError(packageErrors.ip_pool)}
              </label>
            ) : (
              <div className="p-4 bg-slate-50 dark:bg-slate-950 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200">Buat IP Pool Baru di MikroTik</span>
                  <Button variant="primary" type="button"
                    className="text-xs font-bold text-indigo-650 hover:text-indigo-700"
                    onClick={() => {
                      setIsCreatingNewPool(false);
                      onFormChange((curr) => ({ ...curr, ip_pool: "", ip_pool_range: "" }));
                    }}
                  >
                    Batal
                  </Button>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Nama IP Pool Baru</span>
                  <input
                    type="text"
                    className={inputClassName()}
                    placeholder="contoh: POOL-10MBPS"
                    value={packageForm.ip_pool || ""}
                    onChange={(e) => onFormChange((curr) => ({ ...curr, ip_pool: e.target.value }))}
                    required
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Range IP Address (Contoh: 10.10.10.1-10.10.10.253)</span>
                  <input
                    type="text"
                    className={inputClassName(packageErrors.ip_pool_range)}
                    placeholder="10.10.10.1-10.10.10.253"
                    value={packageForm.ip_pool_range || ""}
                    onChange={(e) => onFormChange((curr) => ({ ...curr, ip_pool_range: e.target.value }))}
                    required
                  />
                  {renderInlineError(packageErrors.ip_pool_range)}
                </label>
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Deskripsi Paket</span>
              <textarea
                className={inputClassName()}
                rows={3}
                value={packageForm.description}
                onChange={(e) => onFormChange((curr) => ({ ...curr, description: e.target.value }))}
                placeholder="Keterangan layanan kustom"
              />
            </label>
          </form>
        </Modal>
      )}

      {/* MikroTik Sync Modal */}
      {isSyncOpen && (
        <Modal
          title="Sinkronisasi Paket dari MikroTik"
          onClose={() => setIsSyncOpen(false)}
          actions={
            <>
              <Button variant="outline" type="button"
                className="bg-white dark:bg-slate-900 border border-gray-300 text-gray-700 dark:text-slate-300 hover:bg-gray-55 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                onClick={() => setIsSyncOpen(false)}
              >
                Tutup
              </Button>
              <Button variant="outline" type="button"
                onClick={handleImportSync}
                className="hover:font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                disabled={syncLoading || !anySyncSelected}
              >
                {syncLoading ? "Mengimpor..." : "Impor Profil Terpilih"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Berikut adalah daftar profil PPPoE yang terbaca di router MikroTik Anda. Centang profil yang ingin Anda tambahkan sebagai master paket di Control Panel ini.
            </p>

            {syncError && (
              <div className="bg-red-50 text-red-700 border border-red-200 p-3 rounded-lg text-xs flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{syncError}</span>
              </div>
            )}

            {syncLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-indigo-600" />
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-650 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 text-center w-8">
                        <input
                          type="checkbox"
                          checked={syncProfiles.length > 0 && syncProfiles.every((p) => selectedSyncNames[p.name])}
                          onChange={(e) => handleToggleSelectAllSync(e.target.checked)}
                          aria-label="Pilih semua profil"
                        />
                      </th>
                      <th className="px-4 py-2.5 font-semibold">Nama Profile</th>
                      <th className="px-4 py-2.5 font-semibold">Limit Bandwidth</th>
                      <th className="px-4 py-2.5 font-semibold">Perkiraan Speed</th>
                      <th className="px-4 py-2.5 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:bg-slate-900">
                    {syncProfiles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-slate-450">
                          Tidak ada profil PPPoE yang terdeteksi di MikroTik.
                        </td>
                      </tr>
                    ) : (
                      syncProfiles.map((p) => (
                        <tr key={p.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={!!selectedSyncNames[p.name]}
                              onChange={(e) => handleToggleSyncSelect(p.name, e.target.checked)}
                              disabled={p.exists}
                              aria-label={`Pilih profil ${p.name}`}
                            />
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-100">{p.name}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">{p.rate_limit || "Tidak dibatasi"}</td>
                          <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{p.parsed_speed} Mbps</td>
                          <td className="px-4 py-2.5 text-center">
                            {p.exists ? (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                <Check size={10} />
                                Terpasang
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 dark:bg-slate-950 text-slate-600 border border-slate-200 dark:border-slate-800">
                                Baru
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}

      {deletingPkg && (
        <Modal
          title="Hapus Paket Internet"
          onClose={() => setDeletingPkg(null)}
          actions={
            <>
              <Button variant="outline" type="button"
                className="bg-white dark:bg-slate-900 border border-gray-300 text-slate-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/40 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                onClick={() => setDeletingPkg(null)}
              >
                Batal
              </Button>
              <Button variant="outline" type="button"
                className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                onClick={() => {
                  const id = deletingPkg.id;
                  const deletePool = deletePoolChecked;
                  setDeletingPkg(null);
                  onDelete(id, deletePool);
                }}
              >
                Ya, Hapus Paket
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4 font-sans text-slate-800 dark:text-slate-100">
            <p className="text-xs">
              Apakah Anda yakin ingin menghapus paket <strong className="text-slate-900 dark:text-slate-50">{deletingPkg.name}</strong>?
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Paket akan dihapus dari daftar master. Pastikan tidak ada pelanggan aktif yang masih bergantung pada paket ini.
            </p>
            
            {deletingPkg.ip_pool && (
              <label className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deletePoolChecked}
                  onChange={(e) => setDeletePoolChecked(e.target.checked)}
                  className="accent-indigo-600 w-4 h-4 rounded border-gray-350"
                />
                <div className="text-xs text-left">
                  <span className="font-bold text-slate-900 dark:text-slate-50 block">Hapus IP Pool juga dari MikroTik</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">Hapus IP Pool <code className="bg-slate-200 px-1 rounded font-mono font-bold text-indigo-700">{deletingPkg.ip_pool}</code> dari seluruh router MikroTik aktif.</span>
                </div>
              </label>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
