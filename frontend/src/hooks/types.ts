export type ConfirmDialogState = {
  title: string;
  body: string;
  confirmLabel: string;
  tone: "primary" | "danger";
  onConfirm: () => Promise<void>;
};

export type HookDeps = {
  withFeedback: (action: () => Promise<void>, actionKey?: string) => Promise<void>;
  askForConfirmation: (config: ConfirmDialogState) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};
