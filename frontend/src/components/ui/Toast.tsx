type ToastTone = "success" | "error" | "warning";

export type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
};

const toastIcon: Record<ToastTone, string> = {
  success: "✅",
  warning: "⚠️",
  error: "❌",
};

const toastClass: Record<ToastTone, string> = {
  success: "bg-green-600 text-white",
  warning: "bg-amber-600 text-white",
  error:   "bg-red-600 text-white",
};

type ToastStackProps = {
  toasts: ToastItem[];
};

export function ToastStack({ toasts }: ToastStackProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`flex items-start gap-3 p-4 rounded-xl shadow-lg text-sm w-80 translate-y-0 transition-all ${toastClass[toast.tone]}`}>
          <span className="text-lg leading-none">{toastIcon[toast.tone]}</span>
          <div className="flex-1">
            <span className="block font-medium">{toast.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
