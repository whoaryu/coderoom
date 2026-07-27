import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Code2, Users, ArrowRight, Play, Sparkles } from 'lucide-react';

export const LandingPage: React.FC = () => {
  const { setMode, username, setUsername, createRoom, joinRoom } = useAppStore();
  const [roomInput, setRoomInput] = useState('');
  const [isPairFlow, setIsPairFlow] = useState(false);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    createRoom();
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !roomInput.trim()) return;
    // Extract room ID from URL if they pasted a link
    let target = roomInput.trim();
    if (target.includes('/room/')) {
      const parts = target.split('/room/');
      target = parts[parts.length - 1];
    }
    joinRoom(target);
  };

  return (
    <div className="landing-wrapper" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '24px',
      background: 'radial-gradient(circle at top right, rgba(99, 102, 241, 0.08), transparent 40%), radial-gradient(circle at bottom left, rgba(168, 85, 247, 0.05), transparent 45%)'
    }}>
      
      {/* Header / Brand */}
      <div style={{ textAlign: 'center', marginBottom: '40px', animation: 'fadeIn 0.8s ease' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '28px',
          fontWeight: 800,
          background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '12px'
        }}>
          <Code2 size={36} style={{ stroke: '#a855f7' }} />
          CodeRoom
        </div>
        <h1 style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '8px' }}>
          Distraction-Free Pair Coding
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '16px', maxWidth: '480px', margin: '0 auto', lineHeight: '1.6' }}>
          Collaborate in real-time, write notes, and run code securely in a lightweight development workspace.
        </p>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        width: '100%',
        maxWidth: '720px',
        animation: 'fadeInUp 0.8s ease'
      }}>
        {!isPairFlow ? (
          /* Initial Choice Pane */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Solo Card */}
            <div 
              className="glass-panel" 
              onClick={() => setMode('solo')}
              style={{
                padding: '32px',
                cursor: 'pointer',
                transition: 'all 0.3s',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-blue)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-blue)'
              }}>
                <Play size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>Solo Coding</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5' }}>
                  Open a quick editor instantly. Your work is saved locally. Perfect for practice and algorithm brainstorming.
                </p>
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-blue)', fontWeight: 600, fontSize: '14px' }}>
                Start Coding <ArrowRight size={16} />
              </div>
            </div>

            {/* Pair Card */}
            <div 
              className="glass-panel" 
              onClick={() => setIsPairFlow(true)}
              style={{
                padding: '32px',
                cursor: 'pointer',
                transition: 'all 0.3s',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-purple)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(168, 85, 247, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-purple)'
              }}>
                <Users size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>Pair Coding</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5' }}>
                  Create or join a collaborative workspace. Invite editors & viewers. Features synchronized execution & stopwatch.
                </p>
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-purple)', fontWeight: 600, fontSize: '14px' }}>
                Join or Create Room <ArrowRight size={16} />
              </div>
            </div>
          </div>
        ) : (
          /* Pair Coding Flow Setup */
          <div className="glass-panel" style={{ padding: '36px', position: 'relative' }}>
            <button 
              className="glass-button" 
              onClick={() => setIsPairFlow(false)}
              style={{ position: 'absolute', top: '24px', left: '24px', padding: '6px 12px', fontSize: '13px' }}
            >
              ← Back
            </button>

            <div style={{ textAlign: 'center', marginTop: '16px', marginBottom: '24px' }}>
              <Sparkles size={28} style={{ color: 'var(--accent-purple)', marginBottom: '8px' }} />
              <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Join / Create Pair Session</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
                Enter your details to coordinate with your partner
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Name Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Your Name</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your name..."
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

              {/* Form Splitter: Create Room on Left, Join on Right */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '8px' }}>
                {/* Create Room Block */}
                <div style={{ borderRight: '1px solid var(--border-color)', paddingRight: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    Host a Session
                  </h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.4' }}>
                    Generate a new room. You will be the host and can grant editor permissions.
                  </p>
                  <button 
                    onClick={handleCreateRoom}
                    disabled={!username.trim()}
                    className="glass-button glass-button-primary"
                    style={{ padding: '12px', width: '100%', opacity: username.trim() ? 1 : 0.5, cursor: username.trim() ? 'pointer' : 'not-allowed' }}
                  >
                    Create New Room
                  </button>
                </div>

                {/* Join Room Block */}
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                    Join a Session
                  </h4>
                  <form onSubmit={handleJoinRoom} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <input 
                      type="text" 
                      value={roomInput}
                      onChange={(e) => setRoomInput(e.target.value)}
                      placeholder="Room Code or Link..."
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                    <button 
                      type="submit"
                      disabled={!username.trim() || !roomInput.trim()}
                      className="glass-button"
                      style={{
                        padding: '10px',
                        width: '100%',
                        background: 'rgba(255,255,255,0.04)',
                        opacity: (username.trim() && roomInput.trim()) ? 1 : 0.5,
                        cursor: (username.trim() && roomInput.trim()) ? 'pointer' : 'not-allowed'
                      }}
                    >
                      Join Room
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
