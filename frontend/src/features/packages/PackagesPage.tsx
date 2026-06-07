import type { FormEvent } from "react";
import { formatCurrency } from "../../utils/format";
import { StatusPill, inputClassName, renderInlineError, EmptyTableRow } from "../../components/ui";
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
}: PackagesPageProps) {
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;

  return (
    <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm xl:col-span-1">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">{editingPackageId ? "Edit Paket" : "Tambah Paket"}</h2>
        </div>
        <form className="grid grid-cols-1 gap-6" onSubmit={onSubmit}>
          <label>
            <span>Nama Paket</span>
            <input
              className={inputClassName(packageErrors.name)}
              value={packageForm.name}
              onChange={(e) => onFormChange((curr) => ({ ...curr, name: e.target.value }))}
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
              onChange={(e) =>
                onFormChange((curr) => ({ ...curr, speed_mbps: Number(e.target.value) }))
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
              onChange={(e) => onFormChange((curr) => ({ ...curr, price: Number(e.target.value) }))}
            />
            {renderInlineError(packageErrors.price)}
          </label>
          <label>
            <span>Deskripsi</span>
            <textarea
              className={inputClassName()}
              rows={4}
              value={packageForm.description}
              onChange={(e) => onFormChange((curr) => ({ ...curr, description: e.target.value }))}
            />
          </label>
          <div className="flex gap-3 mt-4">
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" disabled={submitting}>
              {isBusy("save-package") ? "Menyimpan..." : editingPackageId ? "Update Paket" : "Simpan Paket"}
            </button>
            {editingPackageId ? (
              <button type="button" className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={onCancelEdit}>
                Batal Edit
              </button>
            ) : null}
          </div>
        </form>
      </article>

      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm xl:col-span-2 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Daftar Paket</h2>
          <StatusPill label={`${packages.length} item`} tone="slate" />
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm scrollbar-thin">
          <table className="w-full text-left border-collapse text-sm min-w-[500px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Nama</th>
                <th className="px-6 py-4 font-semibold">Speed</th>
                <th className="px-6 py-4 font-semibold">Harga</th>
                <th className="px-6 py-4 font-semibold">Pelanggan</th>
                <th className="px-6 py-4 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {packages.length === 0 ? (
                <EmptyTableRow message="Belum ada master paket. Tambahkan paket pertama untuk mulai operasional." />
              ) : (
                packages.map((pkg) => (
                  <tr key={pkg.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">{pkg.name}</td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-medium">{pkg.speed_mbps} Mbps</td>
                    <td className="px-6 py-4 text-slate-750 dark:text-slate-200 font-semibold">{formatCurrency(pkg.price)}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-medium">{pkg.customer_count}</td>
                    <td className="px-6 py-4 text-gray-700">
                      <div className="flex gap-2">
                        <button type="button" className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={() => onEdit(pkg)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors disabled:opacity-50"
                          onClick={() => onDelete(pkg.id)}
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
    </section>
  );
}
