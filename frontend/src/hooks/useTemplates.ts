import { useState, type FormEvent } from "react";
import { fetchTemplates, createTemplate, updateTemplate, deleteTemplate } from "../lib/api";
import { validateTemplate, type FieldErrors } from "../utils/validation";
import type { TemplateItem } from "../types";
import { defaultTemplateForm, type TemplateFormState } from "../features/templates/TemplatesPage";
import type { HookDeps } from "./types";

export function useTemplates({ withFeedback, askForConfirmation, onSuccess }: Omit<HookDeps, "onError">) {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(defaultTemplateForm());
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [templateErrors, setTemplateErrors] = useState<FieldErrors>({});

  async function refreshTemplates() {
    const payload = await fetchTemplates();
    setTemplates(payload.data);
  }

  async function handleTemplateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateTemplate(templateForm);
    setTemplateErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await withFeedback(async () => {
      if (editingTemplateId) {
        await updateTemplate(editingTemplateId, templateForm);
        onSuccess("Template berhasil diperbarui.");
      } else {
        await createTemplate(templateForm);
        onSuccess("Template baru berhasil ditambahkan.");
      }
      setTemplateErrors({});
      setTemplateForm(defaultTemplateForm());
      setEditingTemplateId(null);
      await refreshTemplates();
    }, "save-template");
  }

  function handleTemplateDelete(id: number) {
    askForConfirmation({
      title: "Hapus template WhatsApp",
      body: "Template yang dihapus tidak lagi tersedia untuk trigger notifikasi. Pastikan template ini memang tidak dibutuhkan di automation.",
      confirmLabel: "Ya, hapus template",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          await deleteTemplate(id);
          if (editingTemplateId === id) {
            setTemplateForm(defaultTemplateForm());
            setEditingTemplateId(null);
          }
          onSuccess("Template berhasil dihapus.");
          await refreshTemplates();
        }, "delete-template");
      },
    });
  }

  return {
    state: { templates, templateForm, editingTemplateId, templateErrors },
    handlers: { setTemplates, setTemplateForm, setEditingTemplateId, refreshTemplates, handleTemplateSubmit, handleTemplateDelete },
  };
}
