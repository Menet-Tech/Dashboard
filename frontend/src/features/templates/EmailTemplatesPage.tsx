import { useState, useEffect, useMemo, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { StatusPill, inputClassName, renderInlineError, EmptyTableRow } from "../../components/ui";
import { Modal } from "../../components/ui/Modal";
import { Plus, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import type { EmailTemplateItem } from "../../types";
import type { FieldErrors } from "../../utils/validation";
import {
  fetchEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
} from "../../lib/api";
import { useDialog } from "../../context/DialogContext";

export type EmailTemplateFormState = {
  name: string;
  trigger_key: string;
  subject: string;
  content: string;
  is_active: boolean;
};

export const defaultEmailTemplateForm = (): EmailTemplateFormState => ({
  name: "",
  trigger_key: "",
  subject: "",
  content: "",
  is_active: true,
});

type EmailTemplatesPageProps = {
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  withFeedback: (fn: () => Promise<void>, busyKey?: string) => Promise<void>;
};

export function EmailTemplatesPage({
  pushSuccess,
  pushError,
  withFeedback,
}: EmailTemplatesPageProps) {
  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const { showConfirm } = useDialog();
  const [templateForm, setTemplateForm] = useState<EmailTemplateFormState>(defaultEmailTemplateForm());
  const [templateErrors, setTemplateErrors] = useState<FieldErrors>({});
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const requestSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedTemplates = useMemo(() => {
    const list = templates || [];
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
  }, [templates, sortField, sortDirection]);

  const renderSortableHeader = (label: string, field: string) => {
    const isSorted = sortField === field;
    return (
      <th 
        className="px-6 py-4 font-semibold select-none cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors text-slate-500 dark:text-slate-400"
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

  const loadTemplates = async () => {
    try {
      const res = await fetchEmailTemplates();
      setTemplates(res.data);
    } catch (err: any) {
      pushError(err.message || "Gagal memuat template email");
    }
  };

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingTemplateId(null);
    setTemplateForm(defaultEmailTemplateForm());
    setTemplateErrors({});
  };

  const validateForm = (form: EmailTemplateFormState): FieldErrors => {
    const errors: FieldErrors = {};
    if (!form.name.trim()) errors.name = "Nama template wajib diisi";
    if (!form.trigger_key.trim()) errors.trigger_key = "Trigger key wajib diisi";
    if (!form.subject.trim()) errors.subject = "Subject email wajib diisi";
    if (!form.content.trim()) errors.content = "Isi template wajib diisi";
    return errors;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errors = validateForm(templateForm);
    setTemplateErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    await withFeedback(async () => {
      try {
        if (editingTemplateId) {
          await updateEmailTemplate(editingTemplateId, templateForm);
          pushSuccess("Template email berhasil diperbarui");
        } else {
          await createEmailTemplate(templateForm);
          pushSuccess("Template email berhasil disimpan");
        }
        handleCloseForm();
        await loadTemplates();
      } catch (err: any) {
        pushError(err.message || "Gagal menyimpan template email");
      }
    });
    setSubmitting(false);
  };

  const handleEdit = (item: EmailTemplateItem) => {
    setEditingTemplateId(item.id);
    setTemplateForm({
      name: item.name,
      trigger_key: item.trigger_key,
      subject: item.subject,
      content: item.content,
      is_active: item.is_active,
    });
    setIsFormOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!(await showConfirm("Apakah Anda yakin ingin menghapus template email ini?"))) return;
    await withFeedback(async () => {
      try {
        await deleteEmailTemplate(id);
        pushSuccess("Template email berhasil dihapus");
        await loadTemplates();
      } catch (err: any) {
        pushError(err.message || "Gagal menghapus template email");
      }
    });
  };

  const showForm = isFormOpen || editingTemplateId !== null;

  return (
    <section className="flex flex-col gap-6 w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100 font-sans">Template Email</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Konfigurasi draft template subject dan isi email otomatis untuk billing, reminder jatuh tempo, isolir, dan pembayaran lunas.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            setEditingTemplateId(null);
            setTemplateForm(defaultEmailTemplateForm());
            setIsFormOpen(true);
          }}
        >
          <Plus size={14} />
          Tambah Template
        </Button>
      </div>

      {/* Templates Table Card (Full Width) */}
      <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm overflow-hidden flex flex-col w-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider font-sans">Daftar Template Email</h3>
          <StatusPill label={`${templates.length} Item`} tone="slate" />
        </div>

        <div className="overflow-x-auto border border-gray-200 dark:border-slate-800 rounded-card bg-white dark:bg-slate-900 shadow-sm scrollbar-thin">
          <table className="w-full text-left border-collapse text-sm min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-800 text-gray-500 dark:text-slate-400 font-sans">
              <tr>
                {renderSortableHeader("Nama Template", "name")}
                {renderSortableHeader("Trigger Key", "trigger_key")}
                {renderSortableHeader("Status", "is_active")}
                {renderSortableHeader("Subject Email", "subject")}
                <th className="px-6 py-4 font-semibold text-slate-500 dark:text-slate-400">Isi Template</th>
                <th className="px-6 py-4 font-semibold text-center text-slate-500 dark:text-slate-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedTemplates.length === 0 ? (
                <EmptyTableRow message="Belum ada template email yang tersimpan." colSpan={6} />
              ) : (
                sortedTemplates.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-50 dark:text-slate-100">{item.name}</td>
                    <td className="px-6 py-4 text-indigo-600 dark:text-indigo-400 font-mono text-xs font-semibold">{item.trigger_key}</td>
                    <td className="px-6 py-4">
                      <StatusPill
                        label={item.is_active ? "active" : "inactive"}
                        tone={item.is_active ? "green" : "slate"}
                      />
                    </td>
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-100 dark:text-slate-200 text-xs font-semibold max-w-[200px] truncate">
                      {item.subject}
                    </td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 max-w-[350px] break-words whitespace-normal text-xs leading-relaxed font-sans">
                      {item.content}
                    </td>
                    <td className="px-6 py-4 text-gray-700 dark:text-slate-300">
                      <div className="flex gap-2 justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(item)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => void handleDelete(item.id)}
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

      {/* Template Form Modal */}
      {showForm && (
        <Modal
          title={editingTemplateId ? "Edit Template Email" : "Tambah Template Email"}
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
                form="email-template-form"
                disabled={submitting}
                isLoading={submitting}
                loadingText="Menyimpan..."
              >
                {editingTemplateId ? "Update Template" : "Simpan Template"}
              </Button>
            </>
          }
        >
          <form id="email-template-form" className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300">Nama Template</span>
              <input
                type="text"
                className={inputClassName(templateErrors.name)}
                value={templateForm.name}
                onChange={(e) => setTemplateForm((curr) => ({ ...curr, name: e.target.value }))}
                placeholder="contoh: Pengingat H-3 Tagihan"
                required
              />
              {renderInlineError(templateErrors.name)}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300">Trigger Key (Unik untuk Sistem)</span>
              <input
                type="text"
                className={inputClassName(templateErrors.trigger_key)}
                value={templateForm.trigger_key}
                onChange={(e) => setTemplateForm((curr) => ({ ...curr, trigger_key: e.target.value }))}
                placeholder="contoh: reminder-h5"
                required
                disabled={editingTemplateId !== null}
              />
              {renderInlineError(templateErrors.trigger_key)}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300">Subject Email</span>
              <input
                type="text"
                className={inputClassName(templateErrors.subject)}
                value={templateForm.subject}
                onChange={(e) => setTemplateForm((curr) => ({ ...curr, subject: e.target.value }))}
                placeholder="contoh: Tagihan Internet Menunggu Pembayaran - {invoice_number}"
                required
              />
              {renderInlineError(templateErrors.subject)}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300">Isi Email</span>
              <textarea
                className={`${inputClassName(templateErrors.content)} min-h-[200px] resize-y`}
                rows={12}
                value={templateForm.content}
                onChange={(e) => setTemplateForm((curr) => ({ ...curr, content: e.target.value }))}
                placeholder="Tulis pesan. Gunakan placeholder seperti {nama}, {nominal}, {jatuh_tempo} untuk data dinamis."
                required
              />
              {renderInlineError(templateErrors.content)}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-300">Status</span>
              <select
                className={inputClassName()}
                value={templateForm.is_active ? "1" : "0"}
                onChange={(e) => setTemplateForm((curr) => ({ ...curr, is_active: e.target.value === "1" }))}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </label>
          </form>
        </Modal>
      )}

      {/* Placeholders Guide */}
      <article className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-card p-6 shadow-sm">
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider font-sans mb-3">Panduan Placeholders</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Anda dapat menggunakan tag placeholder kurung kurawal di bawah ini agar data dinamis pelanggan terisi otomatis pada Subject maupun Isi email:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase mb-1">Informasi Pelanggan</span>
            <code>{"{nama}"}</code> - Nama pelanggan<br />
            <code>{"{alamat}"}</code> - Alamat pemasangan<br />
            <code>{"{no_hp}"}</code> - Nomor WhatsApp
          </div>
          <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase mb-1">Informasi Billing</span>
            <code>{"{invoice_number}"}</code> - No. Invoice<br />
            <code>{"{periode}"}</code> - Periode tagihan<br />
            <code>{"{nominal}"}</code> - Nominal tagihan<br />
            <code>{"{jatuh_tempo}"}</code> - Tgl Jatuh tempo
          </div>
          <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase mb-1">Status Keterlambatan</span>
            <code>{"{hari_limit}"}</code> - Hari isolir
          </div>
        </div>
      </article>
    </section>
  );
}
