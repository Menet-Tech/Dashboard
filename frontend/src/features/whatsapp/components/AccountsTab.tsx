import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { inputClassName } from "../../../components/ui";
import { getGatewayAccounts, type GatewayAccount } from "../../../lib/gatewayApi";

type AccountsTabProps = {
  loading: boolean;
  accounts: GatewayAccount[];
  setAccounts: React.Dispatch<React.SetStateAction<GatewayAccount[]>>;
  gatewayUrl: string;
  apiKey?: string;
  gatewayError: string | null;
  setGatewayError: React.Dispatch<React.SetStateAction<string | null>>;
  canDecrypt: boolean;
  pushSuccess: (msg: string) => void;
  pushError: (msg: string) => void;
  onScanQrClick: (id: string) => void;
  onDeleteAccount: (id: string) => void;
  onAddAccount: (id: string, label: string) => Promise<void>;
};

export function AccountsTab({
  loading,
  accounts,
  setAccounts,
  gatewayUrl,
  apiKey,
  gatewayError,
  setGatewayError,
  canDecrypt,
  pushSuccess,
  pushError,
  onScanQrClick,
  onDeleteAccount,
  onAddAccount,
}: AccountsTabProps) {
  const [newAccountId, setNewAccountId] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountId.trim()) {
      pushError("Account ID wajib diisi");
      return;
    }
    await onAddAccount(newAccountId, newAccountLabel);
    setNewAccountId("");
    setNewAccountLabel("");
  };

  return (
    <div className="grid md:grid-cols-3 gap-6">
      {/* Account List */}
      <div className="md:col-span-2 space-y-4">
        <h3 className="text-md font-bold text-slate-900">Daftar Akun WhatsApp</h3>
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center p-8 bg-slate-50 rounded-xl border border-slate-200">
            {gatewayError ? (
              <>
                <p className="font-semibold text-rose-600 mb-1">Gateway tidak dapat dijangkau</p>
                <p className="text-xs text-slate-500">Pastikan service WhatsApp Gateway berjalan di <code>{gatewayUrl}</code></p>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-700 mb-1">Belum ada akun gateway terdaftar</p>
                <p className="text-xs text-slate-500 mb-4">Tambahkan akun baru di panel sebelah kanan, atau tunggu sebentar jika gateway baru saja dimulai.</p>
                {canDecrypt && apiKey && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await getGatewayAccounts(gatewayUrl, apiKey!);
                        setAccounts(res.data);
                        setGatewayError(null);
                        pushSuccess("Daftar akun diperbarui");
                      } catch (err: any) {
                        pushError(err?.message || "Gagal memuat akun");
                      }
                    }}
                  >
                    Refresh Daftar Akun
                  </Button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {accounts.map((acc) => (
              <div
                key={acc.accountId}
                className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="font-bold text-slate-950 text-md">{acc.accountId}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">WhatsApp Client Account</p>
                  </div>
                  {acc.ready ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Connected
                    </span>
                  ) : acc.hasQr ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Scan QR Needed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs font-semibold bg-slate-50 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      Offline
                    </span>
                  )}
                </div>

                <div className="flex gap-2 mt-2 pt-2 border-t border-slate-50 justify-end">
                  {canDecrypt && !acc.ready && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => onScanQrClick(acc.accountId)}
                      className="!bg-indigo-50 hover:!bg-indigo-100 !text-indigo-600 hover:!text-indigo-700 border-transparent"
                    >
                      Scan QR
                    </Button>
                  )}
                  {canDecrypt && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => onDeleteAccount(acc.accountId)}
                      title="Hapus Akun"
                    >
                      <Trash2 size={15} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Account Form */}
      {canDecrypt ? (
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 h-fit">
          <h3 className="text-md font-bold text-slate-900 mb-4">Tambah Akun Baru</h3>

          {/* API key missing warning */}
          {!apiKey && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-bold mb-1">⚠ API Key belum dikonfigurasi</p>
              <p>Buka <strong>Pengaturan → WhatsApp Gateway</strong> dan isi field <code>wa_api_key</code> agar sama dengan nilai <code>API_KEY</code> di file <code>whatsapp/.env</code>.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600 block mb-1">Account ID (slug / nama)</span>
              <input
                type="text"
                required
                value={newAccountId}
                onChange={(e) => setNewAccountId(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ""))}
                placeholder="Contoh: CS-Admin-1"
                className={inputClassName()}
              />
              <span className="text-[10px] text-slate-400 block mt-1">Hanya huruf, angka, dash, dan underscore.</span>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600 block mb-1">Label Deskripsi</span>
              <input
                type="text"
                value={newAccountLabel}
                onChange={(e) => setNewAccountLabel(e.target.value)}
                placeholder="Contoh: Akun Customer Service Utama"
                className={inputClassName()}
              />
            </label>

            <Button
              type="submit"
              variant="primary"
              disabled={!apiKey}
              className="w-full flex justify-center gap-2"
            >
              <Plus size={16} />
              Daftarkan & Inisialisasi
            </Button>
          </form>
        </div>
      ) : (
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 h-fit text-center text-slate-500 text-xs">
          Anda login sebagai Viewer. Hak akses pengelolaan dinonaktifkan.
        </div>
      )}
    </div>
  );
}
