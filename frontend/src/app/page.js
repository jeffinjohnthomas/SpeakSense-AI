"use client";
import { useState, useEffect, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api";

export default function Home() {
  const [logs, setLogs] = useState([]);
  const [targetNumber, setTargetNumber] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
  const [loading, setLoading] = useState(false);
  const [activeLogId, setActiveLogId] = useState(null);
  const [toast, setToast] = useState(null);
  const [criticalAlert, setCriticalAlert] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const audioRef = useRef(null);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/logs`);
      if (!res.ok) throw new Error("Failed to connect");
      const data = await res.json();
      setLogs(data);

      // Check for negative sentiments to trigger alert
      const negativeEmotions = ["sadness", "anger", "hate", "worry", "boredom", "empty", "negative"];
      if (data.length > 0) {
        const latest = data[0]; // Assuming reversed logs (newest first)
        if (latest.status === 'completed' && negativeEmotions.includes(latest.sentiment.toLowerCase())) {
          // Trigger alert if it's a new critical log
          setCriticalAlert({
            phone: latest.phone,
            sentiment: latest.sentiment,
            id: latest.sid
          });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);



  const initiateCall = async (e) => {
    e.preventDefault();
    if (!targetNumber || targetNumber.length < 5) return;
    const fullNumber = `${countryCode}${targetNumber}`;
    setLoading(true);
    setCriticalAlert(null); // clear old alerts on new call
    try {
      const res = await fetch(`${API_BASE}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_number: fullNumber })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to initiate call");
      }
      const data = await res.json();
      setActiveLogId(data.sid);
      fetchLogs();
      showToast("Call initiated successfully!");
    } catch (err) {
      console.error(err);
      showToast(err.message, true);
    }
    setLoading(false);
  };

  const getAudioUrl = (url) => {
    if (!url) return "";
    if (url.startsWith('http')) return url;
    const baseUrl = API_BASE.replace('/api', '');
    return `${baseUrl}${url}`;
  };

  const generatePoints = (text) => {
    if (!text) return [];
    return text.split('.').map(s => s.trim()).filter(s => s.length > 5);
  };

  const getSentimentClass = (sentiment) => {
    if (!sentiment) return 'neutral';
    const s = sentiment.toLowerCase();
    if (["happy", "joy", "love", "relief", "positive"].includes(s)) return "positive";
    if (["sadness", "anger", "hate", "worry", "boredom", "negative", "empty"].includes(s)) return "negative";
    if (["pending", "in-progress", "analyzing", "processing"].includes(s)) return "in-progress";
    return "neutral";
  };

  const activeLog = logs.find(l => l.sid === activeLogId);
  const audioUrl = activeLog ? getAudioUrl(activeLog.audio_url) : null;

  // Update audio player when active log changes or its audio url loads
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [activeLogId, audioUrl]);
  return (
    <div className="container fade-in">
      {toast && (
        <div className={`toast fade-in ${toast.isError ? 'error' : ''}`}>
          {toast.isError ? '⚠️' : '✅'} {toast.msg}
        </div>
      )}
      
      <div className="header">
        <h1>SpeakSense AI</h1>
        <p>Live Call Sentiment & Diagnostic Platform</p>
      </div>

      <div className="grid">
        {/* Sidebar */}
        <div>
          <div className="glass-panel">
            <h2 style={{marginTop: 0, marginBottom: '24px', fontSize: '1.4rem'}}>Target Configuration</h2>
            <form onSubmit={initiateCall}>
              <div className="input-group">
                <label>Phone Number (Select Country & Enter Number)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    className="input" 
                    value={countryCode} 
                    onChange={e => setCountryCode(e.target.value)}
                    style={{ width: '130px', cursor: 'pointer', appearance: 'menulist' }}
                  >
                    <option value="+91">(IND) +91</option>
                    <option value="+1">(USA) +1</option>
                    <option value="+44">(UK) +44</option>
                    <option value="+61">(AUS) +61</option>
                    <option value="+81">(JPN) +81</option>
                    <option value="+49">(DEU) +49</option>
                    <option value="+33">(FRA) +33</option>
                    <option value="+971">(UAE) +971</option>
                    <option value="+86">(CHN) +86</option>
                  </select>
                  <input 
                    type="text" 
                    className="input" 
                    style={{ flex: 1 }}
                    value={targetNumber} 
                    onChange={e => setTargetNumber(e.target.value.replace(/\D/g, ''))} 
                    placeholder="9980753296"
                  />
                </div>
              </div>
              <button type="submit" className="btn" disabled={loading}>
                {loading ? "Initiating..." : "Initiate Live Analysis"}
              </button>
            </form>
          </div>

          <h3 style={{marginTop: '40px', fontSize: '1.25rem', color: '#f8fafc', marginBottom: '16px'}}>Recent Call Logs</h3>
          <div className="log-list">
            {logs.length === 0 && <p style={{color: '#94a3b8', fontStyle: 'italic'}}>No calls initiated yet.</p>}
            {logs.map((log) => {
              const sClass = getSentimentClass(log.sentiment);
              return (
                <div 
                  key={log.sid} 
                  className={`log-card ${sClass} ${activeLogId === log.sid ? 'active' : ''}`}
                  onClick={() => setActiveLogId(log.sid)}
                >
                  <div className="log-phone">📞 {log.phone}</div>
                  <div className="log-meta">
                    <span>📅 {log.time}</span>
                    <span>⏱️ {log.duration}s</span>
                  </div>
                  <div className={`pill ${sClass}`}>{log.status === 'completed' ? log.sentiment : log.status}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="glass-panel" style={{minHeight: '700px', display: 'flex', flexDirection: 'column'}}>
          {/* Critical Alert Banner */}
          {criticalAlert && (!activeLog || activeLog.sid === criticalAlert.id) && (
            <div className="critical-alert fade-in">
              <div style={{fontSize: '2.5rem'}}>🚨</div>
              <div style={{flex: 1}}>
                <h3>ATTENTION REQUIRED: NEGATIVE SENTIMENT DETECTED</h3>
                <p>Number: <b>{criticalAlert.phone}</b> | Emotion: <b style={{textTransform: 'uppercase'}}>{criticalAlert.sentiment}</b></p>
              </div>
              <button 
                onClick={() => setCriticalAlert(null)}
                style={{
                  background: 'rgba(0,0,0,0.3)', border: 'none', color: 'white', 
                  padding: '10px 16px', borderRadius: '8px', cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Dismiss
              </button>
            </div>
          )}

          {!activeLog ? (
            <div style={{display: 'flex', height: '100%', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '1.1rem'}}>
              👈 Select a call log or initiate a new call to view results.
            </div>
          ) : (
            <div className="fade-in" style={{flex: 1}}>
              <h2 style={{marginTop: 0, marginBottom: '32px', fontSize: '1.75rem'}}>📋 Call Report: <span style={{color: 'var(--primary)'}}>{activeLog.phone}</span></h2>
              
              <div className="report-header">
                <div className="metric">
                  <div className="metric-label">Status</div>
                  <div className="metric-value" style={{textTransform: 'capitalize'}}>{activeLog.status}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Emotion Detected</div>
                  <div className="metric-value" style={{color: `var(--${getSentimentClass(activeLog.sentiment)})`, textTransform: 'capitalize'}}>
                    {activeLog.status === 'completed' ? activeLog.sentiment : 'Pending'}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">Word Count</div>
                  <div className="metric-value">{activeLog.transcription ? activeLog.transcription.split(/\s+/).length : 0}</div>
                </div>
              </div>

              {activeLog.status === "in-progress" || activeLog.status === "processing" || activeLog.status === "analyzing" ? (
                <div style={{textAlign: 'center', padding: '60px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', border: '1px dashed var(--border)'}}>
                  <div className="spinner"></div>
                  <h3 style={{fontSize: '1.5rem', marginBottom: '8px'}}>System Processing...</h3>
                  <p style={{color: '#94a3b8', fontSize: '1.1rem'}}>Please wait while we connect to Twilio and transcribe the audio.</p>
                </div>
              ) : activeLog.status === "failed" ? (
                <div style={{textAlign: 'center', padding: '60px 20px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.3)'}}>
                  <div style={{fontSize: '3rem', marginBottom: '16px'}}>⚠️</div>
                  <h3 style={{fontSize: '1.5rem', color: '#fca5a5'}}>Call Failed</h3>
                  <p style={{color: '#fecaca', fontSize: '1.1rem'}}>{activeLog.sentiment}</p>
                </div>
              ) : (
                <div className="fade-in">
                  <div className="tabs">
                    <button 
                      className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
                      onClick={() => setActiveTab('chat')}
                    >
                      💬 Chat View
                    </button>
                    <button 
                      className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
                      onClick={() => setActiveTab('summary')}
                    >
                      📝 Smart Summary
                    </button>
                    <button 
                      className={`tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
                      onClick={() => setActiveTab('audio')}
                    >
                      🎧 Raw Audio
                    </button>
                  </div>

                  {activeTab === 'chat' && (
                    <div className="fade-in">
                      <div className="diagnostic-box">
                        🤖 <b>AI Diagnostic:</b> The user seems <b style={{textTransform: 'capitalize'}}>{activeLog.sentiment}</b>.
                      </div>
                      <div className="chat-bubble">
                        {activeLog.transcription ? activeLog.transcription : <span style={{fontStyle: 'italic', color: '#64748b'}}>No transcription available (Audio might have been too short).</span>}
                      </div>
                    </div>
                  )}

                  {activeTab === 'summary' && (
                    <div className="fade-in">
                      <h4 style={{marginBottom: '16px', fontSize: '1.1rem', color: '#e2e8f0'}}>Key Conversation Points</h4>
                      {generatePoints(activeLog.transcription).length > 0 ? (
                        generatePoints(activeLog.transcription).map((point, idx) => (
                          <div key={idx} className="info-box">📌 {point}</div>
                        ))
                      ) : (
                        <div className="warning-box">⚠️ Audio was too short to generate a summary.</div>
                      )}
                    </div>
                  )}

                  {activeTab === 'audio' && (
                    <div className="fade-in">
                      {activeLog.audio_url ? (
                        <audio ref={audioRef} controls className="audio-player" style={{marginBottom: '24px'}}>
                          <source src={getAudioUrl(activeLog.audio_url)} type="audio/wav" />
                          Your browser does not support the audio element.
                        </audio>
                      ) : (
                        <div className="warning-box" style={{marginBottom: '24px'}}>⚠️ Audio file not available.</div>
                      )}
                      
                      <div style={{background: 'rgba(0,0,0,0.5)', padding: '16px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.9rem', color: '#a7f3d0', border: '1px solid rgba(167, 243, 208, 0.2)'}}>
                        <pre style={{margin: 0}}>{JSON.stringify({
                          sid: activeLog.sid,
                          recording_sid: activeLog.sid,
                          sentiment_raw: activeLog.sentiment
                        }, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
