import { useState } from "react";
import type { ToastItem } from "../components/ui/Toast";
import type { ConfirmDialogState } from "./types";
import { toErrorMessage } from "../utils/format";

export function useAppFeedback() {
  const [submitting, setSubmitting] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  function pushToast(tone: ToastItem["tone"], message: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }

  /** Dismiss a specific toast by id (e.g. via close button). */
  function dismissToast(id: number) {
    setToasts((current) => current.filter((item) => item.id !== id));
  }

  function pushSuccess(msg: string) {
    pushToast("success", msg);
  }

  function pushError(msg: string) {
    pushToast("error", msg);
  }

  function pushWarning(msg: string) {
    pushToast("warning", msg);
  }

  function askForConfirmation(config: ConfirmDialogState) {
    setConfirmDialog(config);
  }

  function dismissConfirmDialog() {
    setConfirmDialog(null);
  }

  async function confirmAndRun() {
    if (!confirmDialog) return;
    const action = confirmDialog.onConfirm;
    setConfirmDialog(null);
    await action();
  }

  async function withFeedback(action: () => Promise<void>, actionKey?: string) {
    setSubmitting(true);
    setBusyAction(actionKey ?? null);
    try {
      await action();
    } catch (caughtError) {
      pushError(toErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
      setBusyAction(null);
    }
  }

  function isBusy(actionKey: string) {
    return submitting && busyAction === actionKey;
  }

  return {
    submitting,
    busyAction,
    isBusy,
    toasts,
    pushToast,
    pushSuccess,
    pushError,
    pushWarning,
    dismissToast,
    confirmDialog,
    askForConfirmation,
    dismissConfirmDialog,
    confirmAndRun,
    withFeedback,
  };
}
