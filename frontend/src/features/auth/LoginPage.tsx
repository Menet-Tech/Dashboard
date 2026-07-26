import { FormEvent } from "react";
import { inputClassName, renderInlineError, Button } from "../../components/ui";
import type { FieldErrors } from "../../utils/validation";
import { XCircle } from "lucide-react";

type LoginPageProps = {
  loginForm: { username: string; password: string };
  loginErrors: FieldErrors;
  loginApiError: string | null;
  submitting: boolean;
  isBusy: (actionKey: string) => boolean;
  onFormChange: (field: string, value: string) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function LoginPage({
  loginForm,
  loginErrors,
  loginApiError,
  submitting,
  isBusy,
  onFormChange,
  onLogin,
}: LoginPageProps) {
  const displayMessage = loginApiError === "Failed to fetch"
    ? "Gagal terhubung ke server. Pastikan backend/API server Anda sudah berjalan (offline)."
    : loginApiError;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-sky-100 flex items-center justify-center p-4">
      <section className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <p className="text-xs font-bold tracking-wider text-indigo-500 uppercase mb-2">Portal Operasional</p>
          <h1 className="text-2xl font-bold text-slate-900">Masuk ke Menet-Tech</h1>
        </div>

        {displayMessage && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start gap-2.5 shadow-sm">
            <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold mb-0.5">Gagal Masuk</p>
              <p className="opacity-90 leading-relaxed">{displayMessage}</p>
            </div>
          </div>
        )}
        <form className="flex flex-col gap-5" onSubmit={onLogin}>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Username</span>
            <input
              className={inputClassName(loginErrors.username)}
              value={loginForm.username}
              onChange={(event) => onFormChange("username", event.target.value)}
            />
            {renderInlineError(loginErrors.username)}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Password</span>
            <input
              className={inputClassName(loginErrors.password)}
              type="password"
              value={loginForm.password}
              onChange={(event) => onFormChange("password", event.target.value)}
            />
            {renderInlineError(loginErrors.password)}
          </label>
          <Button 
            variant="primary" 
            isLoading={isBusy("login") || submitting} 
            className="w-full mt-2" 
            type="submit"
          >
            Masuk
          </Button>
        </form>
      </section>
    </main>
  );
}
