import { useState } from "react";
import {
  fetchHealth,
  fetchBackups,
  fetchAuditLogs,
  checkIntegrations,
  createBackup,
  verifyBackup,
  simulateRestore,
  applyRestore,
  type HealthPayload,
  type IntegrationCheckPayload,
  type RestoreSimulationResult,
} from "../lib/api";
import type { AuditLogItem } from "../types";
import type { BackupItem } from "../features/monitoring/MonitoringPage";
import type { HookDeps } from "./types";

type RestoreState = { filename: string; result: RestoreSimulationResult };

export function useMonitoring({
  withFeedback,
  askForConfirmation,
  onSuccess,
  userRole,
  setAuditLogs,
}: Omit<HookDeps, "onError"> & {
  userRole: string | undefined;
  setAuditLogs: (logs: AuditLogItem[]) => void;
}) {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [restoreSimulation, setRestoreSimulation] = useState<RestoreState | null>(null);

  async function refreshHealth() {
    const payload = await fetchHealth();
    setHealth(payload);
  }

  async function checkExternalIntegrations(): Promise<IntegrationCheckPayload> {
    const result = await checkIntegrations();
    await refreshHealth();
    return result;
  }

  async function refreshMonitoringData(setLoading?: (v: boolean) => void) {
    setLoading?.(true);
    try {
      const [healthPayload, backupsPayload, auditPayload] = await Promise.all([
        fetchHealth(),
        fetchBackups(),
        userRole === "admin" ? fetchAuditLogs(25) : Promise.resolve({ data: [] as AuditLogItem[] }),
      ]);
      setHealth(healthPayload);
      setBackups(backupsPayload.data ?? []);
      setAuditLogs(auditPayload.data ?? []);
    } finally {
      setLoading?.(false);
    }
  }

  async function handleCreateBackup() {
    await withFeedback(async () => {
      const res = await createBackup();
      onSuccess(`Backup berhasil dibuat: ${res.data.filename}`);
      await refreshMonitoringData();
    }, "create-backup");
  }

  async function handleVerifyBackup(filename: string) {
    await withFeedback(async () => {
      const response = await verifyBackup(filename);
      onSuccess(
        response.data.valid
          ? `Backup ${filename} valid. Integrity check: ${response.data.message}`
          : `Backup ${filename} bermasalah: ${response.data.message}`,
      );
    });
  }

  async function handleSimulateRestore(filename: string) {
    await withFeedback(async () => {
      const response = await simulateRestore(filename);
      if (response.data.valid) {
        setRestoreSimulation({ filename, result: response.data });
      } else {
        onSuccess(`Simulasi gagal: ${response.data.message}`);
      }
    });
  }

  function handleApplyRestore() {
    if (!restoreSimulation) return;
    askForConfirmation({
      title: "Terapkan backup ke sistem live",
      body: `Backup ${restoreSimulation.filename} akan menimpa database aktif dan menyebabkan service restart. Jalankan hanya saat maintenance window sudah disetujui.`,
      confirmLabel: "Terapkan restore",
      tone: "danger",
      onConfirm: async () => {
        await withFeedback(async () => {
          const response = await applyRestore();
          onSuccess(response.message);
          setRestoreSimulation(null);
          setTimeout(() => window.location.reload(), 3000);
        });
      },
    });
  }

  return {
    state: { health, backups, restoreSimulation },
    handlers: {
      setHealth,
      setBackups,
      refreshHealth,
      checkExternalIntegrations,
      refreshMonitoringData,
      handleCreateBackup,
      handleVerifyBackup,
      handleSimulateRestore,
      handleApplyRestore,
      cancelRestore: () => setRestoreSimulation(null),
    },
  };
}
