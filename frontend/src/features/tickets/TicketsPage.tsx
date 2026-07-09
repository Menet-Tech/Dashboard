import { useState, useEffect, FormEvent, useRef, useCallback } from "react";
import {
  fetchTickets,
  fetchTicketDetail,
  addTicketMessage,
  closeTicket,
  fetchCustomers,
  rebootONT,
  factoryResetONT,
  request,
} from "../../lib/api";
import type { TicketItem, TicketDetailItem, CustomerItem, User } from "../../types";
import { StatusPill } from "../../components/ui/StatusPill";
import { toErrorMessage } from "../../utils/format";
import { useDialog } from "../../context/DialogContext";
import { useWhatsAppGateway } from "../../hooks/useWhatsAppGateway";
import {
  Loader2,
  Plus,
  RotateCw,
  AlertTriangle,
  RefreshCw,
  X,
  User as UserIcon,
  Cpu,
  Phone,
  MapPin,
  LifeBuoy,
} from "lucide-react";

interface TicketsPageProps {
  waGatewayUrl?: string;
  waApiKey?: string;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  user: User | null;
}

export function TicketsPage({
  waGatewayUrl,
  waApiKey,
  pushSuccess,
  pushError,
  user,
}: TicketsPageProps) {
  const { showConfirm } = useDialog();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetailItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"open" | "closed" | "">("open");
  const [error, setError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Manual creation states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [customersList, setCustomersList] = useState<CustomerItem[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomerIdForTicket, setSelectedCustomerIdForTicket] = useState<number | null>(null);
  const [newTicketNama, setNewTicketNama] = useState("");
  const [newTicketNoHP, setNewTicketNoHP] = useState("");
  const [newTicketAlamat, setNewTicketAlamat] = useState("");
  const [newTicketKendala, setNewTicketKendala] = useState("");
  const [creatingTicket, setCreatingTicket] = useState(false);

  // Linked customer ONT status states
  const [linkedCustomer, setLinkedCustomer] = useState<CustomerItem | null>(null);
  const [loadingCust, setLoadingCust] = useState(false);
  const [ontStatus, setOntStatus] = useState<any | null>(null);
  const [loadingOnt, setLoadingOnt] = useState(false);
  const [ontError, setOntError] = useState<string | null>(null);
  const [rebootingOnt, setRebootingOnt] = useState(false);
  const [resettingOnt, setResettingOnt] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [detail?.messages]);

  // Load tickets list
  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetchTickets(statusFilter);
      setTickets(res.data);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statusFilter]);

  // Load ticket details when selected
  const loadDetail = useCallback(async (ticketId: number, silent = false) => {
    if (!silent) setDetailLoading(true);
    setReplyError(null);
    try {
      const res = await fetchTicketDetail(ticketId);
      setDetail(res.data);
    } catch (err) {
      setReplyError(toErrorMessage(err));
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (selectedTicketId === null) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedTicketId);
  }, [selectedTicketId, loadDetail]);

  // Fetch linked customer info when ticket detail changes
  useEffect(() => {
    if (detail && detail.pelanggan_id) {
      setLoadingCust(true);
      setOntStatus(null);
      setOntError(null);
      fetch(`/api/v1/customers/${detail.pelanggan_id}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          setLinkedCustomer(data.data);
        })
        .catch((err) => console.error("Error loading linked customer:", err))
        .finally(() => setLoadingCust(false));
    } else {
      setLinkedCustomer(null);
      setOntStatus(null);
      setOntError(null);
    }
  }, [detail]);

  // Connect to WhatsApp Gateway Socket.io for real-time messages
  const gatewayUrl = waGatewayUrl?.trim() || "http://localhost:3001";
  const apiKey = waApiKey?.trim() || "";

  useWhatsAppGateway({
    gatewayUrl,
    apiKey,
    onChatMessage: (msg) => {
      // 1. Silent reload ticket list to reflect new message previews / status updates
      void loadTickets(true);

      // 2. If the message belongs to the active ticket, reload its detail silently
      if (selectedTicketId && detail) {
        const cleanPhone = (p: string | null | undefined) =>
          (p || "").replace(/@(c\.us|lid)$/, "").replace(/^0/, "62");
        const activePhone = cleanPhone(detail.no_hp);
        const msgPhone = cleanPhone(
          msg.direction === "inbound" ? msg.from_number : msg.to_number
        );
        if (activePhone && msgPhone === activePhone) {
          void loadDetail(selectedTicketId, true);
        }
      }
    },
  });

  // Modal customer loaders
  const handleOpenCreateModal = async () => {
    setIsCreateModalOpen(true);
    setLoadingCustomers(true);
    try {
      const res = await fetchCustomers();
      setCustomersList(res.data || []);
    } catch (err) {
      console.error("Failed to load customers list:", err);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleSelectCustomerForTicket = (id: number | null) => {
    setSelectedCustomerIdForTicket(id);
    if (id) {
      const cust = customersList.find((c) => c.id === id);
      if (cust) {
        setNewTicketNama(cust.name);
        setNewTicketNoHP(cust.whatsapp);
        setNewTicketAlamat(cust.address);
        return;
      }
    }
    setNewTicketNama("");
    setNewTicketNoHP("");
    setNewTicketAlamat("");
  };

  const handleCreateTicketSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTicketNama.trim() || !newTicketNoHP.trim() || !newTicketKendala.trim()) {
      pushError("Nama, No HP, dan Kendala wajib diisi.");
      return;
    }
    setCreatingTicket(true);
    try {
      const payload: any = {
        nama: newTicketNama.trim(),
        no_hp: newTicketNoHP.trim(),
        alamat: newTicketAlamat.trim(),
        kendala: newTicketKendala.trim(),
      };
      if (selectedCustomerIdForTicket) {
        payload.pelanggan_id = selectedCustomerIdForTicket;
      }
      const res = await request<{ data: TicketItem }>("/api/v1/tickets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      pushSuccess("Tiket keluhan berhasil dibuat.");
      setIsCreateModalOpen(false);

      // Reset
      setSelectedCustomerIdForTicket(null);
      setNewTicketNama("");
      setNewTicketNoHP("");
      setNewTicketAlamat("");
      setNewTicketKendala("");

      await loadTickets();
      setSelectedTicketId(Number(res.data.id));
    } catch (err) {
      pushError(toErrorMessage(err));
    } finally {
      setCreatingTicket(false);
    }
  };

  // ONT device check and controls
  const handleCheckOntStatus = async () => {
    if (!detail?.pelanggan_id) return;
    setLoadingOnt(true);
    setOntError(null);
    setOntStatus(null);
    try {
      const res = await fetch(`/api/v1/customers/${detail.pelanggan_id}/ont-status`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Gagal memuat status ONT");
      setOntStatus(data.data);
    } catch (err: any) {
      setOntError(err.message || String(err));
    } finally {
      setLoadingOnt(false);
    }
  };

  const handleRebootOnt = async () => {
    if (!detail?.pelanggan_id) return;
    if (!(await showConfirm("Apakah Anda yakin ingin mem-reboot ONT pelanggan ini?"))) return;
    setRebootingOnt(true);
    try {
      const res = await rebootONT(detail.pelanggan_id);
      pushSuccess(res.message || "Perintah reboot berhasil dikirim ke GenieACS.");
    } catch (err: any) {
      pushError(err.message || String(err));
    } finally {
      setRebootingOnt(false);
    }
  };

  const handleFactoryResetOnt = async () => {
    if (!detail?.pelanggan_id) return;
    if (!(await showConfirm("PERINGATAN: Apakah Anda yakin ingin mengembalikan ONT ke pengaturan pabrik? Ini akan menghapus konfigurasi ONT."))) return;
    setResettingOnt(true);
    try {
      const res = await factoryResetONT(detail.pelanggan_id);
      pushSuccess(res.message || "Perintah factory reset berhasil dikirim ke GenieACS.");
    } catch (err: any) {
      pushError(err.message || String(err));
    } finally {
      setResettingOnt(false);
    }
  };

  async function handleSendReply(e: FormEvent) {
    e.preventDefault();
    if (!selectedTicketId || !replyText.trim() || !detail) return;

    setReplyError(null);
    try {
      const res = await addTicketMessage(selectedTicketId, replyText);
      setDetail((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          messages: [...prev.messages, res.data],
        };
      });
      setReplyText("");
    } catch (err) {
      setReplyError(toErrorMessage(err));
    }
  }

  async function handleClose() {
    if (!selectedTicketId || !detail) return;
    if (!(await showConfirm("Apakah Anda yakin ingin menutup tiket ini?"))) return;

    setReplyError(null);
    try {
      await closeTicket(selectedTicketId);
      setDetail((prev) => {
        if (!prev) return prev;
        return { ...prev, status: "closed" };
      });
      setTickets((prev) =>
        prev.map((t) => (t.id === selectedTicketId ? { ...t, status: "closed" } : t))
      );
    } catch (err) {
      setReplyError(toErrorMessage(err));
    }
  }

  const isViewer = user?.role === "viewer";

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] min-h-[500px]">
      {/* Left pane: list of tickets */}
      <article className="lg:col-span-5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col h-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 font-sans">
              <LifeBuoy size={18} className="text-indigo-600" />
              Tiket Keluhan
            </h2>
            <p className="text-xs text-slate-500 mt-1">Daftar laporan kendala pelanggan.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "open" | "closed" | "")}
            >
              <option value="">Semua Status</option>
              <option value="open">Aktif / Terbuka</option>
              <option value="closed">Selesai / Ditutup</option>
            </select>
            {!isViewer && (
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg p-1.5 shadow-sm transition-colors text-xs flex items-center justify-center cursor-pointer"
                title="Tambah Tiket Baru"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-955/20 text-red-600 dark:text-red-400 rounded-lg text-xs font-semibold">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 pr-1 scrollbar-thin">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">Memuat daftar tiket...</div>
          ) : tickets.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">Tidak ada tiket yang ditemukan.</div>
          ) : (
            tickets.map((t) => {
              const date = new Date(t.created_at).toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTicketId(t.id)}
                  className={`w-full text-left py-4 px-3 rounded-xl transition-all flex flex-col gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                    selectedTicketId === t.id
                      ? "bg-indigo-50/70 dark:bg-indigo-950/20 border-l-4 border-indigo-600 pl-2 text-indigo-900 dark:text-indigo-100"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="font-bold text-xs">#{t.id} - {t.nama}</span>
                    <span className="text-[10px] text-slate-400">{date}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1">{t.kendala}</p>
                  <div className="flex justify-between items-center w-full mt-1">
                    <span className="text-[10px] text-slate-400 font-medium">{t.no_hp.replace("@c.us", "")}</span>
                    <StatusPill
                      label={t.status === "open" ? "Terbuka" : "Selesai"}
                      tone={t.status === "open" ? "gold" : "green"}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </article>

      {/* Right pane: ticket details & messages thread */}
      <article className="lg:col-span-7 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
        {selectedTicketId === null ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-950/20">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center mb-4">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <h3 className="font-bold text-slate-700 dark:text-slate-350 mb-1">Pilih Tiket Keluhan</h3>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Klik salah satu tiket keluhan di samping kiri untuk melihat detail percakapan dan membalas via WhatsApp.
            </p>
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs text-slate-400">Memuat detail tiket...</span>
          </div>
        ) : !detail ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs text-red-500 font-semibold">{replyError || "Gagal memuat detail tiket."}</span>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row h-full overflow-hidden">
            {/* Left/Main Column - Chat Message Thread */}
            <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-slate-100 dark:border-slate-800">
              {/* Detail header */}
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start bg-slate-50/20 dark:bg-slate-950/10">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">#{detail.id} - {detail.nama}</h3>
                    <StatusPill
                      label={detail.status === "open" ? "Terbuka" : "Selesai"}
                      tone={detail.status === "open" ? "gold" : "green"}
                    />
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <p className="flex items-center gap-1">
                      <strong>WhatsApp:</strong>{" "}
                      <a
                        href={`https://wa.me/${detail.no_hp.replace("@c.us", "").replace("@lid", "").replace(/[+\-\s]/g, "").replace(/^0/, "62")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline font-semibold inline-flex items-center gap-0.5"
                        title="Chat Manual via wa.me"
                      >
                        {detail.no_hp.replace("@c.us", "").replace("@lid", "")}
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                      </a>
                      {detail.customer_name && ` (${detail.customer_name})`}
                    </p>
                    <p><strong>Alamat:</strong> {detail.alamat || "-"}</p>
                    <div className="mt-2.5 p-3 bg-slate-50 dark:bg-slate-950/50 rounded-xl text-slate-700 dark:text-slate-300 border-l-2 border-indigo-400 text-xs leading-relaxed shadow-sm">
                      <strong>Keluhan Awal:</strong> {detail.kendala}
                    </div>
                  </div>
                </div>
                {detail.status === "open" && !isViewer && (
                  <button
                    onClick={handleClose}
                    className="bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors border border-emerald-100 dark:border-emerald-900/30 cursor-pointer"
                  >
                    Tandai Selesai
                  </button>
                )}
              </div>

              {/* Chat Messages thread */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-slate-950/5 flex flex-col gap-4 scrollbar-thin">
                {detail.messages.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">Belum ada tanggapan percakapan.</div>
                ) : (
                  detail.messages.map((m) => {
                    const isAdmin = m.sender_type === "admin";
                    const isRead = m.is_read === 1;
                    const time = new Date(m.created_at).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const readTime = m.read_at ? new Date(m.read_at).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }) : "";

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col max-w-[85%] ${isAdmin ? "self-end items-end" : "self-start items-start"}`}
                      >
                        <div
                          className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                            isAdmin
                              ? "bg-indigo-600 text-white rounded-tr-none"
                              : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-tl-none"
                          }`}
                        >
                          {m.message}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 px-1 text-[9px] text-slate-400 select-none">
                          <span>{time}</span>
                          {isAdmin && (
                            <span className={isRead ? "text-green-600 dark:text-green-500 font-semibold" : "text-slate-400"}>
                              • {isRead ? `Dibaca ${readTime}` : "Terkirim"}
                            </span>
                          )}
                          {!isAdmin && isRead && (
                            <span className="text-slate-500 font-medium">
                              • Dibaca Admin
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input panel */}
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                {replyError && (
                  <div className="mb-2 p-2 bg-red-50 text-red-600 rounded-lg text-[10px] font-semibold">
                    {replyError}
                  </div>
                )}
                {detail.status === "closed" ? (
                  <div className="p-3 bg-slate-50 dark:bg-slate-950/20 text-slate-550 rounded-xl text-center text-xs font-medium border border-dashed border-slate-200 dark:border-slate-800">
                    Tiket telah ditutup. Tanggapan baru tidak dapat dikirim ke tiket ini.
                  </div>
                ) : (
                  <form onSubmit={handleSendReply} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Tulis balasan untuk dikirim via WhatsApp..."
                      className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-900 dark:text-white transition-all"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={!replyText.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Kirim WA
                    </button>
                    {replyText.trim() && (
                      <div className="inline-flex items-center">
                        {/* Buka WA */}
                        <a
                          href={`https://wa.me/${detail.no_hp.replace("@c.us", "").replace("@lid", "").replace(/[+\-\s]/g, "").replace(/^0/, "62")}?text=${encodeURIComponent(replyText)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-250 dark:border-emerald-900/30 font-semibold py-2 px-3.5 rounded-l-xl text-xs shadow-sm transition-colors flex items-center justify-center cursor-pointer gap-1.5"
                          title="Buka WhatsApp langsung"
                        >
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.451 5.402 0 9.798-4.394 9.802-9.793.002-2.614-1.01-5.074-2.853-6.918C16.38 2.05 13.924.966 11.312.966c-5.402 0-9.802 4.394-9.802 9.794.002 1.902.51 3.5 1.461 5.09l-.989 3.605 3.682-.966zM17.07 14.5c-.274-.138-1.62-.8-1.874-.892-.252-.093-.437-.138-.62.138-.184.276-.713.892-.873 1.077-.16.184-.32.207-.593.07-.273-.138-1.156-.426-2.202-1.36-.812-.724-1.36-1.617-1.52-1.893-.16-.276-.017-.425.12-.562.122-.122.274-.32.41-.482.138-.16.184-.276.276-.46.09-.184.045-.344-.023-.482-.068-.138-.62-1.493-.849-2.046-.224-.543-.472-.47-.62-.47-.138-.008-.32-.008-.503-.008-.184 0-.482.07-.733.344-.25.276-.957.942-.957 2.3 0 1.357.987 2.668 1.123 2.852.138.184 1.94 2.962 4.7 4.15 1.543.665 2.505.772 3.414.636.58-.087 1.62-.662 1.848-1.27.228-.607.228-1.127.16-1.27-.068-.14-.25-.224-.523-.362z"/>
                          </svg>
                          Buka WA
                        </a>
                        {/* Salin Link */}
                        <button
                          type="button"
                          onClick={() => {
                            const phone = detail.no_hp.replace("@c.us", "").replace("@lid", "").replace(/[+\-\s]/g, "").replace(/^0/, "62");
                            const url = `https://wa.me/${phone}?text=${encodeURIComponent(replyText)}`;
                            void navigator.clipboard.writeText(url);
                            pushSuccess("Link wa.me berhasil disalin ke clipboard");
                          }}
                          className="bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-l-0 border-slate-200 dark:border-slate-700 font-semibold py-2 px-3 rounded-r-xl text-xs shadow-sm transition-colors flex items-center justify-center cursor-pointer gap-1"
                          title="Salin link wa.me ke clipboard"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                          Salin
                        </button>
                      </div>
                    )}
                  </form>
                )}
              </div>
            </div>

            {/* Right/Sidebar Column - Customer and ONT Details */}
            {detail.pelanggan_id && (
              <div className="w-full lg:w-72 bg-slate-50/50 dark:bg-slate-950/30 flex flex-col h-full overflow-y-auto p-4 gap-4 border-t lg:border-t-0 border-slate-100 dark:border-slate-800 scrollbar-thin">
                {/* Profile Card */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm">
                  <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1 border-b border-slate-100 dark:border-slate-850 pb-1.5">
                    <UserIcon size={11} className="text-slate-400" />
                    Detail Pelanggan
                  </h4>
                  {loadingCust ? (
                    <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                      <Loader2 className="animate-spin text-indigo-500" size={14} />
                      Loading...
                    </div>
                  ) : linkedCustomer ? (
                    <div className="space-y-3.5 text-xs">
                      <div>
                        <span className="text-[9px] text-slate-450 font-bold uppercase block tracking-wide">NAMA</span>
                        <strong className="text-slate-800 dark:text-slate-200 font-bold block mt-0.5">{linkedCustomer.name}</strong>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-450 font-bold uppercase block tracking-wide">PPPoE USERNAME</span>
                        <code className="text-slate-700 dark:text-slate-300 font-mono text-[10px] font-semibold block mt-0.5 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded w-max">{linkedCustomer.user_pppoe || "—"}</code>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-450 font-bold uppercase block tracking-wide">STATUS AKUN</span>
                        <span className="mt-1 block">
                          <StatusPill
                            label={
                              linkedCustomer.status === "active"
                                ? "Aktif"
                                : linkedCustomer.status === "limit"
                                ? "Isolir"
                                : linkedCustomer.status === "suspended"
                                ? "Suspended"
                                : "Nonaktif"
                            }
                            tone={
                              linkedCustomer.status === "active"
                                ? "green"
                                : linkedCustomer.status === "limit"
                                ? "gold"
                                : "red"
                            }
                          />
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-450 font-bold uppercase block tracking-wide">NOMOR WA</span>
                        <span className="text-slate-700 dark:text-slate-300 block mt-0.5">{linkedCustomer.whatsapp}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-450 font-bold uppercase block tracking-wide">ALAMAT</span>
                        <span className="text-slate-650 dark:text-slate-400 block mt-0.5 leading-relaxed">{linkedCustomer.address || "—"}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 py-2">Gagal memuat profil pelanggan.</div>
                  )}
                </div>

                {/* Device ONT Connection Card */}
                {linkedCustomer && linkedCustomer.sn_ont && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-sm flex flex-col gap-3">
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                      <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Cpu size={11} className="text-slate-400" />
                        GenieACS TR-069
                      </h4>
                      <button
                        type="button"
                        onClick={handleCheckOntStatus}
                        disabled={loadingOnt || rebootingOnt || resettingOnt}
                        className="text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        {loadingOnt ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                        Cek
                      </button>
                    </div>

                    {/* Stats & Details */}
                    <div className="flex flex-col gap-2.5">
                      <div className="flex justify-between text-xs items-center">
                        <span className="text-slate-400">SN ONT</span>
                        <code className="font-semibold font-mono text-slate-800 dark:text-slate-200">{linkedCustomer.sn_ont}</code>
                      </div>

                      {ontError && (
                        <div className="text-[10px] text-rose-600 bg-rose-50 dark:bg-rose-955/20 p-2 rounded-lg flex items-center gap-1 border border-rose-100 dark:border-rose-900/30">
                          <AlertTriangle size={12} className="shrink-0" />
                          <span>{ontError}</span>
                        </div>
                      )}

                      {ontStatus ? (
                        <div className="space-y-2 mt-1.5 text-xs border-t border-slate-50 dark:border-slate-800 pt-2.5 animate-in fade-in duration-200">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Koneksi</span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                              ontStatus.status === "online"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
                                : "bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-400"
                            }`}>
                              <span className={`w-1 h-1 rounded-full ${ontStatus.status === "online" ? "bg-emerald-500" : "bg-rose-500"}`}></span>
                              {ontStatus.status === "online" ? "Online" : "Offline"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Model</span>
                            <span className="font-medium text-slate-850 dark:text-slate-200">{ontStatus.model}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">IP ONT</span>
                            <code className="font-mono text-slate-700 dark:text-slate-350">{ontStatus.ip_address}</code>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Rx Power</span>
                            <span className={`font-bold ${
                              parseFloat(ontStatus.rx_optical_power) < -27
                                ? "text-rose-600"
                                : parseFloat(ontStatus.rx_optical_power) < -25
                                ? "text-amber-500"
                                : "text-emerald-600"
                            }`}>
                              {ontStatus.rx_optical_power}
                            </span>
                          </div>

                          {/* Commands for Non-Viewer */}
                          {user?.role !== "viewer" && (
                            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-50 dark:border-slate-800">
                              <button
                                type="button"
                                onClick={handleRebootOnt}
                                disabled={rebootingOnt || loadingOnt}
                                className="w-full bg-rose-650 hover:bg-rose-700 text-white font-bold py-1 px-1 rounded-lg text-[9px] transition-colors flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                              >
                                {rebootingOnt ? <Loader2 size={9} className="animate-spin" /> : <RotateCw size={9} />}
                                Reboot
                              </button>
                              <button
                                type="button"
                                onClick={handleFactoryResetOnt}
                                disabled={resettingOnt || loadingOnt}
                                className="w-full bg-slate-750 hover:bg-slate-800 text-white font-bold py-1 px-1 rounded-lg text-[9px] transition-colors flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                              >
                                {resettingOnt ? <Loader2 size={9} className="animate-spin" /> : null}
                                Factory
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 text-center py-3 italic border-t border-slate-50 dark:border-slate-800 pt-3">
                          Klik Cek untuk memindai status optical power ONT.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </article>

      {/* Manual Ticket Creation Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-sans">Tambah Tiket Baru</h3>
                <p className="text-[10px] text-slate-450 mt-0.5">Laporkan kendala support baru secara manual.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-350 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content Form */}
            <form onSubmit={handleCreateTicketSubmit} className="p-5 flex flex-col gap-3.5">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Hubungkan ke Pelanggan</span>
                <select
                  className="w-full text-xs px-3 py-2.5 border rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500"
                  value={selectedCustomerIdForTicket || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleSelectCustomerForTicket(val ? Number(val) : null);
                  }}
                >
                  <option value="">-- Input Manual / Pelanggan Baru --</option>
                  {loadingCustomers ? (
                    <option disabled>Loading data pelanggan...</option>
                  ) : (
                    customersList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.user_pppoe || "Tanpa PPPoE"})
                      </option>
                    ))
                  )}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Nama Pelapor</span>
                  <input
                    type="text"
                    required
                    className="w-full text-xs px-3 py-2 border rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                    value={newTicketNama}
                    onChange={(e) => setNewTicketNama(e.target.value)}
                    placeholder="Budi Santoso"
                    disabled={selectedCustomerIdForTicket !== null}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-350">No WhatsApp</span>
                  <input
                    type="text"
                    required
                    className="w-full text-xs px-3 py-2 border rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                    value={newTicketNoHP}
                    onChange={(e) => setNewTicketNoHP(e.target.value)}
                    placeholder="Contoh: 628123456789"
                    disabled={selectedCustomerIdForTicket !== null}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Alamat Lengkap</span>
                <input
                  type="text"
                  className="w-full text-xs px-3 py-2 border rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                  value={newTicketAlamat}
                  onChange={(e) => setNewTicketAlamat(e.target.value)}
                  placeholder="Jl. Melati No. 12"
                  disabled={selectedCustomerIdForTicket !== null}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Detail Kendala</span>
                <textarea
                  required
                  rows={3}
                  className="w-full text-xs px-3 py-2 border rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500"
                  value={newTicketKendala}
                  onChange={(e) => setNewTicketKendala(e.target.value)}
                  placeholder="Deskripsikan masalah perangkat/koneksi pelanggan..."
                />
              </label>

              <div className="flex justify-end gap-2.5 mt-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="bg-white border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-semibold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingTicket}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-5 rounded-xl text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {creatingTicket ? <Loader2 size={12} className="animate-spin" /> : null}
                  {creatingTicket ? "Membuat..." : "Buat Tiket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
