import { useState } from 'react';
import { Send, Image, LayoutList, GripHorizontal } from 'lucide-react';

export default function BroadcastView({ apiKey, activeAccountId, showToast }) {
  const [activeTab, setActiveTab] = useState('text');
  const [to, setTo] = useState('');
  const [payload, setPayload] = useState({ text: '', caption: '', file: null, title: '', footer: '', btn1: '', btn2: '' });
  const [loading, setLoading] = useState(false);

  const sendMessage = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (activeTab === 'text') {
        const res = await fetch('/api/v1/messages', {
            method: 'POST', headers: { 'X-API-Key': apiKey, 'X-Account-Id': activeAccountId, 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, text: payload.text })
        });
        if (res.ok) { showToast('Text Sent!'); setTo(''); setPayload({...payload, text: ''}); }
      } else if (activeTab === 'button') {
        // Build Interactive Button
        const buttons = [];
        if (payload.btn1) buttons.push({ body: payload.btn1 });
        if (payload.btn2) buttons.push({ body: payload.btn2 });
        const res = await fetch('/api/v1/messages/interactive', {
             method: 'POST', headers: { 'X-API-Key': apiKey, 'X-Account-Id': activeAccountId, 'Content-Type': 'application/json' },
             body: JSON.stringify({ to, type: 'button', body: payload.text, title: payload.title, footer: payload.footer, buttons })
        });
        if (res.ok) { showToast('Interactive Buttons Sent!'); setTo(''); }
      } else if (activeTab === 'media') {
         // Use formData for Media
         const formData = new FormData();
         formData.append('to', to);
         if (payload.caption) formData.append('caption', payload.caption);
         if (payload.file) formData.append('file', payload.file);

         const res = await fetch('/api/v1/media', {
             method: 'POST', headers: { 'X-API-Key': apiKey, 'X-Account-Id': activeAccountId },
             body: formData
         });
         if (res.ok) { showToast('Media Transmitted!'); setTo(''); }
      }
    } catch(e) {
       showToast('Failed to execute broadcast', 'error')
    }
    setLoading(false);
  }

  return (
    <div className="h-full overflow-y-auto p-8 animate-fade-in flex justify-center items-start">
      <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl w-full max-w-3xl border-t-4 border-t-amber-500">
         <h2 className="text-xl font-bold mb-6 flex items-center gap-3 text-slate-100">
           <span className="p-2 bg-amber-500/20 text-amber-400 rounded-lg"><Send size={20}/></span> Global Broadcast & Rich Media
         </h2>

         <div className="flex gap-2 mb-8 bg-black/40 p-1.5 rounded-xl border border-white/5 w-fit">
            <button onClick={() => setActiveTab('text')} className={`px-4 py-2 text-sm font-bold rounded-lg transition ${activeTab === 'text' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>Text Only</button>
            <button onClick={() => setActiveTab('media')} className={`px-4 py-2 text-sm font-bold rounded-lg transition flex gap-2 items-center ${activeTab === 'media' ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-white'} `}><Image size={14}/> Media</button>
            <button onClick={() => setActiveTab('button')} className={`px-4 py-2 text-sm font-bold rounded-lg transition flex gap-2 items-center ${activeTab === 'button' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'} `}><GripHorizontal size={14}/> Buttons UI</button>
         </div>

         <form onSubmit={sendMessage} className="space-y-6">
            <div>
              <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">Target Destination</label>
              <input value={to} required onChange={e=>setTo(e.target.value)} placeholder="e.g. 628123..." className="w-full bg-black/40 border border-white/10 px-4 py-3 rounded-xl focus:border-amber-500/50 outline-none text-slate-200" />
            </div>

            {activeTab === 'text' && (
              <div>
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">Text Payload</label>
                <textarea required value={payload.text} onChange={e=>setPayload({...payload, text: e.target.value})} rows="5" className="w-full bg-black/40 border border-white/10 px-4 py-3 rounded-xl focus:border-amber-500/50 outline-none text-slate-200 text-sm" />
              </div>
            )}

            {activeTab === 'media' && (
              <div className="space-y-4 border border-amber-500/20 p-6 rounded-2xl bg-amber-500/5">
                <div>
                  <label className="text-xs text-amber-400/70 font-bold uppercase tracking-wider mb-2 block">File Attachment</label>
                  <input type="file" onChange={e=>setPayload({...payload, file: e.target.files[0]})} required className="w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-amber-500/20 file:text-amber-400 hover:file:bg-amber-500/30" />
                </div>
                <div>
                  <label className="text-xs text-amber-400/70 font-bold uppercase tracking-wider mb-2 block">Caption (Optional)</label>
                  <input value={payload.caption} onChange={e=>setPayload({...payload, caption: e.target.value})} className="w-full bg-black/40 border border-white/10 px-4 py-3 rounded-xl focus:border-amber-500/50 outline-none text-slate-200" />
                </div>
              </div>
            )}

            {activeTab === 'button' && (
              <div className="space-y-4 border border-emerald-500/20 p-6 rounded-2xl bg-emerald-500/5">
                <div>
                  <label className="text-xs text-emerald-400/70 font-bold uppercase tracking-wider mb-2 block">Title</label>
                  <input value={payload.title} onChange={e=>setPayload({...payload, title: e.target.value})} required className="w-full bg-black/40 border border-white/10 px-4 py-3 rounded-xl focus:border-emerald-500/50 outline-none text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-emerald-400/70 font-bold uppercase tracking-wider mb-2 block">Description Body</label>
                  <input value={payload.text} onChange={e=>setPayload({...payload, text: e.target.value})} required className="w-full bg-black/40 border border-white/10 px-4 py-3 rounded-xl focus:border-emerald-500/50 outline-none text-slate-200" />
                </div>
                <div>
                  <label className="text-xs text-emerald-400/70 font-bold uppercase tracking-wider mb-2 block">Footer Sign</label>
                  <input value={payload.footer} onChange={e=>setPayload({...payload, footer: e.target.value})} required className="w-full bg-black/40 border border-white/10 px-4 py-3 rounded-xl focus:border-emerald-500/50 outline-none text-slate-200" />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="text-xs text-emerald-400/70 font-bold uppercase tracking-wider mb-2 block">Button 1</label>
                    <input value={payload.btn1} onChange={e=>setPayload({...payload, btn1: e.target.value})} required className="w-full bg-black/40 border border-emerald-500/30 px-4 py-3 rounded-xl outline-none text-emerald-300" />
                  </div>
                  <div>
                    <label className="text-xs text-emerald-400/70 font-bold uppercase tracking-wider mb-2 block">Button 2 (Optional)</label>
                    <input value={payload.btn2} onChange={e=>setPayload({...payload, btn2: e.target.value})} className="w-full bg-black/40 border border-emerald-500/30 px-4 py-3 rounded-xl outline-none text-emerald-300" />
                  </div>
                </div>
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 rounded-xl shadow-lg transition active:scale-95 disabled:opacity-50">Fire Transmission 🚀</button>
         </form>
      </div>
    </div>
  )
}
