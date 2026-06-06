import { type FormEvent } from "react";
import { inputClassName, renderInlineError } from "../../../components/ui";
import { type CustomerItem, type PackageItem, type User } from "../../../types";
import { type FieldErrors } from "../../../utils/validation";
import { type CustomerFormState } from "../CustomersPage";

type CustomerFormCardProps = {
  user: User | null;
  packages: PackageItem[];
  customers: CustomerItem[];
  customerForm: CustomerFormState;
  customerErrors: FieldErrors;
  editingCustomerId: number | null;
  submitting: boolean;
  busyAction: string | null;
  onFormChange: (updater: (current: CustomerFormState) => CustomerFormState) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onCancelEdit: () => void;
};

export function CustomerFormCard({
  user,
  packages,
  customers,
  customerForm,
  customerErrors,
  editingCustomerId,
  submitting,
  busyAction,
  onFormChange,
  onSubmit,
  onCancelEdit,
}: CustomerFormCardProps) {
  const isBusy = (actionKey: string) => submitting && busyAction === actionKey;

  if (user?.role === "viewer") return null;

  return (
    <article className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-900">
          {editingCustomerId ? "Edit Pelanggan" : "Tambah Pelanggan"}
        </h2>
      </div>
      <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={onSubmit}>
        <label>
          <span>Nama</span>
          <input
            className={inputClassName(customerErrors.name)}
            value={customerForm.name}
            onChange={(e) => onFormChange((curr) => ({ ...curr, name: e.target.value }))}
          />
          {renderInlineError(customerErrors.name)}
        </label>
        <label>
          <span>Paket</span>
          <select
            className={inputClassName(customerErrors.package_id)}
            value={customerForm.package_id}
            onChange={(e) =>
              onFormChange((curr) => ({
                ...curr,
                package_id: Number(e.target.value),
              }))
            }
          >
            <option value={0}>Pilih paket</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} - {pkg.speed_mbps} Mbps
              </option>
            ))}
          </select>
          {renderInlineError(customerErrors.package_id)}
        </label>
        <label>
          <span>User PPPoE</span>
          <input
            className={inputClassName(customerErrors.user_pppoe)}
            value={customerForm.user_pppoe}
            onChange={(e) =>
              onFormChange((curr) => ({
                ...curr,
                user_pppoe: e.target.value,
              }))
            }
          />
          {renderInlineError(customerErrors.user_pppoe)}
        </label>
        <label>
          <span>Password PPPoE</span>
          <input
            className={inputClassName(customerErrors.password_pppoe)}
            value={customerForm.password_pppoe}
            onChange={(e) =>
              onFormChange((curr) => ({
                ...curr,
                password_pppoe: e.target.value,
              }))
            }
          />
          {renderInlineError(customerErrors.password_pppoe)}
        </label>
        <label>
          <span>Nomor WhatsApp</span>
          <input
            className={inputClassName()}
            value={customerForm.whatsapp}
            onChange={(e) =>
              onFormChange((curr) => ({
                ...curr,
                whatsapp: e.target.value,
              }))
            }
          />
        </label>
        <label>
          <span>SN ONT</span>
          <input
            className={inputClassName()}
            value={customerForm.sn_ont}
            onChange={(e) =>
              onFormChange((curr) => ({ ...curr, sn_ont: e.target.value }))
            }
          />
        </label>
        <label>
          <span>Tanggal Jatuh Tempo Bulanan</span>
          <input
            className={inputClassName(customerErrors.due_day)}
            type="number"
            min={1}
            max={31}
            value={customerForm.due_day}
            onChange={(e) =>
              onFormChange((curr) => ({
                ...curr,
                due_day: Number(e.target.value),
              }))
            }
          />
          {renderInlineError(customerErrors.due_day)}
        </label>
        <label>
          <span>Status</span>
          <select
            className={inputClassName()}
            value={customerForm.status}
            onChange={(e) =>
              onFormChange((curr) => ({
                ...curr,
                status: e.target.value as CustomerItem["status"],
              }))
            }
          >
            <option value="active">Active</option>
            <option value="limit">Limit</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label>
          <span>Diskon Bulanan (Rp)</span>
          <input
            type="number"
            className={inputClassName()}
            value={customerForm.diskon}
            onChange={(e) =>
              onFormChange((curr) => ({ ...curr, diskon: Number(e.target.value) || 0 }))
            }
          />
        </label>
        <label>
          <span>Saldo Referral Reward (Rp)</span>
          <input
            type="number"
            className={inputClassName()}
            value={customerForm.referral_balance}
            onChange={(e) =>
              onFormChange((curr) => ({ ...curr, referral_balance: Number(e.target.value) || 0 }))
            }
          />
        </label>
        <label className="col-span-full">
          <span>Direkomendasikan Oleh (Referral)</span>
          <select
            className={inputClassName()}
            value={customerForm.referred_by_id}
            onChange={(e) =>
              onFormChange((curr) => ({
                ...curr,
                referred_by_id: Number(e.target.value) || 0,
              }))
            }
          >
            <option value={0}>Tidak ada (Pilih pelanggan)</option>
            {customers
              .filter((c) => c.id !== editingCustomerId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.whatsapp || "Tanpa WA"})
                </option>
              ))}
          </select>
        </label>
        <label className="col-span-full">
          <span>Alamat</span>
          <textarea
            className={inputClassName()}
            rows={4}
            value={customerForm.address}
            onChange={(e) =>
              onFormChange((curr) => ({ ...curr, address: e.target.value }))
            }
          />
        </label>
        <div className="flex gap-3 mt-4">
          <button
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            disabled={submitting}
          >
            {isBusy("save-customer")
              ? "Menyimpan..."
              : editingCustomerId
              ? "Update Pelanggan"
              : "Simpan Pelanggan"}
          </button>
          {editingCustomerId && (
            <button
              type="button"
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              onClick={onCancelEdit}
            >
              Batal Edit
            </button>
          )}
        </div>
      </form>
    </article>
  );
}
