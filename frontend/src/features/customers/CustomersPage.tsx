import type { FormEvent } from "react";
import { StatusPill, inputClassName, renderInlineError, EmptyTableRow } from "../../components/ui";
import type { CustomerItem, PackageItem, User } from "../../types";
import type { FieldErrors } from "../../utils/validation";
import type { CustomerLifecycleEntry, CustomerLifecycleKey } from "../../lib/lifecycle";
import type { CustomerLifecycleFilter } from "../../hooks/useCustomers";

export type CustomerFormState = {
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

export const defaultCustomerForm = (): CustomerFormState => ({
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

type CustomersPageProps = {
  user: User | null;
  packages: PackageItem[];
  customers: CustomerItem[];
  filteredCustomers: CustomerItem[];
  customerForm: CustomerFormState;
  customerErrors: FieldErrors;
  editingCustomerId: number | null;
  customerLifecycleFilter: CustomerLifecycleFilter;
  customerLifecycleMap: Record<number, CustomerLifecycleEntry>;
  submitting: boolean;
  busyAction: string | null;
  onFormChange: (updater: (current: CustomerFormState) => CustomerFormState) => void;
  onFilterChange: (filter: CustomerLifecycleFilter) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onStatusChange: (id: number, status: CustomerItem["status"]) => void;
  onEdit: (customer: CustomerItem) => void;
  onCancelEdit: () => void;
};

export function CustomersPage({
  user,
  packages,
  customers,
  filteredCustomers,
  customerForm,
  customerErrors,
  editingCustomerId,
  customerLifecycleFilter,
  customerLifecycleMap,
  submitting,
  busyAction,
  onFormChange,
  onFilterChange,
  onSubmit,
  onStatusChange,
  onEdit,
  onCancelEdit,
}: CustomersPageProps) {
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;

  return (
    <section className="grid feature-grid">
      {user?.role !== "viewer" && (
        <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">{editingCustomerId ? "Edit Pelanggan" : "Tambah Pelanggan"}</h2>
          </div>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={onSubmit}>
            <label>
              <span>Nama</span>
              <input
                className={inputClassName(customerErrors.name)}
                value={customerForm.name}
                onChange={(e) => onFormChange((curr) => ({ ...curr, name: e.target.value }))}
              />
              {renderInlineError(customerErrors.name)}
            </label>
            <label>
              <span>Paket</span>
              <select
                className={inputClassName(customerErrors.package_id)}
                value={customerForm.package_id}
                onChange={(e) =>
                  onFormChange((curr) => ({
                    ...curr,
                    package_id: Number(e.target.value),
                  }))
                }
              >
                <option value={0}>Pilih paket</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} - {pkg.speed_mbps} Mbps
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
                onChange={(e) =>
                  onFormChange((curr) => ({
                    ...curr,
                    user_pppoe: e.target.value,
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
                onChange={(e) =>
                  onFormChange((curr) => ({
                    ...curr,
                    password_pppoe: e.target.value,
                  }))
                }
              />
              {renderInlineError(customerErrors.password_pppoe)}
            </label>
            <label>
              <span>Nomor WhatsApp</span>
              <input
                value={customerForm.whatsapp}
                onChange={(e) =>
                  onFormChange((curr) => ({
                    ...curr,
                    whatsapp: e.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>SN ONT</span>
              <input
                value={customerForm.sn_ont}
                onChange={(e) =>
                  onFormChange((curr) => ({ ...curr, sn_ont: e.target.value }))
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
                onChange={(e) =>
                  onFormChange((curr) => ({
                    ...curr,
                    due_day: Number(e.target.value),
                  }))
                }
              />
              {renderInlineError(customerErrors.due_day)}
            </label>
            <label>
              <span>Status</span>
              <select
                value={customerForm.status}
                onChange={(e) =>
                  onFormChange((curr) => ({
                    ...curr,
                    status: e.target.value as CustomerItem["status"],
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
                onChange={(e) =>
                  onFormChange((curr) => ({ ...curr, address: e.target.value }))
                }
              />
            </label>
            <div className="button-row">
              <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" disabled={submitting}>
                {isBusy("save-customer") ? "Menyimpan..." : editingCustomerId ? "Update Pelanggan" : "Simpan Pelanggan"}
              </button>
              {editingCustomerId ? (
                <button type="button" className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={onCancelEdit}>
                  Batal Edit
                </button>
              ) : null}
            </div>
          </form>
        </article>
      )}

      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Daftar Pelanggan</h2>
            <p className="section-copy">Pantau role pelanggan dari trial aktif sampai tertagih, jatuh tempo, dan menunggak dalam satu daftar.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="toolbar-field">
              <span>Filter Role</span>
              <select
                value={customerLifecycleFilter}
                onChange={(e) => onFilterChange(e.target.value as CustomerLifecycleFilter)}
                aria-label="Filter role billing pelanggan"
              >
                <option value="all">Semua</option>
                <option value="trial">Trial Aktif</option>
                <option value="tertagih">Tertagih</option>
                <option value="jatuh_tempo">Jatuh Tempo</option>
                <option value="menunggak">Menunggak</option>
                <option value="lunas">Lunas</option>
              </select>
            </label>
            <StatusPill label={`${filteredCustomers.length} item`} tone="slate" />
          </div>
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">Nama</th>
                <th className="px-6 py-4 font-medium">Paket</th>
                <th className="px-6 py-4 font-medium">Jatuh Tempo</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Layanan</th>
                <th className="px-6 py-4 font-medium">WA</th>
                <th className="px-6 py-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCustomers.length === 0 ? (
                <EmptyTableRow
                  message={
                    customers.length === 0
                      ? "Belum ada pelanggan terdaftar."
                      : "Tidak ada pelanggan yang cocok dengan filter role saat ini."
                  }
                  colSpan={7}
                />
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-700">{customer.name}</td>
                    <td className="px-6 py-4 text-gray-700">{customer.package_name ?? "-"}</td>
                    <td className="px-6 py-4 text-gray-700">Tanggal {customer.due_day}</td>
                    <td className="px-6 py-4 text-gray-700">
                      <div className="meta-stack">
                        <StatusPill
                          label={customerLifecycleMap[customer.id]?.label ?? "Lunas"}
                          tone={customerLifecycleMap[customer.id]?.tone ?? "green"}
                        />
                        <span className="muted">
                          {customerLifecycleMap[customer.id]?.note ?? "Tidak ada tagihan aktif."}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      <select
                        value={customer.status}
                        onChange={(e) => onStatusChange(customer.id, e.target.value as CustomerItem["status"])}
                      >
                        <option value="active">Active</option>
                        <option value="limit">Limit</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{customer.whatsapp || "-"}</td>
                    <td className="px-6 py-4 text-gray-700">
                      {user?.role !== "viewer" && (
                        <button type="button" className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50" onClick={() => onEdit(customer)}>
                          Edit
                        </button>
                      )}
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
