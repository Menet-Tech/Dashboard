import { useState, useEffect, useCallback, useMemo, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { StatusPill, inputClassName, renderInlineError, EmptyTableRow } from "../../components/ui";
import { Modal } from "../../components/ui/Modal";
import { Plus, FileText, MessageSquare, Bot, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import type { TemplateItem, User } from "../../types";
import type { FieldErrors } from "../../utils/validation";
import type { ConfirmDialogState } from "../../hooks/types";
import { ChatbotTab } from "../whatsapp/components/ChatbotTab";
import {
  getGatewayAccounts,
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
  type ChatbotSession,
  type ContactForm,
  type AutoReplyRule,
  type ChatbotSettings,
} from "../../lib/gatewayApi";

export type TemplateFormState = {
  name: string;
  trigger_key: string;
  content: string;
  trigger_keywords: string;
  is_active: boolean;
};

export const defaultTemplateForm = (): TemplateFormState => ({
  name: "",
  trigger_key: "",
  content: "",
  trigger_keywords: "",
  is_active: true,
});

type TemplatesPageProps = {
  templates: TemplateItem[];
  templateForm: TemplateFormState;
  templateErrors: FieldErrors;
  editingTemplateId: number | null;
  submitting: boolean;
  busyAction: string | null;
  onFormChange: (updater: (current: TemplateFormState) => TemplateFormState) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onEdit: (template: TemplateItem) => void;
  onCancelEdit: () => void;
  onDelete: (id: number) => void;
  user: User;
  waGatewayUrl?: string;
  waApiKey?: string;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  withFeedback: (fn: () => Promise<void>, actionKey?: string) => Promise<void>;
  askForConfirmation: (config: ConfirmDialogState) => void;
};

export function TemplatesPage({
  templates,
  templateForm,
  templateErrors,
  editingTemplateId,
  submitting,
  busyAction,
  onFormChange,
  onSubmit,
  onEdit,
  onCancelEdit,
  onDelete,
  user,
  waGatewayUrl,
  waApiKey,
  pushSuccess,
  pushError,
  withFeedback,
  askForConfirmation,
}: TemplatesPageProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"templates" | "autoreply" | "sessions">("templates");

  // Chatbot & Autoreply States
  const [accounts, setAccounts] = useState<GatewayAccount[]>([]);
  const [chatbotSessions, setChatbotSessions] = useState<ChatbotSession[]>([]);
  const [contactForms, setContactForms] = useState<ContactForm[]>([]);
  const [autoReplyRules, setAutoReplyRules] = useState<AutoReplyRule[]>([]);
  const [chatbotSettings, setChatbotSettings] = useState<ChatbotSettings>({
    chatbot_account_id: "*",
    auto_reply_account_id: "*",
    auto_reply_before_chatbot: "1",
    chatbot_enabled: "1",
  });
  const [loading, setLoading] = useState(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);

  const gatewayUrl = waGatewayUrl?.trim() || "http://localhost:3001";
  const apiKey = waApiKey?.trim() || "";

  const loadChatbotData = useCallback(async () => {
    if (!gatewayUrl) return;
    try {
      setLoading(true);
      const [accRes, sessionsRes, formsRes, rulesRes, settingsRes] = await Promise.all([
        getGatewayAccounts(gatewayUrl, apiKey),
        getChatbotSessions(gatewayUrl, apiKey),
        getChatbotForms(gatewayUrl, apiKey, undefined, 100),
        getAutoReplyRules(gatewayUrl, apiKey),
        getChatbotSettings(gatewayUrl, apiKey),
      ]);
      setAccounts(accRes.data);
      setChatbotSessions(sessionsRes.data);
      setContactForms(formsRes.data);
      setAutoReplyRules(rulesRes.data);
      setChatbotSettings(settingsRes.data);
      setGatewayError(null);
    } catch (err: any) {
      setGatewayError(err?.message || "Gateway WhatsApp tidak bisa dimuat");
    } finally {
      setLoading(false);
    }
  }, [gatewayUrl, apiKey]);

  useEffect(() => {
    if (!gatewayUrl) return;
    void loadChatbotData();

    const timer = setInterval(() => {
      void getChatbotSessions(gatewayUrl, apiKey).then(res => {
        setChatbotSessions(res.data);
        setGatewayError(null);
      }).catch((err: any) => setGatewayError(err?.message || "Sinkronisasi gateway gagal"));
      void getChatbotForms(gatewayUrl, apiKey, undefined, 100).then(res => setContactForms(res.data)).catch(() => {});
      void getAutoReplyRules(gatewayUrl, apiKey).then(res => setAutoReplyRules(res.data)).catch(() => {});
    }, 10000);

    return () => clearInterval(timer);
  }, [gatewayUrl, apiKey, loadChatbotData]);

  // Chatbot settings & Auto replies handlers
  async function handleSaveChatbotSettings(settings: ChatbotSettings) {
    if (!gatewayUrl) return;
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
    image?: File;
  }) {
    if (!gatewayUrl) return;
    await withFeedback(async () => {
      const formData = new FormData();
      formData.append("accountId", ruleForm.accountId);
      formData.append("keyword", ruleForm.keyword);
      formData.append("reply", ruleForm.reply);
      formData.append("matchType", ruleForm.matchType);
      formData.append("priority", String(ruleForm.priority));
      if (ruleForm.image) {
        formData.append("image", ruleForm.image);
      }
      await createAutoReplyRule(gatewayUrl, apiKey, formData);
      const res = await getAutoReplyRules(gatewayUrl, apiKey);
      setAutoReplyRules(res.data);
      pushSuccess("Rule auto-response berhasil ditambahkan");
    }, "add-auto-reply");
  }

  async function handleToggleAutoReplyRule(rule: AutoReplyRule) {
    if (!gatewayUrl) return;
    await withFeedback(async () => {
      await updateAutoReplyRule(gatewayUrl, apiKey, rule.id, { enabled: !rule.enabled });
      const res = await getAutoReplyRules(gatewayUrl, apiKey);
      setAutoReplyRules(res.data);
    }, `toggle-auto-reply-${rule.id}`);
  }

  async function handleUpdateAutoReplyRule(
    id: string,
    ruleForm: {
      accountId: string;
      keyword: string;
      reply: string;
      matchType: AutoReplyRule["match_type"];
      priority: number;
      image?: File;
    }
  ) {
    if (!gatewayUrl) return;
    await withFeedback(async () => {
      const formData = new FormData();
      formData.append("accountId", ruleForm.accountId);
      formData.append("keyword", ruleForm.keyword);
      formData.append("reply", ruleForm.reply);
      formData.append("matchType", ruleForm.matchType);
      formData.append("priority", String(ruleForm.priority));
      if (ruleForm.image) {
        formData.append("image", ruleForm.image);
      }
      await updateAutoReplyRule(gatewayUrl, apiKey, id, formData);
      const res = await getAutoReplyRules(gatewayUrl, apiKey);
      setAutoReplyRules(res.data);
      pushSuccess("Rule auto-response berhasil diperbarui");
    }, `update-auto-reply-${id}`);
  }

  async function handleDeleteAutoReplyRule(id: string) {
    if (!gatewayUrl) return;
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
    if (!gatewayUrl) return;
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

  const canDecrypt = user.role === "admin" || user.role === "petugas";

  const maskPhone = (phone: string, shouldMask: boolean) => {
    if (!phone) return "";
    if (!shouldMask) return phone;
    const clean = phone.replace(/@c\.us$/, "");
    if (clean.length <= 6) return "****";
    return `${clean.substring(0, 4)}*****${clean.substring(clean.length - 2)}`;
  };

  // Close form modal on successful save/update
  useEffect(() => {
    if (!submitting && Object.keys(templateErrors).length === 0 && !editingTemplateId) {
      setIsFormOpen(false);
    }
  }, [submitting, templateErrors, editingTemplateId]);

  const handleCloseForm = () => {
    setIsFormOpen(false);
    onCancelEdit();
  };

  const showForm = isFormOpen || editingTemplateId !== null;
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;

  const chatbotTemplates = templates.filter(t => t.trigger_key.startsWith("chatbot_") || t.trigger_key.startsWith("chatbot_trigger_"));
  const billingTemplates = templates.filter(t => !t.trigger_key.startsWith("chatbot_") && !t.trigger_key.startsWith("chatbot_trigger_"));

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Reset sorting state when activeTab changes
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

  const renderSortableHeader = (label: string, field: string) => {
    const isSorted = sortField === field;
    return (
      <th 
        className="px-6 py-4 font-semibold select-none cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-slate-500"
        onClick={() => requestSort(field)}
      >
        <div className="inline-flex items-center gap-1.5">
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

  const sortedBillingTemplates = useMemo(() => {
    const list = billingTemplates;
    if (!sortField) return list;
    return [...list].sort((a, b) => {
      let aVal = (a as any)[sortField];
      let bVal = (b as any)[sortField];

      const isNumericField = sortField === "is_active";
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
  }, [billingTemplates, sortField, sortDirection]);

  const sortedChatbotTemplates = useMemo(() => {
    const list = chatbotTemplates;
    if (!sortField) return list;
    return [...list].sort((a, b) => {
      let aVal = (a as any)[sortField];
      let bVal = (b as any)[sortField];

      const isNumericField = sortField === "is_active";
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
  }, [chatbotTemplates, sortField, sortDirection]);

  return (
    <section className="flex flex-col gap-6 w-full animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">Template & Chatbot WA</h2>
          <p className="text-xs text-slate-500 mt-1">
            Konfigurasi template WhatsApp, auto-response custom, dan kelola sesi pendaftaran chatbot.
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <nav className="flex border-b border-slate-200 dark:border-slate-800 mb-6 overflow-x-auto gap-2">
        <Button variant="outline"
          onClick={() => setActiveTab("templates")}
          type="button"
          className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === "templates"
              ? "border-indigo-600 text-indigo-605 dark:text-indigo-400 font-bold"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          <FileText size={16} />
          Template Pesan
        </Button>
        <Button variant="outline"
          onClick={() => setActiveTab("autoreply")}
          type="button"
          className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === "autoreply"
              ? "border-indigo-600 text-indigo-605 dark:text-indigo-400 font-bold"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          <MessageSquare size={16} />
          Auto-Response Custom
        </Button>
        <Button variant="outline"
          onClick={() => setActiveTab("sessions")}
          type="button"
          className={`py-3 px-4 font-semibold text-sm border-b-2 transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
            activeTab === "sessions"
              ? "border-indigo-600 text-indigo-605 dark:text-indigo-400 font-bold"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          <Bot size={16} />
          Sesi & Pendaftaran Chatbot ({contactForms.length})
        </Button>
      </nav>

      {gatewayError && (activeTab === "autoreply" || activeTab === "sessions") ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-bold">Gateway WhatsApp bermasalah</p>
            <p className="text-sm mt-1">{gatewayError}</p>
          </div>
          <Button
            type="button"
            variant="danger"
            onClick={loadChatbotData}
          >
            Coba Lagi
          </Button>
        </div>
      ) : null}

      {activeTab === "templates" && (
        <>
          {/* Templates Table Card 1: Billing & Reminders */}
          <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col w-full">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-sans">Template Billing & Pengingat</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Draf template pesan otomatis yang dipicu oleh status tagihan dan penagihan pelanggan.</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill label={`${billingTemplates.length} Item`} tone="slate" />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onCancelEdit();
                    onFormChange((curr) => ({ ...curr, trigger_key: "" }));
                    setIsFormOpen(true);
                  }}
                  className="!py-2 !px-3.5 !gap-1.5"
                >
                  <Plus size={13} />
                  Tambah Billing
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm scrollbar-thin">
              <table className="w-full text-left border-collapse text-sm min-w-[700px]">
                <thead className="bg-gray-50 dark:bg-slate-950 border-b border-gray-200 dark:border-slate-800 text-gray-500 dark:text-slate-400 font-sans">
                  <tr>
                    {renderSortableHeader("Nama Template", "name")}
                    {renderSortableHeader("Trigger Key", "trigger_key")}
                    {renderSortableHeader("Status", "is_active")}
                    <th className="px-6 py-4 font-semibold text-slate-500">Isi Draft Pesan</th>
                    <th className="px-6 py-4 font-semibold text-center text-slate-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                  {sortedBillingTemplates.length === 0 ? (
                    <EmptyTableRow message="Belum ada template WhatsApp Billing yang tersimpan." colSpan={5} />
                  ) : (
                    sortedBillingTemplates.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-850/40 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">{item.name}</td>
                        <td className="px-6 py-4 text-indigo-600 dark:text-indigo-400 font-mono text-xs font-semibold">{item.trigger_key}</td>
                        <td className="px-6 py-4">
                          <StatusPill
                            label={item.is_active ? "active" : "inactive"}
                            tone={item.is_active ? "green" : "slate"}
                          />
                        </td>
                        <td className="px-6 py-4 text-slate-700 dark:text-slate-300 max-w-[350px] break-words whitespace-normal text-xs leading-relaxed font-sans">
                          {item.content}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          <div className="flex gap-2 justify-center">
                            <Button variant="outline" type="button"
                              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors cursor-pointer"
                              onClick={() => {
                                onEdit(item);
                                setIsFormOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button variant="outline" type="button"
                              className="bg-red-50 hover:bg-red-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-red-700 dark:text-rose-350 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                              onClick={() => onDelete(item.id)}
                            >
                              Hapus
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Templates Table Card 2: Chatbot Templates */}
          <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col w-full">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-sans">Template Chatbot (Auto-Response)</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Draf template pesan otomatis yang dipicu oleh interaksi menu dan trigger chatbot.</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill label={`${chatbotTemplates.length} Item`} tone="green" />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onCancelEdit();
                    onFormChange((curr) => ({ ...curr, trigger_key: "chatbot_" }));
                    setIsFormOpen(true);
                  }}
                  className="!py-2 !px-3.5 !gap-1.5"
                >
                  <Plus size={13} />
                  Tambah Chatbot
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm scrollbar-thin">
              <table className="w-full text-left border-collapse text-sm min-w-[700px]">
                <thead className="bg-gray-50 dark:bg-slate-950 border-b border-gray-200 dark:border-slate-800 text-gray-500 dark:text-slate-400 font-sans">
                  <tr>
                    {renderSortableHeader("Nama Template", "name")}
                    {renderSortableHeader("Trigger Key", "trigger_key")}
                    {renderSortableHeader("Trigger", "trigger_keywords")}
                    {renderSortableHeader("Status", "is_active")}
                    <th className="px-6 py-4 font-semibold text-slate-500">Isi Draft Pesan</th>
                    <th className="px-6 py-4 font-semibold text-center text-slate-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                  {sortedChatbotTemplates.length === 0 ? (
                    <EmptyTableRow message="Belum ada template WhatsApp Chatbot yang tersimpan." colSpan={6} />
                  ) : (
                    sortedChatbotTemplates.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-850/40 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">{item.name}</td>
                        <td className="px-6 py-4 text-indigo-600 dark:text-indigo-400 font-mono text-xs font-semibold">{item.trigger_key}</td>
                        <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-semibold font-mono text-xs">
                          {item.trigger_keywords || <span className="text-slate-400 dark:text-slate-600 font-mono">-</span>}
                        </td>
                        <td className="px-6 py-4">
                          <StatusPill
                            label={item.is_active ? "active" : "inactive"}
                            tone={item.is_active ? "green" : "slate"}
                          />
                        </td>
                        <td className="px-6 py-4 text-slate-700 dark:text-slate-300 max-w-[300px] break-words whitespace-normal text-xs leading-relaxed font-sans">
                          {item.content}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          <div className="flex gap-2 justify-center">
                            <Button variant="outline" type="button"
                              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors cursor-pointer"
                              onClick={() => {
                                onEdit(item);
                                setIsFormOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button variant="outline" type="button"
                              className="bg-red-50 hover:bg-red-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-red-700 dark:text-rose-350 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                              onClick={() => onDelete(item.id)}
                            >
                              Hapus
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Placeholders Guide */}
          <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-sans mb-3">Panduan Placeholders</h4>
            <p className="text-xs text-slate-500 mb-4">
              Anda dapat menggunakan tag placeholder kurung kurawal di bawah ini agar data dinamis pelanggan terisi otomatis saat pesan dikirim:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-150 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Informasi Pelanggan</span>
                <code>{"{nama}"}</code> - Nama pelanggan<br />
                <code>{"{alamat}"}</code> - Alamat pemasangan<br />
                <code>{"{no_hp}"}</code> - Nomor WhatsApp
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-150 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Informasi Billing</span>
                <code>{"{invoice_number}"}</code> - No. Invoice<br />
                <code>{"{periode}"}</code> - Periode tagihan<br />
                <code>{"{nominal}"}</code> - Nominal tagihan<br />
                <code>{"{jatuh_tempo}"}</code> - Tgl Jatuh tempo
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-150 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Status Keterlambatan</span>
                <code>{"{hari_limit}"}</code> - Hari isolir
              </div>
            </div>
          </article>
        </>
      )}

      {activeTab === "autoreply" && (
        <ChatbotTab
          gatewayUrl={gatewayUrl}
          accounts={accounts}
          canDecrypt={canDecrypt}
          chatbotSettings={chatbotSettings}
          onSaveChatbotSettings={handleSaveChatbotSettings}
          autoReplyRules={autoReplyRules}
          onAddAutoReplyRule={handleAddAutoReplyRule}
          onUpdateAutoReplyRule={handleUpdateAutoReplyRule}
          onToggleAutoReplyRule={handleToggleAutoReplyRule}
          onDeleteAutoReplyRule={handleDeleteAutoReplyRule}
          chatbotSessions={chatbotSessions}
          onResetSession={handleResetSession}
          contactForms={contactForms}
          maskPhone={maskPhone}
          view="rules"
        />
      )}

      {activeTab === "sessions" && (
        <ChatbotTab
          gatewayUrl={gatewayUrl}
          accounts={accounts}
          canDecrypt={canDecrypt}
          chatbotSettings={chatbotSettings}
          onSaveChatbotSettings={handleSaveChatbotSettings}
          autoReplyRules={autoReplyRules}
          onAddAutoReplyRule={handleAddAutoReplyRule}
          onUpdateAutoReplyRule={handleUpdateAutoReplyRule}
          onToggleAutoReplyRule={handleToggleAutoReplyRule}
          onDeleteAutoReplyRule={handleDeleteAutoReplyRule}
          chatbotSessions={chatbotSessions}
          onResetSession={handleResetSession}
          contactForms={contactForms}
          maskPhone={maskPhone}
          view="sessions"
        />
      )}

      {/* Template Form Modal */}
      {showForm && (
        <Modal
          title={editingTemplateId ? "Edit Template WhatsApp" : "Tambah Template WhatsApp"}
          onClose={handleCloseForm}
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseForm}
              >
                Batal
              </Button>
              <Button
                type="submit"
                variant="primary"
                form="template-form"
                disabled={submitting}
                isLoading={isBusy("save-template")}
                loadingText="Menyimpan..."
              >
                {editingTemplateId ? "Update Template" : "Simpan Template"}
              </Button>
            </>
          }
        >
          <form id="template-form" className="flex flex-col gap-4" onSubmit={onSubmit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Nama Template</span>
              <input
                type="text"
                className={inputClassName(templateErrors.name)}
                value={templateForm.name}
                onChange={(e) => onFormChange((curr) => ({ ...curr, name: e.target.value }))}
                placeholder="contoh: Notifikasi Jatuh Tempo"
                required
              />
              {renderInlineError(templateErrors.name)}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Trigger Key (Unik untuk Sistem)</span>
              <input
                type="text"
                className={inputClassName(templateErrors.trigger_key)}
                value={templateForm.trigger_key}
                onChange={(e) =>
                  onFormChange((curr) => ({
                    ...curr,
                    trigger_key: e.target.value,
                  }))
                }
                placeholder="contoh: jatuh_tempo"
                required
                disabled={editingTemplateId !== null}
              />
              {renderInlineError(templateErrors.trigger_key)}
            </label>
            {templateForm.trigger_key.startsWith("chatbot_") && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Kata Kunci Trigger</span>
                <input
                  type="text"
                  className={inputClassName(templateErrors.trigger_keywords)}
                  value={templateForm.trigger_keywords}
                  onChange={(e) =>
                    onFormChange((curr) => ({
                      ...curr,
                      trigger_keywords: e.target.value,
                    }))
                  }
                  placeholder="contoh: 1, tagihan, cek tagihan (pisahkan koma)"
                />
                {renderInlineError(templateErrors.trigger_keywords)}
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  Kata kunci yang memicu respon pesan otomatis ini (pisahkan dengan koma).
                </span>
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Isi Pesan</span>
              <textarea
                className={`${inputClassName(templateErrors.content)} min-h-[200px] resize-y`}
                rows={12}
                value={templateForm.content}
                onChange={(e) => onFormChange((curr) => ({ ...curr, content: e.target.value }))}
                placeholder="Tulis pesan. Gunakan placeholder seperti {nama}, {nominal}, {jatuh_tempo} untuk data dinamis."
                required
              />
              {renderInlineError(templateErrors.content)}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Status</span>
              <select
                className={inputClassName()}
                value={templateForm.is_active ? "1" : "0"}
                onChange={(e) =>
                  onFormChange((curr) => ({
                    ...curr,
                    is_active: e.target.value === "1",
                  }))
                }
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </label>
          </form>
        </Modal>
      )}
    </section>
  );
}
