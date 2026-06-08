import { useState } from "react";
import { Loader2, AlertCircle, RotateCw } from "lucide-react";
import { StatusPill, EmptyTableRow } from "../../components/ui";
import type { CustomerItem, PackageItem, User, BillItem } from "../../types";
import type { FieldErrors } from "../../utils/validation";
import type { CustomerLifecycleEntry } from "../../lib/lifecycle";
import type { CustomerLifecycleFilter } from "../../hooks/useCustomers";
import { formatCurrency } from "../../utils/format";
import { displayStatusLabel, displayStatusTone } from "../../utils/status";
import { fetchBills } from "../../lib/api";

import { CustomerFormCard } from "./components/CustomerFormCard";
import { BroadcastModal } from "./components/BroadcastModal";

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailedCustomer, setDetailedCustomer] = useState<CustomerItem | null>(null);
  const [customerBills, setCustomerBills] = useState<BillItem[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [ontStatus, setOntStatus] = useState<any | null>(null);
  const [loadingOnt, setLoadingOnt] = useState(false);
  const [rebootingOnt, setRebootingOnt] = useState(false);
  const [resettingOnt, setResettingOnt] = useState(false);
  const [kickingMikrotik, setKickingMikrotik] = useState(false);
  const [updatingWifi, setUpdatingWifi] = useState(false);
  const [ontError, setOntError] = useState<string | null>(null);

  const handleRebootOnt = async (customerId: number) => {
    if (!window.confirm("Apakah Anda yakin ingin mem-reboot ONT pelanggan ini?")) return;
    setRebootingOnt(true);
    try {
      const { rebootONT } = await import("../../lib/api");
      const res = await rebootONT(customerId);
      pushSuccess(res.message || "Perintah reboot berhasil dikirim ke GenieACS.");
    } catch (err: any) {
      console.error(err);
      pushError(err.message || String(err));
    } finally {
      setRebootingOnt(false);
    }
  };

  const handleFactoryResetOnt = async (customerId: number) => {
    if (!window.confirm("PERINGATAN: Apakah Anda yakin ingin mengembalikan ONT ke pengaturan pabrik (Factory Reset)? Ini akan menghapus konfigurasi ONT.")) return;
    setResettingOnt(true);
    try {
      const { factoryResetONT } = await import("../../lib/api");
      const res = await factoryResetONT(customerId);
      pushSuccess(res.message || "Perintah factory reset berhasil dikirim ke GenieACS.");
    } catch (err: any) {
      console.error(err);
      pushError(err.message || String(err));
    } finally {
      setResettingOnt(false);
    }
  };

  const handleKickMikrotik = async (customerId: number) => {
    if (!window.confirm("Apakah Anda yakin ingin memutuskan sesi PPPoE pelanggan ini untuk memaksa koneksi ulang?")) return;
    setKickingMikrotik(true);
    try {
      const { kickMikrotikSession } = await import("../../lib/api");
      const res = await kickMikrotikSession(customerId);
      pushSuccess(res.message || "Sesi PPPoE berhasil diputuskan.");
    } catch (err: any) {
      console.error(err);
      pushError(err.message || String(err));
    } finally {
      setKickingMikrotik(false);
    }
  };

  const handleWifiUpdate = async (customerId: number) => {
    const ssid = window.prompt("Masukkan nama WiFi (SSID) baru:");
    if (ssid === null) return;
    const cleanSsid = ssid.trim();
    if (!cleanSsid) {
      alert("SSID tidak boleh kosong.");
      return;
    }

    const password = window.prompt("Masukkan password WiFi baru (Minimal 8 karakter):");
    if (password === null) return;
    const cleanPassword = password.trim();
    if (cleanPassword.length < 8) {
      alert("Password WiFi minimal harus 8 karakter.");
      return;
    }

    setUpdatingWifi(true);
    try {
      const { updateONTWifi } = await import("../../lib/api");
      const res = await updateONTWifi(customerId, cleanSsid, cleanPassword);
      pushSuccess(res.message || "Konfigurasi WiFi berhasil dikirim ke ONT.");
    } catch (err: any) {
      console.error(err);
      pushError(err.message || String(err));
    } finally {
      setUpdatingWifi(false);
    }
  };

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  const handleOpenDetails = async (customer: CustomerItem) => {
    setDetailedCustomer(customer);
    setCustomerBills([]);
    setLoadingBills(true);
    setOntStatus(null);
    setOntError(null);
    try {
      const res = await fetchBills({ customer_id: customer.id, limit: 0 });
      setCustomerBills(res.data);
    } catch (err) {
      console.error("Failed to load customer bills", err);
    } finally {
      setLoadingBills(false);
    }
  };

  const handleWithdrawReferral = async (customer: CustomerItem) => {
    const amountStr = window.prompt(`Masukkan nominal penarikan tunai saldo referral untuk ${customer.name} (Maksimal: Rp ${customer.referral_balance.toLocaleString("id-ID")}):`);
    if (amountStr === null) return;
    const amount = parseInt(amountStr.replace(/[^0-9]/g, ""), 10);
    if (isNaN(amount) || amount <= 0) {
      alert("Nominal penarikan tidak valid.");
      return;
    }
    if (amount > customer.referral_balance) {
      alert("Saldo referral tidak mencukupi.");
      return;
    }

    try {
      const { withdrawReferral } = await import("../../lib/api");
      const res = await withdrawReferral(customer.id, amount);
      pushSuccess(res.message || "Penarikan tunai referral berhasil.");
      
      setDetailedCustomer(prev => prev ? {
        ...prev,
        referral_balance: prev.referral_balance - amount
      } : null);

      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.error(err);
      pushError(err.message || String(err));
    }
  };

  const handleConvertVoucher = async (customer: CustomerItem) => {
    const amountStr = window.prompt(`Masukkan nominal saldo referral yang ingin ditukarkan menjadi voucher diskon untuk ${customer.name} (Maksimal: Rp ${customer.referral_balance.toLocaleString("id-ID")}):`);
    if (amountStr === null) return;
    const amount = parseInt(amountStr.replace(/[^0-9]/g, ""), 10);
    if (isNaN(amount) || amount <= 0) {
      alert("Nominal penukaran tidak valid.");
      return;
    }
    if (amount > customer.referral_balance) {
      alert("Saldo referral tidak mencukupi.");
      return;
    }

    try {
      const { convertReferralToVoucher } = await import("../../lib/api");
      const res = await convertReferralToVoucher(customer.id, amount);
      pushSuccess(res.message || "Saldo berhasil ditukarkan menjadi voucher diskon.");
      
      setDetailedCustomer(prev => prev ? {
        ...prev,
        referral_balance: prev.referral_balance - amount,
        voucher_discount: (prev.voucher_discount || 0) + amount
      } : null);

      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.error(err);
      pushError(err.message || String(err));
    }
  };

  const handleCheckOntStatus = async (customerId: number) => {
    setLoadingOnt(true);
    setOntError(null);
    setOntStatus(null);
    try {
      const res = await fetch(`/api/v1/customers/${customerId}/ont-status`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal memuat status ONT");
      setOntStatus(data.data);
    } catch (err: any) {
      console.error(err);
      setOntError(err.message || String(err));
    } finally {
      setLoadingOnt(false);
    }
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

  const handleOpenBroadcastModal = () => {
    setIsModalOpen(true);
  };

  return (
    <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Sidebar Customer Form Card */}
      <div className="xl:col-span-1">
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
          onCancelEdit={onCancelEdit}
        />
      </div>

      {/* Customer List Card */}
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm xl:col-span-2 overflow-hidden flex flex-col">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Daftar Pelanggan</h2>
            <p className="text-xs text-slate-500 mt-1">Pantau status billing, paket, jatuh tempo, dan referral pelanggan dalam satu daftar terpadu.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {user?.role !== "viewer" && (
              <button
                type="button"
                onClick={handleOpenBroadcastModal}
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
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
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
                  colSpan={user?.role !== "viewer" ? 12 : 11}
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
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                      {customer.diskon > 0 ? `Rp ${customer.diskon.toLocaleString("id-ID")}` : "-"}
                    </td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                      {customer.referral_balance > 0 ? `Rp ${customer.referral_balance.toLocaleString("id-ID")}` : "-"}
                    </td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300 font-mono text-xs">{customer.referral_code || "-"}</td>
                    <td className="px-4 py-4 text-slate-600 dark:text-slate-400">{customer.referred_by_name || "-"}</td>
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
                        <button type="button" className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={() => onEdit(customer)}>
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
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedCount={selectedCount}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
      />

      {/* Customer Detail Drawer Modal */}
      {detailedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-150 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Detail Pelanggan</h3>
                <p className="text-xs text-slate-500 mt-0.5">Informasi profil operasional & riwayat billing pelanggan.</p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-655 p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                onClick={() => setDetailedCustomer(null)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Profile Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-150">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Nama Lengkap</span>
                  <strong className="text-slate-800 text-sm mt-0.5 block">{detailedCustomer.name}</strong>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Paket Internet</span>
                  <strong className="text-slate-800 text-sm mt-0.5 block">
                    {detailedCustomer.package_name ?? "-"} ({formatCurrency(detailedCustomer.package_price ?? 0)})
                  </strong>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Status Layanan</span>
                  <span className="mt-1 block">
                    <StatusPill
                      label={detailedCustomer.status}
                      tone={detailedCustomer.status === "active" ? "green" : detailedCustomer.status === "limit" ? "red" : "slate"}
                    />
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Username PPPoE</span>
                  <code className="text-indigo-600 font-mono text-xs font-semibold mt-0.5 block bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 w-max">
                    {detailedCustomer.user_pppoe || "-"}
                  </code>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Password PPPoE</span>
                  <code className="text-indigo-600 font-mono text-xs font-semibold mt-0.5 block bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 w-max">
                    {detailedCustomer.password_pppoe || "-"}
                  </code>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">SN ONT</span>
                  <span className="text-slate-700 text-sm mt-0.5 font-mono block">{detailedCustomer.sn_ont || "-"}</span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Nomor WhatsApp</span>
                  <span className="text-slate-750 text-sm mt-0.5 block font-semibold">
                    {detailedCustomer.whatsapp ? (
                      <a href={`https://wa.me/${detailedCustomer.whatsapp}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                        {detailedCustomer.whatsapp}
                      </a>
                    ) : (
                      "-"
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Siklus Jatuh Tempo</span>
                  <strong className="text-slate-800 text-sm mt-0.5 block">Tanggal {detailedCustomer.due_day}</strong>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Diskon Bulanan</span>
                  <strong className="text-slate-800 text-sm mt-0.5 block">
                    {detailedCustomer.diskon > 0 ? formatCurrency(detailedCustomer.diskon) : "-"}
                  </strong>
                </div>
                <div className="lg:col-span-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Alamat Pemasangan</span>
                  <p className="text-slate-700 text-xs mt-1 leading-relaxed bg-white border border-slate-150 p-3 rounded-xl">
                    {detailedCustomer.address || "Belum ada informasi alamat."}
                  </p>
                </div>
                {detailedCustomer.sn_ont && (
                  <div className="lg:col-span-3 bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">GenieACS TR-069 Monitor</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCheckOntStatus(detailedCustomer.id)}
                          disabled={loadingOnt || rebootingOnt}
                          className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-60"
                        >
                          {loadingOnt ? <Loader2 size={12} className="animate-spin" /> : null}
                          {loadingOnt ? "Checking..." : "Cek Koneksi ONT"}
                        </button>
                        {ontStatus && (
                          <>
                            {user?.role !== "viewer" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleWifiUpdate(detailedCustomer.id)}
                                  disabled={loadingOnt || rebootingOnt || updatingWifi || resettingOnt}
                                  className="text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-60"
                                >
                                  {updatingWifi ? <Loader2 size={12} className="animate-spin" /> : null}
                                  {updatingWifi ? "Updating..." : "Ubah WiFi"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleFactoryResetOnt(detailedCustomer.id)}
                                  disabled={loadingOnt || rebootingOnt || updatingWifi || resettingOnt}
                                  className="text-xs font-semibold bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-60"
                                >
                                  {resettingOnt ? <Loader2 size={12} className="animate-spin" /> : null}
                                  {resettingOnt ? "Resetting..." : "Reset Pabrik"}
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRebootOnt(detailedCustomer.id)}
                              disabled={loadingOnt || rebootingOnt || updatingWifi || resettingOnt}
                              className="text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-60"
                            >
                              {rebootingOnt ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
                              {rebootingOnt ? "Rebooting..." : "Reboot ONT"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {ontError && (
                      <div className="text-xs text-red-600 bg-red-50 border border-red-150 p-2.5 rounded-lg flex items-center gap-2">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{ontError}</span>
                      </div>
                    )}

                    {ontStatus && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                        <div>
                          <span className="text-[10px] font-semibold text-slate-400 block">Status ONT</span>
                          <span className="mt-1 block">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                              ontStatus.status === "online" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${ontStatus.status === "online" ? "bg-emerald-500" : "bg-red-500"}`}></span>
                              {ontStatus.status === "online" ? "Online" : "Offline"}
                            </span>
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-400 block">Model ONT</span>
                          <strong className="text-slate-800 text-xs mt-0.5 block">{ontStatus.model} ({ontStatus.hardware_version})</strong>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-400 block">IP Address CPE</span>
                          <code className="text-slate-700 font-mono text-xs mt-0.5 block">{ontStatus.ip_address}</code>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-400 block">Uptime ONT</span>
                          <strong className="text-slate-800 text-xs mt-0.5 block">{ontStatus.uptime || "-"}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-400 block">Rx Optical Power</span>
                          <span className={`text-xs font-bold mt-0.5 block ${
                            parseFloat(ontStatus.rx_optical_power) < -27 ? "text-red-655" : parseFloat(ontStatus.rx_optical_power) < -25 ? "text-amber-655" : "text-emerald-655"
                          }`}>{ontStatus.rx_optical_power}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-400 block">Tx Optical Power</span>
                          <strong className="text-slate-700 text-xs mt-0.5 block">{ontStatus.tx_optical_power}</strong>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[10px] font-semibold text-slate-400 block">Last Inform / Connect</span>
                          <span className="text-slate-600 text-xs mt-0.5 block">
                            {ontStatus.last_inform_time ? new Date(ontStatus.last_inform_time).toLocaleString("id-ID") : "-"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {detailedCustomer.is_trial && (
                  <div className="lg:col-span-3 bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-center gap-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-amber-600 shrink-0" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    <div className="text-xs text-amber-800">
                      <strong>Pelanggan dalam Masa Trial Aktif.</strong> Dimulai pada{" "}
                      {detailedCustomer.trial_started_at ? new Date(detailedCustomer.trial_started_at).toLocaleDateString("id-ID") : "-"}{" "}
                      selama {detailedCustomer.trial_days ?? 3} hari.
                    </div>
                  </div>
                )}
              </div>

              {/* Integration Status Cache */}
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">Status Integrasi (Data Terakhir Di-Pool)</span>
                  {detailedCustomer.last_sync_at && (
                    <span className="text-[10px] text-slate-400 font-medium">Terakhir Sync: {new Date(detailedCustomer.last_sync_at).toLocaleString("id-ID")}</span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* PPPoE Cache Card */}
                  <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-2 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-700">PPPoE Status</span>
                      {detailedCustomer.pppoe_status ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          detailedCustomer.pppoe_status === "online" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : detailedCustomer.pppoe_status === "limit" ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-red-50 text-red-700 border border-red-200"
                        }`}>
                          {detailedCustomer.pppoe_status === "online" ? "Online" : detailedCustomer.pppoe_status === "limit" ? "Terisolir" : "Offline"}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Belum di-pool</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase">IP Address</span>
                        <p className="font-mono text-slate-700">{detailedCustomer.pppoe_ip || "-"}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase">Uptime</span>
                        <p className="font-semibold text-slate-700">{detailedCustomer.pppoe_uptime || "-"}</p>
                      </div>
                    </div>
                    {detailedCustomer.user_pppoe && user?.role !== "viewer" && (
                      <div className="pt-2 border-t border-slate-100 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleKickMikrotik(detailedCustomer.id)}
                          disabled={kickingMikrotik}
                          className="text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-60"
                        >
                          {kickingMikrotik ? <Loader2 size={10} className="animate-spin" /> : null}
                          Putus Sesi (Kick)
                        </button>
                      </div>
                    )}
                  </div>

                  {/* GPON ONT Cache Card */}
                  <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-2 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-700">GPON ONT Status</span>
                      {detailedCustomer.ont_status ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          detailedCustomer.ont_status === "online" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
                        }`}>
                          {detailedCustomer.ont_status === "online" ? "Online" : "Offline"}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Belum di-pool</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase">Optical RX/TX</span>
                        <p className="font-semibold text-slate-700">
                          {detailedCustomer.ont_rx_power ? `${detailedCustomer.ont_rx_power} / ${detailedCustomer.ont_tx_power}` : "-"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase">CPE IP / Uptime</span>
                        <p className="font-mono text-slate-700 truncate" title={detailedCustomer.ont_ip}>
                          {detailedCustomer.ont_ip ? `${detailedCustomer.ont_ip}` : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Referral Management Card */}
              <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-4 shadow-sm">
                <div className="border-b border-slate-100 pb-2 flex justify-between items-center">
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Referral Reward & Voucher</h4>
                  <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg font-mono font-semibold">
                    Kode: {detailedCustomer.referral_code || "-"}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Saldo Referral (Tarik Tunai)</span>
                    <strong className="text-base font-extrabold text-indigo-600 block mt-1">
                      {formatCurrency(detailedCustomer.referral_balance)}
                    </strong>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Voucher Diskon (Auto Billing)</span>
                    <strong className="text-base font-extrabold text-emerald-600 block mt-1">
                      {formatCurrency(detailedCustomer.voucher_discount || 0)}
                    </strong>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-150">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Diajak Oleh</span>
                    <strong className="text-slate-800 font-bold block mt-1.5 truncate">
                      {detailedCustomer.referred_by_name || "-"}
                    </strong>
                  </div>
                </div>

                {user?.role !== "viewer" && (
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => handleWithdrawReferral(detailedCustomer)}
                      disabled={detailedCustomer.referral_balance <= 0}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-xl text-xs shadow-sm transition-colors cursor-pointer"
                    >
                      Tarik Tunai Saldo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConvertVoucher(detailedCustomer)}
                      disabled={detailedCustomer.referral_balance <= 0}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-xl text-xs shadow-sm transition-colors cursor-pointer"
                    >
                      Tukar Voucher Diskon
                    </button>
                  </div>
                )}
              </div>

              {/* Bills List Section */}
              <div className="space-y-4">
                <h4 className="text-base font-bold text-slate-800">Riwayat Tagihan</h4>
                <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Invoice</th>
                        <th className="px-6 py-3 font-semibold">Periode</th>
                        <th className="px-6 py-3 font-semibold">Nominal</th>
                        <th className="px-6 py-3 font-semibold">Jatuh Tempo</th>
                        <th className="px-6 py-3 font-semibold">Status</th>
                        <th className="px-6 py-3 font-semibold">Metode</th>
                        <th className="px-6 py-3 font-semibold">Lunas Pada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {loadingBills ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-slate-400">Loading tagihan...</td>
                        </tr>
                      ) : customerBills.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-slate-400">Belum ada riwayat tagihan.</td>
                        </tr>
                      ) : (
                        customerBills.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 text-slate-900 font-semibold">{b.invoice_number}</td>
                            <td className="px-6 py-4 text-slate-600">{b.period}</td>
                            <td className="px-6 py-4 text-slate-700">{formatCurrency(b.amount)}</td>
                            <td className="px-6 py-4 text-slate-600">{b.due_date}</td>
                            <td className="px-6 py-4">
                              <StatusPill
                                label={displayStatusLabel(b.display_status)}
                                tone={displayStatusTone(b.display_status)}
                              />
                            </td>
                            <td className="px-6 py-4 text-slate-600 capitalize">{b.payment_method || "-"}</td>
                            <td className="px-6 py-4 text-slate-500">
                              {b.paid_at ? new Date(b.paid_at).toLocaleString("id-ID") : "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-150 flex justify-end bg-slate-50">
              <button
                type="button"
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2 px-5 rounded-xl text-xs shadow-sm transition-colors"
                onClick={() => setDetailedCustomer(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
