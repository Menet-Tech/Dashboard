/**
 * Customer billing lifecycle engine.
 * Pure business logic — no React, no side-effects.
 */

import type { CustomerItem, BillItem } from "../types";
import { startOfDay, addDays, daysDiff } from "../utils/date";
import { formatDateId } from "../utils/format";

export type CustomerLifecycleKey =
  | "all"
  | "trial"
  | "tertagih"
  | "jatuh_tempo"
  | "menunggak"
  | "lunas";

export type CustomerLifecycleEntry = {
  key: CustomerLifecycleKey;
  label: string;
  tone: "green" | "gold" | "red" | "slate";
  note: string;
};

export type CustomerLifecycleMap = Record<number, CustomerLifecycleEntry>;

function resolveTrialEndsAt(customer: CustomerItem): Date | null {
  if (!customer.trial_started_at || !customer.trial_days) return null;
  const startedAt = new Date(customer.trial_started_at);
  if (Number.isNaN(startedAt.getTime())) return null;
  return addDays(startedAt, customer.trial_days);
}

function parseBillDate(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function lifecycleRank(key: CustomerLifecycleKey): number {
  switch (key) {
    case "menunggak":
      return 5;
    case "jatuh_tempo":
      return 4;
    case "tertagih":
      return 3;
    case "trial":
      return 2;
    case "lunas":
      return 1;
    default:
      return 0;
  }
}

function customerLifecycleFromBill(
  customer: CustomerItem,
  bill: BillItem,
  now: Date,
  reminderDays: number,
  trialGraceDays: number,
  menunggakDays: number,
): CustomerLifecycleEntry {
  const dueDate = parseBillDate(bill.due_date);
  if (!dueDate) {
    return {
      key: "tertagih",
      label: "Tertagih",
      tone: "slate",
      note: `Invoice ${bill.invoice_number} aktif dan menunggu pembayaran.`,
    };
  }

  const trialEndsAt = resolveTrialEndsAt(customer);
  let effectiveDueDate = new Date(dueDate);
  if (trialEndsAt && trialEndsAt.getTime() > dueDate.getTime()) {
    effectiveDueDate = addDays(startOfDay(trialEndsAt), trialGraceDays);
  }

  if (bill.status === "lunas") {
    return {
      key: "lunas",
      label: "Lunas",
      tone: "green",
      note: `Invoice ${bill.invoice_number} sudah lunas.`,
    };
  }

  const overdue = daysDiff(startOfDay(now), startOfDay(effectiveDueDate));
  if (overdue > menunggakDays) {
    return {
      key: "menunggak",
      label: "Menunggak",
      tone: "red",
      note: `Invoice ${bill.invoice_number} sudah lewat ${overdue} hari dari role jatuh tempo efektif.`,
    };
  }
  if (overdue > 0) {
    return {
      key: "jatuh_tempo",
      label: "Jatuh Tempo",
      tone: "gold",
      note: `Invoice ${bill.invoice_number} aktif. Role jatuh tempo sejak ${formatDateId(effectiveDueDate)}.`,
    };
  }

  const reminderDate = addDays(startOfDay(dueDate), -reminderDays);
  if (trialEndsAt && trialEndsAt.getTime() > dueDate.getTime()) {
    return {
      key: "tertagih",
      label: "Tertagih",
      tone: "slate",
      note: `Trial selesai, notif sudah dikirim. Role jatuh tempo mulai ${formatDateId(effectiveDueDate)}.`,
    };
  }
  if (now.getTime() >= reminderDate.getTime()) {
    return {
      key: "tertagih",
      label: "Tertagih",
      tone: "slate",
      note: `Invoice ${bill.invoice_number} aktif. Window reminder dimulai ${formatDateId(reminderDate)}.`,
    };
  }
  return {
    key: "tertagih",
    label: "Tertagih",
    tone: "slate",
    note: `Invoice ${bill.invoice_number} aktif. Menunggu window reminder berikutnya.`,
  };
}

export function buildCustomerLifecycleMap(
  customers: CustomerItem[],
  bills: BillItem[],
  settingsForm: Record<string, string>,
): CustomerLifecycleMap {
  const reminderDays = parseInt(settingsForm["billing_reminder_days"] ?? "3", 10) || 3;
  const menunggakDays = parseInt(settingsForm["billing_menunggak_days"] ?? "30", 10) || 30;
  const trialGraceDays =
    parseInt(settingsForm["trial_overdue_grace_days"] ?? "7", 10) || 7;
  const now = new Date();

  const billsByCustomer = new Map<number, BillItem[]>();
  for (const bill of bills) {
    const current = billsByCustomer.get(bill.customer_id) ?? [];
    current.push(bill);
    billsByCustomer.set(bill.customer_id, current);
  }

  return Object.fromEntries(
    customers.map((customer) => {
      const trialEndsAt = resolveTrialEndsAt(customer);
      if (customer.is_trial) {
        return [
          customer.id,
          {
            key: "trial" as const,
            label: "Trial Aktif",
            tone: "gold" as const,
            note: trialEndsAt
              ? `Free trial sampai ${formatDateId(trialEndsAt)} (${customer.trial_days ?? 3} hari).`
              : `Free trial ${customer.trial_days ?? 3} hari sedang berjalan.`,
          },
        ];
      }

      const unpaidBills = (billsByCustomer.get(customer.id) ?? []).filter(
        (bill) => bill.status !== "lunas",
      );

      if (unpaidBills.length === 0) {
        return [
          customer.id,
          {
            key: "lunas" as const,
            label: "Lunas",
            tone: "green" as const,
            note: "Tidak ada tagihan aktif. Layanan berada pada kondisi aman.",
          },
        ];
      }

      const mostSevere = unpaidBills
        .map((bill) =>
          customerLifecycleFromBill(
            customer,
            bill,
            now,
            reminderDays,
            trialGraceDays,
            menunggakDays,
          ),
        )
        .sort((a, b) => lifecycleRank(b.key) - lifecycleRank(a.key))[0];

      return [customer.id, mostSevere];
    }),
  );
}

export function readCustomerLifecycleFilter(): CustomerLifecycleKey {
  if (typeof window === "undefined") return "all";
  const stored = window.localStorage.getItem("customers.lifecycleFilter");
  if (
    stored === "trial" ||
    stored === "tertagih" ||
    stored === "jatuh_tempo" ||
    stored === "menunggak" ||
    stored === "lunas" ||
    stored === "all"
  ) {
    return stored;
  }
  return "all";
}
