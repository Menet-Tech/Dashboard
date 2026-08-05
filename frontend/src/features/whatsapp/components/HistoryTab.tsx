import { useState, useMemo } from "react";
import { Button } from "../../../components/ui/Button";
import { Lock, Unlock } from "lucide-react";
import { inputClassName } from "../../../components/ui";
import { type GatewayAccount, type GatewayMessage } from "../../../lib/gatewayApi";

type HistoryTabProps = {
  accounts: GatewayAccount[];
  historyMessages: GatewayMessage[];
  canDecrypt: boolean;
  maskPhone: (phone: string, shouldMask: boolean) => string;
  maskText: (text: string, shouldMask: boolean) => string;
};

export function HistoryTab({
  accounts,
  historyMessages,
  canDecrypt,
  maskPhone,
  maskText,
}: HistoryTabProps) {
  const [historyFilterAccount, setHistoryFilterAccount] = useState("all");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [decryptAll, setDecryptAll] = useState(false);

  const shouldMask = !canDecrypt || (!decryptAll && canDecrypt);

  // Filter messages
  const filteredMessages = historyMessages.filter((msg) => {
    const matchesAccount =
      historyFilterAccount === "all" || msg.account_id === historyFilterAccount;
    const rawNumber = msg.from_number || msg.to_number || "";
    const cleanNumber = rawNumber.replace(/@c\.us$/, "");
    const query = historySearchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      cleanNumber.includes(query) ||
      msg.body.toLowerCase().includes(query);
    return matchesAccount && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Filters & Decrypt Toggles */}
      <div className="flex flex-col md:flex-row gap-4 items-end justify-between bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600 block mb-1">Filter Akun</span>
            <select
              value={historyFilterAccount}
              onChange={(e) => setHistoryFilterAccount(e.target.value)}
              className={inputClassName()}
            >
              <option value="all">Semua Akun</option>
              {accounts.map((acc) => (
                <option key={acc.accountId} value={acc.accountId}>
                  {acc.accountId}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold text-slate-600 block mb-1">Cari Chat</span>
            <input
              type="text"
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              placeholder="Cari nomor atau isi pesan..."
              className={inputClassName()}
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          {canDecrypt ? (
              <Button
                type="button"
                variant={decryptAll ? "outline" : "secondary"}
                onClick={() => setDecryptAll(!decryptAll)}
                className={
                  decryptAll
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                    : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                }
              >
                {decryptAll ? <Unlock size={14} /> : <Lock size={14} />}
                {decryptAll ? "Dekripsi Aktif (Role-based)" : "Dekripsi Sembunyi"}
              </Button>
          ) : (
            <div className="flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg">
              <Lock size={12} />
              Sensor Role Viewer Aktif
            </div>
          )}
        </div>
      </div>

      {/* Message History Display */}
      {filteredMessages.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
          Tidak ada log chat yang cocok dengan filter saat ini.
        </div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse bg-white dark:bg-slate-900">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3">Waktu</th>
                <th className="p-3">Akun</th>
                <th className="p-3">Dari / Ke</th>
                <th className="p-3">Pesan</th>
                <th className="p-3 w-28 text-center">Status / Arah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredMessages.map((msg) => {
                const isIncoming = msg.direction === "inbound";
                const dateStr = new Date(msg.created_at).toLocaleString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  day: "2-digit",
                  month: "short",
                });

                const numberToShow = isIncoming
                  ? msg.from_number || "unknown"
                  : msg.to_number;

                return (
                  <tr key={msg.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{dateStr}</td>
                    <td className="p-3 font-semibold text-indigo-700">{msg.account_id}</td>
                    <td className="p-3 font-mono font-semibold">
                      {maskPhone(numberToShow, shouldMask)}
                    </td>
                    <td className="p-3 max-w-md break-words">
                      <span className={shouldMask ? "font-mono tracking-widest text-slate-400 select-all" : ""}>
                        {shouldMask ? maskText(msg.body, shouldMask) : msg.body}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                          isIncoming
                            ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                            : "bg-slate-100 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {isIncoming ? "masuk" : "keluar"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
