import { useState, type FormEvent } from "react";
import { fetchUsers, createUser, updateUser, resetUserPassword } from "../lib/api";
import { validateManagedUser, validatePasswordReset, type FieldErrors } from "../utils/validation";
import type { ManagedUserItem } from "../types";
import { defaultManagedUserForm, type ManagedUserFormState } from "../features/users/UsersPage";
import type { HookDeps } from "./types";

export type PasswordResetState = {
  user: ManagedUserItem;
  password: string;
};

export function useUsers({ withFeedback, onSuccess }: Pick<HookDeps, "withFeedback" | "onSuccess">) {
  const [managedUsers, setManagedUsers] = useState<ManagedUserItem[]>([]);
  const [managedUserForm, setManagedUserForm] = useState<ManagedUserFormState>(defaultManagedUserForm());
  const [managedUserErrors, setManagedUserErrors] = useState<FieldErrors>({});
  const [passwordResetState, setPasswordResetState] = useState<PasswordResetState | null>(null);
  const [passwordResetErrors, setPasswordResetErrors] = useState<FieldErrors>({});

  async function refreshUsers() {
    const payload = await fetchUsers();
    setManagedUsers(payload.data);
  }

  async function handleManagedUserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateManagedUser(managedUserForm);
    setManagedUserErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await withFeedback(async () => {
      await createUser(managedUserForm);
      setManagedUserErrors({});
      setManagedUserForm(defaultManagedUserForm());
      onSuccess("User baru berhasil ditambahkan.");
      await refreshUsers();
    }, "save-user");
  }

  async function handleManagedUserUpdate(item: ManagedUserItem, patch: Partial<ManagedUserItem>) {
    await withFeedback(async () => {
      await updateUser(item.id, { role: patch.role ?? item.role, is_active: patch.is_active ?? item.is_active });
      onSuccess("User berhasil diperbarui.");
      await refreshUsers();
    });
  }

  function handleResetUserPassword(item: ManagedUserItem) {
    setPasswordResetErrors({});
    setPasswordResetState({ user: item, password: "" });
  }

  async function handlePasswordResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordResetState) return;
    const nextErrors = validatePasswordReset(passwordResetState.password);
    setPasswordResetErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const target = passwordResetState.user;
    await withFeedback(async () => {
      await resetUserPassword(target.id, passwordResetState.password.trim());
      setPasswordResetErrors({});
      setPasswordResetState(null);
      onSuccess(`Password untuk ${target.username} berhasil direset.`);
    });
  }

  return {
    state: { managedUsers, managedUserForm, managedUserErrors, passwordResetState, passwordResetErrors },
    handlers: { setManagedUsers, setManagedUserForm, setPasswordResetState, refreshUsers, handleManagedUserSubmit, handleManagedUserUpdate, handleResetUserPassword, handlePasswordResetSubmit },
  };
}
