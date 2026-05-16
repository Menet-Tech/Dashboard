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
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Tambah User Tim</h2>
        </div>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={onSubmit}>
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
              className={inputClassName()}
              value={managedUserForm.role}
              onChange={(e) => onFormChange((curr) => ({ ...curr, role: e.target.value }))}
            >
              <option value="petugas">Petugas</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <div className="flex gap-3 mt-4">
            <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50" disabled={submitting}>
              {isBusy("save-user") ? "Menyimpan..." : "Simpan User"}
            </button>
          </div>
        </form>
        <div className="border-t border-slate-100 pt-6 mt-6">
          <p className="text-xs text-slate-400 leading-relaxed flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            Gunakan akun <code className="bg-slate-50 px-1 rounded">petugas</code> untuk operasional harian dan sisakan <code className="bg-slate-50 px-1 rounded">admin</code> hanya untuk konfigurasi dan audit.
          </p>
        </div>
      </article>

      <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-slate-900">Daftar User</h2>
          <StatusPill label={`${managedUsers.length} user`} tone="slate" />
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-medium">Username</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Terakhir Login</th>
                <th className="px-6 py-4 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {managedUsers.length === 0 ? (
                <EmptyTableRow message="Belum ada user tim tambahan." colSpan={5} />
              ) : (
                managedUsers.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-700">{item.username}</td>
                    <td className="px-6 py-4 text-gray-700">
                      <select
                        className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        value={item.role}
                        onChange={(e) => onUpdateRole(item, e.target.value)}
                      >
                        <option value="petugas">Petugas</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      <select
                        className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        value={item.is_active ? "1" : "0"}
                        onChange={(e) => onUpdateStatus(item, e.target.value === "1")}
                      >
                        <option value="1">Aktif</option>
                        <option value="0">Nonaktif</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {item.last_login_at ? (
                        <div className="flex flex-col text-sm">
                          <span>{new Date(item.last_login_at).toLocaleString("id-ID")}</span>
                          <span className="muted">{item.last_login_ip || "-"}</span>
                        </div>
                      ) : (
                        <span className="muted">Belum pernah</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      <button
                        type="button"
                        className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
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
