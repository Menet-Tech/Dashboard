import { useState, useEffect, type FormEvent } from "react";
import { StatusPill, inputClassName, renderInlineError, EmptyTableRow } from "../../components/ui";
import { Modal } from "../../components/ui/Modal";
import { Plus } from "lucide-react";
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
  const [isFormOpen, setIsFormOpen] = useState(false);

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

  return (
    <section className="flex flex-col gap-6 w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-sans">Template WhatsApp</h2>
          <p className="text-xs text-slate-500 mt-1">
            Konfigurasi draft template pesan WhatsApp otomatis untuk billing, reminder jatuh tempo, isolir, dan chatbot.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onCancelEdit();
            setIsFormOpen(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center gap-1.5"
        >
          <Plus size={14} />
          Tambah Template
        </button>
      </div>

      {/* Templates Table Card (Full Width) */}
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-sans">Daftar Template</h3>
          <StatusPill label={`${templates.length} Item`} tone="slate" />
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm scrollbar-thin">
          <table className="w-full text-left border-collapse text-sm min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-sans">
              <tr>
                <th className="px-6 py-4 font-semibold">Nama Template</th>
                <th className="px-6 py-4 font-semibold">Trigger Key</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Isi Draft Pesan</th>
                <th className="px-6 py-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {templates.length === 0 ? (
                <EmptyTableRow message="Belum ada template WhatsApp yang tersimpan." colSpan={5} />
              ) : (
                templates.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/40 transition-colors">
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
                        <button
                          type="button"
                          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors"
                          onClick={() => {
                            onEdit(item);
                            setIsFormOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors"
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

      {/* Template Form Modal */}
      {showForm && (
        <Modal
          title={editingTemplateId ? "Edit Template WhatsApp" : "Tambah Template WhatsApp"}
          onClose={handleCloseForm}
          actions={
            <>
              <button
                type="button"
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                onClick={handleCloseForm}
              >
                Batal
              </button>
              <button
                type="submit"
                form="template-form"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors"
                disabled={submitting}
              >
                {isBusy("save-template") ? "Menyimpan..." : editingTemplateId ? "Update Template" : "Simpan Template"}
              </button>
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
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Isi Pesan</span>
              <textarea
                className={inputClassName(templateErrors.content)}
                rows={6}
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

      {/* Placeholders Guide */}
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-sans mb-3">Panduan Placeholders</h4>
        <p className="text-xs text-slate-500 mb-4">
          Anda dapat menggunakan tag placeholder kurung kurawal di bawah ini agar data dinamis pelanggan terisi otomatis saat pesan dikirim:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
            <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Informasi Pelanggan</span>
            <code>{"{nama}"}</code> - Nama pelanggan<br />
            <code>{"{alamat}"}</code> - Alamat pemasangan<br />
            <code>{"{no_hp}"}</code> - Nomor WhatsApp
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
            <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Informasi Billing</span>
            <code>{"{invoice_number}"}</code> - No. Invoice<br />
            <code>{"{periode}"}</code> - Periode tagihan<br />
            <code>{"{nominal}"}</code> - Nominal tagihan<br />
            <code>{"{jatuh_tempo}"}</code> - Tgl Jatuh tempo
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-150">
            <span className="text-[10px] text-slate-400 font-bold block uppercase mb-1">Status Keterlambatan</span>
            <code>{"{hari_limit}"}</code> - Hari isolir
          </div>
        </div>
      </article>
    </section>
  );
}
