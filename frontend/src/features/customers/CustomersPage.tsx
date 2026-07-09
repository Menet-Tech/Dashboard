import { useState, useEffect, useMemo } from "react";
import { Loader2, Plus, ArrowUpDown, ChevronUp, ChevronDown, RefreshCw } from "lucide-react";
import { StatusPill, EmptyTableRow } from "../../components/ui";
import { Modal } from "../../components/ui/Modal";
import type { CustomerItem, PackageItem, User, OdpItem } from "../../types";
import type { FieldErrors } from "../../utils/validation";
import type { CustomerLifecycleEntry } from "../../lib/lifecycle";
import type { CustomerLifecycleFilter } from "../../hooks/useCustomers";
import { formatCurrency } from "../../utils/format";
import { displayStatusLabel, displayStatusTone } from "../../utils/status";
import { bulkUpdateCustomerStatus } from "../../lib/api";
import { useDialog } from "../../context/DialogContext";

import { CustomerFormCard } from "./components/CustomerFormCard";
import { BroadcastModal } from "./components/BroadcastModal";
import { CustomerDetailModal } from "./components/CustomerDetailModal";
import { MikrotikSyncModal } from "./components/MikrotikSyncModal";

export type CustomerFormState = {
  name: string;
  package_id: number;
  user_pppoe: string;
  password_pppoe: string;
  whatsapp: string;
  email: string;
  sn_ont: string;
  due_day: number;
  status: CustomerItem["status"];
  address: string;
  diskon: number;
  tipe_diskon: "flat" | "percent";
  referred_by_id: number;
  referral_balance: number;
  odp_id: number;
  odp_port?: number;
};

export const defaultCustomerForm = (): CustomerFormState => ({
  name: "",
  package_id: 0,
  user_pppoe: "",
  password_pppoe: "",
  whatsapp: "",
  email: "",
  sn_ont: "",
  due_day: 8,
  status: "active",
  address: "",
  diskon: 0,
  tipe_diskon: "flat",
  referred_by_id: 0,
  referral_balance: 0,
  odp_id: 0,
  odp_port: undefined,
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
  onDelete: (id: number) => void;
  onDeleteBulk: (ids: number[]) => void;
  isFormOpen: boolean;
  onSetFormOpen: (open: boolean) => void;
  onEndTrial?: (id: number) => void;
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
  onDelete,
  onDeleteBulk,
  isFormOpen,
  onSetFormOpen,
  onEndTrial,
}: CustomersPageProps) {
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
  const { showAlert, showConfirm } = useDialog();
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [detailedCustomer, setDetailedCustomer] = useState<CustomerItem | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelectSecret = (name: string, password: string, guessedPackageId: number) => {
    onCancelEdit();
    onFormChange((curr) => ({
      ...curr,
      name: name,
      user_pppoe: name,
      password_pppoe: password,
      package_id: guessedPackageId,
    }));
    setIsSyncModalOpen(false);
    onSetFormOpen(true);
  };

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

  const searchedCustomers = useMemo(() => {
    if (!searchQuery.trim()) return filteredCustomers;
    const q = searchQuery.toLowerCase();
    return filteredCustomers.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.user_pppoe || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q) ||
        (c.whatsapp || "").includes(q)
    );
  }, [filteredCustomers, searchQuery]);

  const sortedCustomers = [...searchedCustomers].sort((a, b) => {
    if (!sortField) return 0;
    
    let aVal: any = null;
    let bVal: any = null;
    
    if (sortField === "billing_lifecycle") {
      aVal = customerLifecycleMap[a.id]?.key ?? "";
      bVal = customerLifecycleMap[b.id]?.key ?? "";
    } else {
      aVal = (a as any)[sortField];
      bVal = (b as any)[sortField];
    }

    // Handle null/undefined values: treat as 0 for numbers, empty string for others
    const isNumericField = sortField === "due_day" || sortField === "diskon" || sortField === "referral_balance";
    if (aVal === null || aVal === undefined) {
      aVal = isNumericField ? 0 : "";
    }
    if (bVal === null || bVal === undefined) {
      bVal = isNumericField ? 0 : "";
    }

    if (isNumericField) {
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
    }

    // Convert to string and case-insensitive compare with numeric support
    const aStr = String(aVal).trim().toLowerCase();
    const bStr = String(bVal).trim().toLowerCase();

    return sortDirection === "asc"
      ? aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: "base" })
      : bStr.localeCompare(aStr, undefined, { numeric: true, sensitivity: "base" });
  });

  const renderSortableHeader = (label: string, field: string, align: "left" | "center" = "left") => {
    const isSorted = sortField === field;
    return (
      <th 
        className={`px-4 py-4 font-semibold select-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${align === "center" ? "text-center" : "text-left"}`}
        onClick={() => requestSort(field)}
      >
        <div className={`inline-flex items-center gap-1.5 ${align === "center" ? "justify-center w-full" : ""}`}>
          <span>{label}</span>
          {isSorted ? (
            sortDirection === "asc" ? (
              <ChevronUp size={12} className="text-indigo-600 dark:text-indigo-400 stroke-[3]" />
            ) : (
              <ChevronDown size={12} className="text-indigo-600 dark:text-indigo-400 stroke-[3]" />
            )
          ) : (
            <ArrowUpDown size={12} className="text-slate-300 dark:text-slate-600 opacity-50 transition-opacity" />
          )}
        </div>
      </th>
    );
  };
  const [odps, setOdps] = useState<OdpItem[]>([]);

  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<"status" | "package" | "odp" | "referral" | "delete">("status");
  const [bulkSearchQuery, setBulkSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<CustomerItem["status"]>("active");
  const [selectedPackageId, setSelectedPackageId] = useState<number>(0);
  const [selectedOdpId, setSelectedOdpId] = useState<number | null>(null);
  const [selectedReferredById, setSelectedReferredById] = useState<number | null>(null);

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
      onSetFormOpen(false);
    }
  }, [submitting, customerErrors, editingCustomerId, onSetFormOpen]);

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

  const handleApplyBulkChange = async () => {
    const ids = Object.entries(selectedIds)
      .filter(([_, val]) => val)
      .map(([id]) => Number(id));

    if (ids.length === 0) return;

    let confirmMsg = "";
    const payload: {
      ids: number[];
      status?: CustomerItem["status"];
      odp_id?: number | null;
      paket_id?: number;
      referred_by_id?: number | null;
    } = { ids };

    if (bulkActionType === "status") {
      payload.status = selectedStatus;
      confirmMsg = `Ubah status ${ids.length} pelanggan terpilih menjadi ${selectedStatus}?`;
    } else if (bulkActionType === "package") {
      if (!selectedPackageId) {
        await showAlert("Pilih paket internet terlebih dahulu!");
        return;
      }
      payload.paket_id = selectedPackageId;
      const pkgName = packages.find((p) => p.id === selectedPackageId)?.name || "";
      confirmMsg = `Ubah paket ${ids.length} pelanggan terpilih menjadi ${pkgName}?`;
    } else if (bulkActionType === "odp") {
      if (selectedOdpId === null) {
        await showAlert("Pilih ODP terlebih dahulu!");
        return;
      }
      payload.odp_id = selectedOdpId === -1 ? null : selectedOdpId;
      const odpName = selectedOdpId === -1 ? "Kosongkan/Hapus ODP" : odps.find((o) => o.id === selectedOdpId)?.nama || "";
      confirmMsg = `Ubah ODP ${ids.length} pelanggan terpilih menjadi ${odpName}?`;
    } else if (bulkActionType === "referral") {
      if (selectedReferredById === null) {
        await showAlert("Pilih referral terlebih dahulu!");
        return;
      }
      payload.referred_by_id = selectedReferredById === -1 ? null : selectedReferredById;
      const refName = selectedReferredById === -1 ? "Kosongkan/Hapus Referral" : customers.find((c) => c.id === selectedReferredById)?.name || "";
      confirmMsg = `Ubah Referral ${ids.length} pelanggan terpilih menjadi ${refName}?`;
    } else if (bulkActionType === "delete") {
      confirmMsg = `HAPUS secara permanen ${ids.length} pelanggan terpilih beserta semua PPP secret mereka di MikroTik? Tindakan ini tidak dapat dibatalkan!`;
    }

    if (await showConfirm(confirmMsg)) {
      try {
        if (bulkActionType === "delete") {
          await onDeleteBulk(ids);
        } else {
          await bulkUpdateCustomerStatus(
            payload.ids,
            payload.status,
            payload.odp_id === null ? -1 : payload.odp_id,
            payload.paket_id,
            payload.referred_by_id === null ? -1 : payload.referred_by_id
          );
        }
        pushSuccess(`Berhasil memproses aksi massal untuk ${ids.length} pelanggan.`);
        setSelectedIds({});
        setIsBulkEditOpen(false);
        if (onRefresh) onRefresh();
      } catch (err: any) {
        pushError(err.message || "Gagal melakukan aksi massal.");
      }
    }
  };

  const handleToggleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  };

  const handleCloseForm = () => {
    onSetFormOpen(false);
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
                onClick={() => setIsSyncModalOpen(true)}
                className="bg-white border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold py-2 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={14} />
                Sync dari MikroTik
              </button>
            )}
            {user?.role !== "viewer" && (
              <button
                type="button"
                onClick={() => {
                  onCancelEdit();
                  onSetFormOpen(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
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
            {user?.role !== "viewer" && selectedCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setBulkActionType("status");
                  setBulkSearchQuery("");
                  setSelectedStatus("active");
                  setSelectedPackageId(0);
                  setSelectedOdpId(null);
                  setSelectedReferredById(null);
                  setIsBulkEditOpen(true);
                }}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold py-2 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                Aksi Massal ({selectedCount})
              </button>
            )}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-sm font-sans w-full sm:w-64">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 shrink-0"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input
                type="text"
                placeholder="Cari nama, pppoe, alamat..."
                className="bg-transparent border-0 text-xs font-semibold text-slate-750 dark:text-slate-200 focus:outline-none focus:ring-0 w-full py-0 pl-1 pr-1"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl px-3 py-2 shadow-sm font-sans">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Filter Role</span>
              <select
                className="bg-transparent border-0 text-xs font-semibold text-slate-750 dark:text-slate-200 focus:outline-none focus:ring-0 cursor-pointer py-0 pl-1 pr-6"
                value={customerLifecycleFilter}
                onChange={(e) => onFilterChange(e.target.value as CustomerLifecycleFilter)}
                aria-label="Filter role billing pelanggan"
              >
                <option value="exclude_inactive">Semua Kecuali Inactive</option>
                <option value="all">Semua (Termasuk Inactive)</option>
                <option value="trial">Trial Aktif</option>
                <option value="perpanjangan">Perpanjangan</option>
                <option value="tertagih">Tertagih</option>
                <option value="jatuh_tempo">Jatuh Tempo</option>
                <option value="menunggak">Menunggak</option>
                <option value="lunas">Lunas</option>
                <option value="wifi_umum">🛜 WiFi Umum</option>
              </select>
            </div>
            <a
              href="/api/v1/reports/customers/csv"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Export CSV
            </a>
            <StatusPill
              label={
                searchQuery.trim()
                  ? `${searchedCustomers.length} dari ${filteredCustomers.length} item`
                  : `${filteredCustomers.length} item`
              }
              tone="slate"
            />
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
                {renderSortableHeader("Nama", "name")}
                {renderSortableHeader("Paket", "package_name")}
                {renderSortableHeader("Jatuh Tempo", "due_day")}
                {renderSortableHeader("Billing Status / Detail", "billing_lifecycle")}
                {renderSortableHeader("ODP", "odp_name")}
                {renderSortableHeader("Diskon", "diskon")}
                {renderSortableHeader("Reward Ref", "referral_balance")}
                {renderSortableHeader("Kode Ref", "referral_code")}
                {renderSortableHeader("Referred By", "referred_by_name")}
                {renderSortableHeader("Status Layanan", "status", "center")}
                {renderSortableHeader("WhatsApp", "whatsapp")}
                <th className="px-4 py-4 font-semibold text-center select-none">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedCustomers.length === 0 ? (
                <EmptyTableRow
                  message={
                    customers.length === 0
                      ? "Belum ada pelanggan terdaftar."
                      : "Tidak ada pelanggan yang cocok dengan filter role saat ini."
                  }
                  colSpan={user?.role !== "viewer" ? 13 : 12}
                />
              ) : (
                sortedCustomers.map((customer) => {
                  const isMultiAccount = customer.whatsapp && customers.filter(c => {
                    if (!c.whatsapp) return false;
                    const p1 = c.whatsapp.trim().replace(/[+\-\s]/g, "").replace(/^0/, "62");
                    const p2 = customer.whatsapp.trim().replace(/[+\-\s]/g, "").replace(/^0/, "62");
                    return p1 === p2;
                  }).length > 1;

                  return (
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
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDetails(customer)}
                            className="text-indigo-600 hover:text-indigo-700 hover:underline font-semibold text-left transition-colors"
                          >
                            {customer.name}
                          </button>
                          {isMultiAccount && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">
                              Multi-Akun
                            </span>
                          )}
                        </div>
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
                      {customer.diskon > 0 ? (customer.tipe_diskon === "percent" ? `${customer.diskon}%` : `Rp ${customer.diskon.toLocaleString("id-ID")}`) : "-"}
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
                        <option value="suspended">Suspended</option>
                        <option value="inactive">Inactive</option>
                        <option value="wifi_umum">WiFi Umum</option>
                      </select>
                    </td>
                    <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                      {customer.whatsapp ? (
                        <a
                          href={`https://wa.me/+${customer.whatsapp.replace(/[+\-\s]/g, "").replace(/^0/, "62")}`}
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
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                            onClick={() => {
                              onEdit(customer);
                              onSetFormOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="bg-red-50 border border-red-200 hover:bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                            onClick={() => onDelete(customer.id)}
                          >
                            Hapus
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
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

      {/* MikroTik Sync Modal */}
      <MikrotikSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        packages={packages}
        onSelectSecret={handleSelectSecret}
      />

      {/* Standalone Customer Details Modal */}
      {detailedCustomer && (
        <CustomerDetailModal
          customer={detailedCustomer}
          customers={customers}
          onSelectCustomer={(cust) => setDetailedCustomer(cust)}
          onClose={() => setDetailedCustomer(null)}
          user={user}
          pushSuccess={pushSuccess}
          pushError={pushError}
          onRefresh={onRefresh}
          onEndTrial={onEndTrial}
        />
      )}


      {/* Bulk Edit Modal */}
      {isBulkEditOpen && (
        <Modal
          title={`Ubah Data Massal (${selectedCount} Pelanggan Terpilih)`}
          onClose={() => setIsBulkEditOpen(false)}
          actions={
            <>
              <button
                type="button"
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors cursor-pointer"
                onClick={() => setIsBulkEditOpen(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors cursor-pointer"
                onClick={handleApplyBulkChange}
              >
                Terapkan Perubahan
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Pilih Aksi Perubahan</span>
              <select
                className="block w-full rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={bulkActionType}
                onChange={(e) => {
                  setBulkActionType(e.target.value as any);
                  setBulkSearchQuery("");
                }}
              >
                <option value="status">Ubah Status Layanan</option>
                <option value="package">Ubah Paket Internet</option>
                <option value="odp">Ubah Titik Distribusi ODP</option>
                <option value="referral">Ubah Referral (Direkomendasikan Oleh)</option>
                <option value="delete">Hapus Pelanggan (Hapus juga PPP secret)</option>
              </select>
            </div>

            {bulkActionType === "status" && (
              <div className="flex flex-col gap-2.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Pilih Status Baru</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(["active", "limit", "pending", "suspended", "inactive", "wifi_umum"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSelectedStatus(st)}
                      className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-center ${
                        selectedStatus === st
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                          : "bg-white border-gray-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {st === "active"
                        ? "Active (Aktif)"
                        : st === "limit"
                          ? "Limit (Isolir)"
                          : st === "pending"
                            ? "Pending (Perpanjangan)"
                            : st === "suspended"
                              ? "Suspended (Ditangguhkan)"
                              : st === "wifi_umum"
                                ? "🛜 WiFi Umum"
                                : "Inactive (Nonaktif)"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {bulkActionType === "package" && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Pilih Paket Internet Baru</span>
                <input
                  type="text"
                  placeholder="Cari paket..."
                  className="block w-full rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={bulkSearchQuery}
                  onChange={(e) => setBulkSearchQuery(e.target.value)}
                />
                <div className="border border-slate-150 dark:border-slate-800 rounded-xl max-h-48 overflow-y-auto p-1.5 space-y-1 bg-slate-50/50 dark:bg-slate-950/30">
                  {packages
                    .filter((pkg) => pkg.name.toLowerCase().includes(bulkSearchQuery.toLowerCase()))
                    .map((pkg) => (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => setSelectedPackageId(pkg.id)}
                        className={`w-full text-left py-1.5 px-2.5 rounded-lg text-xs font-sans transition-all flex items-center justify-between cursor-pointer ${
                          selectedPackageId === pkg.id
                            ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 font-semibold"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <span>{pkg.name}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">{pkg.speed_mbps} Mbps</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {bulkActionType === "odp" && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Pilih ODP Baru</span>
                <input
                  type="text"
                  placeholder="Cari ODP..."
                  className="block w-full rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={bulkSearchQuery}
                  onChange={(e) => setBulkSearchQuery(e.target.value)}
                />
                <div className="border border-slate-150 dark:border-slate-800 rounded-xl max-h-48 overflow-y-auto p-1.5 space-y-1 bg-slate-50/50 dark:bg-slate-950/30">
                  <button
                    type="button"
                    onClick={() => setSelectedOdpId(-1)}
                    className={`w-full text-left py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      selectedOdpId === -1
                        ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"
                        : "hover:bg-red-50/30 text-red-500 dark:text-red-450"
                    }`}
                  >
                    -- Hapus / Kosongkan ODP --
                  </button>
                  {odps
                    .filter((o) => o.nama.toLowerCase().includes(bulkSearchQuery.toLowerCase()) || o.lokasi.toLowerCase().includes(bulkSearchQuery.toLowerCase()))
                    .map((odp) => (
                      <button
                        key={odp.id}
                        type="button"
                        onClick={() => setSelectedOdpId(odp.id)}
                        className={`w-full text-left py-1.5 px-2.5 rounded-lg text-xs font-sans transition-all flex items-center justify-between cursor-pointer ${
                          selectedOdpId === odp.id
                            ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 font-semibold"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <span>{odp.nama}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">{odp.lokasi}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {bulkActionType === "referral" && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Pilih Pemberi Referral Baru</span>
                <input
                  type="text"
                  placeholder="Cari pelanggan..."
                  className="block w-full rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={bulkSearchQuery}
                  onChange={(e) => setBulkSearchQuery(e.target.value)}
                />
                <div className="border border-slate-150 dark:border-slate-800 rounded-xl max-h-48 overflow-y-auto p-1.5 space-y-1 bg-slate-50/50 dark:bg-slate-950/30">
                  <button
                    type="button"
                    onClick={() => setSelectedReferredById(-1)}
                    className={`w-full text-left py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      selectedReferredById === -1
                        ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"
                        : "hover:bg-red-50/30 text-red-500 dark:text-red-450"
                    }`}
                  >
                    -- Hapus / Kosongkan Referral --
                  </button>
                  {customers
                    .filter((c) => c.name.toLowerCase().includes(bulkSearchQuery.toLowerCase()))
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedReferredById(c.id)}
                        className={`w-full text-left py-1.5 px-2.5 rounded-lg text-xs font-sans transition-all flex items-center justify-between cursor-pointer ${
                          selectedReferredById === c.id
                            ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 font-semibold"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <span>{c.name}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">{c.whatsapp || "Tanpa WA"}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {bulkActionType === "delete" && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 p-4 rounded-xl space-y-2">
                <h4 className="text-red-750 dark:text-red-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                  Peringatan Keamanan
                </h4>
                <p className="text-xs text-red-650 dark:text-red-300/90 leading-relaxed font-sans">
                  Anda akan menghapus secara massal <strong>{selectedCount} pelanggan</strong> yang dipilih beserta semua akun/secret PPPoE mereka di semua router MikroTik yang terhubung.
                </p>
                <p className="text-[10px] text-red-500 dark:text-red-400/80 italic font-medium">
                  *Tindakan ini bersifat permanen dan tidak dapat dibatalkan.
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
