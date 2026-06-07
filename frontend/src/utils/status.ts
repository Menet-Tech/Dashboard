/**
 * Status helper utilities — tone/label mappings for health, bills, integrations.
 * Pure functions, no React.
 */

import type { BillItem } from "../types";
import type { HealthPayload } from "../lib/api";

export type StatusTone = "green" | "gold" | "red" | "slate";

export function statusTone(status?: string): StatusTone {
  switch (status) {
    case "ok":
      return "green";
    case "error":
    case "disabled":
      return "red";
    case "degraded":
    case "idle":
    case "pending":
      return "gold";
    default:
      return "slate";
  }
}

export function displayStatusLabel(status: BillItem["display_status"]): string {
  switch (status) {
    case "lunas":
      return "lunas";
    case "menunggak":
      return "menunggak";
    case "jatuh_tempo":
      return "jatuh tempo";
    default:
      return "belum bayar";
  }
}

export function displayStatusTone(status: BillItem["display_status"]): StatusTone {
  switch (status) {
    case "lunas":
      return "green";
    case "menunggak":
      return "red";
    case "jatuh_tempo":
      return "gold";
    default:
      return "slate";
  }
}

export function integrationSummary(health: HealthPayload | null): string {
  if (!health) return "Belum diperiksa";
  const items: string[] = [];
  
  if (health.integrations.whatsapp_configured) {
    items.push(health.integrations.whatsapp_online ? "WA siap" : "WA mati");
  }
  if (health.integrations.discord_configured) {
    items.push(health.integrations.discord_online ? "Discord siap" : "Discord error");
  }
  if (health.integrations.mikrotik_configured) {
    items.push(health.integrations.mikrotik_online ? "MikroTik siap" : "MikroTik error");
  }
  
  return items.length > 0 ? items.join(" • ") : "Belum dikonfigurasi";
}
