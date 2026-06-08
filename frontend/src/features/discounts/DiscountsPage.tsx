import { useState } from "react";
import type { CustomerItem, User } from "../../types";
import { updateCustomer, withdrawReferral, convertReferralToVoucher } from "../../lib/api";
import { formatCurrency } from "../../utils/format";
import { Info, ArrowUpRight, ArrowDownLeft, Gift, Percent, Search, Trash2, Edit3, Plus, X } from "lucide-react";

type DiscountsPageProps = {
  user: User | null;
  customers: CustomerItem[];
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  onRefresh: () => Promise<void>;
};

export function DiscountsPage({
  user,
  customers,
  pushSuccess,
  pushError,
  onRefresh,
}: DiscountsPageProps) {
  const [activeTab, setActiveTab] = useState<"discounts" | "referrals">("discounts");
  const [searchQuery, setSearchQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Modal State - Discounts
  const [editingDiscountCustomer, setEditingDiscountCustomer] = useState<CustomerItem | null>(null);
  const [discountValue, setDiscountValue] = useState<number>(0);
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

  // List of customers who have special discounts
  const discountCustomers = filteredCustomers.filter((c) => c.diskon > 0);

  // List of customers with active referrals (either have balance, referred someone, or have a code)
  const referralCustomers = filteredCustomers.filter((c) => {
    const referredOthers = customers.some((other) => other.referred_by_id === c.id);
    return c.referral_balance > 0 || referredOthers || c.referral_code;
  });

  // Customers who DO NOT have a discount yet (for new discount dropdown)
  const nonDiscountCustomers = customers.filter((c) => c.diskon === 0);

  // === DISCOUNT CRUD HANDLERS ===
  const handleOpenEditDiscount = (customer: CustomerItem) => {
    setEditingDiscountCustomer(customer);
    setDiscountValue(customer.diskon || 0);
  };

  const handleSaveDiscount = async (e: React.FormEvent, targetCustomer: CustomerItem, val: number) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
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
        referred_by_id: targetCustomer.referred_by_id || 0,
        referral_balance: targetCustomer.referral_balance || 0,
      };

      await updateCustomer(targetCustomer.id, payload);
      pushSuccess(`Diskon khusus untuk ${targetCustomer.name} berhasil diperbarui.`);
      setEditingDiscountCustomer(null);
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
    if (!window.confirm(`Apakah Anda yakin ingin menghapus diskon khusus untuk ${customer.name}?`)) {
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
        diskon: 0, // Reset discount
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
    if (!window.confirm(`Apakah Anda yakin ingin me-reset (hapus) data referral untuk ${customer.name}?`)) {
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
  const handleWithdraw = async (customer: CustomerItem) => {
    const amountStr = window.prompt(
      `Masukkan nominal penarikan tunai saldo referral untuk ${customer.name} (Maks: ${formatCurrency(customer.referral_balance)}):`
    );
    if (!amountStr) return;

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      alert("Nominal penarikan tidak valid.");
      return;
    }
    if (amount > customer.referral_balance) {
      alert("Saldo referral tidak mencukupi.");
      return;
    }

    try {
      await withdrawReferral(customer.id, amount);
      pushSuccess(`Berhasil mencatat penarikan saldo referral sebesar ${formatCurrency(amount)} untuk ${customer.name}.`);
      await onRefresh();
    } catch (err: any) {
      pushError(err.message || "Gagal mencatat penarikan.");
    }
  };

  const handleConvertToVoucher = async (customer: CustomerItem) => {
    const amountStr = window.prompt(
      `Masukkan nominal saldo referral yang ingin ditukarkan menjadi voucher diskon untuk ${customer.name} (Maks: ${formatCurrency(customer.referral_balance)}):`
    );
    if (!amountStr) return;

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      alert("Nominal penukaran tidak valid.");
      return;
    }
    if (amount > customer.referral_balance) {
      alert("Saldo referral tidak mencukupi.");
      return;
    }

    try {
      await convertReferralToVoucher(customer.id, amount);
      pushSuccess(`Berhasil menukarkan saldo referral menjadi voucher diskon sebesar ${formatCurrency(amount)} untuk ${customer.name}.`);
      await onRefresh();
    } catch (err: any) {
      pushError(err.message || "Gagal menukarkan voucher.");
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
          <button
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
            Diskon Khusus ({discountCustomers.length})
          </button>
          <button
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
            Referral MGM ({referralCustomers.length})
          </button>
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
          ) : (
            <p>
              Program Member-Get-Member memberikan saldo reward sebesar Rp 50.000 kepada pengajak ketika mengajak orang baru memasang internet. Saldo ini dapat dicairkan tunai atau ditukarkan menjadi voucher diskon tagihan via Dashboard ini maupun via WhatsApp Chatbot.
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
                : "Cari nama atau kode referral..."
            }
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {!isViewer && (
          <div>
            {activeTab === "discounts" ? (
              <button
                onClick={() => setIsCreateDiscountOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-md shadow-indigo-600/25 flex items-center gap-1.5 shrink-0"
              >
                <Plus size={14} />
                Beri Diskon Baru
              </button>
            ) : (
              <button
                onClick={() => {
                  // Find first customer with no code to edit referral
                  const firstWithoutRef = customers.find(c => !c.referral_code);
                  if (firstWithoutRef) {
                    handleOpenEditReferral(firstWithoutRef);
                  } else if (customers.length > 0) {
                    handleOpenEditReferral(customers[0]);
                  } else {
                    alert("Belum ada pelanggan terdaftar.");
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-md shadow-indigo-600/25 flex items-center gap-1.5 shrink-0"
              >
                <Plus size={14} />
                Atur Referral Baru
              </button>
            )}
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
                  <th className="px-6 py-4 font-semibold">Nama Pelanggan</th>
                  <th className="px-6 py-4 font-semibold">Paket Aktif</th>
                  <th className="px-6 py-4 font-semibold">Harga Asli</th>
                  <th className="px-6 py-4 font-semibold">Nominal Diskon</th>
                  <th className="px-6 py-4 font-semibold">Total Setelah Diskon</th>
                  {!isViewer && <th className="px-6 py-4 font-semibold text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-900 text-slate-700 dark:text-slate-350">
                {discountCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={isViewer ? 5 : 6} className="px-6 py-10 text-center text-slate-400">
                      {searchQuery
                        ? "Tidak ada pelanggan berdiskon yang cocok dengan pencarian."
                        : "Belum ada pelanggan yang dikonfigurasi menggunakan diskon khusus. Gunakan tombol 'Beri Diskon Baru' di atas."}
                    </td>
                  </tr>
                ) : (
                  discountCustomers.map((customer) => {
                    const price = customer.package_price || 0;
                    const discount = customer.diskon || 0;
                    const finalPrice = Math.max(0, price - discount);

                    return (
                      <tr key={customer.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">
                          {customer.name}
                        </td>
                        <td className="px-6 py-4">{customer.package_name || "-"}</td>
                        <td className="px-6 py-4 font-mono text-xs">{formatCurrency(price)}</td>
                        <td className="px-6 py-4 font-mono text-xs text-red-600 dark:text-red-400 font-semibold">
                          - {formatCurrency(discount)}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-green-600 dark:text-green-400 font-bold">
                          {formatCurrency(finalPrice)}
                        </td>
                        {!isViewer && (
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-4">
                              <button
                                onClick={() => handleOpenEditDiscount(customer)}
                                className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1.5"
                                title="Ubah Nominal Diskon"
                              >
                                <Edit3 size={13} />
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteDiscount(customer)}
                                className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1.5"
                                title="Hapus Diskon"
                              >
                                <Trash2 size={13} />
                                Hapus
                              </button>
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
        ) : (
          // === TAB REFERRAL MGM ===
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-150 dark:border-slate-800/80 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-semibold">Pelanggan</th>
                  <th className="px-6 py-4 font-semibold">Kode Referral</th>
                  <th className="px-6 py-4 font-semibold">Saldo Referral</th>
                  <th className="px-6 py-4 font-semibold">Voucher Diskon</th>
                  <th className="px-6 py-4 font-semibold">Teman yang Diajak</th>
                  <th className="px-6 py-4 font-semibold">Rekomendasi Oleh</th>
                  {!isViewer && <th className="px-6 py-4 font-semibold text-center">Aksi / Klaim Reward</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-900 text-slate-700 dark:text-slate-350">
                {referralCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={isViewer ? 6 : 7} className="px-6 py-10 text-center text-slate-400">
                      Tidak ada pelanggan dengan data program referral aktif. Gunakan tombol 'Atur Referral Baru' di atas.
                    </td>
                  </tr>
                ) : (
                  referralCustomers.map((customer) => {
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
                                <button
                                  onClick={() => handleWithdraw(customer)}
                                  disabled={customer.referral_balance <= 0}
                                  className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold flex items-center gap-0.5 transition-all ${
                                    customer.referral_balance > 0
                                      ? "bg-slate-50 hover:bg-slate-105 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                                      : "bg-slate-50/50 border-slate-100 text-slate-300 dark:bg-slate-950/20 dark:border-slate-900 dark:text-slate-600 cursor-not-allowed"
                                  }`}
                                  title="Cairkan saldo referral menjadi uang tunai langsung ke pelanggan"
                                >
                                  <ArrowUpRight size={10} />
                                  Tarik
                                </button>
                                <button
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
                                </button>
                              </div>

                              {/* CRUD actions */}
                              <div className="flex gap-1.5 xl:border-l xl:pl-2 xl:ml-2 border-slate-200 dark:border-slate-800">
                                <button
                                  onClick={() => handleOpenEditReferral(customer)}
                                  className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
                                  title="Edit Data Referral"
                                >
                                  <Edit3 size={11} />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteReferral(customer)}
                                  className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1"
                                  title="Reset Referral"
                                >
                                  <Trash2 size={11} />
                                  Reset
                                </button>
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
        )}
      </div>

      {/* MODAL 1: Create/Add Special Discount */}
      {isCreateDiscountOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden animate-scale-in">
            <button
              onClick={() => {
                setIsCreateDiscountOpen(false);
                setSelectedCustomerForNewDiscount(0);
                setDiscountValue(0);
              }}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-1.5">
              <Percent size={18} className="text-indigo-600" />
              Beri Diskon Khusus Baru
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">
              Pilih pelanggan yang belum memiliki diskon bulanan, lalu tetapkan nominal diskonnya.
            </p>

            <form
              onSubmit={(e) => {
                const targetCust = customers.find((c) => c.id === selectedCustomerForNewDiscount);
                if (targetCust) {
                  void handleSaveDiscount(e, targetCust, discountValue);
                } else {
                  e.preventDefault();
                  alert("Pilih pelanggan terlebih dahulu.");
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
                    const selected = customers.find((c) => c.id === cid);
                    setDiscountValue(selected ? selected.diskon : 0);
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
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                    Nominal Diskon Bulanan (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={
                      (customers.find((c) => c.id === selectedCustomerForNewDiscount)?.package_price) || 999999
                    }
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                    placeholder="Masukkan nominal diskon..."
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    *Nominal diskon tidak boleh melebihi harga asli paket.
                  </span>
                </div>
              )}

              {selectedCustomerForNewDiscount > 0 && discountValue > 0 && (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/40 p-3 rounded-2xl text-xs text-green-700 dark:text-green-300 font-semibold">
                  Harga Akhir Tagihan:{" "}
                  {formatCurrency(
                    Math.max(
                      0,
                      ((customers.find((c) => c.id === selectedCustomerForNewDiscount)?.package_price) || 0) -
                        discountValue
                    )
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateDiscountOpen(false);
                    setSelectedCustomerForNewDiscount(0);
                    setDiscountValue(0);
                  }}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 font-bold rounded-xl text-xs transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || selectedCustomerForNewDiscount === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {submitting ? "Menyimpan..." : "Tambahkan Diskon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Special Discount */}
      {editingDiscountCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden animate-scale-in">
            <button
              onClick={() => setEditingDiscountCustomer(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
              Ubah Diskon Khusus
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">
              Mengatur nominal diskon tetap bulanan untuk pelanggan <strong>{editingDiscountCustomer.name}</strong>.
            </p>

            <form onSubmit={(e) => handleSaveDiscount(e, editingDiscountCustomer, discountValue)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Paket & Harga Aktif
                </label>
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-2xl text-xs text-slate-650 dark:text-slate-300">
                  {editingDiscountCustomer.package_name || "Tanpa Paket"} ({formatCurrency(editingDiscountCustomer.package_price || 0)})
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  Nominal Diskon Bulanan (Rp)
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  max={editingDiscountCustomer.package_price || 0}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-slate-200"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                  placeholder="Contoh: 20000"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  *Nominal diskon tidak boleh melebihi harga asli paket.
                </span>
              </div>

              {discountValue > 0 && (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/40 p-3 rounded-2xl text-xs text-green-700 dark:text-green-300 font-semibold">
                  Harga Akhir Tagihan: {formatCurrency(Math.max(0, (editingDiscountCustomer.package_price || 0) - discountValue))}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingDiscountCustomer(null)}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 font-bold rounded-xl text-xs transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/20"
                >
                  {submitting ? "Menyimpan..." : "Simpan Diskon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Create / Edit Referral MGM Info */}
      {editingReferralCustomer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden animate-scale-in">
            <button
              onClick={() => setEditingReferralCustomer(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </button>

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
                <button
                  type="button"
                  onClick={() => setEditingReferralCustomer(null)}
                  disabled={submitting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 font-bold rounded-xl text-xs transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/20"
                >
                  {submitting ? "Menyimpan..." : "Simpan Data"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
