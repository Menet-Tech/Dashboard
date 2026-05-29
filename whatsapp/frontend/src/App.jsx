import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import {
  MessageCircle, Settings, Key, Send,
  LogOut, Server, Link, Users, Bot, Zap, Activity, Clock
} from 'lucide-react'

import NodesView from './views/NodesView'
import ChatView from './views/ChatView'
import AutomationView from './views/AutomationView'
import SchedulerView from './views/SchedulerView'
import BroadcastView from './views/BroadcastView'
import ContactsView from './views/ContactsView'

export default function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('API_KEY') || '');
  const [activeTab, setActiveTab] = useState('nodes');
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  const [socket, setSocket] = useState(null);
  
  // Global Account Context
  const [accounts, setAccounts] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState('default');

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 3000);
  };

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('API_KEY', apiKey);
      const newSocket = io(window.location.protocol + '//' + window.location.host); 
      setSocket(newSocket);
      fetchAccounts();
      const interval = setInterval(fetchAccounts, 10000); // reduced polling
      return () => { newSocket.disconnect(); clearInterval(interval); }
    }
  }, [apiKey]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/v1/accounts', { headers: { 'X-API-Key': apiKey }});
      const json = await res.json();
      if (json.status === 'success') {
        setAccounts(json.data);
        // Ensure active account is valid
        if (!json.data.find(a => a.accountId === activeAccountId) && json.data.length > 0) {
          setActiveAccountId(json.data[0].accountId);
        }
      }
    } catch (err) {}
  };

  const logout = () => {
    setApiKey('');
    localStorage.removeItem('API_KEY');
    if (socket) socket.disconnect();
  };

  if (!apiKey) return <Login onLogin={setApiKey} />

  // Common props for views
  const viewProps = { apiKey, showToast, socket, accounts, activeAccountId, fetchAccounts };

  return (
    <div className="flex h-screen bg-[#020617] text-slate-200 overflow-hidden font-sans">
      <BackgroundBlobs />
      
      {/* Sidebar Navigation */}
      <nav className="w-64 bg-white/5 backdrop-blur-2xl border-r border-white/10 flex flex-col z-20">
        <div className="p-6 flex items-center gap-3 border-b border-white/5">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
             <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-500 m-0">Antigravity</h1>
            <p className="text-[10px] text-slate-400 m-0 uppercase tracking-widest font-semibold cursor-pointer" onClick={() => localStorage.removeItem('API_KEY')}>v3.0 Edge</p>
          </div>
        </div>

        {/* Global Node Selector */}
        <div className="p-4 border-b border-white/5">
          <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block tracking-wider">Active Node (Device)</label>
          <select 
            value={activeAccountId} 
            onChange={e => setActiveAccountId(e.target.value)}
            className="w-full bg-black/40 border border-white/10 px-3 py-2 rounded-lg text-emerald-400 text-sm font-mono focus:outline-none focus:border-emerald-500/50"
          >
            {accounts.map(acc => (
              <option key={acc.accountId} value={acc.accountId}>
                {acc.accountId} {acc.ready ? '(Online)' : '(Offline)'}
              </option>
            ))}
            {accounts.length === 0 && <option value="default">default</option>}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-4 space-y-1">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 mt-4 px-2">Core</div>
          <NavItem icon={<Server size={18}/>} label="Node Panel" active={activeTab === 'nodes'} onClick={() => setActiveTab('nodes')} />
          <NavItem icon={<MessageCircle size={18}/>} label="Live Chat" active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
          
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 mt-6 px-2">Campaigns</div>
          <NavItem icon={<Send size={18}/>} label="Broadcast & Media" active={activeTab === 'broadcast'} onClick={() => setActiveTab('broadcast')} />
          <NavItem icon={<Clock size={18}/>} label="Scheduler Engine" active={activeTab === 'scheduler'} onClick={() => setActiveTab('scheduler')} />
          <NavItem icon={<Users size={18}/>} label="Contacts & CRM" active={activeTab === 'contacts'} onClick={() => setActiveTab('contacts')} />

          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 mt-6 px-2">Automation</div>
          <NavItem icon={<Zap size={18}/>} label="AI & Auto-Reply" active={activeTab === 'automation'} onClick={() => setActiveTab('automation')} />
        </div>

        <div className="p-4 border-t border-white/5">
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 text-sm font-medium text-slate-400 hover:text-rose-400 bg-white/5 hover:bg-rose-500/10 px-4 py-3 rounded-xl transition-all">
            <LogOut size={16} /> Disconnect
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 relative z-10 overflow-hidden flex flex-col">
          {activeTab === 'nodes' && <NodesView {...viewProps} />}
          {activeTab === 'chat' && <ChatView {...viewProps} />}
          {activeTab === 'broadcast' && <BroadcastView {...viewProps} />}
          {activeTab === 'scheduler' && <SchedulerView {...viewProps} />}
          {activeTab === 'contacts' && <ContactsView {...viewProps} />}
          {activeTab === 'automation' && <AutomationView {...viewProps} />}
      </main>

      {toast.show && <Toast message={toast.message} type={toast.type} />}
    </div>
  )
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 font-medium text-sm
        ${active ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(52,211,153,0.1)]' 
                 : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'}
      `}
    >
      {icon} {label}
    </button>
  )
}

// ----------------------------------------------------------------------
function Login({ onLogin }) {
  return (
    <div className="relative flex justify-center items-center min-h-screen bg-[#020617]">
      <BackgroundBlobs />
      <div className="glass-panel p-10 rounded-3xl w-full max-w-sm animate-fade-in relative z-10 flex flex-col items-center border border-white/10 shadow-2xl">
        <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
          <Key className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-500 mb-2 tracking-tight">Antigravity</h1>
        <p className="text-slate-400 text-sm mb-8 text-center">Authenticate to access the orchestration gateway.</p>
        
        <div className="w-full relative">
          <Key className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" />
          <input 
            type="password" placeholder="API Key" 
            className="w-full bg-black/30 border border-white/10 text-white pl-11 pr-4 py-3 rounded-xl mb-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-all focus:ring-1 focus:ring-emerald-500/50"
            onKeyDown={(e) => { if (e.key === 'Enter') onLogin(e.target.value); }} autoFocus
          />
        </div>
      </div>
    </div>
  )
}

function BackgroundBlobs() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-50">
      <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-emerald-500/20 blur-[130px] rounded-full mix-blend-screen animate-pulse duration-1000"></div>
      <div className="absolute top-1/4 -right-1/4 w-1/2 h-1/2 bg-cyan-500/10 blur-[150px] rounded-full mix-blend-screen overflow-hidden"></div>
      <div className="absolute -bottom-1/4 left-1/3 w-1/2 h-1/2 bg-purple-500/15 blur-[120px] rounded-full mix-blend-screen animate-pulse"></div>
    </div>
  )
}

function Toast({ message, type }) {
  const isError = type === 'error';
  return (
    <div className={`fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl z-[100] flex items-center gap-3 animate-fade-in border backdrop-blur-xl ${isError ? 'bg-rose-900/40 border-rose-500/30 text-rose-200' : 'bg-slate-900/90 border-emerald-500/30 text-emerald-300'}`}>
      <span className="font-medium text-sm">{message}</span>
    </div>
  )
}
