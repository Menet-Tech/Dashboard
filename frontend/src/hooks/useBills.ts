import { useState, useEffect, useRef, type FormEvent } from "react";
import { fetchBills, generateBills, markBillPaid, uploadBillProof, fetchBillNotifications, grantBillExtension, cancelPendingBillAction } from "../lib/api";
import { validateBillPeriod, type FieldErrors } from "../utils/validation";
import { currentPeriod } from "../utils/format";
import type { BillItem, NotificationLog } from "../types";
import type { HookDeps } from "./types";

export function useBills({ withFeedback, askForConfirmation, onSuccess, onError }: HookDeps) {
  const [bills, setBills] = useState<BillItem[]>([]);
  const [billPeriod, setBillPeriod] = useState(currentPeriod());
  const [filterPeriod, setFilterPeriod] = useState(currentPeriod());
  const [billErrors, setBillErrors] = useState<FieldErrors>({});
  const [proofFiles, setProofFiles] = useState<Record<number, File | null>>({});
  const [notificationLogs, setNotificationLogs] = useState<Record<number, NotificationLog[]>>({});
  const [expandedBillId, setExpandedBillId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  async function refreshBills(params?: {
    search?: string;
    status?: string;
    period?: string;
    page?: number;
  }) {
    const activeSearch = params?.search !== undefined ? params.search : search;
    const activeStatus = params?.status !== undefined ? params.status : status;
    const activePeriod = params?.period !== undefined ? params.period : filterPeriod;
    const activePage = params?.page !== undefined ? params.page : page;

    const payload = await fetchBills({
      search: activeSearch || undefined,
      status: activeStatus || undefined,
      period: activePeriod || undefined,
      page: activePage,
      limit,
    });
    setBills(payload.data);
    if (payload.total !== undefined) {
      setTotal(payload.total);
    }
  }

  async function handleGenerateBills(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateBillPeriod(billPeriod);
    setBillErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    askForConfirmation({
      title: "Generate tagihan bulanan",
      body: `Sistem akan membuat tagihan untuk periode ${billPeriod} hanya untuk pelanggan aktif/limit yang belum memiliki invoice pada periode tersebut.`,
      confirmLabel: "Generate sekarang",
      tone: "primary",
      onConfirm: async () => {
        await withFeedback(async () => {
          const response = await generateBills(billPeriod);
          setBillErrors({});
          onSuccess(`Generate tagihan periode ${response.data.period} selesai. ${response.data.generated} tagihan baru dibuat.`);
          await refreshBills();
        }, "generate-bills");
      },
    });
  }

  function handleMarkBillPaid(id: number) {
    askForConfirmation({
      title: "Tandai tagihan lunas",
      body: "Apakah Anda yakin? Pembayaran akan diproses dalam waktu 10 menit, selama waktu tersebut Anda masih dapat membatalkannya.",
      confirmLabel: "Ya, tandai lunas",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          await markBillPaid(id, "transfer");
          onSuccess("Tandai lunas berhasil diproses. Anda memiliki waktu 10 menit untuk membatalkannya.");
          await refreshBills();
        }, "mark-paid");
      },
    });
  }

  async function handleUploadProof(id: number, providedFile?: File | null) {
    const file = providedFile !== undefined ? providedFile : proofFiles[id];
    if (!file) { onError("Pilih file bukti bayar terlebih dahulu."); return; }
    await withFeedback(async () => {
      let fileToUpload = file;
      if (file.type.startsWith('image/')) {
         onSuccess("Sedang mengkompres gambar...");
         const { compressImage } = await import('../lib/imageCompression');
         fileToUpload = await compressImage(file, 0.5); // Max 500KB
      }
      await uploadBillProof(id, fileToUpload);
      setProofFiles((current) => ({ ...current, [id]: null }));
      onSuccess("Bukti bayar berhasil diunggah.");
      await refreshBills();
    }, "upload-proof");
  }

  async function handleToggleNotifications(billId: number) {
    if (expandedBillId === billId) { setExpandedBillId(null); return; }
    setExpandedBillId(billId);
    if (!notificationLogs[billId]) {
      try {
        const res = await fetchBillNotifications(billId);
        setNotificationLogs((prev) => ({ ...prev, [billId]: res.data }));
      } catch (err) { console.error("Failed to fetch logs", err); }
    }
  }

  const searchTimeout = useRef<number | null>(null);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
    
    if (searchTimeout.current) {
      window.clearTimeout(searchTimeout.current);
    }
    
    searchTimeout.current = window.setTimeout(() => {
      void refreshBills({ search: val, page: 1 });
    }, 500);
  };

  const handleStatusChange = (val: string) => {
    setStatus(val);
    setPage(1);
    void refreshBills({ status: val, page: 1 });
  };

  const handleFilterPeriodChange = (val: string) => {
    setFilterPeriod(val);
    setPage(1);
    void refreshBills({ period: val, page: 1 });
  };

  const handlePageChange = (val: number) => {
    setPage(val);
    void refreshBills({ page: val });
  };

  async function handleGrantExtension(id: number) {
    await withFeedback(async () => {
      await grantBillExtension(id);
      onSuccess("Perpanjangan berhasil diproses. Anda memiliki waktu 10 menit untuk membatalkannya.");
      await refreshBills();
    }, `extend-${id}`);
  }

  async function handleCancelPendingAction(id: number) {
    askForConfirmation({
      title: "Batalkan tindakan pending",
      body: "Apakah Anda yakin ingin membatalkan tanda lunas atau perpanjangan yang tertunda ini? Tagihan akan kembali ke status belum bayar.",
      confirmLabel: "Ya, batalkan",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          await cancelPendingBillAction(id);
          onSuccess("Tindakan berhasil dibatalkan.");
          await refreshBills();
        }, `cancel-pending-${id}`);
      },
    });
  }

  return {
    state: { bills, billPeriod, filterPeriod, billErrors, proofFiles, notificationLogs, expandedBillId, search, status, page, total, limit },
    handlers: { setBills, setBillPeriod, setProofFiles, refreshBills, handleGenerateBills, handleMarkBillPaid, handleUploadProof, handleToggleNotifications, handleSearchChange, handleStatusChange, handlePageChange, handleFilterPeriodChange, handleGrantExtension, handleCancelPendingAction },
  };
}
