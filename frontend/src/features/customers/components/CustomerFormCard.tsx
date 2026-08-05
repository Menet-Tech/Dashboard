import { type FormEvent, useState, useEffect } from "react";
import { Sparkles, Calendar } from "lucide-react";
import { inputClassName, renderInlineError } from "../../../components/ui";
import { type CustomerItem, type PackageItem, type User, type OdpItem } from "../../../types";
import { type FieldErrors } from "../../../utils/validation";
import { type CustomerFormState } from "../CustomersPage";
import { Button } from "../../../components/ui/Button";

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

function calculateTrialDueDay(trialDays: number): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const rawTarget = date + trialDays + 5;
  return rawTarget > lastDayOfMonth ? lastDayOfMonth : rawTarget;
}

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
  odps,
}: CustomerFormCardProps) {
  const isEditing = Boolean(editingCustomerId);
  const [localForm, setLocalForm] = useState<CustomerFormState>(customerForm);

  useEffect(() => {
    setLocalForm(customerForm);
  }, [customerForm]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // @ts-ignore
    onSubmit(e, localForm);
  };

  return (
    <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200 uppercase tracking-wider">
            {isEditing ? "Edit Pelanggan" : "Tambah Pelanggan Baru"}
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {isEditing
              ? "Perbarui informasi layanan pelanggan yang dipilih."
              : "Isi data berikut untuk mendaftarkan pelanggan baru."}
          </p>
        </div>
        {isEditing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancelEdit}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 underline"
          >
            Batal Edit
          </Button>
        )}
      </div>

      <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">
            Nama Pelanggan *
          </span>
          <input
            autoFocus={true}
            className={inputClassName(customerErrors.name)}
            value={localForm.name}
            onChange={(e) =>
              setLocalForm((curr) => ({ ...curr, name: e.target.value }))
            }
            placeholder="Masukkan nama pelanggan"
          />
          {renderInlineError(customerErrors.name)}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">
            Paket Layanan *
          </span>
          <select
            className={inputClassName(customerErrors.package_id)}
            value={localForm.package_id || ""}
            onChange={(e) =>
              setLocalForm((curr) => ({
                ...curr,
                package_id: Number(e.target.value),
              }))
            }
          >
            <option value="" disabled>
              -- Pilih Paket --
            </option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} - {pkg.speed_mbps} Mbps (Rp{" "}
                {pkg.price.toLocaleString("id-ID")})
              </option>
            ))}
          </select>
          {renderInlineError(customerErrors.package_id)}
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">
              Username PPPoE
            </span>
            <input
              className={inputClassName()}
              value={localForm.user_pppoe}
              onChange={(e) =>
                setLocalForm((curr) => ({ ...curr, user_pppoe: e.target.value }))
              }
              placeholder="Username login PPPoE"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">
              Password PPPoE
            </span>
            <input
              className={inputClassName()}
              value={localForm.password_pppoe}
              onChange={(e) =>
                setLocalForm((curr) => ({
                  ...curr,
                  password_pppoe: e.target.value,
                }))
              }
              placeholder="Password login PPPoE"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">
              Nomor WhatsApp
            </span>
            <input
              className={inputClassName(customerErrors.whatsapp)}
              value={localForm.whatsapp}
              onChange={(e) =>
                setLocalForm((curr) => ({ ...curr, whatsapp: e.target.value }))
              }
              placeholder="Contoh: 08123456789"
            />
            {renderInlineError(customerErrors.whatsapp)}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">
              Email
            </span>
            <input
              className={inputClassName()}
              type="email"
              value={localForm.email}
              onChange={(e) =>
                setLocalForm((curr) => ({ ...curr, email: e.target.value }))
              }
              placeholder="Alamat email pelanggan"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">
            Alamat Pelanggan
          </span>
          <textarea
            rows={2}
            className={inputClassName()}
            value={localForm.address}
            onChange={(e) =>
              setLocalForm((curr) => ({ ...curr, address: e.target.value }))
            }
            placeholder="Alamat lengkap lokasi pemasangan"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">
            Serial Number ONT
          </span>
          <input
            className={inputClassName()}
            value={localForm.sn_ont}
            onChange={(e) =>
              setLocalForm((curr) => ({ ...curr, sn_ont: e.target.value }))
            }
            placeholder="Serial Number ONT"
          />
        </label>

        <div className="pt-2">
          <label className="relative flex items-center justify-between p-3.5 rounded-card border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all cursor-pointer select-none group shadow-xs">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl transition-colors ${localForm.status === "trial" || localForm.is_trial ? "bg-indigo-600 text-white shadow-xs" : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
                <Sparkles size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 dark:text-slate-200">
                    Aktifkan Masa Trial (Percobaan)
                  </span>
                  {(localForm.status === "trial" || localForm.is_trial) && (
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-955/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      Trial Aktif
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Uji coba gratis tanpa tagihan awal selama durasi trial.
                </p>
              </div>
            </div>

            <div className="relative inline-flex items-center shrink-0 ml-3">
              <input
                type="checkbox"
                id="is_trial"
                className="sr-only peer"
                checked={localForm.status === "trial" || localForm.is_trial}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setLocalForm((curr) => {
                    const nextStatus = checked ? "trial" : "active";
                    let nextDueDay = curr.due_day;
                    if (checked) {
                      nextDueDay = calculateTrialDueDay(curr.trial_days || 3);
                    }
                    return {
                      ...curr,
                      is_trial: checked,
                      status: nextStatus,
                      due_day: nextDueDay,
                    };
                  });
                }}
              />
              <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-xs peer-checked:bg-indigo-600"></div>
            </div>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Status Layanan</span>
          <select
            className={inputClassName()}
            value={localForm.status}
            onChange={(e) => {
              const nextStatus = e.target.value as CustomerItem["status"];
              const isTrial = nextStatus === "trial";
              setLocalForm((curr) => {
                let nextDueDay = curr.due_day;
                if (isTrial) {
                  nextDueDay = calculateTrialDueDay(curr.trial_days || 3);
                } else if (nextStatus === "wifi_umum") {
                  nextDueDay = 1;
                }
                return {
                  ...curr,
                  status: nextStatus,
                  is_trial: isTrial,
                  due_day: nextDueDay,
                };
              });
            }}
          >
            <option value="active">Active</option>
            <option value="limit">Limit</option>
            <option value="pending">Pending (Perpanjangan)</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
            <option value="trial">Trial</option>
            <option value="wifi_umum">🛜 WiFi Umum (Fasilitas Umum)</option>
          </select>
        </label>

        {/* Trial days — only visible when status is "trial" or is_trial is true */}
        {(localForm.status === "trial" || localForm.is_trial) && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">
              Durasi Trial (Hari)
            </span>
            <input
              type="number"
              min={1}
              max={365}
              className={inputClassName()}
              value={localForm.trial_days}
              onChange={(e) => {
                const val = Math.max(1, Number(e.target.value));
                setLocalForm((curr) => {
                  return {
                    ...curr,
                    trial_days: val,
                    is_trial: true,
                    due_day: calculateTrialDueDay(val),
                  };
                });
              }}
              placeholder="Jumlah hari trial"
            />
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Pelanggan akan otomatis diset sebagai pelanggan trial.
            </span>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-355">Tanggal Jatuh Tempo Bulanan</span>
          <select
            className={inputClassName(customerErrors.due_day)}
            value={localForm.due_day}
            disabled={localForm.status === "wifi_umum"}
            onChange={(e) =>
              setLocalForm((curr) => ({
                ...curr,
                due_day: Number(e.target.value),
              }))
            }
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                Tanggal {day}
              </option>
            ))}
          </select>
          {renderInlineError(customerErrors.due_day)}
          {localForm.status === "wifi_umum" ? (
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
              🛜 WiFi Umum gratis / fasilitas umum — tidak memerlukan tanggal jatuh tempo & tidak dibuatkan tagihan.
            </span>
          ) : (localForm.status === "trial" || localForm.is_trial) ? (
            <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1 mt-0.5">
              <Calendar size={12} className="shrink-0" />
              Tanggal jatuh tempo dihitung otomatis: Hari ini + {localForm.trial_days || 3} hari trial + 5 hari jeda = Tanggal {localForm.due_day}
            </span>
          ) : null}
        </label>

      {/* ODP Node selector */}
      <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Titik Distribusi ODP</span>
          <select
            className={inputClassName()}
            value={localForm.odp_id || 0}
            onChange={(e) => {
              const nextOdpId = Number(e.target.value) || 0;
              // Find the first available port for this ODP
              let firstAvailablePort = 1;
              if (nextOdpId > 0) {
                const totalPorts = odps.find((o) => o.id === nextOdpId)?.ports || 8;
                const taken = customers
                  .filter((c) => c.odp_id === nextOdpId && c.id !== editingCustomerId)
                  .map((c) => c.odp_port)
                  .filter(Boolean) as number[];
                for (let p = 1; p <= totalPorts; p++) {
                  if (!taken.includes(p)) {
                    firstAvailablePort = p;
                    break;
                  }
                }
              }
              setLocalForm((curr) => ({
                ...curr,
                odp_id: nextOdpId,
                odp_port: nextOdpId > 0 ? firstAvailablePort : undefined,
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

        {(localForm.odp_id || 0) > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Port ODP</span>
            <select
              className={inputClassName()}
              value={localForm.odp_port || 1}
              onChange={(e) =>
                setLocalForm((curr) => ({
                  ...curr,
                  odp_port: Number(e.target.value),
                }))
              }
            >
              {Array.from(
                { length: odps.find((o) => o.id === localForm.odp_id)?.ports || 8 },
                (_, i) => i + 1
              )
                .filter((portNum) => {
                  // Only show ports that are not occupied by other customers (exclude current editing customer)
                  const isOccupied = customers.some(
                    (c) => c.odp_id === localForm.odp_id && c.odp_port === portNum && c.id !== editingCustomerId
                  );
                  return !isOccupied;
                })
                .map((portNum) => (
                  <option key={portNum} value={portNum}>
                    Port {portNum}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>

      <label className="col-span-full flex flex-col gap-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Direkomendasikan Oleh (Referral)</span>
        <select
          className={inputClassName()}
          value={localForm.referred_by_id}
          onChange={(e) =>
            setLocalForm((curr) => ({
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
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 dark:text-slate-350">Alamat Pemasangan</span>
        <textarea
          className={inputClassName()}
          rows={3}
          value={localForm.address}
          onChange={(e) =>
            setLocalForm((curr) => ({ ...curr, address: e.target.value }))
          }
          placeholder="Alamat lengkap lokasi pemasangan"
        />
      </label>
    </form>
  </article>
  );
}

function formatWhatsAppNumber(val: string): string {
  let clean = val.replace(/[^\d+]/g, "");
  
  if (clean.startsWith("+62")) {
    clean = "62" + clean.slice(3);
  }
  
  if (/^[89]/.test(clean)) {
    clean = "0" + clean;
  }

  if (clean.startsWith("62")) {
    const rest = clean.slice(2).replace(/\D/g, "");
    let formatted = "+62";
    if (rest.length > 0) {
      formatted += " ";
      if (rest.length <= 3) {
        formatted += rest;
      } else if (rest.length <= 7) {
        formatted += `${rest.slice(0, 3)}-${rest.slice(3)}`;
      } else {
        formatted += `${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7, 12)}`;
      }
    }
    return formatted;
  } else if (clean.startsWith("0")) {
    const rest = clean.slice(1).replace(/\D/g, "");
    let formatted = "0";
    if (rest.length > 0) {
      if (rest.length <= 3) {
        formatted += rest;
      } else if (rest.length <= 7) {
        formatted += `${rest.slice(0, 3)}-${rest.slice(3)}`;
      } else {
        formatted += `${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7, 12)}`;
      }
    }
    return formatted;
  }
  return clean;
}
