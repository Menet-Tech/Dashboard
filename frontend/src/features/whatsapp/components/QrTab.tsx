import { Wifi, RefreshCw } from "lucide-react";
import { inputClassName } from "../../../components/ui";
import { type GatewayAccount } from "../../../lib/gatewayApi";

type QrTabProps = {
  accounts: GatewayAccount[];
  qrs: Record<string, string>;
  qrSelectedAccountId: string;
  setQrSelectedAccountId: (id: string) => void;
  onTriggerQrFetch: (id: string) => Promise<void>;
};

export function QrTab({
  accounts,
  qrs,
  qrSelectedAccountId,
  setQrSelectedAccountId,
  onTriggerQrFetch,
}: QrTabProps) {
  const target = accounts.find((a) => a.accountId === qrSelectedAccountId);
  const qr = qrs[qrSelectedAccountId];

  return (
    <div className="max-w-md mx-auto py-4">
      <div className="mb-5 flex flex-col gap-2">
        <label className="block">
          <span className="text-xs font-semibold text-slate-600 block mb-1">Pilih Akun yang Ingin di-Scan</span>
          <select
            value={qrSelectedAccountId}
            onChange={(e) => setQrSelectedAccountId(e.target.value)}
            className={inputClassName()}
          >
            {accounts.map((acc) => (
              <option key={acc.accountId} value={acc.accountId}>
                {acc.accountId} ({acc.ready ? "Connected" : "Offline / Waiting Scan"})
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* QR Card Container */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center shadow-inner relative min-h-[350px]">
        {!target ? (
          <p className="text-slate-500 text-sm">Pilih atau buat akun gateway terlebih dahulu.</p>
        ) : target.ready ? (
          <div className="text-center p-4">
            <div className="bg-emerald-50 text-emerald-600 p-4 rounded-full inline-block mb-3 border border-emerald-100">
              <Wifi size={40} />
            </div>
            <h4 className="font-bold text-slate-900 mb-1">WhatsApp Terkoneksi</h4>
            <p className="text-sm text-slate-500">Akun '{qrSelectedAccountId}' siap mengirim dan menerima pesan.</p>
          </div>
        ) : qr ? (
          <div className="text-center flex flex-col items-center">
            <p className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full mb-4 animate-pulse">
              Menunggu Scan dari Aplikasi WhatsApp HP Anda
            </p>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-md mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
                  qr
                )}&size=260x260`}
                alt="WhatsApp QR Code"
                className="w-[260px] h-[260px] block"
              />
            </div>
            <p className="text-xs text-slate-500 max-w-[280px]">
              Buka WhatsApp di HP Anda → Menu → Perangkat Tertaut → Tautkan Perangkat.
            </p>
          </div>
        ) : (
          <div className="text-center flex flex-col items-center">
            <p className="text-sm text-slate-500 mb-4">Meminta status/QR code dari server...</p>
            <button
              onClick={() => onTriggerQrFetch(qrSelectedAccountId)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <RefreshCw size={14} />
              Muat Ulang QR Code
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
