import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Upload, LayoutDashboard, Copy, Download, Zap, Database, 
  CheckCircle2, LogIn, UserPlus, LogOut, ShieldCheck, Mail, Lock, PlusCircle, Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';

const API_BASE = import.meta.env.VITE_API_URL || "https://webhooktester.onrender.com/api";

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [authMode, setAuthMode] = useState('login'); // login or signup

  const [activeTab, setActiveTab] = useState('dashboard');
  const [jsonInput, setJsonInput] = useState('');
  const [apiKey, setApiKey] = useState(localStorage.getItem('last_apikey') || '');
  const [fields, setFields] = useState([]);
  const [entries, setEntries] = useState([]);
  const [myBots, setMyBots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  // Auth States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (token) {
      fetchMyBots();
    }
  }, [token]);

  useEffect(() => {
    if (apiKey && token) {
      fetchEntries();
    }
  }, [apiKey, token]);

  const authHeader = { headers: { Authorization: `Bearer ${token}` } };

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
    setActiveTab('dashboard');
    setMyBots([]);
    setEntries([]);
    setApiKey('');
  };

  const fetchMyBots = async () => {
    try {
      const res = await axios.get(`${API_BASE}/bot/my-bots`, authHeader);
      setMyBots(res.data);
      if (res.data.length > 0 && !apiKey) {
        setApiKey(res.data[0].apiKey);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpload = async () => {
    try {
      setLoading(true);
      const parsed = JSON.parse(jsonInput);
      const res = await axios.post(`${API_BASE}/bot/upload`, parsed, authHeader);
      setApiKey(res.data.apiKey);
      // setFields(res.data.fields); // Remove this as it's undefined and causes crash
      localStorage.setItem('last_apikey', res.data.apiKey);
      await fetchMyBots();
      setActiveTab('dashboard');
      setStatus('Success! Webhook generated.');
      setTimeout(() => setStatus(''), 3000);
    } catch (err) {
      console.error("Upload Error:", err);
      const msg = err.response?.data?.error || err.message || 'Upload Failed';
      alert(`Upload Failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchEntries = async () => {
    if (!apiKey) return;
    try {
      setLoading(true);
      setEntries([]); // Clear previous entries
      setFields([]);  // Clear previous fields
      const res = await axios.get(`${API_BASE}/webhook/entries/${apiKey}`, authHeader);
      setEntries(res.data.entries || []);
      setFields(res.data.fields || []);
    } catch (err) {
      console.error(err);
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

  const handleDeleteBot = async (apiKeyToDelete) => {
    if (!window.confirm('Are you sure you want to delete this bot and all its data? This cannot be undone.')) return;
    
    try {
      setLoading(true);
      await axios.delete(`${API_BASE}/bot/${apiKeyToDelete}`, authHeader);
      
      // Update bots list
      setMyBots(prev => prev.filter(b => b.apiKey !== apiKeyToDelete));
      
      // If we deleted the active bot, reset it
      if (apiKey === apiKeyToDelete) {
        const remainingBots = myBots.filter(b => b.apiKey !== apiKeyToDelete);
        if (remainingBots.length > 0) {
          setApiKey(remainingBots[0].apiKey);
        } else {
          setApiKey('');
          setEntries([]);
        }
      }
      
      setStatus('Bot deleted successfully');
      setTimeout(() => setStatus(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete bot');
    } finally {
      setLoading(false);
    }
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
          <h1 className="heading" style={{ fontSize: '1.8rem' }}>Control Center</h1>
          <p style={{ color: 'var(--text-dim)' }}>Logged in as <span style={{ color: '#fff' }}>{user.email}</span></p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
           <button className="btn btn-secondary" onClick={handleLogout}>
             <LogOut size={18} /> Logout
           </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '2rem' }}>
        <aside>
          <div className="card" style={{ padding: '1rem' }}>
            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
              <Zap size={16} color="var(--primary)" /> My Bots
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {myBots.map(bot => (
                <div 
                  key={bot.apiKey} 
                  className={`bot-item ${apiKey === bot.apiKey ? 'active' : ''}`}
                  onClick={() => { setApiKey(bot.apiKey); setActiveTab('dashboard'); }}
                  style={{ 
                    padding: '0.8rem', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    background: apiKey === bot.apiKey ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${apiKey === bot.apiKey ? 'var(--primary)' : 'transparent'}`,
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Bot: {bot.apiKey.slice(0, 8)}...</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{bot.fields.length} columns defined</div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBot(bot.apiKey);
                    }}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: 'rgba(255, 255, 255, 0.3)', 
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.color = '#ff4d4d'}
                    onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.3)'}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button 
                className="btn btn-secondary" 
                style={{ width: '100%', marginTop: '1rem', borderStyle: 'dashed' }}
                onClick={() => setActiveTab('upload')}
              >
                <PlusCircle size={16} /> New Bot
              </button>
            </div>
          </div>
        </aside>

        <main>
          {activeTab === 'upload' ? (
            <div className="card">
              <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <PlusCircle color="var(--primary)" /> Connect New Bot
              </h2>
              <div className="input-group">
                <label>Exported JSON Flow</label>
                <textarea 
                  rows="12" 
                  placeholder='Paste the bot flow JSON here'
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                />
              </div>
              <button className="btn" onClick={handleUpload} disabled={loading || !jsonInput}>
                {loading ? 'Processing...' : 'Deploy Universal Parser'}
              </button>
              {status && <div style={{ marginTop: '1rem', color: 'var(--primary)', fontWeight: 600 }}>{status}</div>}
            </div>
          ) : (
            <div className="card">
              {!apiKey ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                   <div style={{ marginBottom: '1rem' }}><Zap size={48} color="rgba(255,255,255,0.1)" /></div>
                   <p style={{ color: 'var(--text-dim)' }}>No bots found. Create one to get started.</p>
                   <button className="btn" onClick={() => setActiveTab('upload')} style={{ marginTop: '1rem' }}>Create First Bot</button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <Database color="var(--primary)" /> {entries.length} Live Entries
                      </h2>
                      <div className="webhook-badge" style={{ padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.05)' }}>
                        <span style={{ fontSize: '0.75rem' }}>{API_BASE}/webhook/{apiKey}</span>
                        <button className="copy-btn" onClick={() => copyWebhook(apiKey)} title="Copy Webhook">
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                      <button className="btn btn-secondary" onClick={fetchEntries} disabled={loading}>
                        Refresh
                      </button>
                      <button className="btn" onClick={exportToExcel} disabled={entries.length === 0}>
                        <Download size={18} /> Export
                      </button>
                    </div>
                  </div>

                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Name</th>
                          <th>Phone</th>
                          {fields.map(f => <th key={f}>{f}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map(entry => (
                          <tr key={entry.id}>
                            <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                              {new Date(entry.updatedAt).toLocaleTimeString()}
                            </td>
                            <td style={{ fontWeight: 600 }}>{entry.name}</td>
                            <td style={{ color: 'var(--primary)' }}>{entry.phone}</td>
                            {fields.map(f => <td key={f}>{entry[f]}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {entries.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                        Waiting for webhooks...
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
      {status && !user && <div className="status-toast">{status}</div>}
    </div>
  );
}

export default App;
