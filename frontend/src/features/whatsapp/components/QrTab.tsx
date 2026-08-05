import { Wifi, RefreshCw, Key } from "lucide-react";
import { useState } from "react";
import { inputClassName, Button } from "../../../components/ui";
import { type GatewayAccount } from "../../../lib/gatewayApi";

type QrTabProps = {
  accounts: GatewayAccount[];
  qrs: Record<string, string>;
  qrSelectedAccountId: string;
  setQrSelectedAccountId: (id: string) => void;
  onTriggerQrFetch: (id: string) => Promise<void>;
  onTriggerPairingCode?: (id: string, phone: string) => Promise<string | null>;
};

export function QrTab({
  accounts,
  qrs,
  qrSelectedAccountId,
  setQrSelectedAccountId,
  onTriggerQrFetch,
  onTriggerPairingCode,
}: QrTabProps) {
  const [usePairingCode, setUsePairingCode] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [loadingPairing, setLoadingPairing] = useState(false);

  const target = accounts.find((a) => a.accountId === qrSelectedAccountId);
  const qr = qrs[qrSelectedAccountId];

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onTriggerPairingCode || !phoneNumber) return;
    setLoadingPairing(true);
    setPairingCode(null);
    const code = await onTriggerPairingCode(qrSelectedAccountId, phoneNumber);
    if (code) {
      setPairingCode(code);
    }
    setLoadingPairing(false);
  };

  return (
    <div className="max-w-md mx-auto py-4">
      <div className="mb-5 flex flex-col gap-2">
        <label className="block">
          <span className="text-xs font-semibold text-slate-600 block mb-1">Pilih Akun yang Ingin di-Scan</span>
          <select
            value={qrSelectedAccountId}
            onChange={(e) => {
              setQrSelectedAccountId(e.target.value);
              setPairingCode(null);
            }}
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

      {/* Toggles between QR and Pairing Code */}
      {!target?.ready && (
        <div className="flex bg-slate-100 rounded-lg p-1 mb-5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setUsePairingCode(false)}
            className={
              !usePairingCode ? "flex-1 !bg-white shadow-sm text-indigo-700" : "flex-1 text-slate-500 hover:text-slate-700 border-transparent"
            }
          >
            Scan QR
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setUsePairingCode(true)}
            className={
              usePairingCode ? "flex-1 !bg-white shadow-sm text-indigo-700" : "flex-1 text-slate-500 hover:text-slate-700 border-transparent"
            }
          >
            Tautkan dg Nomor
          </Button>
        </div>
      )}

      {/* QR Card Container */}
      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center shadow-inner relative min-h-[350px]">
        {!target ? (
          <p className="text-slate-500 dark:text-slate-400 text-sm">Pilih atau buat akun gateway terlebih dahulu.</p>
        ) : target.ready ? (
          <div className="text-center p-4">
            <div className="bg-emerald-50 text-emerald-600 p-4 rounded-full inline-block mb-3 border border-emerald-100">
              <Wifi size={40} />
            </div>
            <h4 className="font-bold text-slate-900 dark:text-slate-50 mb-1">WhatsApp Terkoneksi</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">Akun '{qrSelectedAccountId}' siap mengirim dan menerima pesan.</p>
          </div>
        ) : usePairingCode ? (
          <div className="w-full flex flex-col items-center">
             <div className="bg-indigo-50 text-indigo-600 p-4 rounded-full inline-block mb-4 border border-indigo-100">
               <Key size={32} />
             </div>
             <h4 className="font-bold text-slate-900 dark:text-slate-50 mb-2">Tautkan dengan Nomor</h4>
             {!pairingCode ? (
               <form onSubmit={handleRequestPairingCode} className="w-full max-w-[280px] flex flex-col gap-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-2">
                    Masukkan nomor HP yang ada di WhatsApp (mulai dengan kode negara, ex: 62812...)
                  </p>
                  <input
                    type="text"
                    placeholder="Contoh: 6281234567890"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className={inputClassName()}
                    required
                  />
                  <Button
                    type="submit"
                    isLoading={loadingPairing}
                    className="w-full justify-center"
                  >
                    {loadingPairing ? "Meminta..." : "Dapatkan Kode"}
                  </Button>
               </form>
             ) : (
               <div className="text-center w-full max-w-[280px]">
                 <p className="text-xs text-slate-600 mb-3">Masukkan kode ini di aplikasi WhatsApp Anda:</p>
                 <div className="bg-white dark:bg-slate-900 border-2 border-indigo-200 py-3 px-4 rounded-xl shadow-sm mb-4">
                    <span className="text-3xl font-mono font-bold tracking-[0.25em] text-slate-800 dark:text-slate-100">
                      {pairingCode}
                    </span>
                 </div>
                 <p className="text-xs text-slate-500 dark:text-slate-400">
                   Buka WhatsApp → Tautkan Perangkat → Pilih "Tautkan dengan nomor telepon saja"
                 </p>
                 <Button
                    type="button"
                    variant="link"
                    onClick={() => setPairingCode(null)}
                    className="mt-4 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                 >
                   Meminta Ulang / Ganti Nomor
                 </Button>
               </div>
             )}
          </div>
        ) : qr ? (
          <div className="text-center flex flex-col items-center">
            <p className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full mb-4 animate-pulse">
              Menunggu Scan dari Aplikasi WhatsApp HP Anda
            </p>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-md mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
                  qr
                )}&size=260x260`}
                alt="WhatsApp QR Code"
                className="w-[260px] h-[260px] block"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[280px]">
              Buka WhatsApp di HP Anda → Menu → Perangkat Tertaut → Tautkan Perangkat.
            </p>
          </div>
        ) : (
          <div className="text-center flex flex-col items-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Meminta status/QR code dari server...</p>
            <Button
              type="button"
              variant="primary"
              onClick={() => onTriggerQrFetch(qrSelectedAccountId)}
              className="flex items-center gap-1.5"
            >
              <RefreshCw size={14} />
              Muat Ulang QR Code
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
