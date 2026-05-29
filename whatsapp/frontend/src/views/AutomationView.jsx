import { useState, useEffect } from 'react';
import { Bot, Zap, Trash2 } from 'lucide-react';

export default function AutomationView({ apiKey, activeAccountId, showToast }) {
  const [config, setConfig] = useState({ enabled: false, aiProvider: 'openai', aiBaseUrl: '', aiApiKey: '', aiModel: '', systemPrompt: '' });
  const [rules, setRules] = useState([]);
  const [newRule, setNewRule] = useState({ keyword: '', type: 'exact', reply: '' });

  useEffect(() => { 
    if(activeAccountId) {
      fetchAiConfig(); 
      fetchRules();
    }
  }, [activeAccountId]);

  const fetchAiConfig = async () => {
    try {
      const res = await fetch('/api/v1/ai', { headers: { 'X-API-Key': apiKey, 'X-Account-Id': activeAccountId }});
      const json = await res.json();
      if(json.data) setConfig({ ...config, ...json.data });
    } catch(e){}
  };

  const saveAiConfig = async (e) => {
    e.preventDefault();
    try {
      await fetch('/api/v1/ai', {
        method: 'PUT', headers: { 'X-API-Key': apiKey, 'X-Account-Id': activeAccountId, 'Content-Type': 'application/json'},
        body: JSON.stringify(config)
      });
      showToast('AI Settings Updated for ' + activeAccountId);
    } catch (e) { showToast('Error saving AI settings', 'error'); }
  };

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/v1/autoreply', { headers: { 'X-API-Key': apiKey }}); // Global for now? AutoReply currently is global in backend!
      const json = await res.json();
      if(json.data) setRules(json.data);
    } catch(e){}
  };

  const addRule = async (e) => {
    e.preventDefault();
    try {
      await fetch('/api/v1/autoreply', {
        method: 'POST', headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule)
      });
      showToast('Rule added');
      setNewRule({ keyword: '', type: 'exact', reply: '' });
      fetchRules();
    } catch(e){}
  };

  const deleteRule = async (id) => {
    try {
      await fetch('/api/v1/autoreply/'+id, { method: 'DELETE', headers: { 'X-API-Key': apiKey }});
      showToast('Rule deleted');
      fetchRules();
    } catch(e){}
  };

  return (
    <div className="h-full overflow-y-auto p-8 animate-fade-in grid xl:grid-cols-2 gap-8">
      {/* AI ENGINE */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl h-fit">
         <h2 className="text-xl font-bold mb-6 flex items-center gap-3 text-slate-100 border-b border-white/10 pb-4">
           <span className="p-2 bg-purple-500/20 text-purple-400 rounded-lg"><Bot size={20}/></span> Neural Bot Configuration
         </h2>

         <form onSubmit={saveAiConfig} className="space-y-6">
            <div className="flex items-center gap-3 bg-black/30 p-4 rounded-xl border border-white/5">
              <input type="checkbox" id="enabled" checked={config.enabled} onChange={e=>setConfig({...config, enabled: e.target.checked})} className="w-5 h-5 accent-purple-500" />
              <div className="text-sm">
                <label htmlFor="enabled" className="font-bold text-slate-200 cursor-pointer block">Enable Node AI</label>
                <div className="text-slate-500 text-xs">AI will reply if no static Rule matches</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">Provider</label>
                <select value={config.aiProvider} onChange={e=>setConfig({...config, aiProvider: e.target.value})} className="w-full bg-black/40 border border-white/10 px-4 py-3 rounded-xl focus:border-purple-500/50 outline-none text-slate-200 text-sm">
                  <option value="openai">OpenAI Cloud</option>
                  <option value="custom">Ollama / Custom API</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">AI Model</label>
                <input value={config.aiModel} onChange={e=>setConfig({...config, aiModel: e.target.value})} placeholder="gpt-4o / llama3" className="w-full bg-black/40 border border-white/10 px-4 py-3 rounded-xl focus:border-purple-500/50 outline-none text-slate-200 text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">Endpoint URI</label>
              <input value={config.aiBaseUrl} onChange={e=>setConfig({...config, aiBaseUrl: e.target.value})} placeholder="https://api.openai.com/v1" className="w-full bg-black/40 border border-white/10 px-4 py-3 rounded-xl focus:border-purple-500/50 outline-none text-slate-200 font-mono text-xs" />
            </div>

            <div>
              <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">API Key (Bearer Token)</label>
              <input type="password" value={config.aiApiKey} onChange={e=>setConfig({...config, aiApiKey: e.target.value})} placeholder="sk-..." className="w-full bg-black/40 border border-white/10 px-4 py-3 rounded-xl focus:border-purple-500/50 outline-none text-slate-200 font-mono text-xs" />
            </div>

            <div>
              <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">System Persona Prompt</label>
              <textarea value={config.systemPrompt} onChange={e=>setConfig({...config, systemPrompt: e.target.value})} rows="4" className="w-full bg-black/40 border border-white/10 px-4 py-3 rounded-xl focus:border-purple-500/50 outline-none text-slate-200 text-sm" />
            </div>

            <button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3 text-sm rounded-xl transition active:scale-95">Save Config for {activeAccountId}</button>
         </form>
      </div>

      {/* AUTO REPLY ENGINE */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl h-fit">
         <h2 className="text-xl font-bold mb-6 flex items-center gap-3 text-slate-100 border-b border-white/10 pb-4">
           <span className="p-2 bg-blue-500/20 text-blue-400 rounded-lg"><Zap size={20}/></span> Static Fast-Rules (Global)
         </h2>

         <form onSubmit={addRule} className="flex gap-2 items-end mb-6">
            <div className="flex-1"><input value={newRule.keyword} onChange={e=>setNewRule({...newRule, keyword: e.target.value})} placeholder="Keyword" className="w-full bg-black/40 border border-white/10 px-3 py-2 rounded-xl focus:border-blue-500/50 outline-none text-sm" /></div>
            <div className="w-24"><select value={newRule.type} onChange={e=>setNewRule({...newRule, type: e.target.value})} className="w-full bg-black/40 border border-white/10 px-2 py-2 rounded-xl focus:border-blue-500/50 outline-none text-sm"><option value="exact">Exact</option><option value="contains">Contains</option></select></div>
            <div className="flex-[2]"><input value={newRule.reply} onChange={e=>setNewRule({...newRule, reply: e.target.value})} placeholder="Reply body..." className="w-full bg-black/40 border border-white/10 px-3 py-2 rounded-xl focus:border-blue-500/50 outline-none text-sm" /></div>
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 font-bold rounded-xl transition text-sm">Add</button>
         </form>

         <div className="border border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full text-left">
               <thead className="bg-black/30 border-b border-white/5"><tr className="text-[10px] uppercase text-slate-500">
                  <th className="p-3">Trigger</th><th className="p-3">Type</th><th className="p-3">Payload Output</th><th className="p-3 text-right">Delete</th>
               </tr></thead>
               <tbody className="divide-y divide-white/5 bg-black/10">
                 {rules.map(r => (
                   <tr key={r.id}>
                     <td className="p-3 font-mono text-xs text-cyan-400">{r.keyword}</td>
                     <td className="p-3 text-[10px]"><span className="bg-white/10 px-2 py-1 rounded-md">{r.type}</span></td>
                     <td className="p-3 text-xs text-slate-300 truncate max-w-[150px]">{r.reply}</td>
                     <td className="p-3 text-right"><button onClick={()=>deleteRule(r.id)} className="text-rose-400 hover:text-white bg-rose-500/10 p-1.5 rounded-lg text-xs font-bold transition"><Trash2 size={14}/></button></td>
                   </tr>
                 ))}
                 {rules.length === 0 && <tr><td colSpan="4" className="p-6 text-center text-xs text-slate-500">No static rules found.</td></tr>}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  )
}
