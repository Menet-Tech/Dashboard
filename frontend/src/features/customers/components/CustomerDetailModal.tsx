import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, AlertCircle, RotateCw } from "lucide-react";
import { StatusPill } from "../../../components/ui";
import { formatCurrency } from "../../../utils/format";
import type { CustomerItem, User, BillItem } from "../../../types";
import {
  fetchBills,
  rebootONT,
  factoryResetONT,
  kickMikrotikSession,
  updateONTWifi,
} from "../../../lib/api";
import { useDialog } from "../../../context/DialogContext";
import { Button } from "../../../components/ui/Button";

type CustomerDetailModalProps = {
  customer: CustomerItem;
  customers?: CustomerItem[];
  onSelectCustomer?: (customer: CustomerItem) => void;
  onClose: () => void;
  user: User | null;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  onRefresh?: () => void;
  onEndTrial?: (id: number) => void;
};

export function CustomerDetailModal({
  customer,
  customers = [],
  onSelectCustomer,
  onClose,
  user,
  pushSuccess,
  pushError,
  onRefresh,
  onEndTrial,
}: CustomerDetailModalProps) {
  const [customerBills, setCustomerBills] = useState<BillItem[]>([]);
  const { showAlert, showConfirm } = useDialog();
  const [loadingBills, setLoadingBills] = useState(false);
  const [ontStatus, setOntStatus] = useState<any | null>(null);
  const [loadingOnt, setLoadingOnt] = useState(false);
  const [rebootingOnt, setRebootingOnt] = useState(false);
  const [resettingOnt, setResettingOnt] = useState(false);
  const [kickingMikrotik, setKickingMikrotik] = useState(false);
  const [updatingWifi, setUpdatingWifi] = useState(false);
  const [ontError, setOntError] = useState<string | null>(null);

  const linkedAccounts = customers.filter(c => {
    if (!c.whatsapp || c.id === customer.id) return false;
    const p1 = c.whatsapp.trim().replace(/[+\-\s]/g, "").replace(/^0/, "62");
    const p2 = customer.whatsapp ? customer.whatsapp.trim().replace(/[+\-\s]/g, "").replace(/^0/, "62") : "";
    return p1 === p2;
  });

  // Load bills on mount/customer change
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoadingBills(true);
      try {
        const res = await fetchBills({ customer_id: customer.id, limit: 0 });
        if (!cancelled) {
          setCustomerBills(res.data);
        }
      } catch (err) {
        console.error("Failed to load customer bills", err);
      } finally {
        if (!cancelled) {
          setLoadingBills(false);
        }
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  const handleCheckOntStatus = async () => {
    setLoadingOnt(true);
    setOntError(null);
    setOntStatus(null);
    try {
      const res = await fetch(`/api/v1/customers/${customer.id}/ont-status`, {
        credentials: "include",
      });
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

  const handleRebootOnt = async () => {
    if (!(await showConfirm("Apakah Anda yakin ingin mem-reboot ONT pelanggan ini?"))) return;
    setRebootingOnt(true);
    try {
      const res = await rebootONT(customer.id);
      pushSuccess(res.message || "Perintah reboot berhasil dikirim ke GenieACS.");
    } catch (err: any) {
      console.error(err);
      pushError(err.message || String(err));
    } finally {
      setRebootingOnt(false);
    }
  };

  const handleFactoryResetOnt = async () => {
    if (
      !(await showConfirm(
        "PERINGATAN: Apakah Anda yakin ingin mengembalikan ONT ke pengaturan pabrik (Factory Reset)? Ini akan menghapus konfigurasi ONT."
      ))
    )
      return;
    setResettingOnt(true);
    try {
      const res = await factoryResetONT(customer.id);
      pushSuccess(res.message || "Perintah factory reset berhasil dikirim ke GenieACS.");
    } catch (err: any) {
      console.error(err);
      pushError(err.message || String(err));
    } finally {
      setResettingOnt(false);
    }
  };

  const handleKickMikrotik = async () => {
    if (
      !(await showConfirm(
        "Apakah Anda yakin ingin memutuskan sesi PPPoE pelanggan ini untuk memaksa koneksi ulang?"
      ))
    )
      return;
    setKickingMikrotik(true);
    try {
      const res = await kickMikrotikSession(customer.id);
      pushSuccess(res.message || "Sesi PPPoE berhasil diputuskan.");
    } catch (err: any) {
      console.error(err);
      pushError(err.message || String(err));
    } finally {
      setKickingMikrotik(false);
    }
  };

  const handleWifiUpdate = async () => {
    const ssid = window.prompt("Masukkan nama WiFi (SSID) baru:");
    if (ssid === null) return;
    const cleanSsid = ssid.trim();
    if (!cleanSsid) {
      await showAlert("SSID tidak boleh kosong.");
      return;
    }

    const password = window.prompt("Masukkan password WiFi baru (Minimal 8 karakter):");
    if (password === null) return;
    const cleanPassword = password.trim();
    if (cleanPassword.length < 8) {
      await showAlert("Password WiFi minimal harus 8 karakter.");
      return;
    }

    setUpdatingWifi(true);
    try {
      const res = await updateONTWifi(customer.id, cleanSsid, cleanPassword);
      pushSuccess(res.message || "Konfigurasi WiFi berhasil dikirim ke ONT.");
    } catch (err: any) {
      console.error(err);
      pushError(err.message || String(err));
    } finally {
      setUpdatingWifi(false);
    }
  };

  const REFERRAL_FIXED = 50_000;

  const handleWithdrawReferral = async () => {
    if (customer.referral_balance < REFERRAL_FIXED) {
      await showAlert(`Saldo referral tidak mencukupi. Dibutuhkan minimal Rp ${REFERRAL_FIXED.toLocaleString("id-ID")} untuk menarik tunai.`);
      return;
    }
    const confirmed = await showConfirm(
      `Tarik tunai saldo referral ${customer.name} sebesar Rp ${REFERRAL_FIXED.toLocaleString("id-ID")}?\n\nCatatan: Jika di periode ini sudah menggunakan voucher referral untuk tagihan, penarikan tidak dapat dilakukan.`
    );
    if (!confirmed) return;

    try {
      const { withdrawReferral } = await import("../../../lib/api");
      const res = await withdrawReferral(customer.id);
      pushSuccess(res.message || "Penarikan tunai referral berhasil diajukan.");
      if (onRefresh) {
        onRefresh();
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      pushError(err.message || String(err));
    }
  };

  const handleConvertVoucher = async () => {
    if (customer.referral_balance < REFERRAL_FIXED) {
      await showAlert(`Saldo referral tidak mencukupi. Dibutuhkan minimal Rp ${REFERRAL_FIXED.toLocaleString("id-ID")} untuk menukar voucher.`);
      return;
    }
    const confirmed = await showConfirm(
      `Tukarkan Rp ${REFERRAL_FIXED.toLocaleString("id-ID")} saldo referral ${customer.name} menjadi voucher diskon tagihan?\n\nCatatan: Jika di periode ini sudah mengajukan penarikan tunai referral, penukaran tidak dapat dilakukan.`
    );
    if (!confirmed) return;

    try {
      const { convertReferralToVoucher } = await import("../../../lib/api");
      const res = await convertReferralToVoucher(customer.id);
      pushSuccess(res.message || "Saldo berhasil ditukarkan menjadi voucher diskon.");
      if (onRefresh) {
        onRefresh();
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      pushError(err.message || String(err));
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-150 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Detail Pelanggan</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Informasi profil operasional & riwayat billing pelanggan.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-slate-400 dark:text-slate-500 hover:text-slate-650"
            onClick={onClose}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </Button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {customer.is_trial && (
            <div className="bg-amber-50 border border-amber-250 dark:bg-slate-900/60 dark:border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-250 dark:border-amber-500/20">
                  Masa Trial Aktif
                </span>
                <p className="text-xs text-amber-900 dark:text-amber-250 mt-1.5 leading-relaxed">
                  Pelanggan ini sedang dalam masa trial. Masa trial dimulai pada{" "}
                  <strong className="font-semibold text-amber-950 dark:text-amber-100">
                    {customer.trial_started_at ? new Date(customer.trial_started_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }) : "-"}
                  </strong>{" "}
                  selama {customer.trial_days || 0} hari.
                </p>
              </div>
              {user?.role !== "viewer" && onEndTrial && (
                <Button
                  type="button"
                  variant="primary"
                  className="bg-amber-600 hover:bg-amber-700 sm:w-auto w-full"
                  onClick={() => onEndTrial(customer.id)}
                >
                  Hentikan Trial & Jadikan Reguler
                </Button>
              )}
            </div>
          )}

          {/* Profile Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-slate-50 dark:bg-slate-950 p-5 rounded-2xl border border-slate-150">
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Nama Lengkap</span>
              <strong className="text-slate-800 dark:text-slate-100 text-sm mt-0.5 block">{customer.name}</strong>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Paket Internet</span>
              <strong className="text-slate-800 dark:text-slate-100 text-sm mt-0.5 block">
                {customer.package_name ?? "-"} ({formatCurrency(customer.package_price ?? 0)})
              </strong>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Status Layanan</span>
              <span className="mt-1 block">
                <StatusPill
                  label={
                    customer.status === "pending"
                      ? "pending (perpanjangan)"
                      : customer.status === "suspended"
                        ? "suspended"
                        : customer.status
                  }
                  tone={customer.status === "active" ? "green" : customer.status === "limit" ? "red" : customer.status === "pending" ? "gold" : "slate"}
                />
              </span>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Username PPPoE</span>
              <code className="text-indigo-600 font-mono text-xs font-semibold mt-0.5 block bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 w-max">
                {customer.user_pppoe || "-"}
              </code>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Password PPPoE</span>
              <code className="text-indigo-600 font-mono text-xs font-semibold mt-0.5 block bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 w-max">
                {customer.password_pppoe || "-"}
              </code>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">SN ONT</span>
              <span className="text-slate-700 dark:text-slate-300 text-sm mt-0.5 font-mono block">{customer.sn_ont || "-"}</span>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Nomor WhatsApp</span>
              <span className="text-slate-750 text-sm mt-0.5 block font-semibold">
                {customer.whatsapp ? (
                  <a
                    href={`https://wa.me/+${customer.whatsapp.replace(/[+\-\s]/g, "").replace(/^0/, "62")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    {customer.whatsapp}
                  </a>
                ) : (
                  "-"
                )}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Siklus Jatuh Tempo</span>
              <strong className="text-slate-800 dark:text-slate-100 text-sm mt-0.5 block">Tanggal {customer.due_day}</strong>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">ODP Node / Port</span>
              <strong className="text-slate-800 dark:text-slate-100 text-sm mt-0.5 block">
                {customer.odp_name
                  ? `${customer.odp_name} ${customer.odp_port ? `(Port ${customer.odp_port})` : ""}`
                  : "Belum Terhubung"}
              </strong>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Diskon Bulanan</span>
              <strong className="text-slate-800 dark:text-slate-100 text-sm mt-0.5 block">
                {customer.diskon > 0
                  ? customer.tipe_diskon === "percent"
                    ? `${customer.diskon}%`
                    : formatCurrency(customer.diskon)
                  : "-"}
              </strong>
            </div>
            <div className="lg:col-span-3">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Alamat Pemasangan</span>
              <p className="text-slate-700 dark:text-slate-300 text-xs mt-1 leading-relaxed bg-white dark:bg-slate-900 border border-slate-150 p-3 rounded-xl">
                {customer.address || "Belum ada informasi alamat."}
              </p>
            </div>

            {linkedAccounts.length > 0 && (
              <div className="lg:col-span-3 bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl space-y-2">
                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block font-sans">
                  Akun Terhubung (Nomor WA Sama)
                </span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {linkedAccounts.map((acc) => (
                    <Button
                      key={acc.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="bg-white dark:bg-slate-900 hover:bg-indigo-55 hover:text-indigo-800 text-indigo-700 border-indigo-200"
                      onClick={() => onSelectCustomer?.(acc)}
                      icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-indigo-500"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>}
                    >
                      {acc.name} ({acc.address || "Tanpa Alamat"})
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {customer.sn_ont && (
              <div className="lg:col-span-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 rounded-xl">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      GenieACS TR-069 Monitor
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleCheckOntStatus}
                      disabled={loadingOnt || rebootingOnt}
                      isLoading={loadingOnt}
                      loadingText="Checking..."
                    >
                      Cek Koneksi ONT
                    </Button>
                    {ontStatus && (
                      <>
                        {user?.role !== "viewer" && (
                          <>
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              className="bg-amber-600 hover:bg-amber-700"
                              onClick={handleWifiUpdate}
                              disabled={loadingOnt || rebootingOnt || updatingWifi || resettingOnt}
                              isLoading={updatingWifi}
                              loadingText="Updating..."
                            >
                              Ubah WiFi
                            </Button>
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              className="bg-slate-700 hover:bg-slate-800"
                              onClick={handleFactoryResetOnt}
                              disabled={loadingOnt || rebootingOnt || updatingWifi || resettingOnt}
                              isLoading={resettingOnt}
                              loadingText="Resetting..."
                            >
                              Reset Pabrik
                            </Button>
                          </>
                        )}
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={handleRebootOnt}
                          disabled={loadingOnt || rebootingOnt || updatingWifi || resettingOnt}
                          isLoading={rebootingOnt}
                          loadingText="Rebooting..."
                          icon={!rebootingOnt ? <RotateCw size={12} /> : undefined}
                        >
                          Reboot ONT
                        </Button>
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
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 block">Status ONT</span>
                        <span className="mt-1 block">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                              ontStatus.status === "online"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                ontStatus.status === "online" ? "bg-emerald-500" : "bg-red-500"
                              }`}
                            ></span>
                            {ontStatus.status === "online" ? "Online" : "Offline"}
                          </span>
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 block">Model ONT</span>
                        <strong className="text-slate-800 dark:text-slate-100 text-xs mt-0.5 block">
                          {ontStatus.model} ({ontStatus.hardware_version})
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 block">IP Address CPE</span>
                        <code className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5 block">{ontStatus.ip_address}</code>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 block">Uptime ONT</span>
                        <strong className="text-slate-800 dark:text-slate-100 text-xs mt-0.5 block">{ontStatus.uptime || "-"}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 block">Rx Optical Power</span>
                        <span
                          className={`text-xs font-bold mt-0.5 block ${
                            parseFloat(ontStatus.rx_optical_power) < -27
                              ? "text-red-655"
                              : parseFloat(ontStatus.rx_optical_power) < -25
                              ? "text-amber-655"
                              : "text-emerald-655"
                          }`}
                        >
                          {ontStatus.rx_optical_power}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 block">Tx Optical Power</span>
                        <strong className="text-slate-700 dark:text-slate-300 text-xs mt-0.5 block">{ontStatus.tx_optical_power}</strong>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 block">Last Inform / Connect</span>
                        <span className="text-slate-650 text-xs mt-0.5 block">
                          {ontStatus.last_inform_time ? new Date(ontStatus.last_inform_time).toLocaleString("id-ID") : "-"}
                        </span>
                      </div>
                    </div>

                    {/* MikroTik PPP details */}
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-4 mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Secret Details */}
                      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 text-xs space-y-2.5">
                        <strong className="text-slate-800 dark:text-slate-100 uppercase text-[10px] tracking-wider block border-b pb-1.5 font-sans font-bold">
                          MikroTik PPP Secret info
                        </strong>
                        {ontStatus.mikrotik_secret ? (
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-sans uppercase font-bold">Profile Paket</span>
                              <strong className="text-indigo-600 font-semibold bg-indigo-50 border border-indigo-100 rounded px-1 py-0.5 block w-max mt-0.5">
                                {ontStatus.mikrotik_secret.Profile}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-sans uppercase font-bold">Status PPP</span>
                              {ontStatus.mikrotik_secret.Disabled ? (
                                <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-bold block w-max mt-0.5">Disabled / Terisolir</span>
                              ) : (
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold block w-max mt-0.5">Active / Enabled</span>
                              )}
                            </div>
                            <div className="col-span-2">
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-sans uppercase font-bold">Last Caller ID (MAC)</span>
                              <code className="text-slate-600 font-mono font-semibold block mt-0.5">{ontStatus.mikrotik_secret.LastCallerID || "-"}</code>
                            </div>
                            <div className="col-span-2">
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-sans uppercase font-bold">Last Logged Out</span>
                              <span className="text-slate-700 dark:text-slate-300 font-medium block mt-0.5">{ontStatus.mikrotik_secret.LastLoggedOut || "-"}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-sans uppercase font-bold">Disconnect Reason</span>
                              <span className="text-slate-700 dark:text-slate-300 font-semibold block mt-0.5 leading-relaxed">{ontStatus.mikrotik_secret.LastDisconnectReason || "-"}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-slate-400 dark:text-slate-500 italic font-medium py-2">Data PPP Secret tidak ditemukan di MikroTik.</p>
                        )}
                      </div>

                      {/* Active Connection Details */}
                      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 text-xs space-y-2.5">
                        <strong className="text-slate-800 dark:text-slate-100 uppercase text-[10px] tracking-wider block border-b pb-1.5 font-sans font-bold">
                          Sesi Aktif PPP MikroTik
                        </strong>
                        {ontStatus.mikrotik_active ? (
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-sans uppercase font-bold">Status Koneksi</span>
                              <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold bg-emerald-50 border border-emerald-250 px-2 py-0.5 rounded-full mt-0.5 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Connected
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-sans uppercase font-bold">IP Address Sesi</span>
                              <code className="text-indigo-600 font-mono font-semibold block mt-0.5">{ontStatus.mikrotik_active.Address}</code>
                            </div>
                            <div className="col-span-2">
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-sans uppercase font-bold">Uptime Sesi</span>
                              <strong className="text-slate-700 dark:text-slate-300 block mt-0.5 font-semibold">{ontStatus.mikrotik_active.Uptime}</strong>
                            </div>
                            <div className="col-span-2">
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-sans uppercase font-bold">Caller ID Sesi</span>
                              <code className="text-slate-600 font-mono block mt-0.5">{ontStatus.mikrotik_active.CallerID || "-"}</code>
                            </div>
                          </div>
                        ) : (
                          <p className="text-slate-500 dark:text-slate-400 italic font-medium py-2">Sesi PPPoE saat ini sedang offline (tidak ada koneksi aktif).</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {customer.is_trial && (
              <div className="lg:col-span-3 bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-center gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-amber-600 shrink-0" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <div className="text-xs text-amber-800">
                  <strong>Pelanggan dalam Masa Trial Aktif.</strong> Dimulai pada{" "}
                  {customer.trial_started_at ? new Date(customer.trial_started_at).toLocaleDateString("id-ID") : "-"}{" "}
                  selama {customer.trial_days ?? 3} hari.
                </div>
              </div>
            )}
          </div>

          {/* Integration Status Cache */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider block font-sans">
                Status Integrasi (Data Terakhir Di-Pool)
              </span>
              {customer.last_sync_at && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                  Terakhir Sync: {new Date(customer.last_sync_at).toLocaleString("id-ID")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* PPPoE Cache Card */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-150 space-y-2 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">PPPoE Status</span>
                  {customer.pppoe_status ? (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        customer.pppoe_status === "online"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : customer.pppoe_status === "limit"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {customer.pppoe_status === "online"
                        ? "Online"
                        : customer.pppoe_status === "limit"
                        ? "Terisolir"
                        : "Offline"}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Belum di-pool</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase">IP Address</span>
                    <p className="font-mono text-slate-700 dark:text-slate-300">{customer.pppoe_ip || "-"}</p>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase">Uptime</span>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">{customer.pppoe_uptime || "-"}</p>
                  </div>
                </div>
                {customer.user_pppoe && user?.role !== "viewer" && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
                      onClick={handleKickMikrotik}
                      disabled={kickingMikrotik}
                      isLoading={kickingMikrotik}
                      loadingText="Putus Sesi (Kick)"
                    >
                      Putus Sesi (Kick)
                    </Button>
                  </div>
                )}
              </div>

              {/* GPON ONT Cache Card */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-150 space-y-2 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">GPON ONT Status</span>
                  {customer.ont_status ? (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        customer.ont_status === "online"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {customer.ont_status === "online" ? "Online" : "Offline"}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">Belum di-pool</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase">Optical RX/TX</span>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                      {customer.ont_rx_power ? `${customer.ont_rx_power} / ${customer.ont_tx_power}` : "-"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase">CPE IP / Uptime</span>
                    <p className="font-mono text-slate-700 dark:text-slate-300 truncate" title={customer.ont_ip}>
                      {customer.ont_ip ? `${customer.ont_ip}` : "-"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Referral Management Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-4 shadow-sm">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-2 flex justify-between items-center">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider font-sans">
                Referral Reward & Voucher
              </h4>
              <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg font-mono font-semibold">
                Kode: {customer.referral_code || "-"}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-150">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase">Saldo Referral (Tarik Tunai)</span>
                <strong className="text-base font-extrabold text-indigo-600 block mt-1">
                  {formatCurrency(customer.referral_balance)}
                </strong>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-150">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase">Voucher Diskon (Auto Billing)</span>
                <strong className="text-base font-extrabold text-emerald-600 block mt-1">
                  {formatCurrency(customer.voucher_discount || 0)}
                </strong>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-150">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase">Diajak Oleh</span>
                <strong className="text-slate-800 dark:text-slate-100 font-bold block mt-1.5 truncate">
                  {customer.referred_by_name || "-"}
                </strong>
              </div>
            </div>
            {user?.role !== "viewer" && customer.referral_balance > 0 && (
              <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-white dark:bg-slate-900 border-indigo-200 hover:bg-indigo-50 text-indigo-700"
                  onClick={handleConvertVoucher}
                >
                  Tukar Jadi Voucher
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleWithdrawReferral}
                >
                  Tarik Tunai
                </Button>
              </div>
            )}
          </div>

          {/* Customer Bills list */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-4 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider font-sans border-b border-slate-100 dark:border-slate-800 pb-2">
              Riwayat Tagihan
            </h4>
            {loadingBills ? (
              <div className="flex justify-center py-4">
                <Loader2 className="animate-spin text-indigo-600" />
              </div>
            ) : customerBills.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">Belum ada riwayat tagihan.</p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="compact-table w-full text-xs">
                  <thead className="bg-slate-100 text-slate-650 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2 text-left">Invoice</th>
                      <th className="px-4 py-2 text-left">Periode</th>
                      <th className="px-4 py-2 text-left">Jatuh Tempo</th>
                      <th className="px-4 py-2 text-left">Nominal</th>
                      <th className="px-4 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:bg-slate-900">
                    {customerBills.map((bill) => (
                      <tr key={bill.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-300">{bill.invoice_number}</td>
                        <td className="px-4 py-2 text-slate-600">{bill.period}</td>
                        <td className="px-4 py-2 text-slate-600">{bill.due_date}</td>
                        <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">{formatCurrency(bill.amount)}</td>
                        <td className="px-4 py-2">
                          <StatusPill
                            label={bill.status === "lunas" ? "LUNAS" : "BELUM BAYAR"}
                            tone={bill.status === "lunas" ? "green" : "red"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
