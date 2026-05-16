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
    <section className="grid feature-grid">
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">{editingTemplateId ? "Edit Template" : "Tambah Template"}</h2>
        </div>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={onSubmit}>
          <label>
            <span>Nama Template</span>
            <input
              className={inputClassName(templateErrors.name)}
              value={templateForm.name}
              onChange={(e) => onFormChange((curr) => ({ ...curr, name: e.target.value }))}
            />
            {renderInlineError(templateErrors.name)}
          </label>
          <label>
            <span>Trigger Key</span>
            <input
              className={inputClassName(templateErrors.trigger_key)}
              value={templateForm.trigger_key}
              onChange={(e) =>
                onFormChange((curr) => ({
                  ...curr,
                  trigger_key: e.target.value,
                }))
              }
              placeholder="contoh: reminder_custom"
            />
            {renderInlineError(templateErrors.trigger_key)}
          </label>
          <label className="full-width">
            <span>Isi Template</span>
            <textarea
              className={inputClassName(templateErrors.content)}
              rows={8}
              value={templateForm.content}
              onChange={(e) => onFormChange((curr) => ({ ...curr, content: e.target.value }))}
            />
            {renderInlineError(templateErrors.content)}
          </label>
          <label>
            <span>Status</span>
            <select
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
          <div className="button-row">
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" disabled={submitting}>
              {isBusy("save-template") ? "Menyimpan..." : editingTemplateId ? "Update Template" : "Simpan Template"}
            </button>
            {editingTemplateId ? (
              <button type="button" className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" onClick={onCancelEdit}>
                Batal Edit
              </button>
            ) : null}
          </div>
        </form>
        <p className="muted top-gap">
          Placeholder dasar yang didukung: `{"{nama}"}`, `{"{periode}"}`, `{"{jatuh_tempo}"}`,
          `{"{invoice_number}"}`, `{"{nominal}"}`, `{"{hari_limit}"}`.
        </p>
      </article>

      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Daftar Template</h2>
          <StatusPill label={`${templates.length} item`} tone="slate" />
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">Nama</th>
                <th className="px-6 py-4 font-medium">Trigger</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Isi</th>
                <th className="px-6 py-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {templates.length === 0 ? (
                <EmptyTableRow message="Belum ada template WhatsApp yang tersimpan." colSpan={5} />
              ) : (
                templates.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 text-gray-700">{item.trigger_key}</td>
                    <td className="px-6 py-4 text-gray-700">
                      <StatusPill
                        label={item.is_active ? "active" : "inactive"}
                        tone={item.is_active ? "green" : "slate"}
                      />
                    </td>
                    <td className="px-6 py-4 text-gray-700">{item.content}</td>
                    <td className="px-6 py-4 text-gray-700">
                      <div className="table-actions">
                        <button type="button" className="text-gray-600 hover:bg-gray-100 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50" onClick={() => onEdit(item)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:bg-red-50 font-semibold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50"
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
    </section>
  );
}
