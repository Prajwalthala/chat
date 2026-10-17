# DuoChat — Private 2-Person Real-time Chat

An exclusive, real-time, 2-person locked communication website built with **Node.js**, **Express**, **Socket.IO**, and **modern CSS**. 

Once two people connect to a room, **third-party entry is strictly blocked and rejected**.

---

## ✨ Features

- 🔒 **Strict 2-Peer Enclosure**: Room code allows exactly two participants (Host & Guest). Any 3rd person attempting to join is immediately blocked with an access-denied locked notification.
- ⚡ **Real-time WebSockets (Socket.IO)**: Zero-lag instant messaging with automatic reconnection support.
- ✍️ **Live Typing Indicator**: Real-time partner typing indicators with jumping animated dots.
- 👁️ **Delivery & Read Receipts**: Displays single check (`✓`) when sent and double check (`✓✓`) in teal when read by the partner.
- 🔔 **Built-in Web Audio Synthesizer**: Native in-browser chime synthesizer (sent, received, joined, left sounds) with a 1-click mute toggle — no external audio files required.
- ❤️ **Message Reactions**: React directly to messages with emojis (❤️, 👍, 😂, 🔥, etc.) with real-time reaction counts.
- 🎨 **Modern Dark & Light UI**: Sleek glassmorphism, Plus Jakarta Sans typography, smooth micro-animations, and dynamic status badges.
- 📥 **Export Chat Transcript**: 1-click export of the entire conversation history into a formatted `.txt` file.
- 🔥 **Burn On Exit / Clear Chat**: Purge conversation messages from memory whenever desired.
- 🔗 **Instant 1-Click Invite Link**: Copy a direct URL (`http://localhost:3000/?room=ABC123`) to send to your partner.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
Or with auto-reload:
```bash
npm run dev
```

### 3. Open in Browser
Visit **[http://localhost:3000](http://localhost:3000)** in your browser:
1. Enter your display name and click **Create New Private Room**.
2. Click **Copy Invite Link** or share the 6-character room code with your partner.
3. Open a second browser window / incognito tab and open the invite link to chat as the partner!

---

## 🧪 Automated Testing

An end-to-end automated test suite is included to verify the strict 2-person lock:
```bash
node test-e2e.js
```
This simulates:
1. Alice creating a room.
2. Bob joining the room.
3. Charlie (3rd person) attempting to join & being strictly rejected by the server.
4. Alice sending a real-time message to Bob.
5. Bob triggering the typing indicator.

---

## 🌐 Sharing Across Devices / Internet

To chat between different computers or smartphones:
- **Local Network (Wi-Fi)**: Access via your machine's local IP address (e.g., `http://192.168.1.X:3000`).
- **Instant Public Tunnel**: Run `npx localtunnel --port 3000` to get a public HTTPS link you can share with anyone worldwide.
- **Cloud Deployment**: Ready for 1-click deployment on [Render](https://render.com), [Railway](https://railway.app), [Fly.io](https://fly.io), or [Glitch](https://glitch.com).
