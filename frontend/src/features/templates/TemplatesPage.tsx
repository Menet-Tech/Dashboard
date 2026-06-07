import type { FormEvent } from "react";
import { StatusPill, inputClassName, renderInlineError, EmptyTableRow } from "../../components/ui";
import type { TemplateItem } from "../../types";
import type { FieldErrors } from "../../utils/validation";

export type TemplateFormState = {
  name: string;
  trigger_key: string;
  content: string;
  is_active: boolean;
};

export const defaultTemplateForm = (): TemplateFormState => ({
  name: "",
  trigger_key: "",
  content: "",
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
}: TemplatesPageProps) {
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;

  return (
    <section className="flex flex-col gap-8">
      {/* 1. DAFTAR TEMPLATE */}
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Daftar Template</h2>
            <p className="text-xs text-slate-500 mt-1">Daftar draft template pesan WhatsApp otomatis dan respon chatbot.</p>
          </div>
          <StatusPill label={`${templates.length} item`} tone="slate" />
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm scrollbar-thin">
          <table className="w-full text-left border-collapse text-sm min-w-[650px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Nama</th>
                <th className="px-6 py-4 font-semibold">Trigger</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Isi Template</th>
                <th className="px-6 py-4 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {templates.length === 0 ? (
                <EmptyTableRow message="Belum ada template WhatsApp yang tersimpan." colSpan={5} />
              ) : (
                templates.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">{item.name}</td>
                    <td className="px-6 py-4 text-slate-650 dark:text-slate-400 font-mono text-xs font-semibold">{item.trigger_key}</td>
                    <td className="px-6 py-4">
                      <StatusPill
                        label={item.is_active ? "active" : "inactive"}
                        tone={item.is_active ? "green" : "slate"}
                      />
                    </td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 max-w-[320px] break-words whitespace-normal text-xs leading-relaxed font-sans">{item.content}</td>
                    <td className="px-6 py-4 text-gray-700">
                      <div className="flex gap-2">
                        <button type="button" className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={() => onEdit(item)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors disabled:opacity-50"
                          onClick={() => onDelete(item.id)}
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* 2. TAMBAH/EDIT TEMPLATE FORM (PENGATURAN DI BAWAH) */}
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col mb-6 border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-900">
            {editingTemplateId ? "Edit Template" : "Tambah Template"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {editingTemplateId
              ? "Perbarui isi template pesan otomatis atau respon chatbot."
              : "Buat template pesan baru dengan trigger kustom."}
          </p>
        </div>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={onSubmit}>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Nama Template</span>
            <input
              type="text"
              className={inputClassName(templateErrors.name)}
              value={templateForm.name}
              onChange={(e) => onFormChange((curr) => ({ ...curr, name: e.target.value }))}
              placeholder="contoh: Notifikasi Jatuh Tempo"
            />
            {renderInlineError(templateErrors.name)}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Trigger Key</span>
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
            />
            {renderInlineError(templateErrors.trigger_key)}
          </label>
          <label className="md:col-span-2 flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Isi Template</span>
            <textarea
              className={inputClassName(templateErrors.content)}
              rows={6}
              value={templateForm.content}
              onChange={(e) => onFormChange((curr) => ({ ...curr, content: e.target.value }))}
              placeholder="Tulis isi pesan Anda. Gunakan placeholder seperti {nama} untuk data dinamis."
            />
            {renderInlineError(templateErrors.content)}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-355">Status</span>
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
          <div className="md:col-span-2 flex gap-3 mt-4 border-t border-slate-100 pt-5">
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" disabled={submitting}>
              {isBusy("save-template") ? "Menyimpan..." : editingTemplateId ? "Update Template" : "Simpan Template"}
            </button>
            {editingTemplateId ? (
              <button type="button" className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={onCancelEdit}>
                Batal Edit
              </button>
            ) : null}
          </div>
        </form>
      </article>

      {/* 3. SISTEM TRIGGER & PLACEHOLDER GUIDE */}
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col mb-4">
          <h3 className="text-base font-bold text-slate-900">Panduan Sistem Trigger & Placeholders</h3>
          <p className="text-xs text-slate-500 mt-1">
            Gunakan Trigger Key sistem di bawah ini agar pesan notifikasi otomatis, chatbot WhatsApp, dan laporan teknisi berjalan dengan benar.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-6">
          {/* Section 1: Billing & Automation */}
          <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-5 bg-slate-50/50 dark:bg-slate-900/40">
            <h4 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span>📢 Notifikasi Otomatis Billing</span>
            </h4>
            <div className="space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">reminder_custom</span>
                  <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-semibold">Sistem</span>
                </div>
                <p className="text-slate-500 mt-0.5">Dikirim X hari sebelum jatuh tempo untuk mengingatkan pembayaran.</p>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1.5 flex flex-wrap gap-1">
                  Placeholders:
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nama}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{periode}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nominal}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{jatuh_tempo}"}</code>
                </div>
              </div>
              <div className="border-t border-slate-200/60 dark:border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">jatuh_tempo</span>
                  <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-semibold">Sistem</span>
                </div>
                <p className="text-slate-500 mt-0.5">Dikirim tepat pada hari H jatuh tempo tagihan.</p>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1.5 flex flex-wrap gap-1">
                  Placeholders:
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nama}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{jatuh_tempo}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nominal}"}</code>
                </div>
              </div>
              <div className="border-t border-slate-200/60 dark:border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">limit_5hari</span>
                  <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-semibold">Sistem</span>
                </div>
                <p className="text-slate-500 mt-0.5">Notifikasi isolir setelah melewati batas toleransi keterlambatan.</p>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1.5 flex flex-wrap gap-1">
                  Placeholders:
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nama}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{hari_limit}"}</code>
                </div>
              </div>
              <div className="border-t border-slate-200/60 dark:border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">lunas</span>
                  <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-semibold">Sistem</span>
                </div>
                <p className="text-slate-500 mt-0.5">Dikirim setelah admin mengonfirmasi pembayaran tagihan sebagai lunas.</p>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1.5 flex flex-wrap gap-1">
                  Placeholders:
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nama}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{invoice_number}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nominal}"}</code>
                </div>
              </div>
              <div className="border-t border-slate-200/60 dark:border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">trial_expired</span>
                  <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-semibold">Sistem</span>
                </div>
                <p className="text-slate-500 mt-0.5">Dikirim ketika masa trial pelanggan selesai dan tagihan pertama dibuat.</p>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1.5 flex flex-wrap gap-1">
                  Placeholders:
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nama}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{invoice_number}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{periode}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nominal}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{jatuh_tempo}"}</code>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Chatbot Manual Query */}
          <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-5 bg-slate-50/50 dark:bg-slate-900/40">
            <h4 className="text-sm font-bold text-emerald-650 dark:text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span>🤖 Chatbot Respon Tagihan Mandiri</span>
            </h4>
            <div className="space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">chatbot_trial</span>
                  <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-450 px-1.5 py-0.5 rounded font-semibold">Chatbot</span>
                </div>
                <p className="text-slate-500 mt-0.5">Dibalas otomatis ketika pelanggan status trial mengetik "1" (cek tagihan).</p>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1.5 flex flex-wrap gap-1">
                  Placeholders:
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nama}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{hari_limit}"}</code>
                </div>
              </div>
              <div className="border-t border-slate-200/60 dark:border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">chatbot_no_bill</span>
                  <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-450 px-1.5 py-0.5 rounded font-semibold">Chatbot</span>
                </div>
                <p className="text-slate-500 mt-0.5">Dibalas otomatis ketika pelanggan tidak memiliki tagihan tertunggak (lunas).</p>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1.5 flex flex-wrap gap-1">
                  Placeholders:
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nama}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{periode}"}</code>
                </div>
              </div>
              <div className="border-t border-slate-200/60 dark:border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">chatbot_due_bill</span>
                  <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-455 px-1.5 py-0.5 rounded font-semibold">Chatbot</span>
                </div>
                <p className="text-slate-500 mt-0.5">Dibalas otomatis ketika pelanggan memiliki tagihan yang melewati jatuh tempo.</p>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1.5 flex flex-wrap gap-1">
                  Placeholders:
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nama}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{jatuh_tempo}"}</code>
                </div>
              </div>
              <div className="border-t border-slate-200/60 dark:border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">chatbot_active_bill</span>
                  <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-450 px-1.5 py-0.5 rounded font-semibold">Chatbot</span>
                </div>
                <p className="text-slate-500 mt-0.5">Dibalas otomatis ketika pelanggan memiliki tagihan aktif belum jatuh tempo.</p>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1.5 flex flex-wrap gap-1">
                  Placeholders:
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nama}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{periode}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nominal}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{jatuh_tempo}"}</code>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Admin & Support Notifications */}
          <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-5 bg-slate-50/50 dark:bg-slate-900/40">
            <h4 className="text-sm font-bold text-rose-650 dark:text-rose-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <span>🔧 Notifikasi Admin & Support</span>
            </h4>
            <div className="space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">alert_teknisi</span>
                  <span className="text-[10px] bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-455 px-1.5 py-0.5 rounded font-semibold">Support</span>
                </div>
                <p className="text-slate-500 mt-0.5">Notifikasi berisi keluhan pelanggan baru yang langsung dikirim ke WhatsApp admin/teknisi.</p>
                <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1.5 flex flex-wrap gap-1">
                  Placeholders:
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{nama}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{alamat}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{kendala}"}</code>
                  <code className="bg-white dark:bg-slate-950 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-800">{"{no_hp}"}</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
