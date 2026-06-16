import { type FormEvent } from "react";
import { inputClassName, renderInlineError } from "../../../components/ui";
import { type CustomerItem, type PackageItem, type User, type OdpItem } from "../../../types";
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
  odps: OdpItem[];
};

export function CustomerFormCard({
  user,
  packages,
  customers,
  customerForm,
  customerErrors,
  editingCustomerId,
  onFormChange,
  onSubmit,
  odps,
}: CustomerFormCardProps) {
  if (user?.role === "viewer") return null;

  return (
    <form className="grid grid-cols-1 md:grid-cols-2 gap-6" id="customer-form" onSubmit={onSubmit}>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Nama Pelanggan</span>
        <input
          className={inputClassName(customerErrors.name)}
          value={customerForm.name}
          onChange={(e) => onFormChange((curr) => ({ ...curr, name: e.target.value }))}
          placeholder="Nama Lengkap"
        />
        {renderInlineError(customerErrors.name)}
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-355">Paket Internet</span>
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
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-350">User PPPoE</span>
        <input
          className={inputClassName(customerErrors.user_pppoe)}
          value={customerForm.user_pppoe}
          onChange={(e) =>
            onFormChange((curr) => ({
              ...curr,
              user_pppoe: e.target.value,
            }))
          }
          placeholder="Username PPPoE"
        />
        {renderInlineError(customerErrors.user_pppoe)}
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Password PPPoE</span>
        <input
          className={inputClassName(customerErrors.password_pppoe)}
          value={customerForm.password_pppoe}
          onChange={(e) =>
            onFormChange((curr) => ({
              ...curr,
              password_pppoe: e.target.value,
            }))
          }
          placeholder="Password PPPoE"
        />
        {renderInlineError(customerErrors.password_pppoe)}
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Nomor WhatsApp</span>
        <input
          className={inputClassName()}
          value={customerForm.whatsapp}
          onChange={(e) =>
            onFormChange((curr) => ({
              ...curr,
              whatsapp: e.target.value,
            }))
          }
          placeholder="contoh: 62812345678"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-350">SN ONT</span>
        <input
          className={inputClassName()}
          value={customerForm.sn_ont}
          onChange={(e) =>
            onFormChange((curr) => ({ ...curr, sn_ont: e.target.value }))
          }
          placeholder="Serial Number ONT"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Tanggal Jatuh Tempo Bulanan</span>
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
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Status Layanan</span>
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

      {/* ODP Node selector */}
      <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Titik Distribusi ODP</span>
          <select
            className={inputClassName()}
            value={customerForm.odp_id || 0}
            onChange={(e) => {
              const nextOdpId = Number(e.target.value) || 0;
              onFormChange((curr) => ({
                ...curr,
                odp_id: nextOdpId,
                odp_port: nextOdpId > 0 ? 1 : undefined,
              }));
            }}
          >
            <option value={0}>Pilih ODP (Jika ada)</option>
            {odps.map((odp) => (
              <option key={odp.id} value={odp.id}>
                {odp.nama} - {odp.lokasi}
              </option>
            ))}
          </select>
        </label>

        {(customerForm.odp_id || 0) > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Port ODP</span>
            <select
              className={inputClassName()}
              value={customerForm.odp_port || 1}
              onChange={(e) =>
                onFormChange((curr) => ({
                  ...curr,
                  odp_port: Number(e.target.value),
                }))
              }
            >
              {Array.from(
                { length: odps.find((o) => o.id === customerForm.odp_id)?.ports || 8 },
                (_, i) => i + 1
              ).map((portNum) => (
                <option key={portNum} value={portNum}>
                  Port {portNum}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="col-span-full flex flex-col gap-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Direkomendasikan Oleh (Referral)</span>
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
      <label className="col-span-full flex flex-col gap-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Alamat Pemasangan</span>
        <textarea
          className={inputClassName()}
          rows={3}
          value={customerForm.address}
          onChange={(e) =>
            onFormChange((curr) => ({ ...curr, address: e.target.value }))
          }
          placeholder="Alamat lengkap lokasi pemasangan"
        />
      </label>
    </form>
  );
}
