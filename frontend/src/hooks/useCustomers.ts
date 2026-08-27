import { useState, useEffect, type FormEvent } from "react";
import { fetchCustomers, createCustomer, updateCustomer, updateCustomerStatus, deleteCustomer, bulkDeleteCustomers, endCustomerTrial } from "../lib/api";
import { validateCustomer, type FieldErrors } from "../utils/validation";
import { readCustomerLifecycleFilter } from "../lib/lifecycle";
import type { CustomerItem } from "../types";
import { defaultCustomerForm, type CustomerFormState } from "../features/customers/CustomersPage";
import type { HookDeps } from "./types";

export type CustomerLifecycleFilter =
  | "exclude_inactive"
  | "all"
  | "trial"
  | "perpanjangan"
  | "tertagih"
  | "jatuh_tempo"
  | "menunggak"
  | "lunas"
  | "wifi_umum";

export function useCustomers({ withFeedback, askForConfirmation, onSuccess }: Pick<HookDeps, "withFeedback" | "askForConfirmation" | "onSuccess">) {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(defaultCustomerForm());
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);
  const [customerErrors, setCustomerErrors] = useState<FieldErrors>({});
  const [customerLifecycleFilter, setCustomerLifecycleFilter] =
    useState<CustomerLifecycleFilter>(() => readCustomerLifecycleFilter() as CustomerLifecycleFilter);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("customers.lifecycleFilter", customerLifecycleFilter);
  }, [customerLifecycleFilter]);

  async function refreshCustomers() {
    const payload = await fetchCustomers();
    setCustomers(payload.data);
  }

  async function handleCustomerSubmit(event: FormEvent<HTMLFormElement>, overrideForm?: CustomerFormState) {
    event.preventDefault();
    const targetForm = overrideForm || customerForm;
    // For WiFi Umum nodes, due_day is meaningless — normalise to 1 before validation/submit
    const formToSubmit = targetForm.status === "wifi_umum"
      ? { ...targetForm, due_day: 1 }
      : targetForm;
    const nextErrors = validateCustomer(formToSubmit);
    setCustomerErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await withFeedback(async () => {
      if (editingCustomerId) {
        await updateCustomer(editingCustomerId, formToSubmit);
        onSuccess("Pelanggan berhasil diperbarui.");
      } else {
        await createCustomer(formToSubmit);
        onSuccess("Pelanggan baru berhasil ditambahkan.");
      }
      setCustomerErrors({});
      setCustomerForm(defaultCustomerForm());
      setEditingCustomerId(null);
      setIsFormOpen(false);
      await refreshCustomers();
    }, "save-customer");
  }

  async function handleStatusChange(id: number, status: CustomerItem["status"]) {
    await withFeedback(async () => {
      await updateCustomerStatus(id, status);
      onSuccess("Status pelanggan berhasil diperbarui.");
      await refreshCustomers();
    });
  }

  async function handleCustomerDelete(id: number) {
    askForConfirmation({
      title: "Hapus Pelanggan?",
      body: "Apakah Anda yakin ingin menghapus pelanggan ini? (PPP secret di MikroTik juga akan dihapus secara permanen).",
      confirmLabel: "Hapus Pelanggan",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          await deleteCustomer(id);
          onSuccess("Pelanggan berhasil dihapus.");
          await refreshCustomers();
        }, "delete-customer");
      },
    });
  }

  async function handleBulkDelete(ids: number[]) {
    await withFeedback(async () => {
      await bulkDeleteCustomers(ids);
      onSuccess(`Berhasil menghapus ${ids.length} pelanggan secara massal.`);
      await refreshCustomers();
    }, "bulk-delete-customers");
  }


  async function handleEndTrial(id: number) {
    askForConfirmation({
      title: "Hentikan Masa Trial?",
      body: "Apakah Anda yakin ingin memberhentikan masa trial pelanggan ini? Pelanggan akan dialihkan menjadi pelanggan reguler.",
      confirmLabel: "Hentikan Trial",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          await endCustomerTrial(id);
          onSuccess("Masa trial pelanggan berhasil diberhentikan.");
          await refreshCustomers();
        }, "end-customer-trial");
      },
    });
  }


  return {
    state: { customers, customerForm, editingCustomerId, customerErrors, customerLifecycleFilter, isFormOpen },
    handlers: {
      setCustomers,
      setCustomerForm,
      setEditingCustomerId,
      setCustomerErrors,
      setCustomerLifecycleFilter,
      refreshCustomers,
      handleCustomerSubmit,
      handleStatusChange,
      handleCustomerDelete,
      handleBulkDelete,
      setIsFormOpen,
      handleEndTrial,
    },
  };
}

