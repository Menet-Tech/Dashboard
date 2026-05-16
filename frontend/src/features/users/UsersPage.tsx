import type { FormEvent } from "react";
import { StatusPill, inputClassName, renderInlineError, EmptyTableRow } from "../../components/ui";
import type { ManagedUserItem } from "../../types";
import type { FieldErrors } from "../../utils/validation";

export type ManagedUserFormState = {
  username: string;
  password: "";
  role: string;
};

export const defaultManagedUserForm = (): ManagedUserFormState => ({
  username: "",
  password: "",
  role: "petugas",
});

type UsersPageProps = {
  managedUsers: ManagedUserItem[];
  managedUserForm: ManagedUserFormState;
  managedUserErrors: FieldErrors;
  submitting: boolean;
  busyAction: string | null;
  onFormChange: (updater: (current: ManagedUserFormState) => ManagedUserFormState) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onUpdateRole: (item: ManagedUserItem, role: string) => void;
  onUpdateStatus: (item: ManagedUserItem, isActive: boolean) => void;
  onResetPassword: (item: ManagedUserItem) => void;
};

export function UsersPage({
  managedUsers,
  managedUserForm,
  managedUserErrors,
  submitting,
  busyAction,
  onFormChange,
  onSubmit,
  onUpdateRole,
  onUpdateStatus,
  onResetPassword,
}: UsersPageProps) {
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;

  return (
    <section className="grid feature-grid">
      <article className="surface">
        <div className="section-heading">
          <h2>Tambah User Tim</h2>
        </div>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            <span>Username</span>
            <input
              className={inputClassName(managedUserErrors.username)}
              value={managedUserForm.username}
              onChange={(e) => onFormChange((curr) => ({ ...curr, username: e.target.value }))}
            />
            {renderInlineError(managedUserErrors.username)}
          </label>
          <label>
            <span>Password Awal</span>
            <input
              className={inputClassName(managedUserErrors.password)}
              type="password"
              value={managedUserForm.password}
              onChange={(e) => onFormChange((curr) => ({ ...curr, password: e.target.value as "" }))}
            />
            {renderInlineError(managedUserErrors.password)}
          </label>
          <label>
            <span>Role</span>
            <select
              value={managedUserForm.role}
              onChange={(e) => onFormChange((curr) => ({ ...curr, role: e.target.value }))}
            >
              <option value="petugas">Petugas</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={submitting}>
              {isBusy("save-user") ? "Menyimpan..." : "Simpan User"}
            </button>
          </div>
        </form>
        <p className="muted top-gap">
          Gunakan akun `petugas` untuk operasional harian dan sisakan `admin` hanya untuk konfigurasi
          dan audit.
        </p>
      </article>

      <article className="surface">
        <div className="section-heading">
          <h2>Daftar User</h2>
          <StatusPill label={`${managedUsers.length} user`} tone="slate" />
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Terakhir Login</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {managedUsers.length === 0 ? (
                <EmptyTableRow message="Belum ada user tim tambahan." colSpan={5} />
              ) : (
                managedUsers.map((item) => (
                  <tr key={item.id}>
                    <td>{item.username}</td>
                    <td>
                      <select
                        value={item.role}
                        onChange={(e) => onUpdateRole(item, e.target.value)}
                      >
                        <option value="petugas">Petugas</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={item.is_active ? "1" : "0"}
                        onChange={(e) => onUpdateStatus(item, e.target.value === "1")}
                      >
                        <option value="1">Aktif</option>
                        <option value="0">Nonaktif</option>
                      </select>
                    </td>
                    <td>
                      {item.last_login_at ? (
                        <div className="flex flex-col text-sm">
                          <span>{new Date(item.last_login_at).toLocaleString("id-ID")}</span>
                          <span className="muted">{item.last_login_ip || "-"}</span>
                        </div>
                      ) : (
                        <span className="muted">Belum pernah</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => onResetPassword(item)}
                      >
                        Reset Password
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
