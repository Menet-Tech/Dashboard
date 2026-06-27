import { useState, useEffect } from "react";
import { type GatewayAccount, type ChatbotSession, type ContactForm, type AutoReplyRule, type ChatbotSettings } from "../../../lib/gatewayApi";
import { inputClassName } from "../../../components/ui";
import { Bot, Sliders, PlusCircle, CheckCircle2, XCircle, Trash2, Key, ToggleLeft, ToggleRight, Phone, Clock, FileText, User } from "lucide-react";

type ChatbotTabProps = {
  accounts: GatewayAccount[];
  canDecrypt: boolean;
  chatbotSettings: ChatbotSettings;
  onSaveChatbotSettings: (settings: ChatbotSettings) => Promise<void>;
  autoReplyRules: AutoReplyRule[];
  onAddAutoReplyRule: (rule: {
    accountId: string;
    keyword: string;
    reply: string;
    matchType: AutoReplyRule["match_type"];
    priority: number;
  }) => Promise<void>;
  onToggleAutoReplyRule: (rule: AutoReplyRule) => Promise<void>;
  onDeleteAutoReplyRule: (id: string) => Promise<void>;
  chatbotSessions: ChatbotSession[];
  onResetSession: (phone: string) => void;
  contactForms: ContactForm[];
  maskPhone: (phone: string, shouldMask: boolean) => string;
  view?: "rules" | "sessions" | "all";
};

export function ChatbotTab({
  accounts,
  canDecrypt,
  chatbotSettings,
  onSaveChatbotSettings,
  autoReplyRules,
  onAddAutoReplyRule,
  onToggleAutoReplyRule,
  onDeleteAutoReplyRule,
  chatbotSessions,
  onResetSession,
  contactForms,
  maskPhone,
  view = "all",
}: ChatbotTabProps) {
  const showRules = view === "all" || view === "rules";
  const showSessions = view === "all" || view === "sessions";

  // Local states for chatbot settings form editing
  const [localSettings, setLocalSettings] = useState<ChatbotSettings>(chatbotSettings);

  useEffect(() => {
    setLocalSettings(chatbotSettings);
  }, [chatbotSettings]);

  // Local state for auto reply form
  const [autoReplyForm, setAutoReplyForm] = useState({
    accountId: "*",
    keyword: "",
    reply: "",
    matchType: "contains" as AutoReplyRule["match_type"],
    priority: 100,
  });

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveChatbotSettings(localSettings);
  };

  const handleAddRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!autoReplyForm.keyword.trim() || !autoReplyForm.reply.trim()) {
      return;
    }
    await onAddAutoReplyRule(autoReplyForm);
    setAutoReplyForm((current) => ({ ...current, keyword: "", reply: "" }));
  };

  return (
    <div className="space-y-8">
      {showRules && (
        <>
          {/* Gateway Accounts Configuration */}
      <div className="grid lg:grid-cols-2 gap-6">
        <form onSubmit={handleSettingsSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-850/70 shadow-sm space-y-5">
          <div className="flex items-start gap-3 border-b border-slate-100 dark:border-slate-850 pb-4">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Sliders size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100 uppercase tracking-wider">Pengaturan Akun Bot</h3>
              <p className="text-xs text-slate-500 mt-0.5">Pilih akun WA untuk chatbot dan auto-reply. Gunakan <code>*</code> untuk semua.</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-400 block mb-1.5">Akun Chatbot ISP</span>
              <select
                value={localSettings.chatbot_account_id || "*"}
                onChange={(e) => setLocalSettings((current) => ({ ...current, chatbot_account_id: e.target.value }))}
                className={inputClassName()}
              >
                <option value="*">Semua akun (*)</option>
                {accounts.map((acc) => (
                  <option key={acc.accountId} value={acc.accountId}>{acc.accountId}</option>
                ))}
              </select>
            </label>
            
            <label className="block">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-400 block mb-1.5">Akun Auto-Response Custom</span>
              <select
                value={localSettings.auto_reply_account_id || "*"}
                onChange={(e) => setLocalSettings((current) => ({ ...current, auto_reply_account_id: e.target.value }))}
                className={inputClassName()}
              >
                <option value="*">Semua akun (*)</option>
                {accounts.map((acc) => (
                  <option key={acc.accountId} value={acc.accountId}>{acc.accountId}</option>
                ))}
              </select>
            </label>
            
            <label className="block">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-400 block mb-1.5">Urutan Auto-Response</span>
              <select
                value={localSettings.auto_reply_before_chatbot || "1"}
                onChange={(e) => setLocalSettings((current) => ({ ...current, auto_reply_before_chatbot: e.target.value }))}
                className={inputClassName()}
              >
                <option value="1">Auto-response dicek sebelum chatbot</option>
                <option value="0">Auto-response nonaktif untuk alur chatbot</option>
              </select>
            </label>
          </div>
          
          <div className="pt-2">
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-indigo-500/10 transition-all text-xs cursor-pointer text-center">
              Simpan Pengaturan Bot
            </button>
          </div>
        </form>

        <form onSubmit={handleAddRuleSubmit} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-850/70 shadow-sm space-y-5">
          <div className="flex items-start gap-3 border-b border-slate-100 dark:border-slate-850 pb-4">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <PlusCircle size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100 uppercase tracking-wider">Tambah Auto-Response</h3>
              <p className="text-xs text-slate-500 mt-0.5">Balasan cepat kata kunci seperti: harga, jam layanan, rekening, dll.</p>
            </div>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-400 block mb-1.5">Akun</span>
              <select
                value={autoReplyForm.accountId}
                onChange={(e) => setAutoReplyForm((current) => ({ ...current, accountId: e.target.value }))}
                className={inputClassName()}
              >
                <option value="*">Semua akun (*)</option>
                {accounts.map((acc) => (
                  <option key={acc.accountId} value={acc.accountId}>{acc.accountId}</option>
                ))}
              </select>
            </label>
            
            <label className="block">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-400 block mb-1.5">Tipe Cocok</span>
              <select
                value={autoReplyForm.matchType}
                onChange={(e) => setAutoReplyForm((current) => ({ ...current, matchType: e.target.value as AutoReplyRule["match_type"] }))}
                className={inputClassName()}
              >
                <option value="contains">Mengandung Kata</option>
                <option value="exact">Sama Persis</option>
                <option value="startsWith">Diawali Kata</option>
                <option value="endsWith">Diakhiri Kata</option>
                <option value="regex">Regex</option>
              </select>
            </label>
          </div>
          
          <div className="grid sm:grid-cols-3 gap-4">
            <label className="block sm:col-span-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-400 block mb-1.5">Keyword</span>
              <input className={inputClassName()} value={autoReplyForm.keyword} onChange={(e) => setAutoReplyForm((current) => ({ ...current, keyword: e.target.value }))} placeholder="contoh: rekening" required />
            </label>
            
            <label className="block">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-400 block mb-1.5">Prioritas</span>
              <input type="number" className={inputClassName()} value={autoReplyForm.priority} onChange={(e) => setAutoReplyForm((current) => ({ ...current, priority: Number(e.target.value) || 100 }))} />
            </label>
          </div>
          
          <label className="block">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-400 block mb-1.5">Balasan</span>
            <textarea className={inputClassName()} rows={3} value={autoReplyForm.reply} onChange={(e) => setAutoReplyForm((current) => ({ ...current, reply: e.target.value }))} placeholder="Tulis pesan balasan otomatis..." required />
          </label>
          
          <div className="pt-2">
            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-emerald-500/10 transition-all text-xs cursor-pointer text-center">
              Tambah Rule Baru
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <h3 className="text-md font-bold text-slate-900 dark:text-slate-150 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-600" />
          Rule Auto-Response ({autoReplyRules.length})
        </h3>
        {autoReplyRules.length === 0 ? (
          <div className="text-center py-6 bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500">
            Belum ada rule auto-response custom.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {autoReplyRules.map((rule) => (
              <div key={rule.id} className={`border border-slate-200 dark:border-slate-800 border-l-4 ${rule.enabled ? "border-l-emerald-500" : "border-l-slate-300 dark:border-l-slate-700"} rounded-xl p-5 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-200`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Kata Kunci</span>
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-sm font-mono mt-0.5">{rule.keyword}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${rule.enabled ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900" : "bg-slate-55 bg-slate-100 border-slate-250 text-slate-650 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-500"}`}>
                    {rule.enabled ? "AKTIF" : "NONAKTIF"}
                  </span>
                </div>
                
                <div className="mt-3 bg-slate-50 dark:bg-slate-950/50 p-3 rounded-lg border border-slate-100 dark:border-slate-850">
                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{rule.reply}</p>
                </div>
                
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-850">
                  <div className="text-[10px] text-slate-450 dark:text-slate-500 flex flex-wrap gap-2">
                    <span>Akun: <strong className="text-slate-700 dark:text-slate-350">{rule.accountId || rule.account_id || "*"}</strong></span>
                    <span>•</span>
                    <span>Tipe: <strong className="text-slate-700 dark:text-slate-350">{rule.matchType || rule.match_type}</strong></span>
                    <span>•</span>
                    <span>Prio: <strong className="text-slate-700 dark:text-slate-350">{rule.priority}</strong></span>
                  </div>
                  {canDecrypt ? (
                    <div className="flex gap-1.5">
                      <button 
                        onClick={() => onToggleAutoReplyRule(rule)} 
                        type="button" 
                        title={rule.enabled ? "Nonaktifkan Rule" : "Aktifkan Rule"}
                        className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 p-1.5 rounded-lg dark:bg-indigo-950/45 dark:text-indigo-400 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer"
                      >
                        {rule.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </button>
                      <button 
                        onClick={() => onDeleteAutoReplyRule(rule.id)} 
                        type="button" 
                        title="Hapus Rule"
                        className="text-xs font-bold text-rose-650 bg-rose-50 hover:bg-rose-100 p-1.5 rounded-lg dark:bg-rose-950/45 dark:text-rose-400 dark:hover:bg-rose-900/50 transition-colors cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )}

      {showSessions && (
        <>
          {/* Active Sessions List */}
      <div className="space-y-4">
        <h3 className="text-md font-bold text-slate-900 dark:text-slate-150 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-600" />
          Sesi Chatbot Aktif ({chatbotSessions.length})
        </h3>
        {chatbotSessions.length === 0 ? (
          <div className="text-center py-6 bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500">
            Tidak ada sesi percakapan chatbot aktif saat ini.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {chatbotSessions.map((session) => (
              <div
                key={session.phone}
                className="border border-slate-200 dark:border-slate-850 border-t-2 border-t-indigo-500 rounded-xl p-5 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 rounded-lg">
                        <Phone size={14} />
                      </div>
                      <h4 className="font-bold text-slate-850 dark:text-slate-100 font-mono text-xs">
                        {maskPhone(session.phone, !canDecrypt)}
                      </h4>
                    </div>
                    <span className="text-[9px] bg-indigo-50 border border-indigo-200 text-indigo-750 px-2 py-0.5 rounded-full font-bold dark:bg-indigo-950/45 dark:text-indigo-400 dark:border-indigo-900 uppercase tracking-wider">
                      {session.state}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3 bg-slate-50 dark:bg-slate-950/30 py-1 px-2.5 rounded-lg border border-slate-100 dark:border-slate-850 w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span>Akun: <strong className="text-slate-755 dark:text-slate-300 font-mono">{session.account_id}</strong></span>
                  </div>
                  
                  {Object.keys(session.form_data).length > 0 && (
                    <div className="bg-slate-50/50 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-150 dark:border-slate-850/60 mb-3">
                      <p className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider mb-2">Formulir Isian:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {Object.entries(session.form_data).map(([key, val]) => (
                          <div key={key} className="flex flex-col min-w-0">
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase">{key.replace(/_/g, " ")}</span>
                            <span className="text-slate-800 dark:text-slate-300 truncate font-semibold font-sans mt-0.5 text-xs" title={String(val)}>{String(val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-850 mt-2">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(session.updated_at).toLocaleTimeString("id-ID")}
                  </span>
                  {canDecrypt && (
                    <button
                      onClick={() => onResetSession(session.phone)}
                      className="text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition-all dark:bg-rose-950/45 dark:text-rose-400 dark:hover:bg-rose-900/50 cursor-pointer"
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
        <h3 className="text-md font-bold text-slate-900 dark:text-slate-150 flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-850 pt-6">
          <span className="w-2 h-2 rounded-full bg-emerald-600" />
          Registrasi & Tiket Masuk via WhatsApp ({contactForms.length})
        </h3>
        {contactForms.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500">
            Belum ada formulir pendaftaran atau keluhan support yang dikirim pelanggan.
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse bg-white dark:bg-slate-900 min-w-[700px]">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Tanggal</th>
                    <th className="px-6 py-4">Tipe</th>
                    <th className="px-6 py-4">WhatsApp</th>
                    <th className="px-6 py-4">Detail Data Formulir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {contactForms.map((form) => {
                    const dateStr = new Date(form.created_at).toLocaleString("id-ID");
                    return (
                      <tr key={form.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/30 transition-colors">
                        <td className="px-6 py-4 text-slate-550 dark:text-slate-400 text-xs whitespace-nowrap">{dateStr}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                              form.type === "registration"
                                ? "bg-emerald-50 border-emerald-250 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-400 dark:border-emerald-900"
                                : "bg-amber-50 border-amber-250 text-amber-700 dark:bg-amber-950/45 dark:text-amber-400 dark:border-amber-900"
                            }`}
                          >
                            {form.type === "registration" ? "Registrasi" : "Support"}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-xs text-slate-700 dark:text-slate-300">{maskPhone(form.phone, !canDecrypt)}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2 max-w-2xl">
                            {Object.entries(form.data).map(([k, v]) => (
                              <div key={k} className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 dark:bg-slate-950/55 rounded-xl border border-slate-200 dark:border-slate-850 text-xs shadow-sm">
                                <span className="font-bold text-slate-400 dark:text-slate-500 uppercase text-[9px] tracking-wider">{k.replace(/_/g, " ")}:</span>
                                <span className="font-semibold text-slate-750 dark:text-slate-200 font-sans">{String(v)}</span>
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
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
