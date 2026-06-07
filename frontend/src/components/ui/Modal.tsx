import type { ReactNode } from "react";

type ModalShellProps = {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
};

export function Modal({ title, children, actions, onClose }: ModalShellProps) {
  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-50 flex items-center justify-center p-4" role="presentation" onClick={onClose}>
      <section
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <button type="button" className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-lg transition-colors" onClick={onClose} aria-label="Tutup dialog">
            Tutup
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">{actions}</div>
      </section>
    </div>
  );
}
