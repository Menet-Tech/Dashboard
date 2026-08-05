import { Button } from "./Button";
import type { ReactNode } from "react";
import { useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";

type ModalShellProps = {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  zIndexClass?: string;
};

/**
 * Modal with:
 * - Focus trap (keyboard navigation stays within modal)
 * - Escape key closes modal
 * - aria-labelledby pointing to the title heading
 * - Initial focus on first focusable element
 * - WCAG 2.1.1, 2.4.3, 4.1.2 compliant
 */
export function Modal({ title, children, actions, onClose, zIndexClass = "z-[80]" }: ModalShellProps) {
  const modalRef = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;

    // Find all focusable elements within the modal
    const focusableSelectors =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () =>
      Array.from(el.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
        (node) => !node.closest("[hidden]")
      );

    // Set initial focus on first focusable element
    const focusables = getFocusable();
    focusables[0]?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      const current = getFocusable();
      if (current.length === 0) return;

      const first = current[0];
      const last = current[current.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: going backwards
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: going forwards
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className={`fixed inset-0 bg-slate-950/40 backdrop-blur-sm ${zIndexClass} flex items-center justify-center p-4`}
      role="presentation"
      onClick={onClose}
    >
      <section
        ref={modalRef}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-card shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
          <h2
            id={titleId}
            className="text-xl font-semibold text-gray-900 dark:text-slate-50 dark:text-slate-100 font-sans"
          >
            {title}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Tutup dialog"
          >
            Tutup
          </Button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
        {actions && (
          <div className="p-6 border-t border-slate-100 bg-slate-50 dark:bg-slate-950 dark:bg-slate-900/50 dark:border-slate-800 flex items-center justify-end gap-3">
            {actions}
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}
