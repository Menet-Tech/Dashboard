import { useState, type FormEvent } from "react";
import { fetchSettings, updateSettings } from "../lib/api";
import { validateSettings, type FieldErrors } from "../utils/validation";
import type { HookDeps } from "./types";

export function useSettings({
  withFeedback,
  onSuccess,
  refreshHealth,
}: Pick<HookDeps, "withFeedback" | "onSuccess"> & { refreshHealth: () => Promise<void> }) {
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
  const [settingsErrors, setSettingsErrors] = useState<FieldErrors>({});

  async function refreshSettings() {
    const payload = await fetchSettings();
    setSettingsForm(payload.data as Record<string, string>);
  }

  async function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateSettings(settingsForm);
    setSettingsErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await withFeedback(async () => {
      await updateSettings(settingsForm);
      setSettingsErrors({});
      onSuccess("Pengaturan berhasil disimpan.");
      await refreshSettings();
      await refreshHealth();
    }, "save-settings");
  }

  return {
    state: { settingsForm, settingsErrors },
    handlers: { setSettingsForm, refreshSettings, handleSettingsSubmit },
  };
}
