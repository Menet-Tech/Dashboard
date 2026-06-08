import { useState, useEffect, type FormEvent } from "react";
import { formatCurrency } from "../../utils/format";
import { StatusPill, inputClassName, renderInlineError, EmptyTableRow, RupiahInput } from "../../components/ui";
import { Modal } from "../../components/ui/Modal";
import { Loader2, Plus, RefreshCw, Check, AlertTriangle } from "lucide-react";
import type { PackageItem } from "../../types";
import type { FieldErrors } from "../../utils/validation";

export type PackageFormState = {
  name: string;
  speed_mbps: number;
  price: number;
  description: string;
};

export const defaultPackageForm = (): PackageFormState => ({
  name: "",
  speed_mbps: 10,
  price: 150000,
  description: "",
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
  onDelete: (id: number) => void;
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

  // MikroTik sync state
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncProfiles, setSyncProfiles] = useState<MikrotikProfileSync[]>([]);
  const [selectedSyncNames, setSelectedSyncNames] = useState<Record<string, boolean>>({});
  const [syncError, setSyncError] = useState<string | null>(null);

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
      const res = await fetch("/api/v1/integration/mikrotik/sync-packages-preview", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat profil MikroTik");
      setSyncProfiles(data.profiles || []);
      
      // Auto select ones that do not exist yet
      const initialSelection: Record<string, boolean> = {};
      (data.profiles || []).forEach((p: MikrotikProfileSync) => {
        if (!p.exists) {
          initialSelection[p.name] = true;
        }
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
      alert("Pilih minimal satu profil untuk diimpor.");
      return;
    }

    setSyncLoading(true);
    try {
      const res = await fetch("/api/v1/integration/mikrotik/sync-packages-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: selectedNames }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengimpor profil");

      alert(`Berhasil mengimpor ${data.imported} paket internet.`);
      setIsSyncOpen(false);
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      alert(err.message || String(err));
    } finally {
      setSyncLoading(false);
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
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
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">Paket Internet</h2>
          <p className="text-xs text-slate-500 mt-1">
            Definisikan profil paket kecepatan dan harga bulanan yang akan diterapkan pada data pelanggan dan router MikroTik.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadSyncProfiles}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5"
            onClickCapture={() => setIsSyncOpen(true)}
          >
            <RefreshCw size={14} />
            Sinkronisasi MikroTik
          </button>
          <button
            type="button"
            onClick={() => {
              onCancelEdit();
              setIsFormOpen(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5"
          >
            <Plus size={14} />
            Tambah Paket
          </button>
        </div>
      </div>

      {/* Packages Table Card (Full Width) */}
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-sans">Daftar Master Paket</h3>
          <StatusPill label={`${packages.length} Item`} tone="slate" />
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm scrollbar-thin">
          <table className="w-full text-left border-collapse text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-sans">
              <tr>
                <th className="px-6 py-4 font-semibold">Nama Paket / Profile MikroTik</th>
                <th className="px-6 py-4 font-semibold">Kecepatan bandwidth</th>
                <th className="px-6 py-4 font-semibold">Harga Bulanan</th>
                <th className="px-6 py-4 font-semibold text-center">Pelanggan Aktif</th>
                <th className="px-6 py-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {packages.length === 0 ? (
                <EmptyTableRow message="Belum ada master paket. Tambahkan paket pertama untuk mulai operasional." colSpan={5} />
              ) : (
                packages.map((pkg) => (
                  <tr key={pkg.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">{pkg.name}</td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-medium">{pkg.speed_mbps} Mbps</td>
                    <td className="px-6 py-4 text-slate-950 dark:text-slate-150 font-bold">{formatCurrency(pkg.price)}</td>
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-bold text-center">
                      <span className="bg-slate-100 px-2.5 py-1 rounded-full text-xs font-semibold">
                        {pkg.customer_count} Pelanggan
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      <div className="flex gap-2 justify-center">
                        <button
                          type="button"
                          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors"
                          onClick={() => {
                            onEdit(pkg);
                            setIsFormOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
                          onClick={() => onDelete(pkg.id)}
                          disabled={pkg.customer_count > 0}
                          title={pkg.customer_count > 0 ? "Tidak bisa menghapus paket yang memiliki pelanggan aktif" : ""}
                        >
                          Hapus
                        </button>
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
              <button
                type="button"
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                onClick={handleCloseForm}
              >
                Batal
              </button>
              <button
                type="submit"
                form="package-form"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                disabled={submitting}
              >
                {isBusy("save-package") ? "Menyimpan..." : editingPackageId ? "Update Paket" : "Simpan Paket"}
              </button>
            </>
          }
        >
          <form id="package-form" className="flex flex-col gap-5" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Nama Paket (Wajib Sama dengan Profil MikroTik)</span>
              <input
                className={inputClassName(packageErrors.name)}
                value={packageForm.name}
                onChange={(e) => onFormChange((curr) => ({ ...curr, name: e.target.value }))}
                placeholder="contoh: 10 Mbps"
                required
              />
              {renderInlineError(packageErrors.name)}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Kecepatan Bandwidth (Mbps)</span>
              <input
                className={inputClassName(packageErrors.speed_mbps)}
                type="number"
                min={1}
                value={packageForm.speed_mbps}
                onChange={(e) =>
                  onFormChange((curr) => ({ ...curr, speed_mbps: Number(e.target.value) }))
                }
                required
              />
              {renderInlineError(packageErrors.speed_mbps)}
            </label>

            {/* Rupiah Price Input */}
            <RupiahInput
              label="Harga Berlangganan Bulanan"
              value={packageForm.price}
              onChange={(val) => onFormChange((curr) => ({ ...curr, price: val }))}
              error={packageErrors.price}
            />

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Deskripsi Paket</span>
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
              <button
                type="button"
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                onClick={() => setIsSyncOpen(false)}
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleImportSync}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                disabled={syncLoading || !anySyncSelected}
              >
                {syncLoading ? "Mengimpor..." : "Impor Profil Terpilih"}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-xs text-slate-500">
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
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto scrollbar-thin">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-650 sticky top-0">
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
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {syncProfiles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-slate-450">
                          Tidak ada profil PPPoE yang terdeteksi di MikroTik.
                        </td>
                      </tr>
                    ) : (
                      syncProfiles.map((p) => (
                        <tr key={p.name} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={!!selectedSyncNames[p.name]}
                              onChange={(e) => handleToggleSyncSelect(p.name, e.target.checked)}
                              disabled={p.exists}
                              aria-label={`Pilih profil ${p.name}`}
                            />
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800">{p.name}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">{p.rate_limit || "Tidak dibatasi"}</td>
                          <td className="px-4 py-2.5 text-slate-700">{p.parsed_speed} Mbps</td>
                          <td className="px-4 py-2.5 text-center">
                            {p.exists ? (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                <Check size={10} />
                                Terpasang
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 text-slate-600 border border-slate-200">
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
    </section>
  );
}
