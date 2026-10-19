const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Persistent Room Storage
// Structure:
// roomId: {
//   id: string,
//   createdAt: number,
//   participants: {
//     host: { socketId, sessionToken, reloginKey, name, online, lastSeen },
//     guest: { socketId, sessionToken, reloginKey, name, online, lastSeen }
//   },
//   messages: Array<{ id, senderSlot, senderName, text, timestamp, reactions, status }>,
//   typing: { host: false, guest: false }
// }
const rooms = new Map();

const DATA_DIR = path.join(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

// Load stored rooms from disk to persist across server restarts
function loadRoomsFromDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(ROOMS_FILE)) {
      const raw = fs.readFileSync(ROOMS_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const r of data) {
          if (r && r.id) {
            // Reset active socket connections and typing on boot
            if (r.participants) {
              if (r.participants.host) {
                r.participants.host.socketId = null;
                r.participants.host.online = false;
              }
              if (r.participants.guest) {
                r.participants.guest.socketId = null;
                r.participants.guest.online = false;
              }
            }
            if (r.typing) {
              r.typing.host = false;
              r.typing.guest = false;
            }
            rooms.set(r.id, r);
          }
        }
        console.log(`[Storage] Restored ${rooms.size} persistent room(s) from disk.`);
      }
    }
  } catch (err) {
    console.error('[Storage] Error loading rooms from disk:', err.message);
  }
}

// Debounced atomic write to disk
let saveTimer = null;
function saveRoomsToDisk() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flushRoomsToDiskSync();
  }, 200);
}

function flushRoomsToDiskSync() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const serializableRooms = Array.from(rooms.values()).map(r => ({
      id: r.id,
      createdAt: r.createdAt,
      participants: {
        host: r.participants.host ? {
          ...r.participants.host,
          socketId: null,
          online: Boolean(r.participants.host.online)
        } : null,
        guest: r.participants.guest ? {
          ...r.participants.guest,
          socketId: null,
          online: Boolean(r.participants.guest.online)
        } : null
      },
      messages: r.messages || [],
      typing: { host: false, guest: false }
    }));
    const tempPath = `${ROOMS_FILE}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(serializableRooms, null, 2), 'utf8');
    fs.renameSync(tempPath, ROOMS_FILE);
  } catch (err) {
    console.error('[Storage] Error saving rooms to disk:', err.message);
  }
}

process.on('SIGINT', () => {
  flushRoomsToDiskSync();
  process.exit(0);
});

process.on('SIGTERM', () => {
  flushRoomsToDiskSync();
  process.exit(0);
});

// Initial disk load
loadRoomsFromDisk();

// Helper: Generate unique 6-character room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure uniqueness
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

// Helper: Generate unique session token
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Helper: Generate human-friendly Re-login Passkey (e.g. HOST-7X2K, GUEST-4M9P)
function generateReloginKey(role) {
  const prefix = role === 'host' ? 'HOST' : 'GUEST';
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${rand}`;
}

// Helper: Sanitize public room state to send to clients
function getPublicRoomState(room, clientSlot) {
  if (!room) return null;
  const partnerSlot = clientSlot === 'host' ? 'guest' : 'host';
  const partner = room.participants[partnerSlot];
  const me = room.participants[clientSlot];

  return {
    roomId: room.id,
    createdAt: room.createdAt,
    myRole: clientSlot,
    myName: me ? me.name : '',
    myReloginKey: me ? me.reloginKey : '',
    partner: partner ? {
      name: partner.name,
      online: Boolean(partner.online),
      lastSeen: partner.lastSeen
    } : null,
    isLocked: Boolean(room.participants.host && room.participants.guest),
    messageCount: room.messages.length
  };
}

io.on('connection', (socket) => {
  let boundRoomId = null;
  let boundSlot = null;

  // 1. Create a New Exclusive 2-Person Room
  socket.on('create-room', ({ name }) => {
    const roomId = generateRoomCode();
    const sessionToken = generateToken();
    const reloginKey = generateReloginKey('host');
    const cleanName = (name || '').trim().slice(0, 24) || 'Host';

    const newRoom = {
      id: roomId,
      createdAt: Date.now(),
      participants: {
        host: {
          socketId: socket.id,
          sessionToken,
          reloginKey,
          name: cleanName,
          online: true,
          lastSeen: Date.now()
        },
        guest: null
      },
      messages: [],
      typing: { host: false, guest: false }
    };

    rooms.set(roomId, newRoom);
    boundRoomId = roomId;
    boundSlot = 'host';

    socket.join(roomId);
    saveRoomsToDisk();

    socket.emit('room-joined', {
      success: true,
      roomId,
      role: 'host',
      sessionToken,
      reloginKey,
      roomState: getPublicRoomState(newRoom, 'host'),
      messages: newRoom.messages
    });
  });

  // 2. Join or Re-login to an Existing Room (With Strict 2-Peer Enforcement)
  socket.on('join-room', ({ roomId, name, sessionToken, reloginKey }) => {
    const cleanCode = (roomId || '').trim().toUpperCase();
    const cleanName = (name || '').trim().slice(0, 24) || 'Guest';
    const cleanKey = (reloginKey || '').trim().toUpperCase();

    if (!cleanCode || cleanCode.length !== 6) {
      return socket.emit('join-error', { message: 'Invalid room code format. Must be 6 alphanumeric characters.' });
    }

    const room = rooms.get(cleanCode);
    if (!room) {
      return socket.emit('join-error', { message: `Room "${cleanCode}" was not found or has expired.` });
    }

    let assignedSlot = null;

    // Check A: Matching sessionToken (seamless client reconnection)
    if (sessionToken) {
      if (room.participants.host && room.participants.host.sessionToken === sessionToken) {
        assignedSlot = 'host';
      } else if (room.participants.guest && room.participants.guest.sessionToken === sessionToken) {
        assignedSlot = 'guest';
      }
    }

    // Check B: Matching reloginKey (manual re-login from any device/browser)
    if (!assignedSlot && cleanKey) {
      if (room.participants.host && room.participants.host.reloginKey && room.participants.host.reloginKey.toUpperCase() === cleanKey) {
        assignedSlot = 'host';
      } else if (room.participants.guest && room.participants.guest.reloginKey && room.participants.guest.reloginKey.toUpperCase() === cleanKey) {
        assignedSlot = 'guest';
      }
    }

    // Check C: If slot not determined yet, check open seats
    if (!assignedSlot) {
      if (!room.participants.host) {
        assignedSlot = 'host';
      } else if (!room.participants.guest) {
        assignedSlot = 'guest';
      } else {
        // STRICT 2-PERSON LOCKOUT: Room is occupied by Host & Guest
        const hostOnline = Boolean(room.participants.host && room.participants.host.online);
        const guestOnline = Boolean(room.participants.guest && room.participants.guest.online);

        const offlineParticipants = [];
        if (!hostOnline && room.participants.host) {
          offlineParticipants.push({ slot: 'host', name: room.participants.host.name });
        }
        if (!guestOnline && room.participants.guest) {
          offlineParticipants.push({ slot: 'guest', name: room.participants.guest.name });
        }

        return socket.emit('join-error', {
          isFull: true,
          canRelogin: offlineParticipants.length > 0,
          offlineParticipants,
          message: offlineParticipants.length > 0
            ? `This private conversation is locked. If you are re-joining as ${offlineParticipants.map(p => p.name).join(' or ')}, please enter your Re-login Key to reclaim your seat.`
            : 'This room is locked. Both participants are currently active in this conversation.'
        });
      }
    }

    // Set or refresh participant record
    const existing = room.participants[assignedSlot];
    const userToken = (existing && existing.sessionToken) || sessionToken || generateToken();
    const userReloginKey = (existing && existing.reloginKey) || generateReloginKey(assignedSlot);
    const displayName = (existing && existing.name) ? existing.name : (cleanName || (assignedSlot === 'host' ? 'Host' : 'Guest'));

    room.participants[assignedSlot] = {
      socketId: socket.id,
      sessionToken: userToken,
      reloginKey: userReloginKey,
      name: displayName,
      online: true,
      lastSeen: Date.now()
    };

    boundRoomId = cleanCode;
    boundSlot = assignedSlot;
    socket.join(cleanCode);

    saveRoomsToDisk();

    // Send full state to joining/reconnecting user
    socket.emit('room-joined', {
      success: true,
      roomId: cleanCode,
      role: assignedSlot,
      sessionToken: userToken,
      reloginKey: userReloginKey,
      roomState: getPublicRoomState(room, assignedSlot),
      messages: room.messages
    });

    // Notify the partner in the room
    const partnerSlot = assignedSlot === 'host' ? 'guest' : 'host';
    socket.to(cleanCode).emit('partner-updated', {
      partner: {
        name: room.participants[assignedSlot].name,
        online: true,
        lastSeen: Date.now()
      },
      isLocked: Boolean(room.participants.host && room.participants.guest)
    });
  });

  // 3. Send Message
  socket.on('send-message', ({ text, replyToId }, callback) => {
    if (!boundRoomId || !boundSlot) return;
    const room = rooms.get(boundRoomId);
    if (!room) return;

    const trimmedText = (text || '').trim();
    if (!trimmedText) return;

    const message = {
      id: crypto.randomUUID(),
      senderSlot: boundSlot,
      senderName: room.participants[boundSlot]?.name || (boundSlot === 'host' ? 'Host' : 'Guest'),
      text: trimmedText.slice(0, 4000),
      timestamp: Date.now(),
      replyToId: replyToId || null,
      reactions: {},
      status: 'sent'
    };

    room.messages.push(message);

    // Keep memory clean (limit to 1000 messages per 2-person room)
    if (room.messages.length > 1000) {
      room.messages.shift();
    }

    // Reset typing status on message send
    if (room.typing) room.typing[boundSlot] = false;
    socket.to(boundRoomId).emit('partner-typing', { isTyping: false });

    saveRoomsToDisk();

    // Send to partner
    socket.to(boundRoomId).emit('new-message', message);

    // Acknowledge sender
    if (typeof callback === 'function') {
      callback({ success: true, message });
    }
  });

  // 4. Typing Indicator
  socket.on('typing', ({ isTyping }) => {
    if (!boundRoomId || !boundSlot) return;
    const room = rooms.get(boundRoomId);
    if (!room) return;

    if (room.typing) room.typing[boundSlot] = Boolean(isTyping);
    socket.to(boundRoomId).emit('partner-typing', {
      isTyping: Boolean(isTyping),
      senderName: room.participants[boundSlot]?.name || 'Partner'
    });
  });

  // 5. Message Read Receipts
  socket.on('mark-read', ({ messageIds }) => {
    if (!boundRoomId || !boundSlot) return;
    const room = rooms.get(boundRoomId);
    if (!room || !Array.isArray(messageIds)) return;

    let updated = false;
    room.messages.forEach(msg => {
      if (messageIds.includes(msg.id) && msg.senderSlot !== boundSlot) {
        msg.status = 'read';
        updated = true;
      }
    });

    if (updated) {
      saveRoomsToDisk();
      socket.to(boundRoomId).emit('messages-read', { messageIds });
    }
  });

  // 6. Message Reactions
  socket.on('toggle-reaction', ({ messageId, emoji }) => {
    if (!boundRoomId || !boundSlot) return;
    const room = rooms.get(boundRoomId);
    if (!room) return;

    const msg = room.messages.find(m => m.id === messageId);
    if (!msg) return;

    if (!msg.reactions) msg.reactions = {};

    if (!msg.reactions[emoji]) {
      msg.reactions[emoji] = [];
    }

    const index = msg.reactions[emoji].indexOf(boundSlot);
    if (index > -1) {
      msg.reactions[emoji].splice(index, 1);
      if (msg.reactions[emoji].length === 0) {
        delete msg.reactions[emoji];
      }
    } else {
      msg.reactions[emoji].push(boundSlot);
    }

    saveRoomsToDisk();

    io.to(boundRoomId).emit('reaction-updated', {
      messageId,
      reactions: msg.reactions
    });
  });

  // 7. Update User Display Name
  socket.on('update-name', ({ newName }) => {
    if (!boundRoomId || !boundSlot) return;
    const room = rooms.get(boundRoomId);
    if (!room) return;

    const clean = (newName || '').trim().slice(0, 24);
    if (!clean) return;

    if (room.participants[boundSlot]) {
      room.participants[boundSlot].name = clean;
    }

    saveRoomsToDisk();

    socket.to(boundRoomId).emit('partner-updated', {
      partner: {
        name: clean,
        online: true,
        lastSeen: Date.now()
      },
      isLocked: Boolean(room.participants.host && room.participants.guest)
    });
  });

  // 8. Clear Room Messages
  socket.on('clear-chat', () => {
    if (!boundRoomId || !boundSlot) return;
    const room = rooms.get(boundRoomId);
    if (!room) return;

    room.messages = [];
    saveRoomsToDisk();
    io.to(boundRoomId).emit('chat-cleared');
  });

  // 9. Leave Room / Burn Room
  socket.on('leave-room', ({ destroyRoom }) => {
    handleUserLeaving(socket, boundRoomId, boundSlot, destroyRoom);
    boundRoomId = null;
    boundSlot = null;
  });

  // 10. Check Room Status (for Lobby Saved Chats list updates)
  socket.on('get-room-status', ({ roomId, sessionToken, reloginKey }, callback) => {
    if (typeof callback !== 'function') return;
    const cleanCode = (roomId || '').trim().toUpperCase();
    const room = rooms.get(cleanCode);
    if (!room) {
      return callback({ exists: false, roomId: cleanCode });
    }

    let role = null;
    if (sessionToken) {
      if (room.participants.host && room.participants.host.sessionToken === sessionToken) role = 'host';
      else if (room.participants.guest && room.participants.guest.sessionToken === sessionToken) role = 'guest';
    }
    if (!role && reloginKey) {
      const cleanKey = reloginKey.trim().toUpperCase();
      if (room.participants.host && room.participants.host.reloginKey && room.participants.host.reloginKey.toUpperCase() === cleanKey) role = 'host';
      else if (room.participants.guest && room.participants.guest.reloginKey && room.participants.guest.reloginKey.toUpperCase() === cleanKey) role = 'guest';
    }

    const partnerSlot = role === 'host' ? 'guest' : 'host';
    const partner = role ? room.participants[partnerSlot] : null;

    callback({
      exists: true,
      roomId: cleanCode,
      isMember: Boolean(role),
      role,
      partner: partner ? {
        name: partner.name,
        online: Boolean(partner.online),
        lastSeen: partner.lastSeen
      } : null,
      messageCount: room.messages.length,
      lastMessage: room.messages.length > 0 ? room.messages[room.messages.length - 1] : null
    });
  });

  // 11. Disconnect Handling
  socket.on('disconnect', () => {
    if (boundRoomId && boundSlot) {
      handleUserLeaving(socket, boundRoomId, boundSlot, false);
    }
  });
});

function handleUserLeaving(socket, roomId, slot, destroyRoom) {
  if (!roomId || !rooms.has(roomId)) return;
  const room = rooms.get(roomId);
  const participant = room.participants[slot];

  if (!participant) return;

  if (destroyRoom) {
    // Immediate destruction of the room and all messages
    io.to(roomId).emit('room-destroyed', {
      message: 'The room was permanently terminated and purged from memory.'
    });
    rooms.delete(roomId);
    saveRoomsToDisk();
    return;
  }

  // Mark participant as offline
  participant.online = false;
  participant.lastSeen = Date.now();
  if (room.typing) room.typing[slot] = false;

  socket.leave(roomId);
  socket.to(roomId).emit('partner-typing', { isTyping: false });
  socket.to(roomId).emit('partner-updated', {
    partner: {
      name: participant.name,
      online: false,
      lastSeen: participant.lastSeen
    },
    isLocked: Boolean(room.participants.host && room.participants.guest)
  });

  saveRoomsToDisk();
}

// Stale rooms cleanup (retains active & offline conversations for 30 days)
setInterval(() => {
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let changed = false;
  for (const [id, room] of rooms.entries()) {
    const hostLast = (room.participants.host && room.participants.host.lastSeen) || room.createdAt;
    const guestLast = (room.participants.guest && room.participants.guest.lastSeen) || room.createdAt;
    const lastActive = Math.max(hostLast, guestLast);
    const hostOnline = room.participants.host && room.participants.host.online;
    const guestOnline = room.participants.guest && room.participants.guest.online;
    if (!hostOnline && !guestOnline && (now - lastActive > THIRTY_DAYS)) {
      rooms.delete(id);
      changed = true;
    }
  }
  if (changed) saveRoomsToDisk();
}, 24 * 60 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`  DuoChat (2-Person Private Chat) Server Online!`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  Active Rooms: ${rooms.size}`);
  console.log(`==================================================\n`);
});
