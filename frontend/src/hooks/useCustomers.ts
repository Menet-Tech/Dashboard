import { useState, useEffect, type FormEvent } from "react";
import { fetchCustomers, createCustomer, updateCustomer, updateCustomerStatus } from "../lib/api";
import { validateCustomer, type FieldErrors } from "../utils/validation";
import { readCustomerLifecycleFilter } from "../lib/lifecycle";
import type { CustomerItem } from "../types";
import { defaultCustomerForm, type CustomerFormState } from "../features/customers/CustomersPage";
import type { HookDeps } from "./types";

export type CustomerLifecycleFilter =
  | "all"
  | "trial"
  | "tertagih"
  | "jatuh_tempo"
  | "menunggak"
  | "lunas";

export function useCustomers({ withFeedback, onSuccess }: Pick<HookDeps, "withFeedback" | "onSuccess">) {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(defaultCustomerForm());
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);
  const [customerErrors, setCustomerErrors] = useState<FieldErrors>({});
  const [customerLifecycleFilter, setCustomerLifecycleFilter] =
    useState<CustomerLifecycleFilter>(() => readCustomerLifecycleFilter() as CustomerLifecycleFilter);

  useEffect(() => {
    window.localStorage.setItem("customers.lifecycleFilter", customerLifecycleFilter);
  }, [customerLifecycleFilter]);

  async function refreshCustomers() {
    const payload = await fetchCustomers();
    setCustomers(payload.data);
  }

  async function handleCustomerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateCustomer(customerForm);
    setCustomerErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await withFeedback(async () => {
      if (editingCustomerId) {
        await updateCustomer(editingCustomerId, customerForm);
        onSuccess("Pelanggan berhasil diperbarui.");
      } else {
        await createCustomer(customerForm);
        onSuccess("Pelanggan baru berhasil ditambahkan.");
      }
      setCustomerErrors({});
      setCustomerForm(defaultCustomerForm());
      setEditingCustomerId(null);
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

  return {
    state: { customers, customerForm, editingCustomerId, customerErrors, customerLifecycleFilter },
    handlers: {
      setCustomers,
      setCustomerForm,
      setEditingCustomerId,
      setCustomerLifecycleFilter,
      refreshCustomers,
      handleCustomerSubmit,
      handleStatusChange,
    },
  };
}
