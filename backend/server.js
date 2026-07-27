const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { runCode } = require('./runner');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // In production, restrict this to your frontend URL
    methods: ['GET', 'POST']
  }
});

// Templates
const templates = {
  python: `def solve():\n    print("Hello, World!")\n\nif __name__ == "__main__":\n    solve()`,
  java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}`
};

// Rooms state
// roomId -> Room
const rooms = new Map();

// Helper to generate IDs
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

function getRoomByCode(code) {
  for (const room of rooms.values()) {
    if (room.code === code) return room;
  }
  return null;
}

// Neon cursor colors
const CURSOR_COLORS = [
  '#a855f7', // purple
  '#22c55e', // green
  '#eab308', // yellow
  '#3b82f6', // blue
  '#ec4899', // pink
  '#f97316', // orange
  '#06b6d4'  // cyan
];

// Inactivity cleanup every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    const activeMembers = Object.values(room.members).filter(m => m.isOnline);
    // If no active members for more than 1 hour, clean it up
    if (activeMembers.length === 0 && (now - room.lastActive > 3600000)) {
      rooms.delete(roomId);
      console.log(`Cleaned up inactive room: ${roomId}`);
    }
  }
}, 600000);

// Basic HTTP health check
app.get('/health', (req, res) => {
  res.send('Server is up and running');
});

// Socket.io handlers
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1. Create Room
  socket.on('create-room', ({ username }) => {
    let roomId = generateRoomId();
    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }
    const code = generateRoomCode();

    const room = {
      id: roomId,
      code: code,
      hostId: socket.id,
      language: 'python',
      codeContent: templates.python,
      notes: '',
      lastActive: Date.now(),
      stopwatch: {
        isRunning: false,
        time: 0,
        lastStarted: null
      },
      members: {}
    };

    const userColor = CURSOR_COLORS[0];
    room.members[socket.id] = {
      id: socket.id,
      name: username || 'Host',
      role: 'Editor', // Host is always Editor
      color: userColor,
      isOnline: true
    };

    rooms.set(roomId, room);
    socket.join(roomId);

    socket.emit('room-created', {
      roomId,
      code,
      role: 'Editor',
      color: userColor,
      roomState: room
    });

    console.log(`Room created: ${roomId} by ${username}`);
  });

  // 2. Join Room
  socket.on('join-room', ({ username, roomIdOrCode }) => {
    const searchKey = roomIdOrCode.trim().toUpperCase();
    let room = rooms.get(searchKey);
    if (!room) {
      room = getRoomByCode(searchKey);
    }

    if (!room) {
      socket.emit('join-error', { message: 'Room not found. Check the room code/link.' });
      return;
    }

    // Determine role. Host is always Editor.
    // Count active Editors
    const editorsCount = Object.values(room.members).filter(m => m.isOnline && m.role === 'Editor').length;
    let role = 'Viewer';
    if (editorsCount < 2) {
      role = 'Editor';
    }

    // Pick a color
    const activeColorIndices = Object.values(room.members).filter(m => m.isOnline).map(m => CURSOR_COLORS.indexOf(m.color));
    let color = CURSOR_COLORS.find((c, idx) => !activeColorIndices.includes(idx));
    if (!color) {
      color = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
    }

    room.members[socket.id] = {
      id: socket.id,
      name: username || `User_${socket.id.substring(0, 4)}`,
      role: role,
      color: color,
      isOnline: true
    };

    room.lastActive = Date.now();
    socket.join(room.id);

    // Send confirmation to the joining user
    socket.emit('room-joined', {
      roomId: room.id,
      code: room.code,
      role: role,
      color: color,
      roomState: room
    });

    // Notify other users
    socket.to(room.id).emit('user-joined', {
      message: `${room.members[socket.id].name} joined`,
      members: room.members
    });

    // Send list update to all in the room
    io.to(room.id).emit('members-updated', room.members);

    console.log(`User ${username} (${role}) joined Room ${room.id}`);
  });

  // 3. Code Change
  socket.on('code-change', ({ roomId, changes, codeContent }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.codeContent = codeContent;
    room.lastActive = Date.now();

    // Broadcast changes to everyone else in room
    socket.to(roomId).emit('code-changed', {
      changes,
      codeContent
    });
  });

  // 4. Cursor / Selection Sync
  socket.on('cursor-change', ({ roomId, cursor, selection }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    socket.to(roomId).emit('cursor-changed', {
      userId: socket.id,
      cursor,
      selection,
      name: room.members[socket.id]?.name || 'Collaborator',
      color: room.members[socket.id]?.color || '#fff'
    });
  });

  // 5. Notes Sync
  socket.on('notes-change', ({ roomId, notes }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.notes = notes;
    room.lastActive = Date.now();

    socket.to(roomId).emit('notes-changed', { notes });
  });

  // 6. Language Selector Sync
  socket.on('language-change', ({ roomId, language }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    room.language = language;
    room.codeContent = templates[language.toLowerCase()] || '';
    room.lastActive = Date.now();

    io.to(roomId).emit('language-changed', {
      language,
      codeContent: room.codeContent
    });
  });

  // 7. Stopwatch Control
  socket.on('stopwatch-control', ({ roomId, action, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    // Check if sender is host
    if (room.hostId !== socket.id) return;

    if (action === 'start') {
      room.stopwatch.isRunning = true;
      room.stopwatch.lastStarted = Date.now();
    } else if (action === 'pause') {
      room.stopwatch.isRunning = false;
      if (currentTime !== undefined) {
        room.stopwatch.time = currentTime;
      }
    } else if (action === 'reset') {
      room.stopwatch.isRunning = false;
      room.stopwatch.time = 0;
      room.stopwatch.lastStarted = null;
    }

    room.lastActive = Date.now();
    io.to(roomId).emit('stopwatch-updated', room.stopwatch);
  });

  // 8. Promote / Demote Role
  socket.on('update-member-role', ({ roomId, targetSocketId, role }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    // Verify sender is host
    if (room.hostId !== socket.id) return;

    const target = room.members[targetSocketId];
    if (!target) return;

    // Limit editors to 2
    if (role === 'Editor') {
      const editorsCount = Object.values(room.members).filter(m => m.isOnline && m.role === 'Editor').length;
      if (editorsCount >= 2) {
        socket.emit('error-toast', { message: 'Maximum of 2 Editors allowed simultaneously.' });
        return;
      }
    }

    target.role = role;
    room.lastActive = Date.now();

    // Notify the target
    io.to(targetSocketId).emit('role-changed', { role });

    // Notify the room
    io.to(roomId).emit('user-role-updated', {
      message: `${target.name} is now ${role}`,
      members: room.members
    });

    io.to(roomId).emit('members-updated', room.members);
  });

  // 9. Kick Member
  socket.on('remove-member', ({ roomId, targetSocketId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    // Verify sender is host
    if (room.hostId !== socket.id) return;

    const target = room.members[targetSocketId];
    if (!target) return;

    const targetName = target.name;
    delete room.members[targetSocketId];
    room.lastActive = Date.now();

    // Tell the client to disconnect/redirect
    io.to(targetSocketId).emit('kicked');

    // Notify the room
    io.to(roomId).emit('user-left', {
      message: `${targetName} was removed from the room`,
      members: room.members
    });

    io.to(roomId).emit('members-updated', room.members);
  });

  // 10. Execute Code
  socket.on('execute-code', ({ roomId, code, input, language }) => {
    const room = rooms.get(roomId);
    const channel = roomId || socket.id; // For solo run, roomId is empty/null, use socket.id

    // Notify room/socket execution started
    io.to(channel).emit('execution-started');

    runCode(language, code, input, (result) => {
      // Broadcast finish results
      io.to(channel).emit('execution-finished', result);
    });
  });

  // 11. Disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    // Find room the socket was in
    for (const [roomId, room] of rooms.entries()) {
      if (room.members[socket.id]) {
        const member = room.members[socket.id];
        member.isOnline = false;
        
        // Remove from members list if offline completely
        delete room.members[socket.id];
        room.lastActive = Date.now();

        // If the host disconnected, reassign host
        if (room.hostId === socket.id) {
          const remainingActive = Object.keys(room.members);
          if (remainingActive.length > 0) {
            // First remaining active Editor or Viewer
            const firstEditor = remainingActive.find(sid => room.members[sid].role === 'Editor');
            room.hostId = firstEditor || remainingActive[0];
            
            // Promote new host to Editor
            room.members[room.hostId].role = 'Editor';
            
            io.to(room.id).emit('user-role-updated', {
              message: `${room.members[room.hostId].name} is now host`,
              members: room.members
            });
            
            io.to(room.hostId).emit('role-changed', { role: 'Editor' });
          } else {
            // Room is empty, will be cleaned up by interval
          }
        }

        // Notify other room members
        io.to(roomId).emit('user-left', {
          message: `${member.name} left`,
          members: room.members
        });

        io.to(roomId).emit('members-updated', room.members);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
