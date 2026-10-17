const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

async function runTests() {
  console.log('--- Starting DuoChat 2-Person Strict Test ---');

  // Client 1: Alice (Host)
  const client1 = io(SERVER_URL);
  let createdRoomId = null;

  await new Promise((resolve) => {
    client1.on('connect', () => {
      console.log('✓ Client 1 (Alice) connected to server');
      client1.emit('create-room', { name: 'Alice' });
    });

    client1.on('room-joined', (data) => {
      console.log(`✓ Room created successfully! Code: ${data.roomId}, Role: ${data.role}`);
      createdRoomId = data.roomId;
      resolve();
    });
  });

  // Client 2: Bob (Guest)
  const client2 = io(SERVER_URL);
  await new Promise((resolve) => {
    client2.on('connect', () => {
      console.log('✓ Client 2 (Bob) connected to server');
      client2.emit('join-room', { roomId: createdRoomId, name: 'Bob' });
    });

    client2.on('room-joined', (data) => {
      console.log(`✓ Client 2 (Bob) joined room ${createdRoomId} as ${data.role}`);
      resolve();
    });
  });

  // Client 3: Charlie (Third Party - MUST BE REJECTED)
  const client3 = io(SERVER_URL);
  await new Promise((resolve, reject) => {
    client3.on('connect', () => {
      console.log('✓ Client 3 (Charlie - 3rd person) attempting to breach 2-person room...');
      client3.emit('join-room', { roomId: createdRoomId, name: 'Charlie' });
    });

    client3.on('join-error', (err) => {
      console.log(`✓ STRICT 2-PEER ENFORCEMENT VERIFIED! Server rejected Charlie: "${err.message}" (isFull: ${err.isFull})`);
      if (err.isFull) {
        resolve();
      } else {
        reject(new Error('Expected isFull to be true'));
      }
    });

    client3.on('room-joined', () => {
      reject(new Error('SECURITY FAILURE: 3rd person was allowed into 2-person locked room!'));
    });
  });

  // Test Real-time Messaging from Alice to Bob
  await new Promise((resolve) => {
    client2.on('new-message', (msg) => {
      console.log(`✓ Real-time message delivered from ${msg.senderName}: "${msg.text}"`);
      resolve();
    });

    client1.emit('send-message', { text: 'Hey Bob, welcome to our private room!' });
  });

  // Test Typing Indicator
  await new Promise((resolve) => {
    client1.on('partner-typing', ({ isTyping, senderName }) => {
      if (isTyping) {
        console.log(`✓ Real-time typing sync verified: "${senderName} is typing..."`);
        resolve();
      }
    });

    client2.emit('typing', { isTyping: true });
  });

  console.log('\n=============================================');
  console.log('  ALL DUOCHAT 2-PERSON TESTS PASSED (100%)');
  console.log('=============================================\n');

  client1.disconnect();
  client2.disconnect();
  client3.disconnect();
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
