import { Button } from "../components/ui/Button";
import { createContext, useContext, useState, ReactNode } from "react";
import type { ToastItem } from "../components/ui/Toast";
import type { ConfirmDialogState } from "../hooks/types";
import { toErrorMessage } from "../utils/format";
import { ToastStack } from "../components/ui/Toast";
import { Modal } from "../components/ui/Modal";

type FeedbackContextType = {
  submitting: boolean;
  busyAction: string | null;
  isBusy: (actionKey: string) => boolean;
  pushToast: (tone: ToastItem["tone"], message: string) => void;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  pushWarning: (msg: string) => void;
  dismissToast: (id: number) => void;
  askForConfirmation: (config: ConfirmDialogState) => void;
  dismissConfirmDialog: () => void;
  confirmAndRun: () => Promise<void>;
  withFeedback: (action: () => Promise<void>, actionKey?: string) => Promise<void>;
};

const FeedbackContext = createContext<FeedbackContextType | undefined>(undefined);

export function FeedbackProvider({ children }: { children: ReactNode }) {
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

  function dismissToast(id: number) {
    setToasts((current) => current.filter((item) => item.id !== id));
  }

  function pushSuccess(msg: string) { pushToast("success", msg); }
  function pushError(msg: string) { pushToast("error", msg); }
  function pushWarning(msg: string) { pushToast("warning", msg); }

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

  const value: FeedbackContextType = {
    submitting,
    busyAction,
    isBusy,
    pushToast,
    pushSuccess,
    pushError,
    pushWarning,
    dismissToast,
    askForConfirmation,
    dismissConfirmDialog,
    confirmAndRun,
    withFeedback,
  };

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {confirmDialog && (
        <Modal
          title={confirmDialog.title}
          onClose={dismissConfirmDialog}
          actions={
            <>
              <button
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                onClick={dismissConfirmDialog}
                disabled={submitting}
              >
                Batal
              </button>
              <button
                className={`px-4 py-2 rounded-lg text-white transition-colors ${
                  confirmDialog.tone === "danger"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
                onClick={() => void confirmAndRun()}
                disabled={submitting}
              >
                {confirmDialog.confirmLabel}
              </button>
            </>
          }
        >
          <p className="text-slate-600 dark:text-slate-400">{confirmDialog.body}</p>
        </Modal>
      )}
    </FeedbackContext.Provider>
  );
}

export function useAppFeedback() {
  const context = useContext(FeedbackContext);
  if (context === undefined) {
    throw new Error("useAppFeedback must be used within a FeedbackProvider");
  }
  return context;
}
