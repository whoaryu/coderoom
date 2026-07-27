import React, { useEffect, useRef, useState } from 'react';
import MonacoEditor, { type Monaco } from '@monaco-editor/react';
import { useAppStore, type Role } from '../store';
import {
  Play,
  Copy,
  Sun,
  Moon,
  Users,
  BookOpen,
  Settings,
  LogOut,
  Terminal,
  AlertTriangle,
  FileCode,
  VolumeX,
  UserX,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

export const EditorWorkspace: React.FC = () => {
  const {
    mode,
    roomId,
    roomCode,
    hostId,
    role,
    myColor,
    members,
    language,
    codeContent,
    notes,
    stopwatch,
    input,
    output,
    errors,
    status,
    socket,
    setLanguage,
    setCodeContent,
    setNotes,
    setInput,
    executeCode,
    leaveRoom,
    addToast
  } = useAppStore();

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'members' | 'notes'>('notes');
  const [activeConsoleTab, setActiveConsoleTab] = useState<'output' | 'errors'>('output');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const isApplyingRemote = useRef(false);
  const remoteDecorations = useRef<Record<string, string[]>>({});

  // Sync active sidebar tab when in pair mode
  useEffect(() => {
    if (mode === 'pair') {
      setActiveSidebarTab('members');
    } else {
      setActiveSidebarTab('notes');
    }
  }, [mode]);

  // Handle Theme Toggle
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (nextTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  };

  // Copy Invite Link
  const handleCopyLink = () => {
    const link = `${window.location.origin}/room/${roomId || roomCode}`;
    navigator.clipboard.writeText(link);
    addToast('Invite link copied to clipboard!', 'success');
  };

  // Copy Room Code
  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    addToast('Room code copied to clipboard!', 'success');
  };

  // Monaco Editor Initialization
  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Set starter code
    editor.setValue(codeContent);

    // Track local cursor position changes and broadcast to other editors
    editor.onDidChangeCursorPosition((e: any) => {
      handleCursorChange(e);
    });

    // Socket listeners for Monaco Editor
    if (mode === 'pair' && socket) {
      // 1. Receive Editor Updates
      socket.on('code-changed', ({ changes, codeContent: fullCode }) => {
        if (isApplyingRemote.current) return;
        isApplyingRemote.current = true;

        const model = editor.getModel();
        if (model) {
          model.pushEditOperations(
            editor.getSelections(),
            changes.map((change: any) => ({
              range: new monaco.Range(
                change.range.startLineNumber,
                change.range.startColumn,
                change.range.endLineNumber,
                change.range.endColumn
              ),
              text: change.text,
              forceMoveMarkers: true
            })),
            () => null
          );
        }
        isApplyingRemote.current = false;
      });

      // 2. Receive Remote Cursor & Selection
      socket.on('cursor-changed', ({ userId, cursor, selection, name, color }) => {
        // Dynamically insert CSS classes for remote user cursors
        let styleEl = document.getElementById(`cursor-style-${userId}`);
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = `cursor-style-${userId}`;
          document.head.appendChild(styleEl);
        }
        styleEl.innerHTML = `
          .remote-cursor-${userId} {
            background-color: ${color} !important;
          }
          .remote-cursor-label-${userId} {
            position: relative;
          }
          .remote-cursor-label-${userId}::after {
            content: "${name}";
            position: absolute;
            top: -20px;
            left: 0;
            background-color: ${color};
            color: white;
            font-size: 10px;
            font-weight: 600;
            padding: 1px 4px;
            border-radius: 3px;
            white-space: nowrap;
            font-family: system-ui, sans-serif;
            pointer-events: none;
            z-index: 9999;
          }
          .remote-selection-${userId} {
            background-color: ${color}33 !important;
          }
        `;

        const newDecorations: any[] = [];

        if (selection && (selection.startLineNumber !== selection.endLineNumber || selection.startColumn !== selection.endColumn)) {
          newDecorations.push({
            range: new monaco.Range(
              selection.startLineNumber,
              selection.startColumn,
              selection.endLineNumber,
              selection.endColumn
            ),
            options: {
              className: `remote-selection-${userId}`,
              stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
          });
        }

        if (cursor) {
          newDecorations.push({
            range: new monaco.Range(
              cursor.lineNumber,
              cursor.column,
              cursor.lineNumber,
              cursor.column
            ),
            options: {
              className: `remote-cursor remote-cursor-${userId}`,
              before: {
                content: '\u200B', // zero width space
                inlineClassName: `remote-cursor-label remote-cursor-label-${userId}`
              }
            }
          });
        }

        const oldDecs = remoteDecorations.current[userId] || [];
        remoteDecorations.current[userId] = editor.deltaDecorations(oldDecs, newDecorations);
      });

      // Clear decorations if user leaves
      socket.on('user-left', ({ members: updatedMembers }) => {
        // Scan for missing users and delete their style/decorations
        const activeIds = Object.keys(updatedMembers);
        Object.keys(remoteDecorations.current).forEach((userId) => {
          if (!activeIds.includes(userId)) {
            const oldDecs = remoteDecorations.current[userId] || [];
            editor.deltaDecorations(oldDecs, []);
            delete remoteDecorations.current[userId];
            document.getElementById(`cursor-style-${userId}`)?.remove();
          }
        });
      });
    }
  };

  // Handle local code editing (Broadcasting edits to Socket)
  const handleEditorChange = (value: string | undefined, ev: any) => {
    if (!value) return;
    setCodeContent(value);

    if (mode === 'pair' && socket && !isApplyingRemote.current && ev.changes) {
      socket.emit('code-change', {
        roomId,
        changes: ev.changes,
        codeContent: value
      });
    }
  };

  // Monitor cursor movement
  const handleCursorChange = (ev: any) => {
    if (mode === 'pair' && socket && editorRef.current) {
      const position = ev.position;
      const selection = editorRef.current.getSelection();
      socket.emit('cursor-change', {
        roomId,
        cursor: position,
        selection: selection
      });
    }
  };

  // Update Monaco value if codeContent changes externally (like language templates)
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== codeContent) {
      isApplyingRemote.current = true;
      editorRef.current.setValue(codeContent);
      isApplyingRemote.current = false;
    }
  }, [codeContent]);

  // Adjust console focus when status changes
  useEffect(() => {
    if (status === 'Compilation Error' || status === 'Runtime Error' || status === 'Timeout') {
      setActiveConsoleTab('errors');
    } else if (status === 'Success') {
      setActiveConsoleTab('output');
    }
  }, [status]);

  // Member Management Helpers (Host controls)
  const isHost = mode === 'solo' || (socket && socket.id === hostId);

  const handleUpdateRole = (targetSocketId: string, newRole: Role) => {
    if (socket) {
      socket.emit('update-member-role', { roomId, targetSocketId, role: newRole });
    }
  };

  const handleKickMember = (targetSocketId: string) => {
    if (socket) {
      socket.emit('remove-member', { roomId, targetSocketId });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>

      {/* 1. Header Bar */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div className="logo-container" style={{ cursor: 'pointer' }} onClick={leaveRoom}>
            <FileCode size={24} style={{ color: 'var(--accent-purple)' }} />
            <span>CodeRoom</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              background: mode === 'solo' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
              color: mode === 'solo' ? 'var(--accent-blue)' : 'var(--accent-purple)'
            }}>
              {mode === 'solo' ? 'Solo Mode' : `Pair Room`}
            </span>

            {mode === 'pair' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
                <span
                  onClick={handleCopyCode}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-tertiary)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '13px'
                  }}
                  title="Click to copy Code"
                >
                  Code: {roomCode}
                </span>
                <button
                  className="glass-button"
                  onClick={handleCopyLink}
                  style={{ padding: '6px', borderRadius: '4px' }}
                  title="Copy Invite Link"
                >
                  <Copy size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Stopwatch Header Component */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <StopwatchComponent isHost={isHost} />

          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={role !== 'Editor'}
            style={{
              padding: '6px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              outline: 'none',
              cursor: role === 'Editor' ? 'pointer' : 'not-allowed',
              opacity: role === 'Editor' ? 1 : 0.6
            }}
          >
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
          </select>

          <button
            className="glass-button glass-button-primary"
            onClick={executeCode}
            disabled={status === 'Running'}
            style={{ padding: '6px 16px', fontSize: '13px', borderRadius: '6px' }}
          >
            <Play size={13} fill="currentColor" />
            {status === 'Running' ? 'Running...' : 'Run'}
          </button>

          {/* Participant Avatars */}
          {mode === 'pair' && <AvatarList />}

          <button
            className="glass-button"
            onClick={toggleTheme}
            style={{ padding: '6px', borderRadius: '6px' }}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            className="glass-button"
            onClick={leaveRoom}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              borderColor: 'rgba(239, 68, 68, 0.2)',
              color: '#ef4444'
            }}
          >
            <LogOut size={14} />
            <span>Leave</span>
          </button>
        </div>
      </header>

      {/* 2. Workspace Content */}
      <div className="workspace-container">

        {/* Editor and Console (Main Column) */}
        <div className="main-column">

          {/* Monaco Editor Pane */}
          <div className="editor-pane">
            <MonacoEditor
              height="100%"
              language={language === 'cpp' ? 'cpp' : language}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              value={codeContent}
              onChange={handleEditorChange}
              onMount={handleEditorDidMount}
              options={{
                fontSize: 14,
                fontFamily: 'var(--font-mono)',
                minimap: { enabled: false },
                automaticLayout: true,
                readOnly: role !== 'Editor',
                cursorBlinking: 'blink',
                wordWrap: 'on',
                formatOnPaste: true,
                lineNumbers: 'on',
                bracketPairColorization: { enabled: true }
              }}
            />

            {role !== 'Editor' && (
              <div style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.9)',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 100
              }}>
                <AlertTriangle size={14} />
                Viewer Mode (Read-Only)
              </div>
            )}
          </div>

          {/* Console / Output Tabs Pane */}
          <div className="console-pane">
            <div className="console-header">
              <div className="console-tabs">
                <button
                  className={`console-tab ${activeConsoleTab === 'output' ? 'active' : ''}`}
                  onClick={() => setActiveConsoleTab('output')}
                >
                  <Terminal size={14} style={{ marginRight: '6px', display: 'inline' }} />
                  Output
                </button>
                <button
                  className={`console-tab ${activeConsoleTab === 'errors' ? 'active' : ''}`}
                  onClick={() => setActiveConsoleTab('errors')}
                  style={{ color: errors ? '#f87171' : 'var(--text-secondary)' }}
                >
                  {errors && <AlertTriangle size={14} style={{ marginRight: '6px', display: 'inline', color: '#f87171' }} />}
                  Errors & compiler
                </button>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                Status: <span style={{
                  color: status === 'Success' ? 'var(--accent-green)' :
                    status === 'Running' ? 'var(--accent-cyan)' :
                      status === 'Idle' ? 'var(--text-muted)' : '#ef4444'
                }}>{status}</span>
              </div>
            </div>

            <div className="console-body">
              {/* Left Side: Stdin Input */}
              <div className="input-section">
                <div className="section-label">Input (stdin)</div>
                <textarea
                  className="console-textarea"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Enter inputs here..."
                />
              </div>

              {/* Right Side: Execution Output */}
              <div className="output-section">
                <div className="section-label">Result</div>
                {activeConsoleTab === 'output' ? (
                  <div className="console-output-display output-success">
                    {status === 'Running' && <div className="output-running">Executing code...</div>}
                    {output || (status !== 'Running' && 'No execution output yet.')}
                  </div>
                ) : (
                  <div className="console-output-display output-error">
                    {errors || 'No compilation/runtime errors.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Collapsible Sidebar (Members & Notes) */}
        {isSidebarOpen ? (
          <div className="sidebar-panel">
            <div className="sidebar-header">
              {mode === 'pair' && (
                <button
                  className={`sidebar-tab-btn ${activeSidebarTab === 'members' ? 'active' : ''}`}
                  onClick={() => setActiveSidebarTab('members')}
                >
                  <Users size={16} />
                  Members
                </button>
              )}
              <button
                className={`sidebar-tab-btn ${activeSidebarTab === 'notes' ? 'active' : ''}`}
                onClick={() => setActiveSidebarTab('notes')}
              >
                <BookOpen size={16} />
                Notes
              </button>
              <button
                onClick={() => setIsSidebarOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  padding: '4px'
                }}
                title="Collapse Sidebar"
              >
                ➔
              </button>
            </div>

            <div className="sidebar-content">
              {activeSidebarTab === 'members' && mode === 'pair' ? (
                /* Members Panel List */
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase' }}>
                    Active Participants ({Object.keys(members).length})
                  </div>
                  {Object.values(members).map((member) => {
                    const isSelf = member.id === socket?.id;
                    const targetIsHost = member.id === hostId;
                    return (
                      <div className="user-card" key={member.id}>
                        <div className="user-info">
                          <div
                            className="user-avatar"
                            style={{ backgroundColor: member.color, borderColor: member.isOnline ? 'var(--accent-green)' : 'var(--border-color)' }}
                          >
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="user-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {member.name}
                              {isSelf && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(You)</span>}
                              {targetIsHost && <span style={{ fontSize: '10px', color: 'var(--accent-cyan)' }}>👑</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                              <span className={`user-role-badge ${member.role === 'Editor' ? 'editor' : ''}`}>
                                {member.role}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Host controls for other users */}
                        {isHost && !isSelf && (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {member.role === 'Viewer' ? (
                              <button
                                className="glass-button"
                                style={{ padding: '4px 6px', fontSize: '11px' }}
                                onClick={() => handleUpdateRole(member.id, 'Editor')}
                                title="Promote to Editor"
                              >
                                <ArrowUp size={12} /> Promote
                              </button>
                            ) : (
                              // Only demote if they are not the host
                              !targetIsHost && (
                                <button
                                  className="glass-button"
                                  style={{ padding: '4px 6px', fontSize: '11px' }}
                                  onClick={() => handleUpdateRole(member.id, 'Viewer')}
                                  title="Demote to Viewer"
                                >
                                  <ArrowDown size={12} /> Demote
                                </button>
                              )
                            )}
                            {!targetIsHost && (
                              <button
                                className="glass-button"
                                style={{ padding: '4px 6px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.15)' }}
                                onClick={() => handleKickMember(member.id)}
                                title="Remove member"
                              >
                                <UserX size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Notes Panel Content */
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Shared Scratchpad (Notes)
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Jot down algorithm steps, edge cases, complexities, or hints here. Synced automatically..."
                    style={{
                      flex: 1,
                      minHeight: '280px',
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '13px',
                      fontFamily: 'var(--font-sans)',
                      resize: 'none',
                      lineHeight: '1.5',
                      outline: 'none'
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Sidebar Collapsed Ribbon */
          <div
            onClick={() => setIsSidebarOpen(true)}
            style={{
              width: '40px',
              background: 'var(--bg-secondary)',
              borderLeft: '1px solid var(--border-color)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: '16px',
              gap: '20px',
              color: 'var(--text-secondary)'
            }}
            title="Expand Sidebar"
          >
            <span>➔</span>
            <Users size={16} />
            <BookOpen size={16} />
          </div>
        )}

      </div>
    </div>
  );
};

/* Stopwatch Component */
interface StopwatchProps {
  isHost: boolean;
}

const StopwatchComponent: React.FC<StopwatchProps> = ({ isHost }) => {
  const { stopwatch, roomId, mode, socket } = useAppStore();
  const [displayTime, setDisplayTime] = useState(0);

  useEffect(() => {
    let intervalId: any;

    if (stopwatch.isRunning && stopwatch.lastStarted) {
      const update = () => {
        const elapsed = Math.floor((Date.now() - stopwatch.lastStarted!) / 1000);
        setDisplayTime(stopwatch.time + elapsed);
      };
      update();
      intervalId = setInterval(update, 1000);
    } else {
      setDisplayTime(stopwatch.time);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [stopwatch]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  const handleStart = () => {
    if (mode === 'pair') {
      socket?.emit('stopwatch-control', { roomId, action: 'start' });
    } else {
      useAppStore.getState().setStopwatch({
        isRunning: true,
        time: displayTime,
        lastStarted: Date.now()
      });
    }
  };

  const handlePause = () => {
    if (mode === 'pair') {
      socket?.emit('stopwatch-control', { roomId, action: 'pause', currentTime: displayTime });
    } else {
      useAppStore.getState().setStopwatch({
        isRunning: false,
        time: displayTime,
        lastStarted: null
      });
    }
  };

  const handleReset = () => {
    if (mode === 'pair') {
      socket?.emit('stopwatch-control', { roomId, action: 'reset' });
    } else {
      useAppStore.getState().setStopwatch({
        isRunning: false,
        time: 0,
        lastStarted: null
      });
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: 'var(--bg-tertiary)',
      padding: '4px 10px',
      borderRadius: '6px',
      border: '1px solid var(--border-color)',
      fontSize: '13px'
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, width: '56px', textAlign: 'center' }}>
        {formatTime(displayTime)}
      </span>
      {isHost && (
        <div style={{ display: 'flex', gap: '2px' }}>
          {!stopwatch.isRunning ? (
            <button
              onClick={handleStart}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-green)', padding: '2px 4px', fontSize: '11px', fontWeight: 'bold' }}
            >
              Start
            </button>
          ) : (
            <button
              onClick={handlePause}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-purple)', padding: '2px 4px', fontSize: '11px', fontWeight: 'bold' }}
            >
              Pause
            </button>
          )}
          <button
            onClick={handleReset}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px', fontSize: '11px', fontWeight: 'bold' }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
};

/* Mini Avatar Presence Indicator in Header */
const AvatarList: React.FC = () => {
  const { members } = useAppStore();
  const list = Object.values(members).filter(m => m.isOnline);
  const maxAvatars = 3;
  const overflow = list.length - maxAvatars;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {list.slice(0, maxAvatars).map((m) => (
        <div
          key={m.id}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: m.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            color: '#fff',
            border: '2px solid var(--border-color)',
            position: 'relative'
          }}
          title={m.name}
        >
          {m.name.charAt(0).toUpperCase()}
          <span style={{
            position: 'absolute',
            bottom: '-1px',
            right: '-1px',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-green)',
            border: '1.5px solid var(--bg-secondary)'
          }} />
        </div>
      ))}

      {overflow > 0 && (
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            border: '2px solid var(--border-color)'
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
};
