import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

export type Role = 'Editor' | 'Viewer';

export interface Member {
  id: string;
  name: string;
  role: Role;
  color: string;
  isOnline: boolean;
}

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'error' | 'success';
}

interface RoomState {
  id: string;
  code: string;
  hostId: string;
  language: string;
  codeContent: string;
  notes: string;
  members: Record<string, Member>;
  stopwatch: {
    isRunning: boolean;
    time: number;
    lastStarted: number | null;
  };
}

interface AppStore {
  // Socket & Connection
  socket: Socket | null;
  isConnected: boolean;
  connectSocket: () => void;
  disconnectSocket: () => void;

  // App Phase
  mode: 'landing' | 'solo' | 'pair';
  username: string;
  role: Role;
  myColor: string;
  roomId: string;
  roomCode: string;
  hostId: string;
  setMode: (mode: 'landing' | 'solo' | 'pair') => void;
  setUsername: (name: string) => void;
  setRoomId: (id: string) => void;

  // Room State
  members: Record<string, Member>;
  language: string;
  codeContent: string;
  notes: string;
  stopwatch: {
    isRunning: boolean;
    time: number;
    lastStarted: number | null;
  };
  setLanguage: (lang: string) => void;
  setCodeContent: (content: string) => void;
  setNotes: (notes: string) => void;
  setStopwatch: (stopwatch: RoomState['stopwatch']) => void;

  // Running Code state
  input: string;
  output: string;
  errors: string;
  status: string; // 'Idle' | 'Running' | 'Success' | 'Compilation Error' | 'Runtime Error' | 'Timeout'
  setInput: (input: string) => void;
  setOutput: (output: string) => void;
  setErrors: (errors: string) => void;
  setStatus: (status: string) => void;

  // Toasts / Notifications
  toasts: Toast[];
  addToast: (message: string, type?: 'info' | 'error' | 'success') => void;
  removeToast: (id: string) => void;

  // Actions
  joinRoom: (roomIdOrCode: string) => void;
  createRoom: () => void;
  leaveRoom: () => void;
  executeCode: () => void;
}

const SOCKET_URL = 'http://localhost:5000'; // Target port for backend

export const useAppStore = create<AppStore>((set, get) => ({
  socket: null,
  isConnected: false,
  mode: 'landing',
  username: '',
  role: 'Editor',
  myColor: '#a855f7',
  roomId: '',
  roomCode: '',
  hostId: '',
  members: {},
  language: 'python',
  codeContent: `def solve():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    solve()`,
  notes: '',
  stopwatch: {
    isRunning: false,
    time: 0,
    lastStarted: null
  },

  input: '',
  output: '',
  errors: '',
  status: 'Idle',
  toasts: [],

  connectSocket: () => {
    if (get().socket) return;
    const socket = io(SOCKET_URL);
    
    socket.on('connect', () => {
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('room-created', ({ roomId, code, role, color, roomState }) => {
      set({
        mode: 'pair',
        roomId,
        roomCode: code,
        role,
        myColor: color,
        hostId: roomState.hostId,
        members: roomState.members,
        language: roomState.language,
        codeContent: roomState.codeContent,
        notes: roomState.notes,
        stopwatch: roomState.stopwatch
      });
      get().addToast('Room created successfully!', 'success');
    });

    socket.on('room-joined', ({ roomId, code, role, color, roomState }) => {
      set({
        mode: 'pair',
        roomId,
        roomCode: code,
        role,
        myColor: color,
        hostId: roomState.hostId,
        members: roomState.members,
        language: roomState.language,
        codeContent: roomState.codeContent,
        notes: roomState.notes,
        stopwatch: roomState.stopwatch
      });
      get().addToast(`Joined room: ${code}`, 'success');
    });

    socket.on('join-error', ({ message }) => {
      get().addToast(message, 'error');
    });

    socket.on('user-joined', ({ message, members }) => {
      set({ members });
      get().addToast(message, 'info');
    });

    socket.on('user-left', ({ message, members }) => {
      set({ members });
      get().addToast(message, 'info');
    });

    socket.on('members-updated', (members) => {
      set({ members });
    });

    socket.on('notes-changed', ({ notes }) => {
      set({ notes });
    });

    socket.on('language-changed', ({ language, codeContent }) => {
      set({ language, codeContent });
      get().addToast(`Language updated to ${language}`, 'info');
    });

    socket.on('stopwatch-updated', (stopwatch) => {
      set({ stopwatch });
    });

    socket.on('role-changed', ({ role }) => {
      set({ role });
      get().addToast(`Your role was changed to ${role}`, 'info');
    });

    socket.on('user-role-updated', ({ message, members }) => {
      set({ members });
      get().addToast(message, 'info');
    });

    socket.on('kicked', () => {
      get().addToast('You have been removed from the room by the host', 'error');
      get().leaveRoom();
    });

    socket.on('error-toast', ({ message }) => {
      get().addToast(message, 'error');
    });

    // Execution hooks
    socket.on('execution-started', () => {
      set({ status: 'Running', output: '', errors: '' });
    });

    socket.on('execution-finished', (res) => {
      if (res.status === 'Success') {
        set({ status: 'Success', output: res.output, errors: '' });
      } else if (res.status === 'Compilation Error') {
        set({ status: 'Compilation Error', errors: res.error, output: '' });
      } else if (res.status === 'Runtime Error') {
        set({ status: 'Runtime Error', errors: res.error, output: res.output || '' });
      } else if (res.status === 'Timeout') {
        set({ status: 'Timeout', errors: res.error });
      } else {
        set({ status: 'Error', errors: res.error });
      }
    });

    set({ socket });
  },

  disconnectSocket: () => {
    const s = get().socket;
    if (s) {
      s.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  setMode: (mode) => {
    if (mode === 'solo') {
      // Load from local storage
      const savedCode = localStorage.getItem('coderoom_solo_code');
      const savedLang = localStorage.getItem('coderoom_solo_lang') || 'python';
      const starter = savedCode || getStarterTemplate(savedLang);
      set({
        mode: 'solo',
        roomId: '',
        roomCode: '',
        role: 'Editor',
        language: savedLang,
        codeContent: starter,
        notes: localStorage.getItem('coderoom_solo_notes') || '',
        members: {}
      });
    } else {
      set({ mode });
    }
  },
  setUsername: (username) => set({ username }),
  setRoomId: (roomId) => set({ roomId }),

  setLanguage: (language) => {
    if (get().mode === 'pair') {
      get().socket?.emit('language-change', { roomId: get().roomId, language });
    } else {
      const codeContent = getStarterTemplate(language);
      localStorage.setItem('coderoom_solo_lang', language);
      localStorage.setItem('coderoom_solo_code', codeContent);
      set({ language, codeContent });
    }
  },

  setCodeContent: (codeContent) => {
    set({ codeContent });
    if (get().mode === 'solo') {
      localStorage.setItem('coderoom_solo_code', codeContent);
    }
  },

  setNotes: (notes) => {
    set({ notes });
    if (get().mode === 'solo') {
      localStorage.setItem('coderoom_solo_notes', notes);
    } else {
      get().socket?.emit('notes-change', { roomId: get().roomId, notes });
    }
  },

  setStopwatch: (stopwatch) => set({ stopwatch }),

  setInput: (input) => set({ input }),
  setOutput: (output) => set({ output }),
  setErrors: (errors) => set({ errors }),
  setStatus: (status) => set({ status }),

  addToast: (message, type = 'info') => {
    const id = Math.random().toString();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }]
    }));
    setTimeout(() => {
      get().removeToast(id);
    }, 4000);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }));
  },

  joinRoom: (roomIdOrCode) => {
    get().connectSocket();
    // Wait slightly to ensure socket connects
    setTimeout(() => {
      const s = get().socket;
      if (s) {
        s.emit('join-room', {
          username: get().username,
          roomIdOrCode
        });
      }
    }, 100);
  },

  createRoom: () => {
    get().connectSocket();
    setTimeout(() => {
      const s = get().socket;
      if (s) {
        s.emit('create-room', {
          username: get().username
        });
      }
    }, 100);
  },

  leaveRoom: () => {
    get().disconnectSocket();
    set({
      mode: 'landing',
      roomId: '',
      roomCode: '',
      role: 'Editor',
      members: {},
      language: 'python',
      codeContent: getStarterTemplate('python'),
      notes: '',
      stopwatch: {
        isRunning: false,
        time: 0,
        lastStarted: null
      },
      output: '',
      errors: '',
      status: 'Idle'
    });
  },

  executeCode: () => {
    const { mode, language, codeContent, input, roomId, socket } = get();
    if (mode === 'pair') {
      socket?.emit('execute-code', {
        roomId,
        code: codeContent,
        input,
        language
      });
    } else {
      // Solo local execution uses a connection to execution socket endpoint if connected, 
      // or we can make a connection to run it. Let's connect socket for solo execute too.
      if (!socket) {
        get().connectSocket();
      }
      setTimeout(() => {
        get().socket?.emit('execute-code', {
          roomId: '', // Empty means solo execution, output returned to this socket only
          code: codeContent,
          input,
          language
        });
      }, 100);
    }
  }
}));

function getStarterTemplate(lang: string): string {
  const l = lang.toLowerCase();
  if (l === 'python') {
    return `def solve():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    solve()`;
  }
  if (l === 'java') {
    return `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`;
  }
  if (l === 'cpp' || l === 'c++') {
    return `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}`;
  }
  return '';
}
