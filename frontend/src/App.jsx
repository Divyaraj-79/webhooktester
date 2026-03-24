import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  LayoutDashboard, Copy, Download, Zap, Database, 
  CheckCircle2, LogIn, UserPlus, LogOut, ShieldCheck, Mail, Lock, PlusCircle, Trash2, RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [authMode, setAuthMode] = useState('login'); // login or signup

  const [apiKey, setApiKey] = useState('');
  const [fields, setFields] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  // Auth States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const authHeader = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    if (token) {
      fetchUniversalBot();
    }
  }, [token]);

  useEffect(() => {
    if (apiKey && token) {
      fetchEntries();
    }
  }, [apiKey, token]);

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const res = await axios.post(`${API_BASE}${endpoint}`, { email, password });
      
      setUser(res.data.user);
      setToken(res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      localStorage.setItem('token', res.data.token);
      setStatus(`Welcome back, ${res.data.user.email}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Authentication Failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setEntries([]);
    setApiKey('');
  };

  const fetchUniversalBot = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/bot/universal`, authHeader);
      setApiKey(res.data.apiKey);
    } catch (err) {
      console.error("Fetch Bot Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEntries = async () => {
    if (!apiKey) return;
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/webhook/entries/${apiKey}`, authHeader);
      setEntries(res.data.entries || []);
      setFields(res.data.fields || []);
    } catch (err) {
      console.error("Fetch Entries Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    try {
      // Create a new workbook and worksheet
      const wb = XLSX.utils.book_new();
      
      // Prepare data for the worksheet
      const data = entries.map(entry => {
        const row = {
          'Date': new Date(entry.updatedAt).toLocaleString(),
          'Name': entry.name,
          'Phone': entry.phone
        };
        fields.forEach(f => {
          row[f] = entry[f] || 'N/A';
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(data);

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Chatbot Data");

      // Generate and download file
      XLSX.writeFile(wb, `webhook_export_${apiKey.slice(0, 6)}.xlsx`);
      
      setStatus('Excel exported successfully!');
      setTimeout(() => setStatus(''), 3000);
    } catch (err) {
      alert("Export failed: " + err.message);
    }
  };

  const copyWebhook = (key) => {
    const url = `${API_BASE}/webhook/${key}`;
    navigator.clipboard.writeText(url);
    setStatus('Copied to clipboard!');
    setTimeout(() => setStatus(''), 2000);
  };

  if (!user) {
    return (
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div className="card" style={{ width: '100%', maxWidth: '400px', animation: 'fadeIn 0.5s ease-out' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'inline-flex', padding: '1rem', background: 'rgba(0, 255, 136, 0.1)', borderRadius: '50%', marginBottom: '1rem' }}>
              <ShieldCheck size={32} color="var(--primary)" />
            </div>
            <h2 className="heading">{authMode === 'login' ? 'Welcome Back' : 'Get Started'}</h2>
            <p style={{ color: 'var(--text-dim)' }}>{authMode === 'login' ? 'Login to access your bot webhooks' : 'Create an account to start tracking'}</p>
          </div>

          <form onSubmit={handleAuth}>
            <div className="input-group">
              <label><Mail size={14} style={{ marginRight: '4px' }} /> Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
            </div>
            <div className="input-group">
              <label><Lock size={14} style={{ marginRight: '4px' }} /> Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>
            <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Authenticating...' : authMode === 'login' ? 'Login Now' : 'Create Account'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}{' '}
            <span 
              style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
            >
              {authMode === 'login' ? 'Sign Up' : 'Login'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h1 className="heading" style={{ fontSize: '1.8rem' }}>Live Webhook Console</h1>
          <p style={{ color: 'var(--text-dim)' }}>Logged in as <span style={{ color: '#fff' }}>{user.email}</span></p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
           <button className="btn btn-secondary" onClick={handleLogout}>
             <LogOut size={18} /> Logout
           </button>
        </div>
      </header>

      <main>
        <div className="card" style={{ border: '1px solid rgba(0, 255, 136, 0.2)', background: 'linear-gradient(145deg, rgba(20, 25, 35, 0.9), rgba(15, 20, 30, 1))' }}>
          {!apiKey && loading ? (
            <div style={{ textAlign: 'center', padding: '4rem' }}>
               <RefreshCw className="spin" size={32} color="var(--primary)" />
               <p style={{ marginTop: '1rem', color: 'var(--text-dim)' }}>Initializing your universal webhook...</p>
            </div>
          ) : !apiKey ? (
            <div style={{ textAlign: 'center', padding: '4rem' }}>
               <Zap size={48} color="rgba(255,255,255,0.1)" />
               <p style={{ color: 'var(--text-dim)' }}>No webhook found. Please refresh or contact support.</p>
               <button className="btn" onClick={fetchUniversalBot} style={{ marginTop: '1rem' }}>Retry Initialization</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1.5rem' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <Database color="var(--primary)" /> {entries.length} Total Interactions
                  </h2>
                  <div className="webhook-badge" style={{ padding: '0.8rem 1.2rem', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>Your Universal Webhook URL</div>
                      <div style={{ fontSize: '0.85rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{API_BASE}/webhook/{apiKey}</div>
                    </div>
                    <button className="copy-btn" onClick={() => copyWebhook(apiKey)} title="Copy Webhook" style={{ background: 'var(--primary)', color: '#000', padding: '0.6rem', borderRadius: '8px' }}>
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '0.8rem' }}>
                  <button className="btn btn-secondary" onClick={fetchEntries} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh Map
                  </button>
                  <button className="btn" onClick={exportToExcel} disabled={entries.length === 0} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Download size={18} /> Export CSV
                  </button>
                </div>
              </div>

              <div className="table-container" style={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ background: 'rgba(255,255,255,0.02)' }}>Last Activity</th>
                      <th style={{ background: 'rgba(255,255,255,0.02)' }}>Contact Name</th>
                      <th style={{ background: 'rgba(255,255,255,0.02)' }}>Phone Number</th>
                      {fields.map(f => <th key={f} style={{ background: 'rgba(255,255,255,0.02)' }}>{f}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => (
                      <tr key={entry.id}>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          {new Date(entry.updatedAt).toLocaleString()}
                        </td>
                        <td style={{ fontWeight: 600 }}>{entry.name || 'Anonymous'}</td>
                        <td style={{ color: 'var(--primary)', fontWeight: 500 }}>{entry.phone}</td>
                        {fields.map(f => <td key={f}>{entry[f] || '-'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {entries.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '5rem', background: 'rgba(0,0,0,0.1)' }}>
                    <Zap size={32} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p style={{ color: 'var(--text-dim)' }}>Waiting for first webhook ping...</p>
                    <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.2)', marginTop: '0.5rem' }}>Send a message to your bot to see live data here.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
      
      {status && <div className="status-toast" style={{ position: 'fixed', bottom: '2rem', right: '2rem', background: 'var(--primary)', color: '#000', padding: '1rem 2rem', borderRadius: '12px', fontWeight: 600, boxShadow: '0 10px 30px rgba(0, 255, 136, 0.3)', animation: 'slideUp 0.3s ease-out' }}>{status}</div>}
      
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

export default App;
