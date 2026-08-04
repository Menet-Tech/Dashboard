import { useState, useEffect } from "react";
import { Modal } from "../../../components/ui/Modal";
import { apiRequest } from "../../../lib/api";
import { Loader2, Search, AlertCircle, RefreshCw, UserPlus } from "lucide-react";
import type { PackageItem } from "../../../types";
import { Button } from "../../../components/ui/Button";

type MikrotikSyncSecret = {
  name: string;
  password?: string;
  profile: string;
  disabled: boolean;
  exists: boolean;
};

type MikrotikSyncModalProps = {
  isOpen: boolean;
  onClose: () => void;
  packages: PackageItem[];
  onSelectSecret: (name: string, password: string, guessedPackageId: number) => void;
};

export function MikrotikSyncModal({
  isOpen,
  onClose,
  packages,
  onSelectSecret,
}: MikrotikSyncModalProps) {
  const [secrets, setSecrets] = useState<MikrotikSyncSecret[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadSecrets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ secrets: MikrotikSyncSecret[] }>("/api/v1/integration/mikrotik/sync-preview");
      // Filter out secrets that are already in the dashboard
      const unsynced = (data.secrets || []).filter((s) => !s.exists);
      setSecrets(unsynced);
    } catch (e: any) {
      setError(e.message || "Gagal memuat PPPoE secrets dari MikroTik");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadSecrets();
      setSearchQuery("");
    }
  }, [isOpen]);

  const guessPackageId = (profile: string): number => {
    const cleanProfile = profile.toLowerCase().trim();
    // 1. Exact match by name
    const exact = packages.find((p) => p.name.toLowerCase().trim() === cleanProfile);
    if (exact) return exact.id;

    // 2. Match by speed number (e.g., profile "10Mbps" or "10M" matches speed_mbps = 10)
    const matchSpeed = cleanProfile.match(/(\d+)\s*(mbps|m)/);
    if (matchSpeed) {
      const speed = parseInt(matchSpeed[1], 10);
      const bySpeed = packages.find((p) => p.speed_mbps === speed);
      if (bySpeed) return bySpeed.id;
    }

    // 3. Fallback check if profile name contains package name
    const partial = packages.find((p) => cleanProfile.includes(p.name.toLowerCase().trim()));
    if (partial) return partial.id;

    return 0;
  };

  const filteredSecrets = secrets.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.profile.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <Modal
      title="Sync dari MikroTik (PPPoE Secret)"
      onClose={onClose}
      actions={
        <Button type="button" variant="outline" onClick={onClose}>
          Tutup
        </Button>
      }
    >
      <div className="space-y-4 min-h-[300px] max-h-[500px] flex flex-col">
        <p className="text-xs text-slate-500 leading-relaxed">
          Pilih salah satu akun PPPoE Secret di bawah ini untuk didaftarkan sebagai pelanggan baru. 
          Sistem akan mengisi username, password, dan mencocokkan profil paket secara otomatis. 
          Anda hanya perlu melengkapi data manual lainnya setelah memilih.
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Cari PPPoE Username / Profil..."
              className="block w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:text-slate-100 pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void loadSecrets()}
            disabled={loading}
            title="Refresh List"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 gap-2">
            <Loader2 className="animate-spin text-indigo-600" size={24} />
            <span className="text-xs text-slate-400 font-semibold">Mengambil secrets dari MikroTik...</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-center gap-3">
            <AlertCircle className="text-rose-500" size={32} />
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Gagal Membaca MikroTik</p>
              <p className="text-[11px] text-slate-400 max-w-sm leading-relaxed">{error}</p>
            </div>
            <Button type="button" variant="primary" onClick={() => void loadSecrets()}>
              Coba Lagi
            </Button>
          </div>
        ) : filteredSecrets.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-slate-400 text-xs">
            {secrets.length === 0
              ? "Semua PPPoE secret di MikroTik sudah terdaftar di dashboard."
              : "Tidak ada PPPoE secret yang cocok dengan pencarian Anda."}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto border border-slate-150 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {filteredSecrets.map((secret) => {
              const guessedId = guessPackageId(secret.profile);
              const matchedPkg = packages.find((p) => p.id === guessedId);

              return (
                <div
                  key={secret.name}
                  className="flex items-center justify-between p-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="space-y-1">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">
                      {secret.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        Profile: {secret.profile}
                      </span>
                      {matchedPkg && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-455">
                          Paket Cocok: {matchedPkg.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-100"
                    onClick={() => onSelectSecret(secret.name, secret.password || "", guessedId)}
                    icon={<UserPlus size={12} />}
                  >
                    Pilih & Lengkapi
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
