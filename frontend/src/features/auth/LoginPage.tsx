import { FormEvent } from "react";
import { StatusPill } from "../../components/StatusPill";
import { inputClassName, renderInlineError } from "../../components/ui";
import { statusTone } from "../../utils/status";
import type { HealthPayload } from "../../lib/api";
import type { FieldErrors } from "../../utils/validation";

type LoginPageProps = {
  health: HealthPayload | null;
  loginForm: { username: string; password: string };
  loginErrors: FieldErrors;
  submitting: boolean;
  isBusy: (actionKey: string) => boolean;
  onFormChange: (field: string, value: string) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function LoginPage({
  health,
  loginForm,
  loginErrors,
  submitting,
  isBusy,
  onFormChange,
  onLogin,
}: LoginPageProps) {
  const databaseTone = statusTone(health?.services.database);
  const workerTone = statusTone(health?.services.worker);
  const appTone = statusTone(health?.status);

  return (
    <main className="page-shell auth-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">go-dev rewrite</p>
          <h1>Masuk ke Menet-Tech Dashboard</h1>
          <p className="hero-copy">
            Backend Go, frontend React, dan SQLite sekarang sudah mulai membentuk
            admin panel baru. Login default bootstrap tetap `admin / password`
            sampai nanti kita pindah ke user management penuh.
          </p>
        </div>
        <div className="hero-panel">
          <div className="panel-row">
            <span>Backend</span>
            <StatusPill label={health?.status ?? "offline"} tone={appTone} />
          </div>
          <div className="panel-row">
            <span>Database</span>
            <StatusPill label={health?.services.database ?? "offline"} tone={databaseTone} />
          </div>
          <div className="panel-row">
            <span>Worker</span>
            <StatusPill label={health?.services.worker ?? "unknown"} tone={workerTone} />
          </div>
          <div className="panel-row">
            <span>Environment</span>
            <strong>{health?.app.environment ?? "development"}</strong>
          </div>
        </div>
      </section>

      <section className="surface auth-card">
        <div className="section-heading">
          <h2>Login</h2>
          <StatusPill label="session cookie" tone="slate" />
        </div>
        <form className="form-grid" onSubmit={onLogin}>
          <label>
            <span>Username</span>
            <input
              className={inputClassName(loginErrors.username)}
              value={loginForm.username}
              onChange={(event) => onFormChange("username", event.target.value)}
            />
            {renderInlineError(loginErrors.username)}
          </label>
          <label>
            <span>Password</span>
            <input
              className={inputClassName(loginErrors.password)}
              type="password"
              value={loginForm.password}
              onChange={(event) => onFormChange("password", event.target.value)}
            />
            {renderInlineError(loginErrors.password)}
          </label>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" disabled={submitting}>
            {isBusy("login") ? "Masuk..." : "Masuk"}
          </button>
        </form>
      </section>
    </main>
  );
}
