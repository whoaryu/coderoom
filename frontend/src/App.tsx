import React, { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { LandingPage } from './components/LandingPage';
import { EditorWorkspace } from './components/EditorWorkspace';
import { AlertCircle, Code2 } from 'lucide-react';

function App() {
  const { mode, setUsername, joinRoom, toasts, removeToast } = useAppStore();
  const [initRoomId, setInitRoomId] = useState<string | null>(null);
  const [autoJoinName, setAutoJoinName] = useState('');

  // Detect URL parameter for room (e.g. /room/ABCD)
  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/room/')) {
      const parts = path.split('/room/');
      const roomId = parts[parts.length - 1];
      if (roomId && roomId.trim()) {
        setInitRoomId(roomId.trim().toUpperCase());
      }
    }
  }, []);

  const handleAutoJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!autoJoinName.trim() || !initRoomId) return;
    setUsername(autoJoinName);
    joinRoom(initRoomId);
    setInitRoomId(null); // Clear auto join state so we show loading / editor workspace
  };

  return (
    <>
      {/* Dynamic Toast Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div 
            key={toast.id} 
            className={`toast toast-${toast.type}`}
            onClick={() => removeToast(toast.id)}
            style={{ cursor: 'pointer' }}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Screen Blocker for Mobile devices */}
      <div className="mobile-blocker">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <AlertCircle size={48} style={{ color: 'var(--accent-purple)' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Screen Size Not Supported</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '300px', lineHeight: '1.6' }}>
            Pair coding and collaborative coding work best on larger screens. Please switch to a tablet or desktop browser.
          </p>
        </div>
      </div>

      {/* Main App Switching Logic */}
      {initRoomId ? (
        /* Invite Link Join Screen */
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          background: 'radial-gradient(circle at top right, rgba(99, 102, 241, 0.08), transparent 40%), radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.05), transparent 45%)'
        }}>
          <div className="glass-panel" style={{ padding: '36px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <Code2 size={40} style={{ color: 'var(--accent-purple)', marginBottom: '12px' }} />
            <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Join Session</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              You have been invited to join room <strong style={{ color: 'var(--text-primary)' }}>{initRoomId}</strong>.
            </p>

            <form onSubmit={handleAutoJoinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Your Name</label>
                <input 
                  type="text" 
                  value={autoJoinName}
                  onChange={(e) => setAutoJoinName(e.target.value)}
                  placeholder="Enter your name..."
                  required
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    fontSize: '15px',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--accent-purple)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                />
              </div>

              <button 
                type="submit"
                disabled={!autoJoinName.trim()}
                className="glass-button glass-button-primary"
                style={{ padding: '12px', width: '100%', opacity: autoJoinName.trim() ? 1 : 0.6 }}
              >
                Join Room
              </button>
              
              <button 
                type="button" 
                className="glass-button"
                onClick={() => setInitRoomId(null)}
                style={{ padding: '10px', width: '100%', background: 'transparent' }}
              >
                Go to Homepage
              </button>
            </form>
          </div>
        </div>
      ) : mode === 'landing' ? (
        <LandingPage />
      ) : (
        <EditorWorkspace />
      )}
    </>
  );
}

export default App;


// src/App.tsx(8,17): error TS6133: 'setMode' is declared but its value is never read.
// src/components/EditorWorkspace.tsx(11,3): error TS6133: 'Settings' is declared but its value is never read.
// src/components/EditorWorkspace.tsx(16,3): error TS6133: 'VolumeX' is declared but its value is never read.
// src/components/EditorWorkspace.tsx(29,5): error TS6133: 'myColor' is declared but its value is never read.
// src/components/EditorWorkspace.tsx(34,5): error TS6133: 'stopwatch' is declared but its value is never read.
// src/components/EditorWorkspace.tsx(108,58): error TS6133: 'fullCode' is declared but its value is never read.
// src/components/EditorWorkspace.tsx(340,31): error TS2322: Type 'boolean | null' is not assignable to type 'boolean'.
//   Type 'null' is not assignable to type 'boolean'.
// Error: Command "npm run build" exited with 2