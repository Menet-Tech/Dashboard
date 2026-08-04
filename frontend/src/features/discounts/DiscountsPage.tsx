import { useState, useEffect, useMemo } from "react";
import type { CustomerItem, User, VoucherItem, CustomerVoucherItem, VoucherUsageLogItem } from "../../types";
import {
  updateCustomer,
  withdrawReferral,
  convertReferralToVoucher,
  fetchVouchers,
  createVoucher,
  deleteVoucher,
  fetchVoucherUsageLogs,
  fetchCustomerVouchers,
  claimCustomerVoucher,
  toggleCustomerVoucherAutoApply,
  fetchReferralWithdrawals,
  completeReferralWithdrawal,
  rejectReferralWithdrawal,
  type ReferralWithdrawalItem
} from "../../lib/api";
import { formatCurrency } from "../../utils/format";
import { Info, ArrowUpRight, ArrowDownLeft, Gift, Percent, Search, Trash2, Edit3, Plus, X, Ticket, Settings, Clock, CheckCircle, XCircle, FileText, Camera, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import { useDialog } from "../../context/DialogContext";
import { Button } from "../../components/ui/Button";

type DiscountsPageProps = {
  user: User | null;
  customers: CustomerItem[];
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  onRefresh: () => Promise<void>;
};

const formatNumberWithDots = (val: string | number) => {
  if (val === "" || val === 0 || val === "0") return "";
  const num = typeof val === "number" ? val : parseInt(val.replace(/\D/g, ""), 10);
  if (isNaN(num)) return "";
  return num.toLocaleString("id-ID");
};

const parseFormattedNumber = (val: string) => {
  const clean = val.replace(/\D/g, "");
  const num = parseInt(clean, 10);
  return isNaN(num) ? 0 : num;
};

export function DiscountsPage({
  user,
  customers,
  pushSuccess,
  pushError,
  onRefresh,
}: DiscountsPageProps) {
  const [activeTab, setActiveTab] = useState<"discounts" | "referrals" | "vouchers" | "withdrawals">("discounts");
  const { showAlert, showConfirm } = useDialog();
  const [searchQuery, setSearchQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Referral Withdrawals state
  const [withdrawalsList, setWithdrawalsList] = useState<ReferralWithdrawalItem[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);

  // Complete Payout modal state
  const [isCompleteWithdrawOpen, setIsCompleteWithdrawOpen] = useState(false);
  const [selectedWithdrawForComplete, setSelectedWithdrawForComplete] = useState<ReferralWithdrawalItem | null>(null);
  const [completeProofFile, setCompleteProofFile] = useState<File | null>(null);
  const [completeNotes, setCompleteNotes] = useState("");

  // Reject Payout modal state
  const [isRejectWithdrawOpen, setIsRejectWithdrawOpen] = useState(false);
  const [selectedWithdrawForReject, setSelectedWithdrawForReject] = useState<ReferralWithdrawalItem | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  // Vouchers state
  const [vouchersList, setVouchersList] = useState<VoucherItem[]>([]);
  const [customerVouchersList, setCustomerVouchersList] = useState<CustomerVoucherItem[]>([]);
  const [usageLogsList, setUsageLogsList] = useState<VoucherUsageLogItem[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);

  // Modal State - Voucher Templates
  const [isCreateVoucherOpen, setIsCreateVoucherOpen] = useState(false);
  const [newVoucherCode, setNewVoucherCode] = useState("");
  const [newVoucherAmount, setNewVoucherAmount] = useState<string>("");
  const [newVoucherType, setNewVoucherType] = useState<"one-time" | "multi-use" | "permanent">("one-time");
  const [newVoucherCycles, setNewVoucherCycles] = useState<number>(1);
  const [newVoucherDesc, setNewVoucherDesc] = useState("");

  // Modal State - Assign Voucher
  const [isAssignVoucherOpen, setIsAssignVoucherOpen] = useState(false);
  const [selectedCustomerForVoucher, setSelectedCustomerForVoucher] = useState<number>(0);
  const [selectedVoucherTemplate, setSelectedVoucherTemplate] = useState<number>(0);

  const loadVouchersData = async () => {
    setLoadingVouchers(true);
    try {
      const [vRes, cvRes, logsRes] = await Promise.all([
        fetchVouchers(),
        fetchCustomerVouchers(),
        fetchVoucherUsageLogs(),
      ]);
      setVouchersList(vRes.data || []);
      setCustomerVouchersList(cvRes.data || []);
      setUsageLogsList(logsRes.data || []);
    } catch (err: any) {
      pushError(err.message || "Gagal memuat data voucher.");
    } finally {
      setLoadingVouchers(false);
    }
  };

  const loadWithdrawalsData = async () => {
    setLoadingWithdrawals(true);
    try {
      const res = await fetchReferralWithdrawals();
      setWithdrawalsList(res.data || []);
    } catch (err: any) {
      pushError(err.message || "Gagal memuat data penarikan referral.");
    } finally {
      setLoadingWithdrawals(false);
    }
  };

  useEffect(() => {
    if (activeTab === "vouchers") {
      void loadVouchersData();
    } else if (activeTab === "withdrawals") {
      void loadWithdrawalsData();
    }
  }, [activeTab]);

  // Modal State - Discounts
  const [editingDiscountCustomer, setEditingDiscountCustomer] = useState<CustomerItem | null>(null);
  const [discountValueInput, setDiscountValueInput] = useState<string>("");
  const [discountTypeInput, setDiscountTypeInput] = useState<"flat" | "percent">("flat");
  const [isCreateDiscountOpen, setIsCreateDiscountOpen] = useState(false);
  const [selectedCustomerForNewDiscount, setSelectedCustomerForNewDiscount] = useState<number>(0);

  // Modal State - Referrals
  const [editingReferralCustomer, setEditingReferralCustomer] = useState<CustomerItem | null>(null);
  const [refCode, setRefCode] = useState("");
  const [refBalance, setRefBalance] = useState<number>(0);
  const [refReferredById, setRefReferredById] = useState<number>(0);

  // Filter customers based on search query
  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.whatsapp && c.whatsapp.includes(searchQuery)) ||
    (c.referral_code && c.referral_code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Reset sorting state when tab changes to avoid mismatched sort columns
  useEffect(() => {
    setSortField(null);
    setSortDirection("asc");
  }, [activeTab]);

  const requestSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortableHeader = (label: string, field: string, align: "left" | "center" = "left") => {
    const isSorted = sortField === field;
    return (
      <th 
        className={`px-6 py-4 font-semibold select-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400 ${align === "center" ? "text-center" : "text-left"}`}
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

  // List of customers who have special discounts (sorted)
  const sortedDiscountCustomers = useMemo(() => {
    const list = filteredCustomers.filter((c) => c.diskon > 0);
    if (!sortField) return list;
    return [...list].sort((a, b) => {
      let aVal = (a as any)[sortField];
      let bVal = (b as any)[sortField];

      if (sortField === "final_price") {
        const aPrice = a.package_price || 0;
        const aDisc = a.diskon || 0;
        aVal = a.tipe_diskon === "percent" ? aPrice - (aPrice * aDisc) / 100 : aPrice - aDisc;

        const bPrice = b.package_price || 0;
        const bDisc = b.diskon || 0;
        bVal = b.tipe_diskon === "percent" ? bPrice - (bPrice * bDisc) / 100 : bPrice - bDisc;
      }

      const isNumericField = sortField === "package_price" || sortField === "diskon" || sortField === "final_price";
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
  }, [filteredCustomers, sortField, sortDirection]);

  // List of customers with active referrals (sorted)
  const sortedReferralCustomers = useMemo(() => {
    const list = filteredCustomers.filter((c) => {
      const referredOthers = customers.some((other) => other.referred_by_id === c.id);
      return c.referral_balance > 0 || referredOthers || c.referral_code;
    });
    if (!sortField) return list;
    return [...list].sort((a, b) => {
      let aVal = (a as any)[sortField];
      let bVal = (b as any)[sortField];

      if (sortField === "referred_count") {
        aVal = customers.filter((other) => other.referred_by_id === a.id).length;
        bVal = customers.filter((other) => other.referred_by_id === b.id).length;
      }

      const isNumericField = sortField === "referral_balance" || sortField === "voucher_discount" || sortField === "referred_count";
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
  }, [filteredCustomers, customers, sortField, sortDirection]);

  // Sorted withdrawals list
  const sortedWithdrawalsList = useMemo(() => {
    const list = withdrawalsList.filter((w) =>
      w.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (!sortField) return list;
    return [...list].sort((a, b) => {
      let aVal = (a as any)[sortField];
      let bVal = (b as any)[sortField];

      const isNumericField = sortField === "amount";
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
  }, [withdrawalsList, searchQuery, sortField, sortDirection]);

  // Customers who DO NOT have a discount yet (for new discount dropdown)
  const nonDiscountCustomers = customers.filter((c) => c.diskon === 0);

  // === DISCOUNT CRUD HANDLERS ===
  const handleOpenEditDiscount = (customer: CustomerItem) => {
    setEditingDiscountCustomer(customer);
    setDiscountTypeInput(customer.tipe_diskon || "flat");
    setDiscountValueInput(
      customer.diskon
        ? (customer.tipe_diskon === "percent" ? String(customer.diskon) : formatNumberWithDots(customer.diskon))
        : ""
    );
  };

  const handleSaveDiscount = async (e: React.FormEvent, targetCustomer: CustomerItem, val: number, type: "flat" | "percent") => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Omit<CustomerItem, "id" | "package_name" | "package_price"> = {
        name: targetCustomer.name,
        package_id: targetCustomer.package_id,
        user_pppoe: targetCustomer.user_pppoe,
        password_pppoe: targetCustomer.password_pppoe,
        whatsapp: targetCustomer.whatsapp,
        sn_ont: targetCustomer.sn_ont,
        due_day: targetCustomer.due_day,
        status: targetCustomer.status,
        address: targetCustomer.address,
        diskon: val,
        tipe_diskon: type,
        referred_by_id: targetCustomer.referred_by_id || 0,
        referral_balance: targetCustomer.referral_balance || 0,
      };

      await updateCustomer(targetCustomer.id, payload);
      pushSuccess(`Diskon khusus untuk ${targetCustomer.name} berhasil diperbarui.`);
      setEditingDiscountCustomer(null);
      setDiscountValueInput("");
      setIsCreateDiscountOpen(false);
      setSelectedCustomerForNewDiscount(0);
      await onRefresh();
    } catch (err: any) {
      pushError(err.message || "Gagal memperbarui diskon khusus.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDiscount = async (customer: CustomerItem) => {
    if (!(await showConfirm(`Apakah Anda yakin ingin menghapus diskon khusus untuk ${customer.name}?`))) {
      return;
    }
    setSubmitting(true);
    try {
      const payload: Omit<CustomerItem, "id" | "package_name" | "package_price"> = {
        name: customer.name,
        package_id: customer.package_id,
        user_pppoe: customer.user_pppoe,
        password_pppoe: customer.password_pppoe,
        whatsapp: customer.whatsapp,
        sn_ont: customer.sn_ont,
        due_day: customer.due_day,
        status: customer.status,
        address: customer.address,
        diskon: 0, // Reset discount
        tipe_diskon: "flat",
        referred_by_id: customer.referred_by_id || 0,
        referral_balance: customer.referral_balance || 0,
      };

      await updateCustomer(customer.id, payload);
      pushSuccess(`Diskon khusus untuk ${customer.name} telah dihapus.`);
      await onRefresh();
    } catch (err: any) {
      pushError(err.message || "Gagal menghapus diskon.");
    } finally {
      setSubmitting(false);
    }
  };

  // === REFERRAL CRUD HANDLERS ===
  const handleOpenEditReferral = (customer: CustomerItem) => {
    setEditingReferralCustomer(customer);
    setRefCode(customer.referral_code || "");
    setRefBalance(customer.referral_balance || 0);
    setRefReferredById(customer.referred_by_id || 0);
  };

  const handleSaveReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReferralCustomer) return;

    setSubmitting(true);
    try {
      const payload = {
        name: editingReferralCustomer.name,
        package_id: editingReferralCustomer.package_id,
        user_pppoe: editingReferralCustomer.user_pppoe,
        password_pppoe: editingReferralCustomer.password_pppoe,
        whatsapp: editingReferralCustomer.whatsapp,
        sn_ont: editingReferralCustomer.sn_ont,
        due_day: editingReferralCustomer.due_day,
        status: editingReferralCustomer.status,
        address: editingReferralCustomer.address,
        diskon: editingReferralCustomer.diskon || 0,
        referred_by_id: refReferredById || 0,
        referral_balance: refBalance,
        referral_code: refCode,
      };

      await updateCustomer(editingReferralCustomer.id, payload);
      pushSuccess(`Data referral untuk ${editingReferralCustomer.name} berhasil diperbarui.`);
      setEditingReferralCustomer(null);
      await onRefresh();
    } catch (err: any) {
      pushError(err.message || "Gagal memperbarui data referral.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReferral = async (customer: CustomerItem) => {
    if (!(await showConfirm(`Apakah Anda yakin ingin me-reset (hapus) data referral untuk ${customer.name}?`))) {
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: customer.name,
        package_id: customer.package_id,
        user_pppoe: customer.user_pppoe,
        password_pppoe: customer.password_pppoe,
        whatsapp: customer.whatsapp,
        sn_ont: customer.sn_ont,
        due_day: customer.due_day,
        status: customer.status,
        address: customer.address,
        diskon: customer.diskon || 0,
        referred_by_id: 0,
        referral_balance: 0,
        referral_code: "",
      };

      await updateCustomer(customer.id, payload);
      pushSuccess(`Data referral untuk ${customer.name} telah di-reset.`);
      await onRefresh();
    } catch (err: any) {
      pushError(err.message || "Gagal me-reset data referral.");
    } finally {
      setSubmitting(false);
    }
  };

  // === REDEEM FLOWS ===
  const REFERRAL_FIXED = 50_000;

  const handleWithdraw = async (customer: CustomerItem) => {
    if (customer.referral_balance < REFERRAL_FIXED) {
      await showAlert(`Saldo referral tidak mencukupi. Minimal Rp ${REFERRAL_FIXED.toLocaleString("id-ID")} untuk menarik tunai.`);
      return;
    }
    const confirmed = await showConfirm(
      `Tarik tunai saldo referral ${customer.name} sebesar Rp ${REFERRAL_FIXED.toLocaleString("id-ID")}?\n\nCatatan: Jika periode ini sudah menggunakan voucher referral untuk tagihan, penarikan tidak dapat dilakukan.`
    );
    if (!confirmed) return;

    try {
      await withdrawReferral(customer.id);
      pushSuccess(`Berhasil mencatat penarikan saldo referral sebesar ${formatCurrency(REFERRAL_FIXED)} untuk ${customer.name}.`);
      await onRefresh();
    } catch (err: any) {
      pushError(err.message || "Gagal mencatat penarikan.");
    }
  };

  const handleConvertToVoucher = async (customer: CustomerItem) => {
    if (customer.referral_balance < REFERRAL_FIXED) {
      await showAlert(`Saldo referral tidak mencukupi. Minimal Rp ${REFERRAL_FIXED.toLocaleString("id-ID")} untuk menukar voucher.`);
      return;
    }
    const confirmed = await showConfirm(
      `Tukarkan Rp ${REFERRAL_FIXED.toLocaleString("id-ID")} saldo referral ${customer.name} menjadi voucher diskon tagihan?\n\nCatatan: Jika periode ini sudah mengajukan penarikan tunai referral, penukaran tidak dapat dilakukan.`
    );
    if (!confirmed) return;

    try {
      await convertReferralToVoucher(customer.id);
      pushSuccess(`Berhasil menukarkan saldo referral menjadi voucher diskon sebesar ${formatCurrency(REFERRAL_FIXED)} untuk ${customer.name}.`);
      await onRefresh();
    } catch (err: any) {
      pushError(err.message || "Gagal menukarkan voucher.");
    }
  };

  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVoucherCode.trim()) return;
    const amt = parseFormattedNumber(newVoucherAmount);
    if (amt <= 0) {
      await showAlert("Nominal diskon harus lebih dari 0.");
      return;
    }
    setSubmitting(true);
    try {
      await createVoucher({
        code: newVoucherCode.trim().toUpperCase(),
        amount: amt,
        type: newVoucherType,
        total_cycles: newVoucherType === "multi-use" ? newVoucherCycles : newVoucherType === "one-time" ? 1 : 0,
        description: newVoucherDesc,
      });
      pushSuccess("Voucher baru berhasil dibuat.");
      setIsCreateVoucherOpen(false);
      setNewVoucherCode("");
      setNewVoucherAmount("");
      setNewVoucherType("one-time");
      setNewVoucherCycles(1);
      setNewVoucherDesc("");
      void loadVouchersData();
    } catch (err: any) {
      pushError(err.message || "Gagal membuat voucher.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVoucher = async (id: number, code: string) => {
    if (!(await showConfirm(`Apakah Anda yakin ingin menghapus voucher template ${code}? Pelanggan yang sudah mengklaim voucher ini tidak akan terpengaruh, namun kode tidak bisa diklaim lagi.`))) {
      return;
    }
    setSubmitting(true);
    try {
      await deleteVoucher(id);
      pushSuccess("Template voucher berhasil dihapus.");
      void loadVouchersData();
    } catch (err: any) {
      pushError(err.message || "Gagal menghapus template voucher.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCustomerForVoucher <= 0 || selectedVoucherTemplate <= 0) {
      await showAlert("Pilih pelanggan dan voucher template terlebih dahulu.");
      return;
    }
    const code = vouchersList.find(v => v.id === selectedVoucherTemplate)?.code;
    if (!code) return;
    setSubmitting(true);
    try {
      await claimCustomerVoucher(selectedCustomerForVoucher, code);
      pushSuccess("Voucher berhasil diberikan kepada pelanggan.");
      setIsAssignVoucherOpen(false);
      setSelectedCustomerForVoucher(0);
      setSelectedVoucherTemplate(0);
      void loadVouchersData();
      await onRefresh();
    } catch (err: any) {
      pushError(err.message || "Gagal memberikan voucher kepada pelanggan. Pastikan pelanggan belum memiliki voucher aktif.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAutoApply = async (customer: CustomerItem, currentSetting: number) => {
    const nextSetting = currentSetting === 1 ? false : true;
    try {
      await toggleCustomerVoucherAutoApply(customer.id, nextSetting);
      pushSuccess(`Auto-apply voucher untuk ${customer.name} berhasil diubah.`);
      await onRefresh();
      if (activeTab === "vouchers") {
        void loadVouchersData();
      }
    } catch (err: any) {
      pushError(err.message || "Gagal mengubah pengaturan auto-apply.");
    }
  };

  const isViewer = user?.role === "viewer";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            Diskon & Program Referral
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Kelola pemberian diskon khusus/permanen serta insentif program Member-Get-Member (Referral).
          </p>
        </div>

        {/* Tab Selector */}
        <div className="bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl flex border border-slate-200 dark:border-slate-800 shrink-0">
          <Button type="button" variant="outline"
            onClick={() => {
              setActiveTab("discounts");
              setSearchQuery("");
            }}
            className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "discounts"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Percent size={14} />
            Diskon Khusus ({sortedDiscountCustomers.length})
          </Button>
          <Button type="button" variant="outline"
            onClick={() => {
              setActiveTab("referrals");
              setSearchQuery("");
            }}
            className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "referrals"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Gift size={14} />
            Referral MGM ({sortedReferralCustomers.length})
          </Button>
          <Button type="button" variant="outline"
            onClick={() => {
              setActiveTab("vouchers");
              setSearchQuery("");
            }}
            className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "vouchers"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Ticket size={14} />
            Voucher & Promosi
          </Button>
          <Button type="button" variant="outline"
            onClick={() => {
              setActiveTab("withdrawals");
              setSearchQuery("");
            }}
            className={`px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === "withdrawals"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Clock size={14} />
            Penarikan Referral ({withdrawalsList.filter(w => w.status === "pending").length})
          </Button>
        </div>
      </div>

      {/* Info Warning */}
      <div className="bg-blue-50 dark:bg-indigo-950/20 border border-blue-100 dark:border-indigo-900/40 p-4 rounded-3xl flex gap-3 text-sm text-blue-700 dark:text-indigo-300">
        <Info size={18} className="shrink-0 mt-0.5 text-blue-600 dark:text-indigo-400" />
        <div>
          <strong className="font-bold block mb-1">Informasi Fitur:</strong>
          {activeTab === "discounts" ? (
            <p>
              Diskon khusus digunakan untuk pelanggan tertentu (misal: rumahnya dipasangi tiang ODP wifi atau kerjasama lahan). Diskon ini bersifat permanen dan akan otomatis memotong tagihan bulanan pelanggan tersebut setiap periode generate tagihan.
            </p>
          ) : activeTab === "referrals" ? (
            <p>
              Program Member-Get-Member memberikan saldo reward sebesar Rp 50.000 kepada pengajak ketika mengajak orang baru memasang internet. Saldo ini dapat dicairkan tunai atau ditukarkan menjadi voucher diskon tagihan via Dashboard ini maupun via WhatsApp Chatbot.
            </p>
          ) : activeTab === "withdrawals" ? (
            <p>
              Kelola pencairan/penarikan saldo referral pelanggan. Penarikan tunai (Cash) memerlukan penyerahan manual ke rumah pelanggan dan pendokumentasian foto serah terima. Penarikan via Transfer memerlukan pengunggahan bukti transfer ke bank/e-wallet pelanggan sebagai arsip penyelesaian.
            </p>
          ) : (
            <p>
              Sistem Voucher & Promosi digunakan untuk membuat kode voucher diskon dengan batas pemakaian bulanan (Sekali pakai, multi-periode, atau permanen). Admin dapat membuat voucher promosi baru, membagikannya ke pelanggan, atau memantau log penggunaannya.
            </p>
          )}
        </div>
      </div>

      {/* Filter & Search */}
      <div className="bg-white dark:bg-slate-950 p-6 rounded-3xl border border-slate-100 dark:border-slate-900 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder={
              activeTab === "discounts"
                ? "Cari nama pelanggan..."
                : activeTab === "referrals"
                ? "Cari nama atau kode referral..."
                : activeTab === "withdrawals"
                ? "Cari nama pelanggan..."
                : "Cari data voucher..."
            }
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {!isViewer && (
          <div className="flex gap-2">
            {activeTab === "discounts" ? (
              <Button type="button" variant="outline"
                onClick={() => setIsCreateDiscountOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-md shadow-indigo-600/25 flex items-center gap-1.5 shrink-0"
              >
                <Plus size={14} />
                Beri Diskon Baru
              </Button>
            ) : activeTab === "referrals" ? (
              <Button type="button" variant="outline"
                onClick={async () => {
                  // Find first customer with no code to edit referral
                  const firstWithoutRef = customers.find(c => !c.referral_code);
                  if (firstWithoutRef) {
                    handleOpenEditReferral(firstWithoutRef);
                  } else if (customers.length > 0) {
                    handleOpenEditReferral(customers[0]);
                  } else {
                    await showAlert("Belum ada pelanggan terdaftar.");
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-md shadow-indigo-600/25 flex items-center gap-1.5 shrink-0"
              >
                <Plus size={14} />
                Atur Referral Baru
              </Button>
            ) : activeTab === "vouchers" ? (
              <>
                <Button type="button" variant="outline"
                  onClick={() => setIsCreateVoucherOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-md shadow-indigo-600/25 flex items-center gap-1.5 shrink-0"
                >
                  <Plus size={14} />
                  Buat Voucher Baru
                </Button>
                <Button type="button" variant="outline"
                  onClick={() => setIsAssignVoucherOpen(true)}
                  className="bg-slate-800 hover:bg-slate-900 dark:bg-slate-750 dark:hover:bg-slate-700 text-white font-semibold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-md flex items-center gap-1.5 shrink-0"
                >
                  <Gift size={14} />
                  Beri Voucher ke Pelanggan
                </Button>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Table Container */}
      <div className="bg-white dark:bg-slate-950 rounded-3xl border border-slate-100 dark:border-slate-900 shadow-sm overflow-hidden">
        {activeTab === "discounts" ? (
          // === TAB DISKON KHUSUS ===
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-150 dark:border-slate-800/80 text-slate-500 dark:text-slate-400">
                <tr>
                  {renderSortableHeader("Nama Pelanggan", "name")}
                  {renderSortableHeader("Paket Aktif", "package_name")}
                  {renderSortableHeader("Harga Asli", "package_price")}
                  {renderSortableHeader("Nominal Diskon", "diskon")}
                  {renderSortableHeader("Total Setelah Diskon", "final_price")}
                  {!isViewer && <th className="px-6 py-4 font-semibold text-center text-slate-500">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-900 text-slate-700 dark:text-slate-350">
                {sortedDiscountCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={isViewer ? 5 : 6} className="px-6 py-10 text-center text-slate-400">
                      {searchQuery
                        ? "Tidak ada pelanggan berdiskon yang cocok dengan pencarian."
                        : "Belum ada pelanggan yang dikonfigurasi menggunakan diskon khusus. Gunakan tombol 'Beri Diskon Baru' di atas."}
                    </td>
                  </tr>
                ) : (
                  sortedDiscountCustomers.map((customer) => {
                    const price = customer.package_price || 0;
                    const discount = customer.diskon || 0;
                    const finalPrice = Math.max(
                      0,
                      customer.tipe_diskon === "percent"
                        ? price - (price * discount) / 100
                        : price - discount
                    );

                    return (
                      <tr key={customer.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">
                          {customer.name}
                        </td>
                        <td className="px-6 py-4">{customer.package_name || "-"}</td>
                        <td className="px-6 py-4 font-mono text-xs">{formatCurrency(price)}</td>
                        <td className="px-6 py-4 font-mono text-xs text-red-600 dark:text-red-400 font-semibold">
                          - {customer.tipe_diskon === "percent" ? `${discount}%` : formatCurrency(discount)}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-green-600 dark:text-green-400 font-bold">
                          {formatCurrency(finalPrice)}
                        </td>
                        {!isViewer && (
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-4">
                              <Button type="button" variant="outline"
                                onClick={() => handleOpenEditDiscount(customer)}
                                className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1.5"
                                title="Ubah Nominal Diskon"
                              >
                                <Edit3 size={13} />
                                Edit
                              </Button>
                              <Button type="button" variant="outline"
                                onClick={() => handleDeleteDiscount(customer)}
                                className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1.5"
                                title="Hapus Diskon"
                              >
                                <Trash2 size={13} />
                                Hapus
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === "referrals" ? (
          // === TAB REFERRAL MGM ===
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-150 dark:border-slate-800/80 text-slate-500 dark:text-slate-400">
                <tr>
                  {renderSortableHeader("Pelanggan", "name")}
                  {renderSortableHeader("Kode Referral", "referral_code")}
                  {renderSortableHeader("Saldo Referral", "referral_balance")}
                  {renderSortableHeader("Voucher Diskon", "voucher_discount")}
                  {renderSortableHeader("Teman yang Diajak", "referred_count")}
                  {renderSortableHeader("Rekomendasi Oleh", "referred_by_name")}
                  {!isViewer && <th className="px-6 py-4 font-semibold text-center text-slate-500">Aksi / Klaim Reward</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-900 text-slate-700 dark:text-slate-350">
                {sortedReferralCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={isViewer ? 6 : 7} className="px-6 py-10 text-center text-slate-400">
                      Tidak ada pelanggan dengan data program referral aktif. Gunakan tombol 'Atur Referral Baru' di atas.
                    </td>
                  </tr>
                ) : (
                  sortedReferralCustomers.map((customer) => {
                    // Count how many people were referred by this customer id
                    const referredCount = customers.filter(
                      (other) => other.referred_by_id === customer.id
                    ).length;

                    return (
                      <tr key={customer.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="px-6 py-4">
                          <strong className="block text-slate-900 dark:text-slate-100 font-semibold">{customer.name}</strong>
                          <span className="text-xs text-slate-400 font-mono">{customer.whatsapp || "No WA"}</span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-bold text-slate-800 dark:text-slate-300">
                          {customer.referral_code || "-"}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-200">
                          {formatCurrency(customer.referral_balance)}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                          {customer.voucher_discount ? formatCurrency(customer.voucher_discount) : "-"}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                          {referredCount > 0 ? (
                            <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-full text-xs font-bold">
                              {referredCount} Orang
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">{customer.referred_by_name || "-"}</td>
                        {!isViewer && (
                          <td className="px-6 py-4">
                            <div className="flex flex-col xl:flex-row items-center justify-center gap-2">
                              {/* Claim actions */}
                              <div className="flex gap-1.5">
                                <Button type="button" variant="outline"
                                  onClick={() => handleWithdraw(customer)}
                                  disabled={customer.referral_balance <= 0}
                                  className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold flex items-center gap-0.5 transition-all ${
                                    customer.referral_balance > 0
                                      ? "bg-slate-50 hover:bg-slate-105 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:border-slate-800 text-slate-700 dark:text-slate-355"
                                      : "bg-slate-50/50 border-slate-100 text-slate-300 dark:bg-slate-950/20 dark:border-slate-900 dark:text-slate-600 cursor-not-allowed"
                                  }`}
                                  title="Cairkan saldo referral menjadi uang tunai langsung ke pelanggan"
                                >
                                  <ArrowUpRight size={10} />
                                  Tarik
                                </Button>
                                <Button type="button" variant="outline"
                                  onClick={() => handleConvertToVoucher(customer)}
                                  disabled={customer.referral_balance <= 0}
                                  className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold flex items-center gap-0.5 transition-all ${
                                    customer.referral_balance > 0
                                      ? "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-600 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/60 dark:border-indigo-900/60 dark:text-indigo-400"
                                      : "bg-slate-50/50 border-slate-100 text-slate-300 dark:bg-slate-950/20 dark:border-slate-900 dark:text-slate-600 cursor-not-allowed"
                                  }`}
                                  title="Tukarkan saldo referral menjadi voucher pemotong tagihan bulanan"
                                >
                                  <ArrowDownLeft size={10} />
                                  Voucher
                                </Button>
                              </div>

                              {/* CRUD actions */}
                              <div className="flex gap-1.5 xl:border-l xl:pl-2 xl:ml-2 border-slate-200 dark:border-slate-800">
                                <Button type="button" variant="outline"
                                  onClick={() => handleOpenEditReferral(customer)}
                                  className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
                                  title="Edit Data Referral"
                                >
                                  <Edit3 size={11} />
                                  Edit
                                </Button>
                                <Button type="button" variant="outline"
                                  onClick={() => handleDeleteReferral(customer)}
                                  className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1"
                                  title="Reset Referral"
                                >
                                  <Trash2 size={11} />
                                  Reset
                                </Button>
                              </div>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === "vouchers" ? (
          // === TAB SYSTEM VOUCHER & PROMOSI ===
          <div className="p-6 space-y-8">
            {/* 1. Voucher Templates Grid */}
            <div>
              <h4 className="text-sm font-bold text-slate-850 dark:text-slate-200 mb-4 flex items-center gap-2">
                <Ticket size={16} className="text-indigo-600" />
                Template Voucher Tersedia
              </h4>
              {loadingVouchers ? (
                <div className="py-8 text-center text-slate-400 text-xs">Memuat data...</div>
              ) : vouchersList.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  Belum ada template voucher. Klik "Buat Voucher Baru" untuk memulainya.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {vouchersList.map((voucher) => {
                    const isOneTime = voucher.type === "one-time";
                    const isPerm = voucher.type === "permanent";
                    const colorClass = isPerm 
                      ? "from-emerald-500 to-teal-600" 
                      : isOneTime 
                      ? "from-blue-500 to-indigo-600" 
                      : "from-amber-500 to-orange-600";
                    return (
                      <div 
                        key={voucher.id} 
                        className="bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm flex"
                      >
                        {/* HSL Gradient Tag side */}
                        <div className={`w-24 bg-gradient-to-br ${colorClass} text-white flex flex-col items-center justify-center p-3 text-center shrink-0`}>
                          <Ticket size={24} className="mb-1 opacity-80" />
                          <span className="text-[10px] uppercase tracking-wider font-extrabold opacity-90">
                            {isPerm ? "Permanen" : isOneTime ? "Sekali" : `${voucher.total_cycles} Bulan`}
                          </span>
                        </div>
                        {/* Details side */}
                        <div className="p-4 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start">
                              <span className="text-sm font-mono font-bold text-slate-850 dark:text-slate-100 bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded-lg">
                                {voucher.code}
                              </span>
                              {!isViewer && (
                                <Button type="button" variant="outline"
                                  onClick={() => handleDeleteVoucher(voucher.id, voucher.code)}
                                  className="text-red-600 hover:text-red-750 dark:text-red-400 p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                                  title="Hapus template"
                                >
                                  <Trash2 size={12} />
                                </Button>
                              )}
                            </div>
                            <div className="text-lg font-extrabold text-slate-850 dark:text-slate-200 mt-2">
                              {formatCurrency(voucher.amount)}
                            </div>
                            <div className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                              {voucher.description || "Tidak ada deskripsi."}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Customer Vouchers Table */}
            <div>
              <h4 className="text-sm font-bold text-slate-850 dark:text-slate-200 mb-4 flex items-center gap-2">
                <Settings size={16} className="text-indigo-600" />
                Voucher Aktif Pelanggan
              </h4>
              <div className="overflow-x-auto border border-slate-150 dark:border-slate-800 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-150 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Nama Pelanggan</th>
                      <th className="px-5 py-3 font-semibold">Kode Voucher</th>
                      <th className="px-5 py-3 font-semibold">Potongan Bulanan</th>
                      <th className="px-5 py-3 font-semibold">Sisa Periode</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Auto-Apply</th>
                      <th className="px-5 py-3 font-semibold">Dibuat Pada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-900 text-slate-700 dark:text-slate-350">
                    {customerVouchersList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-6 text-center text-slate-400">
                          Tidak ada data voucher pelanggan aktif.
                        </td>
                      </tr>
                    ) : (
                      customerVouchersList.map((cv) => {
                        const cust = customers.find(c => c.id === cv.pelanggan_id);
                        const isAuto = cust ? cust.voucher_auto_apply === 1 : true;
                        return (
                          <tr key={cv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors">
                            <td className="px-5 py-3 font-semibold text-slate-850 dark:text-slate-200">{cv.customer_name}</td>
                            <td className="px-5 py-3 font-mono font-bold text-slate-800 dark:text-slate-300">{cv.voucher_code}</td>
                            <td className="px-5 py-3 font-mono text-xs">{formatCurrency(cv.voucher_amount || 0)}</td>
                            <td className="px-5 py-3 font-medium">
                              {cv.remaining_cycles === 0 ? "Permanen" : `${cv.remaining_cycles} Bulan`}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                cv.status === "active" 
                                  ? "bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400" 
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              }`}>
                                {cv.status === "active" ? "Aktif" : "Selesai"}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              {!isViewer && cv.status === "active" ? (
                                <Button type="button" variant="outline"
                                  onClick={() => cust && handleToggleAutoApply(cust, cust.voucher_auto_apply ?? 1)}
                                  className={`px-3 py-1 rounded-xl text-[10px] font-bold transition-all shadow-sm ${
                                    isAuto
                                      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/10"
                                      : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-350 dark:hover:bg-slate-700"
                                  }`}
                                  title="Klik untuk mengubah preferensi penggunaan"
                                >
                                  {isAuto ? "ON" : "OFF"}
                                </Button>
                              ) : (
                                <span className="text-slate-400">{isAuto ? "ON" : "OFF"}</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-slate-400 font-mono text-[10px]">
                              {new Date(cv.created_at).toLocaleString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Usage Logs Table */}
            <div>
              <h4 className="text-sm font-bold text-slate-850 dark:text-slate-200 mb-4 flex items-center gap-2">
                <Clock size={16} className="text-indigo-600" />
                Riwayat Penggunaan Voucher (Logs)
              </h4>
              <div className="overflow-x-auto border border-slate-150 dark:border-slate-800 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-150 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Invoice Tagihan</th>
                      <th className="px-5 py-3 font-semibold">Nama Pelanggan</th>
                      <th className="px-5 py-3 font-semibold">Voucher Digunakan</th>
                      <th className="px-5 py-3 font-semibold">Nominal Potongan</th>
                      <th className="px-5 py-3 font-semibold">Siklus Penggunaan Ke-</th>
                      <th className="px-5 py-3 font-semibold">Tanggal Digunakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-900 text-slate-700 dark:text-slate-350">
                    {usageLogsList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-6 text-center text-slate-400">
                          Belum ada riwayat pemakaian voucher tagihan.
                        </td>
                      </tr>
                    ) : (
                      usageLogsList.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors">
                          <td className="px-5 py-3 font-semibold text-slate-850 dark:text-slate-200">{log.invoice_number}</td>
                          <td className="px-5 py-3 font-medium text-slate-750 dark:text-slate-300">{log.customer_name}</td>
                          <td className="px-5 py-3 font-mono font-bold text-slate-850 dark:text-slate-250">{log.voucher_code}</td>
                          <td className="px-5 py-3 font-mono font-bold text-red-600 dark:text-red-400">- {formatCurrency(log.amount_applied)}</td>
                          <td className="px-5 py-3 text-slate-800 dark:text-slate-200">Siklus #{log.cycle_number}</td>
                          <td className="px-5 py-3 text-slate-400 font-mono text-[10px]">
                            {new Date(log.created_at).toLocaleString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          // === TAB REFERRAL WITHDRAWALS ===
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-150 dark:border-slate-800/80 text-slate-500 dark:text-slate-400">
                <tr>
                  {renderSortableHeader("Pelanggan", "customer_name")}
                  {renderSortableHeader("Nominal", "amount")}
                  {renderSortableHeader("Metode", "method")}
                  {renderSortableHeader("Tujuan / Rekening", "destination")}
                  {renderSortableHeader("Status", "status")}
                  {renderSortableHeader("Tanggal", "created_at")}
                  <th className="px-6 py-4 font-semibold text-slate-500 dark:text-slate-400">Catatan / Bukti</th>
                  {!isViewer && <th className="px-6 py-4 font-semibold text-center text-slate-500">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-900 text-slate-700 dark:text-slate-350">
                {sortedWithdrawalsList.length === 0 ? (
                  <tr>
                    <td colSpan={isViewer ? 7 : 8} className="px-6 py-10 text-center text-slate-400">
                      Tidak ada permintaan penarikan saldo referral.
                    </td>
                  </tr>
                ) : (
                  sortedWithdrawalsList.map((w) => {
                      return (
                        <tr key={w.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors">
                          <td className="px-6 py-4">
                            <strong className="block text-slate-900 dark:text-slate-100 font-semibold">{w.customer_name}</strong>
                            <span className="text-xs text-slate-400 font-mono">{w.customer_phone || "-"}</span>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-200">
                            {formatCurrency(w.amount)}
                          </td>
                          <td className="px-6 py-4">
                            {w.method === "transfer" ? (
                              <span className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md text-xs font-semibold">
                                Transfer
                              </span>
                            ) : (
                              <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md text-xs font-semibold">
                                Cash
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs font-mono text-slate-600 dark:text-slate-300">
                            {w.payment_target || <span className="text-slate-400 italic">Serah terima tunai</span>}
                          </td>
                          <td className="px-6 py-4">
                            {w.status === "pending" && (
                              <span className="bg-amber-50 dark:bg-amber-950/45 text-amber-800 dark:text-amber-400 px-2 py-1 rounded-full text-xs font-semibold">
                                Pending
                              </span>
                            )}
                            {w.status === "completed" && (
                              <span className="bg-green-50 dark:bg-green-950/45 text-green-800 dark:text-green-400 px-2 py-1 rounded-full text-xs font-semibold">
                                Selesai
                              </span>
                            )}
                            {w.status === "rejected" && (
                              <span className="bg-red-50 dark:bg-red-950/45 text-red-800 dark:text-red-400 px-2 py-1 rounded-full text-xs font-semibold">
                                Ditolak
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">
                            {new Date(w.created_at).toLocaleString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-6 py-4 text-xs">
                            {w.notes && <div className="text-slate-600 dark:text-slate-400 italic mb-1">"{w.notes}"</div>}
                            {w.proof_path ? (
                              <a
                                href={w.proof_path}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1"
                              >
                                <Camera size={12} />
                                Lihat Bukti
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">Belum ada bukti</span>
                            )}
                          </td>
                          {!isViewer && (
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center gap-2">
                                {w.status === "pending" ? (
                                  <>
                                    <Button type="button" variant="outline"
                                      onClick={() => {
                                        setSelectedWithdrawForComplete(w);
                                        setCompleteNotes("");
                                        setCompleteProofFile(null);
                                        setIsCompleteWithdrawOpen(true);
                                      }}
                                      className="bg-green-600 hover:bg-green-700 text-white text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all shadow-sm shadow-green-600/25"
                                    >
                                      <CheckCircle size={12} />
                                      Selesai
                                    </Button>
                                    <Button type="button" variant="outline"
                                      onClick={() => {
                                        setSelectedWithdrawForReject(w);
                                        setRejectNotes("");
                                        setIsRejectWithdrawOpen(true);
                                      }}
                                      className="bg-red-50 hover:bg-red-100 text-red-655 dark:bg-red-950/20 dark:hover:bg-red-950/55 dark:text-red-400 text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all"
                                    >
                                      <XCircle size={12} />
                                      Tolak
                                    </Button>
                                  </>
                                ) : (
                                  <span className="text-slate-400 italic text-xs">No Action</span>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Create/Add Special Discount */}
      {isCreateDiscountOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden animate-scale-in">
            <Button type="button" variant="outline"
              onClick={() => {
                setIsCreateDiscountOpen(false);
                setSelectedCustomerForNewDiscount(0);
                setDiscountValueInput("");
              }}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </Button>

            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-1.5">
              <Percent size={18} className="text-indigo-600" />
              Beri Diskon Khusus Baru
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">
              Pilih pelanggan yang belum memiliki diskon bulanan, lalu tetapkan nominal diskonnya.
            </p>

            <form
              onSubmit={async (e) => {
                const targetCust = customers.find((c) => c.id === selectedCustomerForNewDiscount);
                if (targetCust) {
                  void handleSaveDiscount(e, targetCust, parseFormattedNumber(discountValueInput), discountTypeInput);
                } else {
                  e.preventDefault();
                  await showAlert("Pilih pelanggan terlebih dahulu.");
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Pilih Pelanggan
                </label>
                <select
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                  value={selectedCustomerForNewDiscount}
                  onChange={(e) => {
                    const cid = Number(e.target.value) || 0;
                    setSelectedCustomerForNewDiscount(cid);
                    setDiscountValueInput("");
                    setDiscountTypeInput("flat");
                  }}
                >
                  <option value={0}>-- Pilih Pelanggan --</option>
                  {nonDiscountCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} - {c.package_name || "Tanpa Paket"} ({formatCurrency(c.package_price || 0)})
                    </option>
                  ))}
                </select>
              </div>

              {selectedCustomerForNewDiscount > 0 && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                      Tipe Diskon
                    </label>
                    <select
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                      value={discountTypeInput}
                      onChange={(e) => {
                        const newType = e.target.value as "flat" | "percent";
                        setDiscountTypeInput(newType);
                        setDiscountValueInput("");
                      }}
                    >
                      <option value="flat">Rupiah (Rp)</option>
                      <option value="percent">Persen (%)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                      {discountTypeInput === "percent" ? "Diskon (%)" : "Nominal Diskon (Rp)"}
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                      value={discountValueInput}
                      onChange={(e) => {
                        const rawVal = e.target.value.replace(/\D/g, "");
                        const valNum = rawVal ? parseInt(rawVal, 10) : 0;
                        if (discountTypeInput === "percent") {
                          const clampedVal = Math.min(valNum, 100);
                          setDiscountValueInput(clampedVal > 0 ? String(clampedVal) : "");
                        } else {
                          const maxVal = (customers.find((c) => c.id === selectedCustomerForNewDiscount)?.package_price) || 999999;
                          const clampedVal = Math.min(valNum, maxVal);
                          setDiscountValueInput(clampedVal > 0 ? formatNumberWithDots(clampedVal) : "");
                        }
                      }}
                      placeholder={discountTypeInput === "percent" ? "Contoh: 10" : "Contoh: 10.000"}
                    />
                  </div>
                </div>
              )}

              {selectedCustomerForNewDiscount > 0 && parseFormattedNumber(discountValueInput) > 0 && (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/40 p-3 rounded-2xl text-xs text-green-700 dark:text-green-300 font-semibold">
                  Harga Akhir Tagihan:{" "}
                  {formatCurrency(
                    Math.max(
                      0,
                      discountTypeInput === "percent"
                        ? ((customers.find((c) => c.id === selectedCustomerForNewDiscount)?.package_price) || 0) -
                          (((customers.find((c) => c.id === selectedCustomerForNewDiscount)?.package_price) || 0) * parseFormattedNumber(discountValueInput)) / 100
                        : ((customers.find((c) => c.id === selectedCustomerForNewDiscount)?.package_price) || 0) -
                          parseFormattedNumber(discountValueInput)
                    )
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" type="button"
                  onClick={() => {
                    setIsCreateDiscountOpen(false);
                    setSelectedCustomerForNewDiscount(0);
                    setDiscountValueInput("");
                  }}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 font-bold rounded-xl text-xs transition-all"
                >
                  Batal
                </Button>
                <Button variant="outline" type="submit"
                  disabled={submitting || selectedCustomerForNewDiscount === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {submitting ? "Menyimpan..." : "Tambahkan Diskon"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Special Discount */}
      {editingDiscountCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden animate-scale-in">
            <Button type="button" variant="outline"
              onClick={() => setEditingDiscountCustomer(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </Button>

            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
              Ubah Diskon Khusus
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">
              Mengatur nominal diskon tetap bulanan untuk pelanggan <strong>{editingDiscountCustomer.name}</strong>.
            </p>

            <form onSubmit={(e) => handleSaveDiscount(e, editingDiscountCustomer, parseFormattedNumber(discountValueInput), discountTypeInput)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Paket & Harga Asli
                </label>
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-2xl text-xs text-slate-650 dark:text-slate-300">
                  {editingDiscountCustomer.package_name || "Tanpa Paket"} ({formatCurrency(editingDiscountCustomer.package_price || 0)})
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                    Tipe Diskon
                  </label>
                  <select
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                    value={discountTypeInput}
                    onChange={(e) => {
                      const newType = e.target.value as "flat" | "percent";
                      setDiscountTypeInput(newType);
                      setDiscountValueInput("");
                    }}
                  >
                    <option value="flat">Rupiah (Rp)</option>
                    <option value="percent">Persen (%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                    {discountTypeInput === "percent" ? "Diskon (%)" : "Nominal Diskon (Rp)"}
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                    value={discountValueInput}
                    onChange={(e) => {
                      const rawVal = e.target.value.replace(/\D/g, "");
                      const valNum = rawVal ? parseInt(rawVal, 10) : 0;
                      if (discountTypeInput === "percent") {
                        const clampedVal = Math.min(valNum, 100);
                        setDiscountValueInput(clampedVal > 0 ? String(clampedVal) : "");
                      } else {
                        const maxVal = editingDiscountCustomer.package_price || 0;
                        const clampedVal = Math.min(valNum, maxVal);
                        setDiscountValueInput(clampedVal > 0 ? formatNumberWithDots(clampedVal) : "");
                      }
                    }}
                    placeholder={discountTypeInput === "percent" ? "Contoh: 10" : "Contoh: 10.000"}
                  />
                </div>
              </div>

              {parseFormattedNumber(discountValueInput) > 0 && (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/40 p-3 rounded-2xl text-xs text-green-700 dark:text-green-300 font-semibold">
                  Harga Akhir Tagihan:{" "}
                  {formatCurrency(
                    Math.max(
                      0,
                      discountTypeInput === "percent"
                        ? (editingDiscountCustomer.package_price || 0) -
                          ((editingDiscountCustomer.package_price || 0) * parseFormattedNumber(discountValueInput)) / 100
                        : (editingDiscountCustomer.package_price || 0) - parseFormattedNumber(discountValueInput)
                    )
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" type="button"
                  onClick={() => setEditingDiscountCustomer(null)}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 font-bold rounded-xl text-xs transition-all"
                >
                  Batal
                </Button>
                <Button variant="outline" type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/20"
                >
                  {submitting ? "Menyimpan..." : "Simpan Diskon"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Buat Voucher Baru */}
      {isCreateVoucherOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden animate-scale-in">
            <Button type="button" variant="outline"
              onClick={() => {
                setIsCreateVoucherOpen(false);
                setNewVoucherCode("");
                setNewVoucherAmount("");
                setNewVoucherType("one-time");
                setNewVoucherCycles(1);
                setNewVoucherDesc("");
              }}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </Button>

            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-1.5">
              <Ticket size={18} className="text-indigo-600" />
              Buat Voucher Baru
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">
              Definisikan parameter kode voucher baru untuk promosi / diskon pelanggan.
            </p>

            <form onSubmit={handleCreateVoucher} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Kode Voucher (Unik & Huruf Besar)
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200 font-mono"
                  value={newVoucherCode}
                  onChange={(e) => setNewVoucherCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                  placeholder="Contoh: PROMO100K"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Nominal Diskon Bulanan (Rp)
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                  value={newVoucherAmount}
                  onChange={(e) => {
                    const rawVal = e.target.value.replace(/\D/g, "");
                    const valNum = rawVal ? parseInt(rawVal, 10) : 0;
                    setNewVoucherAmount(valNum > 0 ? formatNumberWithDots(valNum) : "");
                  }}
                  placeholder="Contoh: 50.000"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Tipe Batas Periode
                </label>
                <select
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                  value={newVoucherType}
                  onChange={(e) => {
                    const type = e.target.value as "one-time" | "multi-use" | "permanent";
                    setNewVoucherType(type);
                    if (type === "one-time") setNewVoucherCycles(1);
                    else if (type === "permanent") setNewVoucherCycles(0);
                  }}
                >
                  <option value="one-time">Sekali Pakai (One-time)</option>
                  <option value="multi-use">Multi Periode (Misal: 3 Bulan)</option>
                  <option value="permanent">Permanen (Seterusnya)</option>
                </select>
              </div>

              {newVoucherType === "multi-use" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                    Jumlah Bulan (Siklus Tagihan)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={120}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200 font-mono"
                    value={newVoucherCycles}
                    onChange={(e) => setNewVoucherCycles(Math.max(1, Number(e.target.value) || 1))}
                    placeholder="Contoh: 3"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Deskripsi Voucher
                </label>
                <textarea
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200 min-h-[60px]"
                  value={newVoucherDesc}
                  onChange={(e) => setNewVoucherDesc(e.target.value)}
                  placeholder="Keterangan promosi..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" type="button"
                  onClick={() => {
                    setIsCreateVoucherOpen(false);
                    setNewVoucherCode("");
                    setNewVoucherAmount("");
                    setNewVoucherType("one-time");
                    setNewVoucherCycles(1);
                    setNewVoucherDesc("");
                  }}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 font-bold rounded-xl text-xs transition-all"
                >
                  Batal
                </Button>
                <Button variant="outline" type="submit"
                  disabled={submitting || !newVoucherCode}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/20"
                >
                  {submitting ? "Menyimpan..." : "Buat Voucher"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Beri Voucher ke Pelanggan */}
      {isAssignVoucherOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden animate-scale-in">
            <Button type="button" variant="outline"
              onClick={() => {
                setIsAssignVoucherOpen(false);
                setSelectedCustomerForVoucher(0);
                setSelectedVoucherTemplate(0);
              }}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </Button>

            <h3 className="text-lg font-bold text-slate-850 dark:text-slate-100 mb-2 flex items-center gap-1.5">
              <Gift size={18} className="text-indigo-600" />
              Beri Voucher ke Pelanggan
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">
              Pilih salah satu pelanggan dan kaitkan voucher aktif ke akun mereka.
            </p>

            <form onSubmit={handleAssignVoucher} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Pilih Pelanggan
                </label>
                <select
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                  value={selectedCustomerForVoucher}
                  onChange={(e) => setSelectedCustomerForVoucher(Number(e.target.value) || 0)}
                >
                  <option value={0}>-- Pilih Pelanggan --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Pilih Voucher Promosi
                </label>
                <select
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                  value={selectedVoucherTemplate}
                  onChange={(e) => setSelectedVoucherTemplate(Number(e.target.value) || 0)}
                >
                  <option value={0}>-- Pilih Voucher --</option>
                  {vouchersList.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.code} ({formatCurrency(v.amount)} - {v.type === "permanent" ? "Permanen" : v.type === "one-time" ? "Sekali Pakai" : `${v.total_cycles} Siklus`})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" type="button"
                  onClick={() => {
                    setIsAssignVoucherOpen(false);
                    setSelectedCustomerForVoucher(0);
                    setSelectedVoucherTemplate(0);
                  }}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 font-bold rounded-xl text-xs transition-all"
                >
                  Batal
                </Button>
                <Button variant="outline" type="submit"
                  disabled={submitting || selectedCustomerForVoucher === 0 || selectedVoucherTemplate === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {submitting ? "Mengaitkan..." : "Kaitkan Voucher"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {editingReferralCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden animate-scale-in">
            <Button type="button" variant="outline"
              onClick={() => setEditingReferralCustomer(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </Button>

            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-1.5">
              <Gift size={18} className="text-indigo-600" />
              Atur Referral & MGM
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">
              Konfigurasi kode referral, saldo insentif, dan relasi rujukan untuk pelanggan <strong>{editingReferralCustomer.name}</strong>.
            </p>

            <form onSubmit={handleSaveReferral} className="space-y-4">
              {/* Dropdown Customer Selector (Alternative to target different customers directly) */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Pelanggan Yang Diedit
                </label>
                <select
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                  value={editingReferralCustomer.id}
                  onChange={(e) => {
                    const cid = Number(e.target.value) || 0;
                    const found = customers.find((c) => c.id === cid);
                    if (found) {
                      handleOpenEditReferral(found);
                    }
                  }}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Kode Referral Unik
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200 font-mono"
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                  placeholder="Contoh: MENET50K (Kosongkan untuk auto-generate)"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  *Digunakan calon pelanggan saat mendaftar mandiri via WhatsApp Chatbot.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Saldo Reward Referral (Rp)
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                  value={refBalance}
                  onChange={(e) => setRefBalance(Number(e.target.value) || 0)}
                  placeholder="Contoh: 100000"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Direkomendasikan Oleh (Sponsor)
                </label>
                <select
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                  value={refReferredById}
                  onChange={(e) => setRefReferredById(Number(e.target.value) || 0)}
                >
                  <option value={0}>Tidak ada (Pilih pemberi rekomendasi)</option>
                  {customers
                    .filter((c) => c.id !== editingReferralCustomer.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.referral_code || "Tanpa kode"})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" type="button"
                  onClick={() => setEditingReferralCustomer(null)}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 font-bold rounded-xl text-xs transition-all"
                >
                  Batal
                </Button>
                <Button variant="outline" type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/20"
                >
                  {submitting ? "Menyimpan..." : "Simpan Data"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2.1: Complete Withdrawal */}
      {isCompleteWithdrawOpen && selectedWithdrawForComplete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden animate-scale-in">
            <Button type="button" variant="outline"
              onClick={() => {
                setIsCompleteWithdrawOpen(false);
                setSelectedWithdrawForComplete(null);
                setCompleteProofFile(null);
                setCompleteNotes("");
              }}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </Button>

            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-1.5">
              <CheckCircle size={18} className="text-green-600" />
              Selesaikan Penarikan
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">
              Konfirmasi penyelesaian pencairan saldo sebesar <strong>{formatCurrency(selectedWithdrawForComplete.amount)}</strong> untuk <strong>{selectedWithdrawForComplete.customer_name}</strong> ({selectedWithdrawForComplete.method === "cash" ? "Cash/Tunai" : "Transfer"}).
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!completeProofFile) {
                  await showAlert("Foto bukti serah terima atau bukti transfer wajib diunggah.");
                  return;
                }
                setSubmitting(true);
                try {
                  await completeReferralWithdrawal(selectedWithdrawForComplete.id, completeProofFile, completeNotes);
                  pushSuccess("Pencairan referral berhasil ditandai selesai.");
                  setIsCompleteWithdrawOpen(false);
                  setSelectedWithdrawForComplete(null);
                  setCompleteProofFile(null);
                  setCompleteNotes("");
                  void loadWithdrawalsData();
                  void onRefresh();
                } catch (err: any) {
                  pushError(err.message || "Gagal memproses penyelesaian penarikan.");
                } finally {
                  setSubmitting(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Foto Bukti (Wajib)
                </label>
                <input
                  type="file"
                  required
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setCompleteProofFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 dark:file:bg-indigo-950/40 dark:file:text-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Catatan Pembayaran
                </label>
                <textarea
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200 h-20 resize-none"
                  value={completeNotes}
                  onChange={(e) => setCompleteNotes(e.target.value)}
                  placeholder="Misal: Uang diserahkan tunai di rumah pelanggan / Ditransfer via SeaBank"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" type="button"
                  onClick={() => {
                    setIsCompleteWithdrawOpen(false);
                    setSelectedWithdrawForComplete(null);
                    setCompleteProofFile(null);
                    setCompleteNotes("");
                  }}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-355 font-bold rounded-xl text-xs transition-all"
                >
                  Batal
                </Button>
                <Button variant="outline" type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-green-600/25"
                >
                  {submitting ? "Memproses..." : "Selesaikan Penarikan"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2.2: Reject Withdrawal */}
      {isRejectWithdrawOpen && selectedWithdrawForReject && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden animate-scale-in">
            <Button type="button" variant="outline"
              onClick={() => {
                setIsRejectWithdrawOpen(false);
                setSelectedWithdrawForReject(null);
                setRejectNotes("");
              }}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </Button>

            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-1.5">
              <XCircle size={18} className="text-red-600" />
              Tolak Penarikan
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">
              Konfirmasi penolakan permintaan penarikan saldo sebesar <strong>{formatCurrency(selectedWithdrawForReject.amount)}</strong> untuk <strong>{selectedWithdrawForReject.customer_name}</strong>. Saldo akan otomatis dikembalikan ke pelanggan.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!rejectNotes.trim()) {
                  await showAlert("Alasan penolakan wajib diisi.");
                  return;
                }
                setSubmitting(true);
                try {
                  await rejectReferralWithdrawal(selectedWithdrawForReject.id, rejectNotes);
                  pushSuccess("Permintaan penarikan referral berhasil ditolak dan saldo dikembalikan.");
                  setIsRejectWithdrawOpen(false);
                  setSelectedWithdrawForReject(null);
                  setRejectNotes("");
                  void loadWithdrawalsData();
                  void onRefresh();
                } catch (err: any) {
                  pushError(err.message || "Gagal menolak permintaan penarikan.");
                } finally {
                  setSubmitting(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Alasan Penolakan (Wajib)
                </label>
                <textarea
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200 h-24 resize-none"
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="Masukkan alasan penolakan agar pelanggan mengetahui penyebabnya..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" type="button"
                  onClick={() => {
                    setIsRejectWithdrawOpen(false);
                    setSelectedWithdrawForReject(null);
                    setRejectNotes("");
                  }}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-355 font-bold rounded-xl text-xs transition-all"
                >
                  Batal
                </Button>
                <Button variant="outline" type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-red-600/25"
                >
                  {submitting ? "Menolak..." : "Tolak Penarikan"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
