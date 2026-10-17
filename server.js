const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const crypto = require('crypto');

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

// In-memory Room Storage
// Structure:
// roomId: {
//   id: string,
//   createdAt: number,
//   participants: {
//     host: { socketId, sessionToken, name, online, lastSeen },
//     guest: { socketId, sessionToken, name, online, lastSeen }
//   },
//   messages: Array<{ id, senderSlot, senderName, text, timestamp, reactions, status }>,
//   typing: { host: false, guest: false }
// }
const rooms = new Map();

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
    partner: partner ? {
      name: partner.name,
      online: partner.online,
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
    const cleanName = (name || '').trim().slice(0, 24) || 'Host';

    const newRoom = {
      id: roomId,
      createdAt: Date.now(),
      participants: {
        host: {
          socketId: socket.id,
          sessionToken,
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

    socket.emit('room-joined', {
      success: true,
      roomId,
      role: 'host',
      sessionToken,
      roomState: getPublicRoomState(newRoom, 'host'),
      messages: newRoom.messages
    });
  });

  // 2. Join an Existing Room (With Strict 2-Peer Enforcement)
  socket.on('join-room', ({ roomId, name, sessionToken }) => {
    const cleanCode = (roomId || '').trim().toUpperCase();
    const cleanName = (name || '').trim().slice(0, 24) || 'Guest';

    if (!cleanCode || cleanCode.length !== 6) {
      return socket.emit('join-error', { message: 'Invalid room code format. Must be 6 alphanumeric characters.' });
    }

    const room = rooms.get(cleanCode);
    if (!room) {
      return socket.emit('join-error', { message: `Room "${cleanCode}" was not found or has expired.` });
    }

    let assignedSlot = null;

    // Check if user has an existing session in this room (reconnection)
    if (sessionToken) {
      if (room.participants.host && room.participants.host.sessionToken === sessionToken) {
        assignedSlot = 'host';
      } else if (room.participants.guest && room.participants.guest.sessionToken === sessionToken) {
        assignedSlot = 'guest';
      }
    }

    // New participant joining
    if (!assignedSlot) {
      if (!room.participants.host) {
        assignedSlot = 'host';
      } else if (!room.participants.guest) {
        assignedSlot = 'guest';
      } else {
        // STRICT 2-PERSON LOCKOUT: Room is strictly occupied by 2 people
        return socket.emit('join-error', {
          isFull: true,
          message: 'This room is locked. Exactly two people are already participating in this private conversation.'
        });
      }
    }

    // Set or refresh participant record
    const newToken = sessionToken || generateToken();
    const existing = room.participants[assignedSlot];

    room.participants[assignedSlot] = {
      socketId: socket.id,
      sessionToken: newToken,
      name: cleanName || (existing ? existing.name : (assignedSlot === 'host' ? 'Host' : 'Guest')),
      online: true,
      lastSeen: Date.now()
    };

    boundRoomId = cleanCode;
    boundSlot = assignedSlot;
    socket.join(cleanCode);

    // Send full state to joining user
    socket.emit('room-joined', {
      success: true,
      roomId: cleanCode,
      role: assignedSlot,
      sessionToken: newToken,
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
    io.to(boundRoomId).emit('chat-cleared');
  });

  // 9. Leave Room / Burn Room
  socket.on('leave-room', ({ destroyRoom }) => {
    handleUserLeaving(socket, boundRoomId, boundSlot, destroyRoom);
    boundRoomId = null;
    boundSlot = null;
  });

  // 10. Disconnect Handling
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

  // If both participants are offline for 1 hour, clean up room
  const hostOnline = room.participants.host && room.participants.host.online;
  const guestOnline = room.participants.guest && room.participants.guest.online;

  if (!hostOnline && !guestOnline) {
    setTimeout(() => {
      const current = rooms.get(roomId);
      if (current && (!current.participants.host || !current.participants.host.online) &&
          (!current.participants.guest || !current.participants.guest.online)) {
        rooms.delete(roomId);
      }
    }, 60 * 60 * 1000);
  }
}

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`  DuoChat (2-Person Private Chat) Server Online!`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  Active Rooms: 0`);
  console.log(`==================================================\n`);
});
