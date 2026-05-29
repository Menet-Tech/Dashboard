import { useState, useEffect } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';

export default function SchedulerView({ apiKey, activeAccountId, showToast }) {
  const [schedules, setSchedules] = useState([]);
  const [form, setForm] = useState({ to: '', text: '', type: 'once', scheduledAt: '', day: '1', time: '12:00' });
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchSchedules(); }, []);

  const fetchSchedules = async () => {
    try {
      const res = await fetch('/api/v1/scheduled', { headers: { 'X-API-Key': apiKey }});
      const json = await res.json();
      if (json.data) setSchedules(json.data);
    } catch(e){}
  };

  const createSchedule = async (e) => {
    e.preventDefault();
    setLoading(true);
    let payload = { to: form.to, text: form.text, type: form.type };
    if (form.type === 'once') {
        payload.scheduledAt = form.scheduledAt;
    } else {
        payload.day = form.day;
        payload.time = form.time;
    }

    try {
      const res = await fetch('/api/v1/scheduled', {
        method: 'POST', headers: { 'X-API-Key': apiKey, 'X-Account-Id': activeAccountId, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Campaign scheduled successfully!');
        setForm({ ...form, to: '', text: '' });
        fetchSchedules();
      } else {
        showToast(data.message || 'Error occurred', 'error');
      }
    } catch(e) { showToast('Network Error', 'error'); }
    setLoading(false);
  };

  const cancelJob = async (id) => {
    if (!confirm('Cancel this job?')) return;
    try {
      await fetch('/api/v1/scheduled/'+id, { method: 'DELETE', headers: { 'X-API-Key': apiKey }});
      showToast('Scheduled task cancelled');
      fetchSchedules();
    } catch(e) {}
  };

  return (
    <div className="h-full overflow-y-auto p-8 animate-fade-in">
      <div className="max-w-6xl mx-auto space-y-8">
         <h2 className="text-2xl font-bold flex items-center gap-3">
           <span className="p-2 bg-pink-500/20 text-pink-400 rounded-lg"><Clock size={24}/></span> Scheduler Engine
         </h2>

         <div className="bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-md flex flex-col md:flex-row gap-8">
            <div className="flex-1">
               <h3 className="text-lg font-bold mb-4 text-slate-200">New Campaign</h3>
               <form onSubmit={createSchedule} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="text-xs text-slate-400 font-bold block mb-1">Target Number</label>
                        <input value={form.to} onChange={e=>setForm({...form, to: e.target.value})} placeholder="628..." required className="w-full bg-black/40 border border-white/10 p-3 rounded-xl focus:border-pink-500/50 outline-none" />
                     </div>
                     <div>
                        <label className="text-xs text-slate-400 font-bold block mb-1">Schedule Type</label>
                        <select value={form.type} onChange={e=>setForm({...form, type: e.target.value})} className="w-full bg-black/40 border border-white/10 p-3 rounded-xl focus:border-pink-500/50 outline-none text-slate-200">
                          <option value="once">One-Time Send</option>
                          <option value="monthly">Recurring (Monthly)</option>
                        </select>
                     </div>
                  </div>

                  {form.type === 'once' ? (
                     <div>
                        <label className="text-xs text-slate-400 font-bold block mb-1">Exact Date & Time</label>
                        <input type="datetime-local" value={form.scheduledAt} onChange={e=>setForm({...form, scheduledAt: e.target.value})} className="w-full bg-black/40 border border-white/10 p-3 rounded-xl focus:border-pink-500/50 outline-none [color-scheme:dark]" />
                     </div>
                  ) : (
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="text-xs text-slate-400 font-bold block mb-1">Day of Month</label>
                           <input type="number" min="1" max="31" value={form.day} onChange={e=>setForm({...form, day: e.target.value})} className="w-full bg-black/40 border border-white/10 p-3 rounded-xl focus:border-pink-500/50 outline-none" placeholder="e.g. 7" />
                        </div>
                        <div>
                           <label className="text-xs text-slate-400 font-bold block mb-1">Time (Local)</label>
                           <input type="time" value={form.time} onChange={e=>setForm({...form, time: e.target.value})} className="w-full bg-black/40 border border-white/10 p-3 rounded-xl focus:border-pink-500/50 outline-none [color-scheme:dark]" />
                        </div>
                     </div>
                  )}

                  <div>
                     <label className="text-xs text-slate-400 font-bold block mb-1">Message Payload</label>
                     <textarea value={form.text} onChange={e=>setForm({...form, text: e.target.value})} rows="3" required className="w-full bg-black/40 border border-white/10 p-3 rounded-xl focus:border-pink-500/50 outline-none" />
                  </div>

                  <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white font-bold py-3 rounded-xl shadow-lg transition active:scale-95 disabled:opacity-50">Create Job</button>
               </form>
            </div>

            <div className="flex-1 flex flex-col">
               <h3 className="text-lg font-bold mb-4 text-slate-200">Active Jobs</h3>
               <div className="flex-1 overflow-y-auto border border-white/10 rounded-2xl bg-black/20">
                  <table className="w-full text-left text-sm">
                     <thead className="bg-black/40 text-slate-400"><tr className="text-xs uppercase"><th className="p-3">Target</th><th className="p-3">Rule</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
                     <tbody className="divide-y divide-white/5">
                        {schedules.map(s => (
                           <tr key={s.id} className="hover:bg-white/5">
                              <td className="p-3 font-mono text-cyan-400">{s.to}</td>
                              <td className="p-3 text-xs text-slate-300">{s.description} ({s.type})</td>
                              <td className="p-3"><span className={`px-2 py-1 rounded text-[10px] uppercase font-bold border ${s.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : s.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>{s.status}</span></td>
                              <td className="p-3 text-right">
                                 {s.status !== 'sent' && s.status !== 'cancelled' && <button onClick={()=>cancelJob(s.id)} className="text-rose-400 hover:bg-rose-500/20 p-2 rounded-lg transition"><Trash2 size={16}/></button>}
                              </td>
                           </tr>
                        ))}
                        {schedules.length === 0 && <tr><td colSpan="4" className="text-center p-6 text-slate-500">No scheduled campaigns</td></tr>}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
