import { useState, type FormEvent } from "react";
import { fetchPackages, createPackage, updatePackage, deletePackage } from "../lib/api";
import { validatePackage, type FieldErrors } from "../utils/validation";
import type { PackageItem } from "../types";
import { defaultPackageForm, type PackageFormState } from "../features/packages/PackagesPage";
import type { HookDeps } from "./types";

export function usePackages({ withFeedback, askForConfirmation, onSuccess }: Omit<HookDeps, "onError">) {
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [packageForm, setPackageForm] = useState<PackageFormState>(defaultPackageForm());
  const [editingPackageId, setEditingPackageId] = useState<number | null>(null);
  const [packageErrors, setPackageErrors] = useState<FieldErrors>({});

  async function refreshPackages() {
    const payload = await fetchPackages();
    setPackages(payload.data);
  }

  async function handlePackageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validatePackage(packageForm);
    setPackageErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await withFeedback(async () => {
      if (editingPackageId) {
        await updatePackage(editingPackageId, packageForm);
        onSuccess("Paket berhasil diperbarui.");
      } else {
        await createPackage(packageForm);
        onSuccess("Paket baru berhasil ditambahkan.");
      }
      setPackageErrors({});
      setPackageForm(defaultPackageForm());
      setEditingPackageId(null);
      await refreshPackages();
    }, "save-package");
  }

  function handlePackageDelete(id: number) {
    askForConfirmation({
      title: "Hapus paket internet",
      body: "Paket akan dihapus dari daftar master. Pastikan tidak ada pelanggan aktif yang masih bergantung pada paket ini.",
      confirmLabel: "Ya, hapus paket",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          await deletePackage(id);
          if (editingPackageId === id) {
            setPackageForm(defaultPackageForm());
            setEditingPackageId(null);
          }
          onSuccess("Paket berhasil dihapus.");
          await refreshPackages();
        }, "delete-package");
      },
    });
  }

  return {
    state: { packages, packageForm, editingPackageId, packageErrors },
    handlers: { setPackages, setPackageForm, setEditingPackageId, refreshPackages, handlePackageSubmit, handlePackageDelete },
  };
}
