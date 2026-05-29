import { useState, useRef, useEffect } from 'react';

export default function ChatView({ apiKey, activeAccountId, socket }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [toNum, setToNum] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    fetchHistory();
    if (socket) {
      const onMsg = (msg) => {
        // filter by active account
        if (msg.account_id === activeAccountId || !msg.account_id) {
           setMessages(prev => [...prev, msg]);
        }
      };
      socket.on('chat_message', onMsg);
      return () => socket.off('chat_message', onMsg);
    }
  }, [socket, activeAccountId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/v1/messages/history?limit=100`, { headers: { 'X-API-Key': apiKey }});
      const json = await res.json();
      if (json.data) {
        // filter frontend side or backend side, since api doesn't filter by account yet, we filter here
        const filtered = json.data.filter(m => m.account_id === activeAccountId || m.account_id === 'default');
        setMessages(filtered.reverse());
      }
    } catch (e) {}
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !toNum.trim()) return;
    const body = inputText;
    setInputText('');
    await fetch('/api/v1/messages', {
      method: 'POST', headers: { 'X-API-Key': apiKey, 'X-Account-Id': activeAccountId, 'Content-Type': 'application/json'},
      body: JSON.stringify({ to: toNum, text: body })
    });
  };

  return (
    <div className="h-full flex flex-col p-6 animate-fade-in bg-black/20">
      <div className="bg-white/5 border border-white/10 p-4 rounded-t-2xl flex items-center justify-between backdrop-blur-md">
         <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-200">Live Communication Stream</span>
            <span className="text-xs text-emerald-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Node: {activeAccountId}</span>
         </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-black/40 border-x border-white/5">
         {messages.map((m, i) => {
           const isInbound = m.direction === 'inbound';
           return (
             <div key={i} className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}>
               <div className="flex items-center gap-2 mb-1 opacity-60 hover:opacity-100 transition">
                 <span className="text-[10px] text-slate-300 font-bold uppercase">{isInbound ? m.from_number : m.to_number}</span>
                 <span className="text-[9px] text-slate-500">{new Date(m.created_at).toLocaleTimeString()}</span>
               </div>
               <div className={`px-4 py-2.5 rounded-2xl max-w-xl text-sm shadow-xl border whitespace-pre-wrap ${
                 isInbound ? 'bg-white/10 text-slate-200 border-white/10 rounded-tl-none' 
                           : 'bg-emerald-500/20 text-emerald-100 border-emerald-500/30 rounded-tr-none'
               }`}>
                 {m.body}
               </div>
             </div>
           );
         })}
         <div ref={chatEndRef} />
      </div>

      <div className="bg-white/5 border border-white/10 p-4 rounded-b-2xl backdrop-blur-md">
        <form onSubmit={sendMessage} className="flex gap-3">
          <input value={toNum} onChange={e=>setToNum(e.target.value)} placeholder="Target (628...)" className="w-48 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50" />
          <input value={inputText} onChange={e=>setInputText(e.target.value)} placeholder="Type a message..." className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50" />
          <button type="submit" disabled={!inputText} className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-black px-6 rounded-xl font-bold transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100">Send</button>
        </form>
      </div>
    </div>
  );
}
