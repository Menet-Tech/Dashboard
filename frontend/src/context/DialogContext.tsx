import React, { createContext, useContext, useState, ReactNode } from "react";
import { Modal } from "../components/ui/Modal";

type DialogType = "alert" | "confirm";

type DialogState = {
  type: DialogType;
  title: string;
  message: string;
  resolve: (value: boolean) => void;
};

type DialogContextType = {
  showAlert: (message: string, title?: string) => Promise<void>;
  showConfirm: (message: string, title?: string) => Promise<boolean>;
};

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const showAlert = (message: string, title?: string) => {
    return new Promise<void>((resolve) => {
      setDialog({
        type: "alert",
        title: title || "Pemberitahuan",
        message,
        resolve: () => {
          setDialog(null);
          resolve();
        },
      });
    });
  };

  const showConfirm = (message: string, title?: string) => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        type: "confirm",
        title: title || "Konfirmasi",
        message,
        resolve: (result) => {
          setDialog(null);
          resolve(result);
        },
      });
    });
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialog && (
        <Modal
          title={dialog.title}
          onClose={() => dialog.resolve(false)}
          actions={
            dialog.type === "confirm" ? (
              <>
                <button
                  type="button"
                  className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors cursor-pointer text-sm"
                  onClick={() => dialog.resolve(false)}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors cursor-pointer text-sm"
                  onClick={() => dialog.resolve(true)}
                >
                  Ya, Lanjutkan
                </button>
              </>
            ) : (
              <button
                type="button"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors cursor-pointer text-sm"
                onClick={() => dialog.resolve(true)}
              >
                OK
              </button>
            )
          }
        >
          <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">{dialog.message}</p>
        </Modal>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
}
