import { useState, useEffect } from "react";
import { Loader2, Plus } from "lucide-react";
import { StatusPill, EmptyTableRow } from "../../components/ui";
import { Modal } from "../../components/ui/Modal";
import type { CustomerItem, PackageItem, User, OdpItem } from "../../types";
import type { FieldErrors } from "../../utils/validation";
import type { CustomerLifecycleEntry } from "../../lib/lifecycle";
import type { CustomerLifecycleFilter } from "../../hooks/useCustomers";
import { formatCurrency } from "../../utils/format";
import { displayStatusLabel, displayStatusTone } from "../../utils/status";

import { CustomerFormCard } from "./components/CustomerFormCard";
import { BroadcastModal } from "./components/BroadcastModal";
import { CustomerDetailModal } from "./components/CustomerDetailModal";

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
  diskon: number;
  referred_by_id: number;
  referral_balance: number;
  odp_id: number;
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
  diskon: 0,
  referred_by_id: 0,
  referral_balance: 0,
  odp_id: 0,
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
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onStatusChange: (id: number, status: CustomerItem["status"]) => void;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  onEdit: (customer: CustomerItem) => void;
  onCancelEdit: () => void;
  onRefresh?: () => void;
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
  pushSuccess,
  pushError,
  onRefresh,
}: CustomersPageProps) {
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [detailedCustomer, setDetailedCustomer] = useState<CustomerItem | null>(null);
  const [odps, setOdps] = useState<OdpItem[]>([]);

  // Load ODP list
  useEffect(() => {
    fetch("/api/v1/odps", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setOdps(data.data || []))
      .catch((err) => console.error("Failed to load ODPs", err));
  }, []);

  // Close form modal on successful save/update
  useEffect(() => {
    if (!submitting && Object.keys(customerErrors).length === 0 && !editingCustomerId) {
      setIsFormOpen(false);
    }
  }, [submitting, customerErrors, editingCustomerId]);

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  const handleOpenDetails = (customer: CustomerItem) => {
    setDetailedCustomer(customer);
  };

  const handleToggleSelectAll = (checked: boolean) => {
    const next: Record<number, boolean> = {};
    if (checked) {
      filteredCustomers.forEach((c) => {
        next[c.id] = true;
      });
    }
    setSelectedIds(next);
  };

  const handleToggleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    onCancelEdit();
  };

  const showForm = isFormOpen || editingCustomerId !== null;

  return (
    <section className="flex flex-col gap-6 w-full">
      {/* Customer List Card (Full Width) */}
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-sans">Daftar Pelanggan</h2>
            <p className="text-xs text-slate-500 mt-1">Pantau status billing, paket, jatuh tempo, dan referral pelanggan dalam satu daftar terpadu.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {user?.role !== "viewer" && (
              <button
                type="button"
                onClick={() => {
                  onCancelEdit();
                  setIsFormOpen(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Plus size={14} />
                Tambah Pelanggan
              </button>
            )}
            {user?.role !== "viewer" && (
              <button
                type="button"
                onClick={() => setIsBroadcastOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                Broadcast WA {selectedCount > 0 ? `(${selectedCount})` : ""}
              </button>
            )}
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
            <a
              href="/api/v1/reports/customers/csv"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Export CSV
            </a>
            <StatusPill label={`${filteredCustomers.length} item`} tone="slate" />
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm scrollbar-thin">
          <table className="w-full text-left border-collapse text-sm min-w-[1000px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-sans">
              <tr>
                {user?.role !== "viewer" && (
                  <th className="px-4 py-4 font-medium w-8 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={filteredCustomers.length > 0 && filteredCustomers.every((c) => selectedIds[c.id])}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      aria-label="Pilih semua pelanggan"
                    />
                  </th>
                )}
                <th className="px-4 py-4 font-semibold">Nama</th>
                <th className="px-4 py-4 font-semibold">Paket</th>
                <th className="px-4 py-4 font-semibold">Jatuh Tempo</th>
                <th className="px-4 py-4 font-semibold">Billing Status / Detail</th>
                <th className="px-4 py-4 font-semibold">ODP</th>
                <th className="px-4 py-4 font-semibold">Diskon</th>
                <th className="px-4 py-4 font-semibold">Reward Ref</th>
                <th className="px-4 py-4 font-semibold">Kode Ref</th>
                <th className="px-4 py-4 font-semibold">Referred By</th>
                <th className="px-4 py-4 font-semibold text-center">Status Layanan</th>
                <th className="px-4 py-4 font-semibold">WhatsApp</th>
                <th className="px-4 py-4 font-semibold text-center">Aksi</th>
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
                  colSpan={user?.role !== "viewer" ? 13 : 12}
                />
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/40 transition-colors">
                    {user?.role !== "viewer" && (
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={!!selectedIds[customer.id]}
                          onChange={(e) => handleToggleSelectOne(customer.id, e.target.checked)}
                          aria-label={`Pilih ${customer.name}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-4 font-semibold text-slate-900 dark:text-slate-100">
                      <button
                        type="button"
                        onClick={() => handleOpenDetails(customer)}
                        className="text-indigo-600 hover:text-indigo-700 hover:underline font-semibold text-left transition-colors"
                      >
                        {customer.name}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300 font-medium">{customer.package_name ?? "-"}</td>
                    <td className="px-4 py-4 text-slate-600 dark:text-slate-400">Tgl {customer.due_day}</td>
                    <td className="px-4 py-4 text-gray-700">
                      <div className="flex flex-col items-start gap-1">
                        <StatusPill
                          label={customerLifecycleMap[customer.id]?.label ?? "Lunas"}
                          tone={customerLifecycleMap[customer.id]?.tone ?? "green"}
                        />
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 max-w-[260px] leading-relaxed break-words whitespace-normal font-sans">
                          {customerLifecycleMap[customer.id]?.note ?? "Tidak ada tagihan aktif."}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300 font-medium">{customer.odp_name || "-"}</td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300 font-semibold">
                      {customer.diskon > 0 ? `Rp ${customer.diskon.toLocaleString("id-ID")}` : "-"}
                    </td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300 font-semibold">
                      {customer.referral_balance > 0 ? `Rp ${customer.referral_balance.toLocaleString("id-ID")}` : "-"}
                    </td>
                    <td className="px-4 py-4 text-slate-750 dark:text-slate-300 font-mono text-xs">{customer.referral_code || "-"}</td>
                    <td className="px-4 py-4 text-slate-600 dark:text-slate-400 font-semibold">{customer.referred_by_name || "-"}</td>
                    <td className="px-4 py-4 text-center">
                      <select
                        className="bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 text-slate-750 dark:text-slate-200 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                        value={customer.status}
                        onChange={(e) => onStatusChange(customer.id, e.target.value as CustomerItem["status"])}
                      >
                        <option value="active">Active</option>
                        <option value="limit">Limit</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                      {customer.whatsapp ? (
                        <a
                          href={`https://wa.me/${customer.whatsapp}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline font-mono text-xs font-semibold"
                        >
                          {customer.whatsapp}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {user?.role !== "viewer" && (
                        <button
                          type="button"
                          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                          onClick={() => {
                            onEdit(customer);
                            setIsFormOpen(true);
                          }}
                        >
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

      {/* Broadcast WhatsApp Overlay Modal */}
      <BroadcastModal
        isOpen={isBroadcastOpen}
        onClose={() => setIsBroadcastOpen(false)}
        selectedCount={selectedCount}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
      />

      {/* Customer Form Modal */}
      {showForm && (
        <Modal
          title={editingCustomerId ? "Edit Pelanggan" : "Tambah Pelanggan"}
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
                form="customer-form"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                disabled={submitting}
              >
                {submitting ? "Menyimpan..." : editingCustomerId ? "Update Pelanggan" : "Simpan Pelanggan"}
              </button>
            </>
          }
        >
          <CustomerFormCard
            user={user}
            packages={packages}
            customers={customers}
            customerForm={customerForm}
            customerErrors={customerErrors}
            editingCustomerId={editingCustomerId}
            submitting={submitting}
            busyAction={busyAction}
            onFormChange={onFormChange}
            onSubmit={onSubmit}
            onCancelEdit={handleCloseForm}
            odps={odps}
          />
        </Modal>
      )}

      {/* Standalone Customer Details Modal */}
      {detailedCustomer && (
        <CustomerDetailModal
          customer={detailedCustomer}
          onClose={() => setDetailedCustomer(null)}
          user={user}
          pushSuccess={pushSuccess}
          pushError={pushError}
          onRefresh={onRefresh}
        />
      )}
    </section>
  );
}
