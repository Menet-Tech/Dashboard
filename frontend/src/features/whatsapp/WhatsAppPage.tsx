import { useState, useEffect, useCallback } from "react";
import { useWhatsAppGateway } from "../../hooks/useWhatsAppGateway";
import {
  getGatewayAccounts,
  deleteGatewayAccount,
  getGatewayAccountQr,
  getGatewayHistory,
  getChatbotSessions,
  resetChatbotSession,
  getChatbotForms,
  getAutoReplyRules,
  createAutoReplyRule,
  updateAutoReplyRule,
  deleteAutoReplyRule,
  getChatbotSettings,
  updateChatbotSettings,
  type GatewayAccount,
  type GatewayMessage,
  type ChatbotSession,
  type ContactForm,
  type AutoReplyRule,
  type ChatbotSettings,
  createGatewayAccount,
} from "../../lib/gatewayApi";
import { RefreshCw, Plus, Wifi, MessageSquare, ShieldAlert } from "lucide-react";
import type { User } from "../../types";
import type { ConfirmDialogState } from "../../hooks/types";

import { AccountsTab } from "./components/AccountsTab";
import { QrTab } from "./components/QrTab";
import { HistoryTab } from "./components/HistoryTab";
import { ChatbotTab } from "./components/ChatbotTab";

type WhatsAppPageProps = {
  user: User;
  waGatewayUrl?: string;
  waAccountId?: string;
  waApiKey?: string;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  withFeedback: (fn: () => Promise<void>, actionKey?: string) => Promise<void>;
  askForConfirmation: (config: ConfirmDialogState) => void;
};

type ActiveTab = "accounts" | "qr" | "history" | "chatbot";

export function WhatsAppPage({
  user,
  waGatewayUrl,
  waAccountId,
  waApiKey,
  pushSuccess,
  pushError,
  withFeedback,
  askForConfirmation,
}: WhatsAppPageProps) {
  const gatewayUrl = waGatewayUrl?.trim() || "http://localhost:3001";
  const configuredAccountId = waAccountId?.trim() || "default";
  const apiKey = waApiKey?.trim();

  const [activeTab, setActiveTab] = useState<ActiveTab>("accounts");
  const [qrSelectedAccountId, setQrSelectedAccountId] = useState(configuredAccountId);

  // Shared Gateway States
  const [historyMessages, setHistoryMessages] = useState<GatewayMessage[]>([]);
  const [chatbotSessions, setChatbotSessions] = useState<ChatbotSession[]>([]);
  const [contactForms, setContactForms] = useState<ContactForm[]>([]);
  const [autoReplyRules, setAutoReplyRules] = useState<AutoReplyRule[]>([]);
  const [chatbotSettings, setChatbotSettings] = useState<ChatbotSettings>({
    chatbot_account_id: "*",
    auto_reply_account_id: "*",
    auto_reply_before_chatbot: "1",
  });

  const [loading, setLoading] = useState(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);

  // Socket.io callback for real-time messaging
  const handleIncomingMessage = useCallback((msg: GatewayMessage) => {
    setHistoryMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [msg, ...prev];
    });
  }, []);

  const { socketConnected, accounts, setAccounts, qrs, setQrs } = useWhatsAppGateway({
    gatewayUrl,
    apiKey,
    onChatMessage: handleIncomingMessage,
  });

  useEffect(() => {
    setQrSelectedAccountId(configuredAccountId);
  }, [configuredAccountId]);

  // Fetch initial gateway details, history, rules & settings
  useEffect(() => {
    if (!gatewayUrl || !apiKey) return;

    let active = true;
    async function loadData() {
      try {
        setLoading(true);
        const [accRes, histRes, sessionsRes, formsRes, rulesRes, settingsRes] = await Promise.all([
          getGatewayAccounts(gatewayUrl!, apiKey!),
          getGatewayHistory(gatewayUrl!, apiKey!, null, 100),
          getChatbotSessions(gatewayUrl!, apiKey!),
          getChatbotForms(gatewayUrl!, apiKey!, undefined, 100),
          getAutoReplyRules(gatewayUrl!, apiKey!),
          getChatbotSettings(gatewayUrl!, apiKey!),
        ]);

        if (active) {
          setAccounts(accRes.data);
          setHistoryMessages(histRes.data);
          setChatbotSessions(sessionsRes.data);
          setContactForms(formsRes.data);
          setAutoReplyRules(rulesRes.data);
          setChatbotSettings(settingsRes.data);
          setGatewayError(null);

          if (accRes.data.length > 0) {
            setQrSelectedAccountId((current) => {
              if (accRes.data.some((a) => a.accountId === current)) return current;
              const configuredAccount = accRes.data.find((a) => a.accountId === configuredAccountId);
              return configuredAccount?.accountId ?? accRes.data[0].accountId;
            });
          }
        }
      } catch (err: any) {
        if (active) {
          setGatewayError(err?.message || "Gateway WhatsApp tidak bisa dimuat");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadData();

    // Poll chatbot logs/sessions periodically
    const timer = setInterval(() => {
      if (!gatewayUrl || !apiKey) return;
      void getChatbotSessions(gatewayUrl, apiKey).then(res => {
        setChatbotSessions(res.data);
        setGatewayError(null);
      }).catch((err: any) => setGatewayError(err?.message || "Sinkronisasi gateway gagal"));
      void getChatbotForms(gatewayUrl, apiKey, undefined, 100).then(res => setContactForms(res.data)).catch(() => {});
      void getAutoReplyRules(gatewayUrl, apiKey).then(res => setAutoReplyRules(res.data)).catch(() => {});
    }, 10000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [gatewayUrl, apiKey, setAccounts, configuredAccountId]);

  // Accounts Tab Handlers
  async function handleAddAccount(id: string, label: string) {
    if (!apiKey) {
      pushError("API Key belum dikonfigurasi. Buka Pengaturan → WhatsApp Gateway dan isi field API Key terlebih dahulu.");
      return;
    }
    await withFeedback(async () => {
      await createGatewayAccount(gatewayUrl, apiKey, id, label);
      pushSuccess(`Inisialisasi akun '${id}' berhasil dimulai`);

      // Optimistic list update
      setAccounts((prev) => {
        if (prev.some((a) => a.accountId === id)) return prev;
        return [...prev, { accountId: id, ready: false, hasQr: false }];
      });
      setQrSelectedAccountId(id);
      setActiveTab("qr");

      try {
        const res = await getGatewayAccounts(gatewayUrl, apiKey);
        if (res.data.length > 0) setAccounts(res.data);
      } catch {
        // Fallback catch
      }
    }, "add-account");
  }

  async function handleDeleteAccount(id: string) {
    if (!apiKey) {
      pushError("API Key belum dikonfigurasi. Buka Pengaturan → WhatsApp Gateway.");
      return;
    }
    askForConfirmation({
      title: "Hapus akun WhatsApp?",
      body: `Akun '${id}' akan dihapus dari gateway dan session login akan dibersihkan dari disk.`,
      confirmLabel: "Hapus Akun",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          await deleteGatewayAccount(gatewayUrl, apiKey, id);
          pushSuccess(`Akun '${id}' berhasil dihapus`);
          const res = await getGatewayAccounts(gatewayUrl, apiKey);
          setAccounts(res.data);
        }, "delete-account");
      },
    });
  }

  async function handleRefreshAccounts() {
    if (!apiKey) {
      pushError("API Key belum dikonfigurasi. Buka Pengaturan → WhatsApp Gateway.");
      return;
    }
    await withFeedback(async () => {
      const accRes = await getGatewayAccounts(gatewayUrl, apiKey);
      const histRes = await getGatewayHistory(gatewayUrl, apiKey, null, 100);
      setAccounts(accRes.data);
      setHistoryMessages(histRes.data);
      setGatewayError(null);
      pushSuccess("Data gateway berhasil diperbarui");
    }, "refresh-accounts");
  }

  // QR Fetch Fallback
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

  // Chatbot settings & Auto replies handlers
  async function handleSaveChatbotSettings(settings: ChatbotSettings) {
    if (!gatewayUrl || !apiKey) return;
    await withFeedback(async () => {
      const res = await updateChatbotSettings(gatewayUrl, apiKey, settings);
      setChatbotSettings((current) => ({ ...current, ...res.data }));
      pushSuccess("Pengaturan akun bot WhatsApp berhasil disimpan");
    }, "save-chatbot-settings");
  }

  async function handleAddAutoReplyRule(ruleForm: {
    accountId: string;
    keyword: string;
    reply: string;
    matchType: AutoReplyRule["match_type"];
    priority: number;
  }) {
    if (!gatewayUrl || !apiKey) return;
    await withFeedback(async () => {
      await createAutoReplyRule(gatewayUrl, apiKey, ruleForm);
      const res = await getAutoReplyRules(gatewayUrl, apiKey);
      setAutoReplyRules(res.data);
      pushSuccess("Rule auto-response berhasil ditambahkan");
    }, "add-auto-reply");
  }

  async function handleToggleAutoReplyRule(rule: AutoReplyRule) {
    if (!gatewayUrl || !apiKey) return;
    await withFeedback(async () => {
      await updateAutoReplyRule(gatewayUrl, apiKey, rule.id, { enabled: !rule.enabled });
      const res = await getAutoReplyRules(gatewayUrl, apiKey);
      setAutoReplyRules(res.data);
    }, `toggle-auto-reply-${rule.id}`);
  }

  async function handleDeleteAutoReplyRule(id: string) {
    if (!gatewayUrl || !apiKey) return;
    askForConfirmation({
      title: "Hapus auto-response?",
      body: "Rule ini akan dihapus dan tidak akan membalas pesan masuk lagi.",
      confirmLabel: "Hapus Rule",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          await deleteAutoReplyRule(gatewayUrl, apiKey, id);
          setAutoReplyRules((current) => current.filter((rule) => rule.id !== id));
          pushSuccess("Rule auto-response dihapus");
        }, `delete-auto-reply-${id}`);
      },
    });
  }

  async function handleResetSession(phone: string) {
    if (!gatewayUrl || !apiKey) return;
    askForConfirmation({
      title: "Reset sesi chatbot?",
      body: `Sesi chatbot untuk ${phone} akan dikembalikan ke awal. Data form yang belum selesai bisa hilang.`,
      confirmLabel: "Reset Sesi",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          await resetChatbotSession(gatewayUrl, apiKey, phone);
          pushSuccess(`Sesi chatbot untuk ${phone} berhasil direset`);
          const sessionsRes = await getChatbotSessions(gatewayUrl, apiKey);
          setChatbotSessions(sessionsRes.data);
        }, "reset-session");
      },
    });
  }

  // Encryption helper
  const canDecrypt = user.role === "admin" || user.role === "petugas";

  const maskText = (text: string, shouldMask: boolean) => {
    if (!text) return "";
    if (!shouldMask) return text;
    return text.replace(/./g, "*");
  };

  const maskPhone = (phone: string, shouldMask: boolean) => {
    if (!phone) return "";
    if (!shouldMask) return phone;
    const clean = phone.replace(/@c\.us$/, "");
    if (clean.length <= 6) return "****";
    return `${clean.substring(0, 4)}*****${clean.substring(clean.length - 2)}`;
  };

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
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Gateway
              </span>
              <code className="bg-slate-50 px-1 py-0.5 rounded text-xs">{gatewayUrl}</code>
              <span className="text-xs text-slate-400">Account: {configuredAccountId}</span>
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

        {gatewayError ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-bold">Gateway WhatsApp bermasalah</p>
              <p className="text-sm mt-1">{gatewayError}</p>
            </div>
            <button
              type="button"
              onClick={handleRefreshAccounts}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
            >
              <RefreshCw size={15} />
              Coba Lagi
            </button>
          </div>
        ) : null}

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
          <AccountsTab
            loading={loading}
            accounts={accounts}
            setAccounts={setAccounts}
            gatewayUrl={gatewayUrl}
            apiKey={apiKey}
            gatewayError={gatewayError}
            setGatewayError={setGatewayError}
            canDecrypt={canDecrypt}
            pushSuccess={pushSuccess}
            pushError={pushError}
            onScanQrClick={(id) => {
              setQrSelectedAccountId(id);
              setActiveTab("qr");
            }}
            onDeleteAccount={handleDeleteAccount}
            onAddAccount={handleAddAccount}
          />
        )}

        {/* Tab content 2: Scan QR */}
        {activeTab === "qr" && (
          <QrTab
            accounts={accounts}
            qrs={qrs}
            qrSelectedAccountId={qrSelectedAccountId}
            setQrSelectedAccountId={setQrSelectedAccountId}
            onTriggerQrFetch={triggerQrFetch}
          />
        )}

        {/* Tab content 3: Chat history / log */}
        {activeTab === "history" && (
          <HistoryTab
            accounts={accounts}
            historyMessages={historyMessages}
            canDecrypt={canDecrypt}
            maskPhone={maskPhone}
            maskText={maskText}
          />
        )}

        {/* Tab content 4: Chatbot sessions & Contact forms */}
        {activeTab === "chatbot" && (
          <ChatbotTab
            accounts={accounts}
            canDecrypt={canDecrypt}
            chatbotSettings={chatbotSettings}
            onSaveChatbotSettings={handleSaveChatbotSettings}
            autoReplyRules={autoReplyRules}
            onAddAutoReplyRule={handleAddAutoReplyRule}
            onToggleAutoReplyRule={handleToggleAutoReplyRule}
            onDeleteAutoReplyRule={handleDeleteAutoReplyRule}
            chatbotSessions={chatbotSessions}
            onResetSession={handleResetSession}
            contactForms={contactForms}
            maskPhone={maskPhone}
          />
        )}
      </article>
    </section>
  );
}
