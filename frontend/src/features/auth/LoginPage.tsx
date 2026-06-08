import { FormEvent } from "react";
import { inputClassName, renderInlineError } from "../../components/ui";
import type { FieldErrors } from "../../utils/validation";

type LoginPageProps = {
  loginForm: { username: string; password: string };
  loginErrors: FieldErrors;
  submitting: boolean;
  isBusy: (actionKey: string) => boolean;
  onFormChange: (field: string, value: string) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function LoginPage({
  loginForm,
  loginErrors,
  submitting,
  isBusy,
  onFormChange,
  onLogin,
}: LoginPageProps) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-sky-100 flex items-center justify-center p-4">
      <section className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <p className="text-xs font-bold tracking-wider text-indigo-500 uppercase mb-2">Portal Operasional</p>
          <h1 className="text-2xl font-bold text-slate-900">Masuk ke Menet-Tech</h1>
        </div>
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
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50 mt-2" disabled={submitting}>
            {isBusy("login") ? "Masuk..." : "Masuk"}
          </button>
        </form>
      </section>
    </main>
  );
}
