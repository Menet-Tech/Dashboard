import { useState, useEffect } from "react";
import { type GatewayAccount, type ChatbotSession, type ContactForm, type AutoReplyRule, type ChatbotSettings } from "../../../lib/gatewayApi";
import { inputClassName } from "../../../components/ui";
import { Bot } from "lucide-react";

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
        <form onSubmit={handleSettingsSubmit} className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-200 dark:border-slate-850 space-y-4">
          <div>
            <h3 className="text-md font-bold text-slate-900 dark:text-slate-150">Akun Bot & Auto-Response</h3>
            <p className="text-xs text-slate-500 mt-1">Pilih akun WA mana yang boleh menjalankan chatbot dan rule auto-response. Isi <code>*</code> untuk semua akun.</p>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-650 dark:text-slate-400 block mb-1">Akun Chatbot ISP</span>
            <select
              value={localSettings.chatbot_account_id || "*"}
              onChange={(e) => setLocalSettings((current) => ({ ...current, chatbot_account_id: e.target.value }))}
              className={inputClassName()}
            >
              <option value="*">Semua akun</option>
              {accounts.map((acc) => (
                <option key={acc.accountId} value={acc.accountId}>{acc.accountId}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-650 dark:text-slate-400 block mb-1">Akun Auto-Response Custom</span>
            <select
              value={localSettings.auto_reply_account_id || "*"}
              onChange={(e) => setLocalSettings((current) => ({ ...current, auto_reply_account_id: e.target.value }))}
              className={inputClassName()}
            >
              <option value="*">Semua akun</option>
              {accounts.map((acc) => (
                <option key={acc.accountId} value={acc.accountId}>{acc.accountId}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-650 dark:text-slate-400 block mb-1">Urutan Auto-Response</span>
            <select
              value={localSettings.auto_reply_before_chatbot || "1"}
              onChange={(e) => setLocalSettings((current) => ({ ...current, auto_reply_before_chatbot: e.target.value }))}
              className={inputClassName()}
            >
              <option value="1">Auto-response dicek sebelum chatbot</option>
              <option value="0">Auto-response nonaktif untuk alur chatbot</option>
            </select>
          </label>
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors text-xs">
            Simpan Pengaturan Bot
          </button>
        </form>

        <form onSubmit={handleAddRuleSubmit} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div>
            <h3 className="text-md font-bold text-slate-900 dark:text-slate-150">Tambah Auto-Response</h3>
            <p className="text-xs text-slate-500 mt-1">Cocok untuk balasan cepat seperti info harga, jam layanan, rekening, atau instruksi bayar.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-650 dark:text-slate-400 block mb-1">Akun</span>
              <select
                value={autoReplyForm.accountId}
                onChange={(e) => setAutoReplyForm((current) => ({ ...current, accountId: e.target.value }))}
                className={inputClassName()}
              >
                <option value="*">Semua akun</option>
                {accounts.map((acc) => (
                  <option key={acc.accountId} value={acc.accountId}>{acc.accountId}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-650 dark:text-slate-400 block mb-1">Tipe Cocok</span>
              <select
                value={autoReplyForm.matchType}
                onChange={(e) => setAutoReplyForm((current) => ({ ...current, matchType: e.target.value as AutoReplyRule["match_type"] }))}
                className={inputClassName()}
              >
                <option value="contains">Mengandung kata</option>
                <option value="exact">Sama persis</option>
                <option value="startsWith">Diawali kata</option>
                <option value="endsWith">Diakhiri kata</option>
                <option value="regex">Regex</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-650 dark:text-slate-400 block mb-1">Keyword</span>
            <input className={inputClassName()} value={autoReplyForm.keyword} onChange={(e) => setAutoReplyForm((current) => ({ ...current, keyword: e.target.value }))} placeholder="contoh: rekening" required />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-650 dark:text-slate-400 block mb-1">Balasan</span>
            <textarea className={inputClassName()} rows={4} value={autoReplyForm.reply} onChange={(e) => setAutoReplyForm((current) => ({ ...current, reply: e.target.value }))} placeholder="Tulis pesan balasan otomatis..." required />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-655 dark:text-slate-400 block mb-1">Prioritas</span>
            <input type="number" className={inputClassName()} value={autoReplyForm.priority} onChange={(e) => setAutoReplyForm((current) => ({ ...current, priority: Number(e.target.value) || 100 }))} />
          </label>
          <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors text-xs">
            Tambah Rule
          </button>
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
              <div key={rule.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-slate-100">{rule.keyword}</p>
                    <p className="text-xs text-slate-500 mt-1">Akun: {rule.accountId || rule.account_id || "*"} | Match: {rule.matchType || rule.match_type} | Prioritas: {rule.priority}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${rule.enabled ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-100 border-slate-250 text-slate-600"}`}>
                    {rule.enabled ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-3 whitespace-pre-wrap">{rule.reply}</p>
                {canDecrypt ? (
                  <div className="flex gap-2 justify-end mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button onClick={() => onToggleAutoReplyRule(rule)} type="button" className="text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md dark:bg-indigo-950/45 dark:text-indigo-400">
                      {rule.enabled ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                    <button onClick={() => onDeleteAutoReplyRule(rule.id)} type="button" className="text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-md dark:bg-rose-950/45 dark:text-rose-400">
                      Hapus
                    </button>
                  </div>
                ) : null}
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
                className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-slate-950 dark:text-slate-100 font-mono">
                      {maskPhone(session.phone, !canDecrypt)}
                    </h4>
                    <span className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded font-bold dark:bg-indigo-950/45 dark:text-indigo-400 dark:border-indigo-900">
                      {session.state}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">Akun: {session.account_id}</p>
                  
                  {Object.keys(session.form_data).length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-850 mb-3">
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Form Data:</p>
                      <pre className="text-xs font-mono overflow-x-auto text-slate-700 dark:text-slate-350 select-all">
                        {JSON.stringify(session.form_data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800 mt-2">
                  <span className="text-[10px] text-slate-400">
                    {new Date(session.updated_at).toLocaleTimeString("id-ID")}
                  </span>
                  {canDecrypt && (
                    <button
                      onClick={() => onResetSession(session.phone)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-1.5 rounded transition-colors dark:bg-rose-950/45 dark:text-rose-400"
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
        <h3 className="text-md font-bold text-slate-900 dark:text-slate-150 flex items-center gap-1.5 border-t border-slate-100 dark:border-slate-800 pt-6">
          <span className="w-2 h-2 rounded-full bg-emerald-600" />
          Registrasi & Tiket Masuk via WhatsApp ({contactForms.length})
        </h3>
        {contactForms.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500">
            Belum ada formulir pendaftaran atau keluhan support yang dikirim pelanggan.
          </div>
        ) : (
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse bg-white dark:bg-slate-900">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-xs font-bold uppercase border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3">Tanggal</th>
                  <th className="p-3">Tipe</th>
                  <th className="p-3">WhatsApp</th>
                  <th className="p-3">Detail Data Formulir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {contactForms.map((form) => {
                  const dateStr = new Date(form.created_at).toLocaleString("id-ID");
                  return (
                    <tr key={form.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/40 transition-colors">
                      <td className="p-3 text-slate-500 text-xs whitespace-nowrap">{dateStr}</td>
                      <td className="p-3">
                        <span
                          className={`inline-block text-xs font-bold px-2 py-0.5 rounded border ${
                            form.type === "registration"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-400 dark:border-emerald-900"
                              : "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/45 dark:text-amber-400 dark:border-amber-900"
                          }`}
                        >
                          {form.type === "registration" ? "Registrasi" : "Support"}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-semibold text-slate-800 dark:text-slate-200">{maskPhone(form.phone, !canDecrypt)}</td>
                      <td className="p-3">
                        <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-850 font-mono text-xs text-slate-700 dark:text-slate-350 max-w-xl whitespace-pre-wrap select-all">
                          {Object.entries(form.data).map(([k, v]) => (
                            <div key={k}>
                              <strong className="text-indigo-800 dark:text-indigo-400">{k}</strong>: {String(v)}
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
        </>
      )}
    </div>
  );
}
