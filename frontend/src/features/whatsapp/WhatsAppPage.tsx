import { useState, useEffect, useRef } from "react";
import { useWhatsAppGateway } from "../../hooks/useWhatsAppGateway";
import {
  getGatewayAccounts,
  createGatewayAccount,
  deleteGatewayAccount,
  getGatewayAccountQr,
  getGatewayHistory,
  getChatbotSessions,
  resetChatbotSession,
  getChatbotForms,
  type GatewayAccount,
  type GatewayMessage,
  type ChatbotSession,
  type ContactForm,
} from "../../lib/gatewayApi";
import { inputClassName } from "../../components/ui";
import { Eye, EyeOff, Lock, Unlock, RefreshCw, Trash2, Plus, Wifi, WifiOff, MessageSquare, ShieldAlert } from "lucide-react";
import type { User } from "../../types";

type WhatsAppPageProps = {
  user: User;
  waGatewayUrl?: string;
  waApiKey?: string;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  withFeedback: (fn: () => Promise<void>, actionKey?: string) => Promise<void>;
};

type ActiveTab = "accounts" | "qr" | "history" | "chatbot";

export function WhatsAppPage({
  user,
  waGatewayUrl,
  waApiKey,
  pushSuccess,
  pushError,
  withFeedback,
}: WhatsAppPageProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("accounts");
  const [newAccountId, setNewAccountId] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [qrSelectedAccountId, setQrSelectedAccountId] = useState("default");
  
  // Local copies / state
  const [historyMessages, setHistoryMessages] = useState<GatewayMessage[]>([]);
  const [chatbotSessions, setChatbotSessions] = useState<ChatbotSession[]>([]);
  const [contactForms, setContactForms] = useState<ContactForm[]>([]);
  const [historyFilterAccount, setHistoryFilterAccount] = useState<string>("all");
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  const [loading, setLoading] = useState(false);
  const [decryptAll, setDecryptAll] = useState(false);

  // Read config safely
  const gatewayUrl = waGatewayUrl?.trim();
  const apiKey = waApiKey?.trim();

  // Socket.io integration
  const handleIncomingMessage = (msg: GatewayMessage) => {
    setHistoryMessages((prev) => {
      // Avoid duplicate keys
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [msg, ...prev];
    });
  };

  const { socketConnected, accounts, setAccounts, qrs, setQrs } = useWhatsAppGateway({
    gatewayUrl,
    onChatMessage: handleIncomingMessage,
  });

  // Fetch initial accounts, history, chatbot data
  useEffect(() => {
    if (!gatewayUrl || !apiKey) return;

    let active = true;
    async function loadData() {
      try {
        setLoading(true);
        const [accRes, histRes, sessionsRes, formsRes] = await Promise.all([
          getGatewayAccounts(gatewayUrl!, apiKey!),
          getGatewayHistory(gatewayUrl!, apiKey!, null, 100),
          getChatbotSessions(gatewayUrl!, apiKey!),
          getChatbotForms(gatewayUrl!, apiKey!, undefined, 100),
        ]);

        if (active) {
          setAccounts(accRes.data);
          setHistoryMessages(histRes.data);
          setChatbotSessions(sessionsRes.data);
          setContactForms(formsRes.data);

          if (accRes.data.length > 0 && !accRes.data.some(a => a.accountId === qrSelectedAccountId)) {
            setQrSelectedAccountId(accRes.data[0].accountId);
          }
        }
      } catch (err: any) {
        console.error("Failed to load gateway data", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadData();

    // Poll chatbot data periodically
    const timer = setInterval(() => {
      if (!gatewayUrl || !apiKey) return;
      void getChatbotSessions(gatewayUrl, apiKey).then(res => setChatbotSessions(res.data)).catch(() => {});
      void getChatbotForms(gatewayUrl, apiKey, undefined, 100).then(res => setContactForms(res.data)).catch(() => {});
    }, 10000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [gatewayUrl, apiKey, setAccounts]);

  // Actions
  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!gatewayUrl || !apiKey) return;
    if (!newAccountId.trim()) {
      pushError("Account ID wajib diisi");
      return;
    }

    await withFeedback(async () => {
      await createGatewayAccount(
        gatewayUrl,
        apiKey,
        newAccountId.trim(),
        newAccountLabel.trim()
      );
      pushSuccess(`Inisialisasi akun '${newAccountId}' berhasil dimulai`);
      setNewAccountId("");
      setNewAccountLabel("");
      
      // Reload accounts list
      const res = await getGatewayAccounts(gatewayUrl, apiKey);
      setAccounts(res.data);
      setQrSelectedAccountId(newAccountId.trim());
      setActiveTab("qr");
    }, "add-account");
  }

  async function handleDeleteAccount(id: string) {
    if (!gatewayUrl || !apiKey) return;
    if (!window.confirm(`Apakah Anda yakin ingin menghapus akun '${id}'?`)) return;

    await withFeedback(async () => {
      await deleteGatewayAccount(gatewayUrl, apiKey, id);
      pushSuccess(`Akun '${id}' berhasil dihapus`);
      const res = await getGatewayAccounts(gatewayUrl, apiKey);
      setAccounts(res.data);
    }, "delete-account");
  }

  async function handleRefreshAccounts() {
    if (!gatewayUrl || !apiKey) return;
    await withFeedback(async () => {
      const accRes = await getGatewayAccounts(gatewayUrl, apiKey);
      const histRes = await getGatewayHistory(gatewayUrl, apiKey, null, 100);
      setAccounts(accRes.data);
      setHistoryMessages(histRes.data);
      pushSuccess("Data gateway berhasil diperbarui");
    }, "refresh-accounts");
  }

  async function handleResetSession(phone: string) {
    if (!gatewayUrl || !apiKey) return;
    if (!window.confirm(`Apakah Anda yakin ingin mereset sesi chatbot untuk ${phone}?`)) return;

    await withFeedback(async () => {
      await resetChatbotSession(gatewayUrl, apiKey, phone);
      pushSuccess(`Sesi chatbot untuk ${phone} berhasil direset`);
      const sessionsRes = await getChatbotSessions(gatewayUrl, apiKey);
      setChatbotSessions(sessionsRes.data);
    }, "reset-session");
  }

  // QR Fetch fallback for selected account
  async function triggerQrFetch(id: string) {
    if (!gatewayUrl || !apiKey) return;
    try {
      const res = await getGatewayAccountQr(gatewayUrl, apiKey, id);
      if (res.data?.qr) {
        setQrs((prev) => ({ ...prev, [id]: res.data.qr }));
      }
    } catch (err: any) {
      pushError(err.message || "QR Code belum siap");
    }
  }

  // Encryption helper
  const canDecrypt = user.role === "admin" || user.role === "petugas";
  const shouldMask = !canDecrypt || (!decryptAll && canDecrypt);

  const maskText = (text: string) => {
    if (!text) return "";
    if (!shouldMask) return text;
    return text.replace(/./g, "*");
  };

  const maskPhone = (phone: string) => {
    if (!phone) return "";
    if (!shouldMask) return phone;
    const clean = phone.replace(/@c\.us$/, "");
    if (clean.length <= 6) return "****";
    return `${clean.substring(0, 4)}*****${clean.substring(clean.length - 2)}`;
  };

  // Filter messages
  const filteredMessages = historyMessages.filter((msg) => {
    const matchesAccount =
      historyFilterAccount === "all" || msg.account_id === historyFilterAccount;
    const rawNumber = msg.from_number || msg.to_number || "";
    const cleanNumber = rawNumber.replace(/@c\.us$/, "");
    const query = historySearchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      cleanNumber.includes(query) ||
      msg.body.toLowerCase().includes(query);
    return matchesAccount && matchesSearch;
  });

  if (!gatewayUrl || !apiKey) {
    return (
      <section className="grid">
        <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col items-center justify-center text-center p-8">
            <div className="bg-red-50 text-red-600 p-4 rounded-full mb-4">
              <ShieldAlert size={48} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              WhatsApp Gateway Belum Dikonfigurasi
            </h2>
            <p className="text-slate-600 max-w-md mb-6">
              Silakan isi <strong>Gateway URL</strong> dan <strong>API Key</strong> di tab
              Pengaturan Sistem terlebih dahulu untuk menggunakan fitur integrasi WhatsApp.
            </p>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="grid gap-6">
      {/* Overview Card */}
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span>WhatsApp Gateway & Chatbot</span>
              {socketConnected ? (
                <span className="flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Real-time Active
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-200">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  Polling Only
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Gateway URL: <code className="bg-slate-50 px-1 py-0.5 rounded text-xs">{gatewayUrl}</code>
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRefreshAccounts}
              className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors text-slate-700"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh Status
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 mb-6 overflow-x-auto gap-2">
          <button
            onClick={() => setActiveTab("accounts")}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "accounts"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <MessageSquare size={16} />
            Akun Gateway ({accounts.length})
          </button>
          <button
            onClick={() => setActiveTab("qr")}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "qr"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Wifi size={16} />
            Scan QR Code
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "history"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShieldAlert size={16} />
            Log Percakapan
          </button>
          <button
            onClick={() => setActiveTab("chatbot")}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "chatbot"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Plus size={16} />
            Form Chatbot ({contactForms.length})
          </button>
        </div>

        {/* Tab content 1: Accounts list & Create account */}
        {activeTab === "accounts" && (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Account List */}
            <div className="md:col-span-2 space-y-4">
              <h3 className="text-md font-bold text-slate-900">Daftar Akun WhatsApp</h3>
              {accounts.length === 0 ? (
                <div className="text-center p-8 bg-slate-50 rounded-xl border border-slate-200 text-slate-500">
                  Belum ada akun WhatsApp gateway yang terdaftar.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {accounts.map((acc) => (
                    <div
                      key={acc.accountId}
                      className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm flex flex-col justify-between hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h4 className="font-bold text-slate-950 text-md">{acc.accountId}</h4>
                          <p className="text-xs text-slate-400 mt-0.5">WhatsApp Client Account</p>
                        </div>
                        {acc.ready ? (
                          <span className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Connected
                          </span>
                        ) : acc.hasQr ? (
                          <span className="flex items-center gap-1.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Scan QR Needed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs font-semibold bg-slate-50 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Offline
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2 mt-2 pt-2 border-t border-slate-50 justify-end">
                        {canDecrypt && !acc.ready && (
                          <button
                            onClick={() => {
                              setQrSelectedAccountId(acc.accountId);
                              setActiveTab("qr");
                            }}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-colors"
                          >
                            Scan QR
                          </button>
                        )}
                        {canDecrypt && (
                          <button
                            onClick={() => handleDeleteAccount(acc.accountId)}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-1.5 rounded-md transition-colors"
                            title="Hapus Akun"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Create Account Form */}
            {canDecrypt ? (
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 h-fit">
                <h3 className="text-md font-bold text-slate-900 mb-4">Tambah Akun Baru</h3>
                <form onSubmit={handleAddAccount} className="space-y-4">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 block mb-1">Account ID (slug / nama)</span>
                    <input
                      type="text"
                      required
                      value={newAccountId}
                      onChange={(e) => setNewAccountId(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ""))}
                      placeholder="Contoh: CS-Admin-1"
                      className={inputClassName()}
                    />
                    <span className="text-[10px] text-slate-400 block mt-1">Hanya huruf, angka, dash, dan underscore.</span>
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600 block mb-1">Label Deskripsi</span>
                    <input
                      type="text"
                      value={newAccountLabel}
                      onChange={(e) => setNewAccountLabel(e.target.value)}
                      placeholder="Contoh: Akun Customer Service Utama"
                      className={inputClassName()}
                    />
                  </label>

                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={16} />
                    Daftarkan & Inisialisasi
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 h-fit text-center text-slate-500 text-xs">
                Anda login sebagai Viewer. Hak akses pengelolaan dinonaktifkan.
              </div>
            )}
          </div>
        )}

        {/* Tab content 2: Scan QR */}
        {activeTab === "qr" && (
          <div className="max-w-md mx-auto py-4">
            <div className="mb-5 flex flex-col gap-2">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 block mb-1">Pilih Akun yang Ingin di-Scan</span>
                <select
                  value={qrSelectedAccountId}
                  onChange={(e) => setQrSelectedAccountId(e.target.value)}
                  className={inputClassName()}
                >
                  {accounts.map((acc) => (
                    <option key={acc.accountId} value={acc.accountId}>
                      {acc.accountId} ({acc.ready ? "Connected" : "Offline / Waiting Scan"})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* QR Card Container */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center shadow-inner relative min-h-[350px]">
              {(() => {
                const target = accounts.find((a) => a.accountId === qrSelectedAccountId);
                const qr = qrs[qrSelectedAccountId];

                if (!target) {
                  return <p className="text-slate-500 text-sm">Pilih atau buat akun gateway terlebih dahulu.</p>;
                }

                if (target.ready) {
                  return (
                    <div className="text-center p-4">
                      <div className="bg-emerald-50 text-emerald-600 p-4 rounded-full inline-block mb-3 border border-emerald-100">
                        <Wifi size={40} />
                      </div>
                      <h4 className="font-bold text-slate-900 mb-1">WhatsApp Terkoneksi</h4>
                      <p className="text-sm text-slate-500">Akun '{qrSelectedAccountId}' siap mengirim dan menerima pesan.</p>
                    </div>
                  );
                }

                if (qr) {
                  return (
                    <div className="text-center flex flex-col items-center">
                      <p className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full mb-4 animate-pulse">
                        Menunggu Scan dari Aplikasi WhatsApp HP Anda
                      </p>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-md mb-4">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
                            qr
                          )}&size=260x260`}
                          alt="WhatsApp QR Code"
                          className="w-[260px] h-[260px] block"
                        />
                      </div>
                      <p className="text-xs text-slate-500 max-w-[280px]">
                        Buka WhatsApp di HP Anda → Menu → Perangkat Tertaut → Tautkan Perangkat.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="text-center flex flex-col items-center">
                    <p className="text-sm text-slate-500 mb-4">Meminta status/QR code dari server...</p>
                    <button
                      onClick={() => triggerQrFetch(qrSelectedAccountId)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw size={14} />
                      Muat Ulang QR Code
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Tab content 3: Chat history / log */}
        {activeTab === "history" && (
          <div className="space-y-6">
            {/* Filters & Decrypt Toggles */}
            <div className="flex flex-col md:flex-row gap-4 items-end justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600 block mb-1">Filter Akun</span>
                  <select
                    value={historyFilterAccount}
                    onChange={(e) => setHistoryFilterAccount(e.target.value)}
                    className={inputClassName()}
                  >
                    <option value="all">Semua Akun</option>
                    {accounts.map((acc) => (
                      <option key={acc.accountId} value={acc.accountId}>
                        {acc.accountId}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold text-slate-600 block mb-1">Cari Chat</span>
                  <input
                    type="text"
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    placeholder="Cari nomor atau isi pesan..."
                    className={inputClassName()}
                  />
                </label>
              </div>

              <div className="flex items-center gap-2">
                {canDecrypt ? (
                  <button
                    onClick={() => setDecryptAll(!decryptAll)}
                    className={`flex items-center gap-1.5 font-bold text-xs py-2 px-3 rounded-lg shadow-sm border transition-colors ${
                      decryptAll
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                        : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                    }`}
                  >
                    {decryptAll ? <Unlock size={14} /> : <Lock size={14} />}
                    {decryptAll ? "Dekripsi Aktif (Role-based)" : "Dekripsi Sembunyi"}
                  </button>
                ) : (
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg">
                    <Lock size={12} />
                    Sensor Role Viewer Aktif
                  </div>
                )}
              </div>
            </div>

            {/* Message History Display */}
            {filteredMessages.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200 text-slate-500">
                Tidak ada log chat yang cocok dengan filter saat ini.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm max-h-[600px] overflow-y-auto">
                <table className="w-full text-left border-collapse bg-white">
                  <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3">Waktu</th>
                      <th className="p-3">Akun</th>
                      <th className="p-3">Dari / Ke</th>
                      <th className="p-3">Pesan</th>
                      <th className="p-3 w-28 text-center">Status / Arah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredMessages.map((msg) => {
                      const isIncoming = msg.direction === "inbound";
                      const dateStr = new Date(msg.created_at).toLocaleString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        day: "2-digit",
                        month: "short",
                      });

                      const numberToShow = isIncoming
                        ? msg.from_number || "unknown"
                        : msg.to_number;

                      return (
                        <tr key={msg.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-slate-500 text-xs whitespace-nowrap">{dateStr}</td>
                          <td className="p-3 font-semibold text-indigo-700">{msg.account_id}</td>
                          <td className="p-3 font-mono font-semibold">
                            {maskPhone(numberToShow)}
                          </td>
                          <td className="p-3 max-w-md break-words">
                            <span className={shouldMask ? "font-mono tracking-widest text-slate-400 select-all" : ""}>
                              {shouldMask ? maskText(msg.body) : msg.body}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                                isIncoming
                                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                                  : "bg-slate-100 border-slate-200 text-slate-700"
                              }`}
                            >
                              {isIncoming ? " masuk" : "keluar"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab content 4: Chatbot sessions & Contact forms */}
        {activeTab === "chatbot" && (
          <div className="space-y-8">
            {/* Active Sessions List */}
            <div className="space-y-4">
              <h3 className="text-md font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                Sesi Chatbot Aktif ({chatbotSessions.length})
              </h3>
              {chatbotSessions.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 border border-slate-200 rounded-xl text-slate-500">
                  Tidak ada sesi percakapan chatbot aktif saat ini.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {chatbotSessions.map((session) => (
                    <div
                      key={session.phone}
                      className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-slate-950 font-mono">
                            {maskPhone(session.phone)}
                          </h4>
                          <span className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded font-bold">
                            {session.state}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">Akun: {session.account_id}</p>
                        
                        {Object.keys(session.form_data).length > 0 && (
                          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-3">
                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Form Data:</p>
                            <pre className="text-xs font-mono overflow-x-auto text-slate-700 select-all">
                              {JSON.stringify(session.form_data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-2">
                        <span className="text-[10px] text-slate-400">
                          {new Date(session.updated_at).toLocaleTimeString("id-ID")}
                        </span>
                        {canDecrypt && (
                          <button
                            onClick={() => handleResetSession(session.phone)}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-1.5 rounded transition-colors"
                          >
                            Reset Sesi
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submitted Forms List */}
            <div className="space-y-4">
              <h3 className="text-md font-bold text-slate-900 flex items-center gap-1.5 border-t border-slate-100 pt-6">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                Registrasi & Tiket Masuk via WhatsApp ({contactForms.length})
              </h3>
              {contactForms.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 border border-slate-200 rounded-xl text-slate-500">
                  Belum ada formulir pendaftaran atau keluhan support yang dikirim pelanggan.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse bg-white">
                    <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase border-b border-slate-200">
                      <tr>
                        <th className="p-3">Tanggal</th>
                        <th className="p-3">Tipe</th>
                        <th className="p-3">WhatsApp</th>
                        <th className="p-3">Detail Data Formulir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {contactForms.map((form) => {
                        const dateStr = new Date(form.created_at).toLocaleString("id-ID");
                        return (
                          <tr key={form.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 text-slate-500 text-xs whitespace-nowrap">{dateStr}</td>
                            <td className="p-3">
                              <span
                                className={`inline-block text-xs font-bold px-2 py-0.5 rounded border ${
                                  form.type === "registration"
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                    : "bg-amber-50 border-amber-200 text-amber-700"
                                }`}
                              >
                                {form.type === "registration" ? "Registrasi" : "Support"}
                              </span>
                            </td>
                            <td className="p-3 font-mono font-semibold">{maskPhone(form.phone)}</td>
                            <td className="p-3">
                              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono text-xs text-slate-700 max-w-xl whitespace-pre-wrap select-all">
                                {Object.entries(form.data).map(([k, v]) => (
                                  <div key={k}>
                                    <strong className="text-indigo-800">{k}</strong>: {String(v)}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </article>
    </section>
  );
}
