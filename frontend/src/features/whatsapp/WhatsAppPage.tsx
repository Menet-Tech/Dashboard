import { useState, useEffect, useCallback } from "react";
import { Button } from "../../components/ui/Button";
import { useWhatsAppGateway } from "../../hooks/useWhatsAppGateway";
import {
  getGatewayAccounts,
  deleteGatewayAccount,
  getGatewayAccountQr,
  getGatewayHistory,
  type GatewayAccount,
  type GatewayMessage,
  createGatewayAccount,
} from "../../lib/gatewayApi";
import { RefreshCw, Wifi, MessageSquare, ShieldAlert } from "lucide-react";
import type { User, SettingsState, TemplateItem } from "../../types";
import type { ConfirmDialogState } from "../../hooks/types";

import { AccountsTab } from "./components/AccountsTab";
import { QrTab } from "./components/QrTab";
import { HistoryTab } from "./components/HistoryTab";

type WhatsAppPageProps = {
  user: User;
  waGatewayUrl?: string;
  waAccountId?: string;
  waApiKey?: string;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  withFeedback: (fn: () => Promise<void>, actionKey?: string) => Promise<void>;
  askForConfirmation: (config: ConfirmDialogState) => void;
  settingsForm: SettingsState;
  setSettingsForm: (form: SettingsState) => void;
  refreshSettings: () => Promise<void>;
  templates: TemplateItem[];
  refreshTemplates: () => Promise<void>;
};

type ActiveTab = "accounts" | "qr" | "history";

export function WhatsAppPage({
  user,
  waGatewayUrl,
  waAccountId,
  waApiKey,
  pushSuccess,
  pushError,
  withFeedback,
  askForConfirmation,
  settingsForm,
  setSettingsForm,
  refreshSettings,
  templates,
  refreshTemplates,
}: WhatsAppPageProps) {
  const gatewayUrl = waGatewayUrl?.trim() || "http://localhost:3001";
  const configuredAccountId = waAccountId?.trim() || "default";
  const apiKey = waApiKey?.trim() || "";

  const [activeTab, setActiveTab] = useState<ActiveTab>("accounts");
  const [qrSelectedAccountId, setQrSelectedAccountId] = useState(configuredAccountId);

  // Shared Gateway States
  const [historyMessages, setHistoryMessages] = useState<GatewayMessage[]>([]);

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
    onError: pushError,
  });

  const [prevConfiguredAccountId, setPrevConfiguredAccountId] = useState(configuredAccountId);
  if (configuredAccountId !== prevConfiguredAccountId) {
    setPrevConfiguredAccountId(configuredAccountId);
    setQrSelectedAccountId(configuredAccountId);
  }

  // Fetch initial gateway details & history
  useEffect(() => {
    if (!gatewayUrl) return;

    let active = true;
    async function loadData() {
      try {
        setLoading(true);
        const accRes = await getGatewayAccounts(gatewayUrl!, apiKey!);

        if (active) {
          setAccounts(accRes.data);
          setGatewayError(null);

          if (accRes.data.length > 0) {
            setQrSelectedAccountId((current) => {
              if (accRes.data.some((a) => a.accountId === current)) return current;
              const configuredAccount = accRes.data.find((a) => a.accountId === configuredAccountId);
              return configuredAccount?.accountId ?? accRes.data[0].accountId;
            });
          }
        }

        try {
          const histRes = await getGatewayHistory(gatewayUrl!, apiKey!, null, 100);
          if (active) {
            setHistoryMessages(histRes.data);
          }
        } catch (histErr: any) {
          console.warn("History failed to load (client might not be ready yet):", histErr);
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

    return () => {
      active = false;
    };
  }, [gatewayUrl, apiKey, setAccounts, configuredAccountId]);

  // Accounts Tab Handlers
  async function handleAddAccount(id: string, label: string) {
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
    await withFeedback(async () => {
      const accRes = await getGatewayAccounts(gatewayUrl, apiKey);
      setAccounts(accRes.data);
      setGatewayError(null);
      
      try {
        const histRes = await getGatewayHistory(gatewayUrl, apiKey, null, 100);
        setHistoryMessages(histRes.data);
      } catch (histErr) {
        console.warn("History failed to load on refresh:", histErr);
      }
      
      pushSuccess("Data gateway berhasil diperbarui");
    }, "refresh-accounts");
  }

  // QR Fetch Fallback
  async function triggerQrFetch(id: string) {
    if (!gatewayUrl) return;
    try {
      const res = await getGatewayAccountQr(gatewayUrl, apiKey, id);
      if (res.data?.qr) {
        setQrs((prev) => ({ ...prev, [id]: res.data.qr }));
      }
    } catch (err: any) {
      pushError(err.message || "QR Code belum siap");
    }
  }

  async function triggerPairingCode(id: string, phone: string): Promise<string | null> {
    if (!gatewayUrl) return null;
    try {
      const { requestGatewayPairingCode } = await import("../../lib/gatewayApi");
      const res = await requestGatewayPairingCode(gatewayUrl, apiKey, id, phone);
      if (res.data?.code) {
        return res.data.code;
      }
      return null;
    } catch (err: any) {
      pushError(err.message || "Gagal mendapatkan pairing code");
      return null;
    }
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
      <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <span>WhatsApp Gateway</span>
              {socketConnected ? (
                <span className="flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Real-time Active
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-800">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  Polling Only
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Gateway
              </span>
              <code className="bg-slate-50 dark:bg-slate-950 px-1 py-0.5 rounded text-xs">{gatewayUrl}</code>
              <span className="text-xs text-slate-400 dark:text-slate-500">Account: {configuredAccountId}</span>
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleRefreshAccounts}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh Status
            </Button>
          </div>
        </div>

        {gatewayError ? (
          <div className="mb-6 rounded-card border border-rose-200 bg-rose-50 p-4 text-rose-800 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-bold">Gateway WhatsApp bermasalah</p>
              <p className="text-sm mt-1">{gatewayError}</p>
            </div>
            <Button
              type="button"
              variant="danger"
              onClick={handleRefreshAccounts}
            >
              <RefreshCw size={15} />
              Coba Lagi
            </Button>
          </div>
        ) : null}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 overflow-x-auto gap-2">
          <Button type="button" variant="outline"
            onClick={() => setActiveTab("accounts")}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "accounts"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <MessageSquare size={16} />
            Akun Gateway ({accounts.length})
          </Button>
          <Button type="button" variant="outline"
            onClick={() => setActiveTab("qr")}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "qr"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Wifi size={16} />
            Scan QR Code
          </Button>
          <Button type="button" variant="outline"
            onClick={() => setActiveTab("history")}
            className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === "history"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShieldAlert size={16} />
            Log Percakapan
          </Button>
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
            onTriggerPairingCode={triggerPairingCode}
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
      </article>
    </section>
  );
}
