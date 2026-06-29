import { useState, useEffect, FormEvent, useRef, useCallback } from "react";
import { fetchTickets, fetchTicketDetail, addTicketMessage, closeTicket } from "../../lib/api";
import type { TicketItem, TicketDetailItem } from "../../types";
import { StatusPill } from "../../components/ui/StatusPill";
import { toErrorMessage } from "../../utils/format";
import { useDialog } from "../../context/DialogContext";
import { useWhatsAppGateway } from "../../hooks/useWhatsAppGateway";

interface TicketsPageProps {
  waGatewayUrl?: string;
  waApiKey?: string;
}

export function TicketsPage({ waGatewayUrl, waApiKey }: TicketsPageProps) {
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
        const cleanPhone = (p: string | null | undefined) => (p || "").replace(/@(c\.us|lid)$/, "").replace(/^0/, "62");
        const activePhone = cleanPhone(detail.no_hp);
        const msgPhone = cleanPhone(msg.direction === "inbound" ? msg.from_number : msg.to_number);
        if (activePhone && msgPhone === activePhone) {
          void loadDetail(selectedTicketId, true);
        }
      }
    },
  });

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
      // Update in ticket list
      setTickets((prev) =>
        prev.map((t) => (t.id === selectedTicketId ? { ...t, status: "closed" } : t))
      );
    } catch (err) {
      setReplyError(toErrorMessage(err));
    }
  }

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)] min-h-[500px]">
      {/* Left pane: list of tickets */}
      <article className="lg:col-span-5 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col h-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Tiket Keluhan</h2>
            <p className="text-xs text-slate-500">Daftar laporan kendala dari chatbot WhatsApp.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "open" | "closed" | "")}
            >
              <option value="">Semua Status</option>
              <option value="open">Aktif / Terbuka</option>
              <option value="closed">Selesai / Ditutup</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-xs font-semibold">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1">
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
                  className={`w-full text-left py-4 px-3 rounded-xl transition-all flex flex-col gap-1.5 hover:bg-slate-50 ${
                    selectedTicketId === t.id ? "bg-indigo-50/75 border-l-4 border-indigo-600 pl-2" : ""
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="font-bold text-xs text-slate-900">#{t.id} - {t.nama}</span>
                    <span className="text-[10px] text-slate-400">{date}</span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-1">{t.kendala}</p>
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
      <article className="lg:col-span-7 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
        {selectedTicketId === null ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
            <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <h3 className="font-bold text-slate-700 mb-1">Pilih Tiket Keluhan</h3>
            <p className="text-xs text-slate-400 max-w-xs">
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
          <div className="flex flex-col h-full">
            {/* Detail header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="font-bold text-slate-900 text-sm">#{detail.id} - {detail.nama}</h3>
                  <StatusPill
                    label={detail.status === "open" ? "Terbuka" : "Selesai"}
                    tone={detail.status === "open" ? "gold" : "green"}
                  />
                </div>
                <div className="flex flex-col gap-1 text-xs text-slate-500">
                  <p><strong>WhatsApp:</strong> {detail.no_hp.replace("@c.us", "")} {detail.customer_name && `(${detail.customer_name})`}</p>
                  <p><strong>Alamat:</strong> {detail.alamat || "-"}</p>
                  <div className="mt-2 p-2.5 bg-slate-50 rounded-lg text-slate-700 border-l-2 border-indigo-400">
                    <strong>Keluhan Awal:</strong> {detail.kendala}
                  </div>
                </div>
              </div>
              {detail.status === "open" && (
                <button
                  onClick={handleClose}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors"
                >
                  Tandai Selesai
                </button>
              )}
            </div>

            {/* Chat Messages thread */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 flex flex-col gap-4">
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
                      className={`flex flex-col max-w-[80%] ${isAdmin ? "self-end items-end" : "self-start items-start"}`}
                    >
                      <div
                        className={`p-3.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                          isAdmin
                            ? "bg-indigo-600 text-white rounded-tr-none"
                            : "bg-white text-slate-700 border border-slate-200 rounded-tl-none"
                        }`}
                      >
                        {m.message}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 px-1 text-[9px] text-slate-400 select-none">
                        <span>{time}</span>
                        {isAdmin && (
                          <span className={isRead ? "text-green-600 font-semibold" : "text-slate-400"}>
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
            <div className="p-4 border-t border-slate-100 bg-white">
              {replyError && (
                <div className="mb-2 p-2 bg-red-50 text-red-600 rounded-lg text-[10px] font-semibold">
                  {replyError}
                </div>
              )}
              {detail.status === "closed" ? (
                <div className="p-3 bg-slate-50 text-slate-500 rounded-xl text-center text-xs font-medium border border-dashed border-slate-200">
                  Tiket telah ditutup. Tanggapan baru tidak dapat dikirim ke tiket ini.
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Tulis balasan untuk dikirim via WhatsApp..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-sm transition-colors disabled:opacity-50"
                  >
                    Kirim WA
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
