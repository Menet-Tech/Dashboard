type ToastTone = "success" | "error" | "warning";

export type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
};

const toastLabel: Record<ToastTone, string> = {
  success: "Berhasil",
  warning: "Perhatian",
  error: "Error",
};

const toastClass: Record<ToastTone, string> = {
  success: "toast-item toast-success",
  warning: "toast-item toast-warning",
  error:   "toast-item toast-error",
};

type ToastStackProps = {
  toasts: ToastItem[];
};

export function ToastStack({ toasts }: ToastStackProps) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={toastClass[toast.tone]}>
          <strong>{toastLabel[toast.tone]}</strong>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
