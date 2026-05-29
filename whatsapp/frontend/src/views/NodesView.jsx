import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Server, Plus, X, Link } from 'lucide-react';

export default function NodesView({ apiKey, showToast, accounts, fetchAccounts }) {
  const [newAccountId, setNewAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState(null);

  const createAccount = async (e) => {
    e.preventDefault();
    if (!newAccountId.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/accounts', { 
        method: 'POST', headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: newAccountId })
      });
      if (res.ok) { showToast(`Node ${newAccountId} provisioned!`); setNewAccountId(''); fetchAccounts(); }
    } catch (err) { showToast('Error provisioning node', 'error'); }
    setLoading(false);
  };

  const removeAccount = async (id) => {
    if (!confirm(`Destroy node ${id}?`)) return;
    try {
      await fetch('/api/v1/accounts/' + id, { method: 'DELETE', headers: { 'X-API-Key': apiKey }});
      if (qrCode?.accountId === id) setQrCode(null);
      showToast(`Node ${id} destroyed`); fetchAccounts();
    } catch (err) { showToast('Failed to destroy node', 'error'); }
  };

  const showQr = async (id) => {
    try {
      const res = await fetch('/api/v1/accounts/' + id + '/qr', { headers: { 'X-API-Key': apiKey }});
      const json = await res.json();
      if (json.data?.qr) setQrCode({ accountId: id, qr: json.data.qr });
      else showToast('QR not ready yet', 'error');
    } catch (err) {}
  };

  return (
    <div className="h-full overflow-y-auto p-8 animate-fade-in">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-xl">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 text-slate-100">
              <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg"><Server size={24}/></span>
              Node Management
            </h2>
            
            <form onSubmit={createAccount} className="flex gap-3 mb-8">
              <input value={newAccountId} onChange={e => setNewAccountId(e.target.value)} placeholder="e.g. branch-01" className="flex-1 bg-black/40 border border-white/10 px-4 py-3 rounded-xl focus:border-emerald-500/50 outline-none transition text-slate-100" />
              <button type="submit" disabled={loading} className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 px-6 font-bold rounded-xl flex items-center gap-2 transition active:scale-95 disabled:opacity-50">
                <Plus size={18}/> Provision
              </button>
            </form>

            <div className="border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-black/30 text-slate-400 text-sm">
                  <tr><th className="p-4">Node ID</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-black/10">
                  {accounts.map(acc => (
                    <tr key={acc.accountId} className="hover:bg-white/5 transition">
                      <td className="p-4 font-mono text-emerald-400 text-sm flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${acc.ready ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></div> {acc.accountId}
                      </td>
                      <td className="p-4">
                        {acc.ready ? <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold border border-emerald-500/20">Connected</span>
                         : acc.hasQr ? <span className="bg-amber-500/10 text-amber-400 px-3 py-1 rounded-full text-xs font-bold border border-amber-500/20">Awaiting Scan</span>
                         : <span className="bg-slate-500/10 text-slate-400 px-3 py-1 rounded-full text-xs font-bold border border-slate-500/20">Init...</span>}
                      </td>
                      <td className="p-4 text-right flex justify-end gap-2">
                        {!acc.ready && acc.hasQr && <button onClick={() => showQr(acc.accountId)} className="bg-white/5 hover:bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-bold border border-white/5">Pair</button>}
                        <button onClick={() => removeAccount(acc.accountId)} className="bg-white/5 hover:bg-rose-500/20 text-rose-400 px-3 py-1.5 rounded-lg text-xs font-bold border border-white/5"><X size={14} className="inline"/></button>
                      </td>
                    </tr>
                  ))}
                  {accounts.length === 0 && <tr><td colSpan="3" className="p-8 text-center text-slate-500">No nodes deployed.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          {qrCode ? (
            <div className="bg-gradient-to-b from-amber-500/10 to-transparent border border-amber-500/20 p-8 rounded-3xl sticky top-8 text-center relative overflow-hidden backdrop-blur-xl">
               <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/20 blur-3xl rounded-full"></div>
               <h3 className="text-xl font-bold text-amber-100 flex items-center justify-center gap-2 mb-6"><Link size={20} className="text-amber-400"/> Authentication Required</h3>
               <p className="text-amber-400/80 text-sm font-mono mb-6 bg-black/40 py-2 rounded-xl inline-block px-4">Node: {qrCode.accountId}</p>
               <div className="bg-white p-4 rounded-2xl mx-auto inline-block border-4 border-slate-800 shadow-2xl"><QRCodeSVG value={qrCode.qr} size={200} /></div>
               <button onClick={() => setQrCode(null)} className="mt-8 text-slate-400 hover:text-white text-sm">Cancel Pairing</button>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 p-8 rounded-3xl h-full min-h-[400px] flex flex-col items-center justify-center text-center text-slate-500 border-dashed backdrop-blur-xl">
               <Link className="w-12 h-12 mb-4 opacity-50" />
               <p>Select a node awaiting scan to view the authorization payload.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
