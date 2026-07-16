import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalShellProps = {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
};

export function Modal({ title, children, actions, onClose }: ModalShellProps) {
  return createPortal(
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="presentation" onClick={onClose}>
      <section
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 font-sans">{title}</h2>
          <button type="button" className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 dark:hover:text-slate-350 p-2 rounded-lg transition-colors cursor-pointer text-xs font-semibold" onClick={onClose} aria-label="Tutup dialog">
            Tutup
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
        {actions && (
          <div className="p-6 border-t border-slate-100 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-800 flex items-center justify-end gap-3">
            {actions}
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}
