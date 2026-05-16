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
    <section className="grid feature-grid">
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">{editingPackageId ? "Edit Paket" : "Tambah Paket"}</h2>
        </div>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={onSubmit}>
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
              rows={4}
              value={packageForm.description}
              onChange={(e) => onFormChange((curr) => ({ ...curr, description: e.target.value }))}
            />
          </label>
          <div className="button-row">
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" disabled={submitting}>
              {isBusy("save-package") ? "Menyimpan..." : editingPackageId ? "Update Paket" : "Simpan Paket"}
            </button>
            {editingPackageId ? (
              <button type="button" className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={onCancelEdit}>
                Batal Edit
              </button>
            ) : null}
          </div>
        </form>
      </article>

      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Daftar Paket</h2>
          <StatusPill label={`${packages.length} item`} tone="slate" />
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">Nama</th>
                <th className="px-6 py-4 font-medium">Speed</th>
                <th className="px-6 py-4 font-medium">Harga</th>
                <th className="px-6 py-4 font-medium">Pelanggan</th>
                <th className="px-6 py-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {packages.length === 0 ? (
                <EmptyTableRow message="Belum ada master paket. Tambahkan paket pertama untuk mulai operasional." />
              ) : (
                packages.map((pkg) => (
                  <tr key={pkg.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-700">{pkg.name}</td>
                    <td className="px-6 py-4 text-gray-700">{pkg.speed_mbps} Mbps</td>
                    <td className="px-6 py-4 text-gray-700">{formatCurrency(pkg.price)}</td>
                    <td className="px-6 py-4 text-gray-700">{pkg.customer_count}</td>
                    <td className="px-6 py-4 text-gray-700">
                      <div className="table-actions">
                        <button type="button" className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50" onClick={() => onEdit(pkg)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:bg-red-50 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50"
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
