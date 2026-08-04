type ToastTone = "success" | "error" | "warning";

export type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
};

// SVG icon components — lebih accessible daripada emoji
// Screen reader tidak akan membaca icon ini karena aria-hidden="true"
function IconSuccess() {
  return (
    <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  );
}

function IconError() {
  return (
    <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
    </svg>
  );
}

const toastIcon: Record<ToastTone, React.ReactElement> = {
  success: <IconSuccess />,
  warning: <IconWarning />,
  error:   <IconError />,
};

const toastLabel: Record<ToastTone, string> = {
  success: "Berhasil",
  warning: "Peringatan",
  error:   "Terjadi kesalahan",
};

const toastClass: Record<ToastTone, string> = {
  success: "bg-green-600 text-white",
  warning: "bg-amber-500 text-white",
  error:   "bg-red-600 text-white",
};

type ToastStackProps = {
  toasts: ToastItem[];
  onDismiss?: (id: number) => void;
};

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
      aria-live="polite"
      aria-label="Notifikasi sistem"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-label={`${toastLabel[toast.tone]}: ${toast.message}`}
          className={`flex items-start gap-3 p-4 rounded-xl shadow-lg text-sm w-80 animate-in ${toastClass[toast.tone]}`}
        >
          {toastIcon[toast.tone]}
          <span className="flex-1 font-medium leading-snug">{toast.message}</span>
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Tutup notifikasi"
              className="shrink-0 p-0.5 rounded-md hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 transition-colors"
            >
              <IconClose />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
