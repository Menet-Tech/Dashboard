import { useState, useEffect } from 'react';
import { Users, User, ArrowRight, RefreshCw } from 'lucide-react';

export default function ContactsView({ apiKey, activeAccountId, showToast }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { 
    if (activeAccountId) fetchContacts();
  }, [activeAccountId]);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      // The backend API might be slow retrieving all contacts, maybe limit it if possible
      // but let's just fetch it normally
      const res = await fetch('/api/v1/contacts', { headers: { 'X-API-Key': apiKey, 'X-Account-Id': activeAccountId }});
      const json = await res.json();
      if (json.data) {
         // Filter out useless internal contacts and sort by name
         const realContacts = json.data.filter(c => c.name || c.pushname).sort((a,b) => (a.name || a.pushname).localeCompare(b.name || b.pushname));
         setContacts(realContacts);
      }
    } catch(e) {}
    setLoading(false);
  }

  return (
    <div className="h-full overflow-y-auto p-8 animate-fade-in flex flex-col items-center">
      <div className="w-full max-w-4xl space-y-6">
         <div className="flex justify-between items-end mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-3 text-slate-100">
               <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg"><Users size={24}/></span> 
               CRM & Address Book
            </h2>
            <button onClick={fetchContacts} disabled={loading} className="flex gap-2 items-center bg-white/5 hover:bg-white/10 text-slate-300 px-4 py-2 rounded-xl transition disabled:opacity-50 border border-white/5">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Sync Device Contacts
            </button>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {contacts.map((c, i) => (
                <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-4 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition cursor-pointer group">
                   <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400">
                      <User size={20} />
                   </div>
                   <div className="flex-1 overflow-hidden">
                      <h4 className="font-bold text-slate-200 truncate">{c.name || c.pushname || 'Unknown'}</h4>
                      <div className="text-xs text-slate-500 font-mono flex items-center gap-2 mt-1">
                          {c.number} {c.isGroup && <span className="bg-slate-700 text-[10px] px-1.5 py-0.5 rounded text-white">Group</span>}
                      </div>
                   </div>
                   <button className="opacity-0 group-hover:opacity-100 bg-indigo-500/20 text-indigo-400 p-2 rounded-lg transition" title="Start Chat">
                       <ArrowRight size={16} />
                   </button>
                </div>
             ))}
             {contacts.length === 0 && !loading && (
                <div className="col-span-2 text-center p-12 text-slate-500 bg-white/5 border border-white/10 rounded-3xl border-dashed">
                   No contacts found. Make sure the Node is online and synced.
                </div>
             )}
             {loading && (
                <div className="col-span-2 text-center p-12 text-indigo-400 animate-pulse">
                   Fetching directory from Node...
                </div>
             )}
         </div>
      </div>
    </div>
  )
}
