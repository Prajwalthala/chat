/**
 * DuoChat Client Application
 * Real-time 2-Person Private Chat with WebSockets, Audio Synth, and Strict Peer Isolation
 */

(function () {
  'use strict';

  // 1. Socket & Application State
  const socket = io();

  const state = {
    roomId: null,
    role: null, // 'host' | 'guest'
    name: 'User',
    sessionToken: null,
    reloginKey: null,
    partner: null,
    messages: [],
    soundEnabled: true,
    isScrolledUp: false,
    unreadCount: 0,
    typingTimer: null,
    isTypingSent: false
  };

  // 2. DOM Elements
  const elements = {
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    themeIcon: document.getElementById('theme-icon'),
    soundToggleBtn: document.getElementById('sound-toggle-btn'),
    soundIcon: document.getElementById('sound-icon'),
    userBadge: document.getElementById('user-badge'),
    userBadgeName: document.getElementById('user-badge-name'),

    lobbyView: document.getElementById('lobby-view'),
    chatView: document.getElementById('chat-view'),
    nicknameInput: document.getElementById('nickname-input'),
    createRoomBtn: document.getElementById('create-room-btn'),
    joinCodeInput: document.getElementById('join-code-input'),
    joinRoomBtn: document.getElementById('join-room-btn'),

    toggleReloginKeyBtn: document.getElementById('toggle-relogin-key-btn'),
    reloginKeyField: document.getElementById('relogin-key-field'),
    joinKeyInput: document.getElementById('join-key-input'),

    savedChatsSection: document.getElementById('saved-chats-section'),
    savedChatsBadge: document.getElementById('saved-chats-badge'),
    savedChatsList: document.getElementById('saved-chats-list'),

    connectionBanner: document.getElementById('connection-banner'),
    connectionBannerIcon: document.getElementById('connection-banner-icon'),
    connectionBannerText: document.getElementById('connection-banner-text'),
    viewReloginKeyBtn: document.getElementById('view-relogin-key-btn'),

    activeRoomCode: document.getElementById('active-room-code'),
    copyCodeBtn: document.getElementById('copy-code-btn'),
    copyLinkBtn: document.getElementById('copy-link-btn'),
    quickCopyBtn: document.getElementById('quick-copy-btn'),
    partnerStatusDot: document.getElementById('partner-status-dot'),
    partnerStatusText: document.getElementById('partner-status-text'),
    waitingBanner: document.getElementById('waiting-banner'),

    messagesContainer: document.getElementById('messages-container'),
    scrollBottomBtn: document.getElementById('scroll-bottom-btn'),
    unreadCountBadge: document.getElementById('unread-count-badge'),
    typingBar: document.getElementById('typing-bar'),
    typingText: document.getElementById('typing-text'),

    messageForm: document.getElementById('message-form'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    emojiPickerToggle: document.getElementById('emoji-picker-toggle'),
    emojiQuickBar: document.getElementById('emoji-quick-bar'),

    exportChatBtn: document.getElementById('export-chat-btn'),
    clearChatBtn: document.getElementById('clear-chat-btn'),
    leaveRoomBtn: document.getElementById('leave-room-btn'),

    modal: document.getElementById('custom-modal'),
    modalIcon: document.getElementById('modal-icon'),
    modalIconContainer: document.getElementById('modal-icon-container'),
    modalTitle: document.getElementById('modal-title'),
    modalDesc: document.getElementById('modal-desc'),
    modalCustomSlot: document.getElementById('modal-custom-slot'),
    modalActions: document.getElementById('modal-actions'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalConfirmBtn: document.getElementById('modal-confirm-btn'),

    toastContainer: document.getElementById('toast-container')
  };

  // 3. Audio Synth (Native Web Audio API - Zero dependencies, instant chimes)
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playChime(type) {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);

      if (type === 'sent') {
        // Bright two-tone chime (C5 -> G5)
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.08);

        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'received') {
        // Soft welcoming chime (G4 -> C5)
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(392.00, now);
        osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.1);

        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.26);
      } else if (type === 'joined') {
        // Celebratory harmonic chord
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.05);

          const noteGain = ctx.createGain();
          noteGain.gain.setValueAtTime(0.06, now + idx * 0.05);
          noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.35);

          osc.connect(noteGain);
          noteGain.connect(ctx.destination);
          osc.start(now + idx * 0.05);
          osc.stop(now + idx * 0.05 + 0.36);
        });
      } else if (type === 'left') {
        // Subtle drop (F4 -> Db4)
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(349.23, now);
        osc.frequency.exponentialRampToValueAtTime(277.18, now + 0.15);

        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (e) {
      // Audio autoplay policy can safely ignore
    }
  }

  // 4. Modal Dialog Controller
  function showModal({
    title,
    desc,
    icon = 'fa-lock',
    iconType = 'danger',
    confirmText = 'OK',
    cancelText = 'Cancel',
    showCancel = true,
    customContent = null,
    onConfirm,
    onCancel
  }) {
    elements.modalTitle.textContent = title;
    elements.modalDesc.textContent = desc;
    elements.modalIcon.className = `fa-solid ${icon}`;
    elements.modalIconContainer.className = `modal-icon-badge ${iconType}`;

    elements.modalConfirmBtn.textContent = confirmText;
    elements.modalCancelBtn.textContent = cancelText;

    if (showCancel) {
      elements.modalCancelBtn.classList.remove('hidden');
    } else {
      elements.modalCancelBtn.classList.add('hidden');
    }

    if (customContent) {
      elements.modalCustomSlot.innerHTML = '';
      if (typeof customContent === 'string') {
        elements.modalCustomSlot.innerHTML = customContent;
      } else {
        elements.modalCustomSlot.appendChild(customContent);
      }
      elements.modalCustomSlot.classList.remove('hidden');
    } else {
      elements.modalCustomSlot.innerHTML = '';
      elements.modalCustomSlot.classList.add('hidden');
    }

    const cleanup = () => {
      elements.modal.close();
      elements.modalCustomSlot.innerHTML = '';
      elements.modalCustomSlot.classList.add('hidden');
      elements.modalConfirmBtn.onclick = null;
      elements.modalCancelBtn.onclick = null;
    };

    elements.modalCancelBtn.onclick = () => {
      cleanup();
      if (typeof onCancel === 'function') onCancel();
    };

    elements.modalConfirmBtn.onclick = () => {
      if (typeof onConfirm === 'function') {
        const result = onConfirm();
        if (result !== false) cleanup();
      } else {
        cleanup();
      }
    };

    if (typeof elements.modal.showModal === 'function') {
      elements.modal.showModal();
    } else {
      elements.modal.setAttribute('open', '');
    }
  }

  // 5. Toast Notifications
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info'
    };

    toast.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.info}"></i>
      <span>${escapeHtml(message)}</span>
    `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  // 6. Safe Clipboard Copy
  function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg, 'success');
      }).catch(() => fallbackCopy(text, successMsg));
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    tempInput.style.position = 'fixed';
    tempInput.style.left = '-9999px';
    document.body.appendChild(tempInput);
    tempInput.focus();
    tempInput.select();
    try {
      document.execCommand('copy');
      showToast(successMsg, 'success');
    } catch (e) {
      showToast('Could not copy automatically', 'warning');
    }
    document.body.removeChild(tempInput);
  }

  // 7. Sanitization & Formatting Helpers
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateDivider(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function linkifyText(text) {
    const escaped = escapeHtml(text);
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    return escaped.replace(urlPattern, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  }

  // 8. Theme & Sound Controls
  function initPreferences() {
    // Theme
    const savedTheme = localStorage.getItem('duochat_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    elements.themeIcon.className = savedTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';

    // Sound
    const savedSound = localStorage.getItem('duochat_sound');
    state.soundEnabled = savedSound !== 'false';
    elements.soundIcon.className = state.soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';

    // Nickname
    const savedName = localStorage.getItem('duochat_name') || '';
    if (savedName) elements.nicknameInput.value = savedName;
  }

  elements.themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('duochat_theme', nextTheme);
    elements.themeIcon.className = nextTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  });

  elements.soundToggleBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('duochat_sound', state.soundEnabled ? 'true' : 'false');
    elements.soundIcon.className = state.soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
    showToast(state.soundEnabled ? 'Sound alerts enabled' : 'Sound alerts muted', 'info');
    if (state.soundEnabled) playChime('sent');
  });

  // 9. Navigation & Views Switching
  function showView(viewName) {
    if (viewName === 'chat') {
      elements.lobbyView.classList.add('hidden-view');
      elements.chatView.classList.remove('hidden-view');
      elements.userBadge.classList.remove('hidden');
      elements.messageInput.focus();
    } else {
      elements.chatView.classList.add('hidden-view');
      elements.lobbyView.classList.remove('hidden-view');
      elements.userBadge.classList.add('hidden');
    }
  }

  // 10. Saved Chats & Persistent Local Storage
  const STORAGE_KEY = 'duochat_saved_rooms';

  function getSavedRooms() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  function saveRoomToStorage(roomData) {
    try {
      const rooms = getSavedRooms();
      rooms[roomData.roomId] = {
        roomId: roomData.roomId,
        role: roomData.role,
        sessionToken: roomData.sessionToken,
        reloginKey: roomData.reloginKey,
        name: roomData.name,
        partnerName: roomData.partnerName || 'Waiting for partner...',
        partnerOnline: Boolean(roomData.partnerOnline),
        lastMessage: roomData.lastMessage || 'Connected to room',
        lastUpdated: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
      renderSavedRoomsList();
    } catch (e) {
      console.error('Error saving room to storage', e);
    }
  }

  function updateRoomInStorage(roomId, partialData) {
    try {
      if (!roomId) return;
      const rooms = getSavedRooms();
      if (rooms[roomId]) {
        rooms[roomId] = {
          ...rooms[roomId],
          ...partialData,
          lastUpdated: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
        renderSavedRoomsList();
      }
    } catch (e) {}
  }

  function removeRoomFromStorage(roomId) {
    try {
      if (!roomId) return;
      const rooms = getSavedRooms();
      delete rooms[roomId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
      renderSavedRoomsList();
    } catch (e) {}
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Recently';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function renderSavedRoomsList() {
    if (!elements.savedChatsSection || !elements.savedChatsList) return;
    const roomsObj = getSavedRooms();
    const roomsList = Object.values(roomsObj).sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));

    if (roomsList.length === 0) {
      elements.savedChatsSection.classList.add('hidden');
      return;
    }

    elements.savedChatsSection.classList.remove('hidden');
    if (elements.savedChatsBadge) elements.savedChatsBadge.textContent = roomsList.length;
    elements.savedChatsList.innerHTML = '';

    roomsList.forEach(room => {
      const item = document.createElement('div');
      item.className = 'saved-chat-item';
      item.id = `saved-card-${room.roomId}`;

      const isHost = room.role === 'host';
      const roleClass = isHost ? 'host' : 'guest';
      const roleLabel = isHost ? 'Host' : 'Guest';
      const partnerStatus = room.partnerOnline ? 'Online' : 'Offline';
      const partnerDotClass = room.partnerOnline ? 'online' : 'offline';

      item.innerHTML = `
        <div class="saved-chat-top">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="saved-room-pill">${escapeHtml(room.roomId)}</span>
            <span class="saved-role-badge ${roleClass}">${roleLabel}</span>
          </div>
          <span class="text-xs text-muted" id="time-ago-${room.roomId}">${formatTimeAgo(room.lastUpdated)}</span>
        </div>

        <div class="saved-chat-partner-row">
          <span class="status-indicator ${partnerDotClass}" id="partner-dot-${room.roomId}"></span>
          <span style="font-weight:600;font-size:0.88rem;" id="partner-label-${room.roomId}">
            ${escapeHtml(room.partnerName || 'Waiting for partner...')}
          </span>
          <span class="text-xs text-muted" id="partner-status-tag-${room.roomId}">(${partnerStatus})</span>
        </div>

        <div class="saved-chat-meta-row">
          <span class="saved-chat-snippet" id="snippet-${room.roomId}" title="${escapeHtml(room.lastMessage || '')}">
            ${escapeHtml(room.lastMessage || 'No recent messages')}
          </span>
          <span class="saved-chat-key-badge" data-key="${escapeHtml(room.reloginKey || '')}" title="Click to copy your Re-login Key">
            <i class="fa-solid fa-key text-teal"></i>
            <span>${escapeHtml(room.reloginKey || 'KEY')}</span>
          </span>
        </div>

        <div class="saved-chat-actions">
          <button type="button" class="btn btn-primary btn-sm resume-btn" data-room="${room.roomId}">
            <i class="fa-solid fa-arrow-right-to-bracket"></i>
            <span>Re-login & Open</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-remove remove-btn" data-room="${room.roomId}" title="Remove from this device">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;

      elements.savedChatsList.appendChild(item);
    });
  }

  function refreshSavedRoomsStatus() {
    const roomsObj = getSavedRooms();
    Object.values(roomsObj).forEach(r => {
      socket.emit('get-room-status', {
        roomId: r.roomId,
        sessionToken: r.sessionToken,
        reloginKey: r.reloginKey
      }, (res) => {
        if (!res || !res.exists) {
          const statusTag = document.getElementById(`partner-status-tag-${r.roomId}`);
          if (statusTag) statusTag.textContent = '(Room Expired)';
          return;
        }

        if (res.partner) {
          const dot = document.getElementById(`partner-dot-${r.roomId}`);
          const label = document.getElementById(`partner-label-${r.roomId}`);
          const tag = document.getElementById(`partner-status-tag-${r.roomId}`);

          if (dot) dot.className = `status-indicator ${res.partner.online ? 'online' : 'offline'}`;
          if (label && res.partner.name) label.textContent = res.partner.name;
          if (tag) tag.textContent = res.partner.online ? '(Online)' : '(Offline)';

          updateRoomInStorage(r.roomId, {
            partnerName: res.partner.name,
            partnerOnline: res.partner.online,
            lastMessage: res.lastMessage ? res.lastMessage.text : r.lastMessage
          });
        }
      });
    });
  }

  // Saved Chats interaction delegation
  if (elements.savedChatsList) {
    elements.savedChatsList.addEventListener('click', (e) => {
      const resumeBtn = e.target.closest('.resume-btn');
      if (resumeBtn) {
        const roomId = resumeBtn.getAttribute('data-room');
        const saved = getSavedRooms()[roomId];
        if (saved) {
          state.name = saved.name || state.name || 'User';
          elements.nicknameInput.value = state.name;
          showToast(`Re-logging into room ${roomId}...`, 'info');
          socket.emit('join-room', {
            roomId: saved.roomId,
            name: saved.name,
            sessionToken: saved.sessionToken,
            reloginKey: saved.reloginKey
          });
        }
        return;
      }

      const removeBtn = e.target.closest('.remove-btn');
      if (removeBtn) {
        const roomId = removeBtn.getAttribute('data-room');
        removeRoomFromStorage(roomId);
        showToast(`Removed room ${roomId} from this device`, 'info');
        return;
      }

      const keyBadge = e.target.closest('.saved-chat-key-badge');
      if (keyBadge) {
        const key = keyBadge.getAttribute('data-key');
        if (key) {
          copyToClipboard(key, `Re-login Key "${key}" copied to clipboard!`);
        }
        return;
      }
    });
  }

  // Toggle optional Re-login Key Input
  if (elements.toggleReloginKeyBtn) {
    elements.toggleReloginKeyBtn.addEventListener('click', () => {
      elements.reloginKeyField.classList.toggle('hidden');
      if (!elements.reloginKeyField.classList.contains('hidden')) {
        elements.joinKeyInput.focus();
      }
    });
  }

  // 11. Room Creation & Joining Handlers
  elements.createRoomBtn.addEventListener('click', () => {
    const name = elements.nicknameInput.value.trim() || 'Host';
    state.name = name;
    localStorage.setItem('duochat_name', name);
    socket.emit('create-room', { name });
  });

  elements.joinRoomBtn.addEventListener('click', handleJoinRequest);
  elements.joinCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleJoinRequest();
  });
  if (elements.joinKeyInput) {
    elements.joinKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleJoinRequest();
    });
  }

  function handleJoinRequest() {
    const code = elements.joinCodeInput.value.trim().toUpperCase();
    const name = elements.nicknameInput.value.trim() || 'Guest';
    const manualKey = elements.joinKeyInput ? elements.joinKeyInput.value.trim().toUpperCase() : '';

    if (!code || code.length !== 6) {
      showToast('Please enter a valid 6-character room code', 'warning');
      elements.joinCodeInput.focus();
      return;
    }

    state.name = name;
    localStorage.setItem('duochat_name', name);

    // Retrieve previous session token / reloginKey if returning to this room
    const saved = getSavedRooms()[code];
    const sessionToken = saved ? saved.sessionToken : null;
    const reloginKey = manualKey || (saved ? saved.reloginKey : null);

    socket.emit('join-room', {
      roomId: code,
      name,
      sessionToken,
      reloginKey
    });
  }

  // Connection & Offline Banner Helpers
  function showConnectionBanner(type, message) {
    if (!elements.connectionBanner) return;
    elements.connectionBanner.className = `connection-banner ${type}`;
    elements.connectionBannerText.textContent = message;
    elements.connectionBanner.classList.remove('hidden');

    if (type === 'online') {
      setTimeout(() => {
        elements.connectionBanner.classList.add('hidden');
      }, 2500);
    }
  }

  function hideConnectionBanner() {
    if (elements.connectionBanner) {
      elements.connectionBanner.classList.add('hidden');
    }
  }

  // 12. Socket.IO Event Listeners
  socket.on('connect', () => {
    if (state.roomId && (state.sessionToken || state.reloginKey)) {
      showConnectionBanner('online', '✓ Reconnected! Resuming chat...');
      socket.emit('join-room', {
        roomId: state.roomId,
        name: state.name,
        sessionToken: state.sessionToken,
        reloginKey: state.reloginKey
      });
    } else {
      hideConnectionBanner();
    }
    refreshSavedRoomsStatus();
  });

  socket.on('disconnect', () => {
    if (state.roomId) {
      showConnectionBanner('offline', '⚠️ Connection lost. Auto-reconnecting as soon as network is back...');
    }
  });

  window.addEventListener('online', () => {
    showToast('Internet connection restored', 'success');
    if (state.roomId) {
      showConnectionBanner('online', 'Network online! Re-syncing chat...');
      if (!socket.connected) {
        socket.connect();
      } else {
        socket.emit('join-room', {
          roomId: state.roomId,
          name: state.name,
          sessionToken: state.sessionToken,
          reloginKey: state.reloginKey
        });
      }
    }
    refreshSavedRoomsStatus();
  });

  window.addEventListener('offline', () => {
    showToast('You are currently offline', 'warning');
    if (state.roomId) {
      showConnectionBanner('offline', '⚠️ You are currently offline. Changes will sync when reconnected.');
    }
  });

  socket.on('room-joined', ({ success, roomId, role, sessionToken, reloginKey, roomState, messages }) => {
    if (!success) return;

    state.roomId = roomId;
    state.role = role;
    state.sessionToken = sessionToken;
    state.reloginKey = reloginKey;
    state.messages = messages || [];
    state.partner = roomState.partner;

    saveRoomToStorage({
      roomId,
      role,
      sessionToken,
      reloginKey,
      name: state.name,
      partnerName: roomState.partner?.name,
      partnerOnline: roomState.partner?.online,
      lastMessage: messages.length > 0 ? messages[messages.length - 1].text : 'Joined conversation',
      lastUpdated: Date.now()
    });

    hideConnectionBanner();

    // Update Header and UI
    elements.activeRoomCode.textContent = roomId;
    elements.userBadgeName.textContent = `${state.name} (${role === 'host' ? 'Host' : 'Guest'})`;

    // Update URL parameter without reload
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    window.history.replaceState({}, '', url);

    // Update Partner UI Status
    updatePartnerUI(roomState.partner, roomState.isLocked);

    // Render Messages
    renderAllMessages();

    // Transition to chat view
    showView('chat');
    showToast(`Connected to room ${roomId}`, 'success');
  });

  socket.on('join-error', ({ message, isFull, canRelogin, offlineParticipants }) => {
    if (isFull && canRelogin) {
      // Re-login prompt modal
      const content = document.createElement('div');
      content.className = 'modal-input-group';
      const seatNames = (offlineParticipants || []).map(p => `${p.name} (${p.slot === 'host' ? 'Host' : 'Guest'})`).join(' or ');
      content.innerHTML = `
        <label for="modal-relogin-key-input" class="form-label">Enter your Re-login Key</label>
        <div class="input-wrapper">
          <i class="fa-solid fa-key input-icon"></i>
          <input 
            type="text" 
            id="modal-relogin-key-input" 
            class="code-input" 
            placeholder="e.g. HOST-8A2F or GUEST-7K9P" 
            autocomplete="off"
            spellcheck="false"
            maxlength="16"
          >
        </div>
      `;

      showModal({
        title: 'Re-login to Room',
        desc: `This 2-person room is locked, but offline seat(s) are available for ${seatNames}. Enter your Re-login Key to reclaim your seat:`,
        icon: 'fa-shield-halved',
        iconType: 'info',
        confirmText: 'Re-login & Enter',
        cancelText: 'Cancel',
        showCancel: true,
        customContent: content,
        onConfirm: () => {
          const keyInput = document.getElementById('modal-relogin-key-input');
          const keyVal = (keyInput ? keyInput.value : '').trim().toUpperCase();
          if (!keyVal) {
            showToast('Please enter your Re-login Key', 'warning');
            return false;
          }
          const code = elements.joinCodeInput.value.trim().toUpperCase() || state.roomId;
          socket.emit('join-room', {
            roomId: code,
            name: state.name || 'User',
            reloginKey: keyVal
          });
          return true;
        }
      });

      setTimeout(() => {
        const inp = document.getElementById('modal-relogin-key-input');
        if (inp) inp.focus();
      }, 100);
      return;
    }

    if (isFull) {
      // STRICT 2-PEER LOCK ENFORCEMENT MODAL
      showModal({
        title: 'Room Is Locked (2/2)',
        desc: 'This private conversation is strictly limited to 2 participants and both are currently online and chatting. Third-party entry is strictly blocked.',
        icon: 'fa-user-lock',
        iconType: 'danger',
        confirmText: 'Understood',
        showCancel: false,
        onConfirm: () => {
          elements.joinCodeInput.value = '';
          elements.joinCodeInput.focus();
        }
      });
    } else {
      showToast(message || 'Failed to join room', 'error');
    }
  });

  socket.on('partner-updated', ({ partner, isLocked }) => {
    const wasOnline = state.partner && state.partner.online;
    state.partner = partner;
    updatePartnerUI(partner, isLocked);

    if (state.roomId && partner) {
      updateRoomInStorage(state.roomId, {
        partnerName: partner.name,
        partnerOnline: Boolean(partner.online)
      });
    }

    if (partner && partner.online && !wasOnline) {
      playChime('joined');
      showToast(`${partner.name || 'Partner'} has connected!`, 'info');
    } else if (partner && !partner.online && wasOnline) {
      playChime('left');
      showToast(`${partner.name || 'Partner'} disconnected.`, 'warning');
    }
  });

  socket.on('new-message', (message) => {
    state.messages.push(message);
    appendMessageDOM(message);

    if (state.roomId) {
      updateRoomInStorage(state.roomId, {
        lastMessage: `${message.senderName}: ${message.text}`,
        lastUpdated: Date.now()
      });
    }

    playChime('received');

    // If user is scrolled up, display unread indicator
    if (state.isScrolledUp) {
      state.unreadCount++;
      elements.unreadCountBadge.textContent = state.unreadCount;
      elements.unreadCountBadge.classList.remove('hidden');
    } else {
      scrollToBottom();
      // Inform sender that message is read
      socket.emit('mark-read', { messageIds: [message.id] });
    }
  });

  socket.on('partner-typing', ({ isTyping, senderName }) => {
    if (isTyping) {
      elements.typingText.textContent = `${senderName || 'Partner'} is typing...`;
      elements.typingBar.classList.remove('hidden');
    } else {
      elements.typingBar.classList.add('hidden');
    }
  });

  socket.on('messages-read', ({ messageIds }) => {
    messageIds.forEach(id => {
      const msg = state.messages.find(m => m.id === id);
      if (msg) msg.status = 'read';

      const checkElem = document.getElementById(`checks-${id}`);
      if (checkElem) {
        checkElem.className = 'status-checks read fa-solid fa-check-double';
      }
    });
  });

  socket.on('reaction-updated', ({ messageId, reactions }) => {
    const msg = state.messages.find(m => m.id === messageId);
    if (msg) msg.reactions = reactions;

    const reactionsContainer = document.getElementById(`reactions-${messageId}`);
    if (reactionsContainer) {
      renderReactionsDOM(reactionsContainer, messageId, reactions);
    }
  });

  socket.on('chat-cleared', () => {
    state.messages = [];
    renderAllMessages();
    showToast('Conversation cleared by partner', 'info');
  });

  socket.on('room-destroyed', ({ message }) => {
    showModal({
      title: 'Room Terminated',
      desc: message || 'This room has been permanently deleted.',
      icon: 'fa-fire',
      iconType: 'warning',
      confirmText: 'Return to Lobby',
      showCancel: false,
      onConfirm: () => {
        exitToLobby();
      }
    });
  });

  // 12. Partner UI Status Updater
  function updatePartnerUI(partner, isLocked) {
    if (partner) {
      elements.waitingBanner.classList.add('hidden');
      if (partner.online) {
        elements.partnerStatusDot.className = 'status-indicator online';
        elements.partnerStatusText.textContent = `${partner.name || 'Partner'} is online`;
      } else {
        elements.partnerStatusDot.className = 'status-indicator offline';
        elements.partnerStatusText.textContent = `${partner.name || 'Partner'} is offline`;
      }
    } else {
      elements.waitingBanner.classList.remove('hidden');
      elements.partnerStatusDot.className = 'status-indicator waiting';
      elements.partnerStatusText.textContent = 'Waiting for partner to join...';
    }
  }

  // 13. Message Rendering & DOM
  function renderAllMessages() {
    elements.messagesContainer.innerHTML = '';

    if (state.messages.length === 0) {
      elements.messagesContainer.innerHTML = `
        <div class="empty-chat-state">
          <div class="empty-chat-icon">
            <i class="fa-regular fa-comments"></i>
          </div>
          <h3>No messages yet</h3>
          <p>Send a message below. Once sent, messages sync instantly over secure WebSockets.</p>
        </div>
      `;
      return;
    }

    let lastDate = null;

    state.messages.forEach(msg => {
      const msgDate = new Date(msg.timestamp || Date.now()).toDateString();
      if (msgDate !== lastDate) {
        const dateDivider = document.createElement('div');
        dateDivider.className = 'date-divider';
        dateDivider.innerHTML = `<span class="date-pill">${formatDateDivider(msg.timestamp)}</span>`;
        elements.messagesContainer.appendChild(dateDivider);
        lastDate = msgDate;
      }
      appendMessageDOM(msg, false);
    });

    scrollToBottom();
  }

  function appendMessageDOM(msg, shouldScroll = true) {
    // Remove empty placeholder if present
    const emptyState = elements.messagesContainer.querySelector('.empty-chat-state');
    if (emptyState) emptyState.remove();

    const isMe = msg.senderSlot === state.role;
    const initial = (msg.senderName || (isMe ? 'Y' : 'P')).charAt(0).toUpperCase();

    const row = document.createElement('div');
    row.className = `message-row ${isMe ? 'me' : 'partner'}`;
    row.id = `msg-row-${msg.id}`;

    // Bubble wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'message-bubble-wrapper';

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = initial;

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    const header = document.createElement('div');
    header.className = 'msg-header';
    header.innerHTML = `
      <span>${escapeHtml(msg.senderName || (isMe ? 'You' : 'Partner'))}</span>
      <span class="sender-pill">${isMe ? 'You' : 'Partner'}</span>
    `;

    const text = document.createElement('div');
    text.className = 'msg-text';
    text.innerHTML = linkifyText(msg.text);

    bubble.appendChild(header);
    bubble.appendChild(text);

    // Reactions container
    const reactionsBox = document.createElement('div');
    reactionsBox.className = 'msg-reactions-row';
    reactionsBox.id = `reactions-${msg.id}`;
    renderReactionsDOM(reactionsBox, msg.id, msg.reactions);
    bubble.appendChild(reactionsBox);

    // Hover actions toolbar
    const hoverActions = document.createElement('div');
    hoverActions.className = 'msg-hover-actions';
    hoverActions.innerHTML = `
      <button class="hover-action-btn" title="React ❤️" data-react="❤️" data-id="${msg.id}">❤️</button>
      <button class="hover-action-btn" title="React 👍" data-react="👍" data-id="${msg.id}">👍</button>
      <button class="hover-action-btn" title="React 😂" data-react="😂" data-id="${msg.id}">😂</button>
      <button class="hover-action-btn" title="React 🔥" data-react="🔥" data-id="${msg.id}">🔥</button>
      <button class="hover-action-btn" title="Copy text" data-copy-text="${escapeHtml(msg.text)}">
        <i class="fa-regular fa-copy"></i>
      </button>
    `;

    // Timestamp & delivery status
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const isRead = msg.status === 'read';
    meta.innerHTML = `
      <span>${formatTime(msg.timestamp)}</span>
      ${isMe ? `<i id="checks-${msg.id}" class="status-checks ${isRead ? 'read fa-solid fa-check-double' : 'fa-solid fa-check'}"></i>` : ''}
    `;

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    wrapper.appendChild(hoverActions);

    row.appendChild(wrapper);
    row.appendChild(meta);

    elements.messagesContainer.appendChild(row);

    if (shouldScroll) {
      scrollToBottom();
    }
  }

  function renderReactionsDOM(container, messageId, reactions) {
    container.innerHTML = '';
    if (!reactions) return;

    Object.entries(reactions).forEach(([emoji, slots]) => {
      if (!Array.isArray(slots) || slots.length === 0) return;
      const isMine = slots.includes(state.role);
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `reaction-badge ${isMine ? 'active-by-me' : ''}`;
      pill.innerHTML = `<span>${emoji}</span> <span class="reaction-count">${slots.length}</span>`;
      pill.addEventListener('click', () => {
        socket.emit('toggle-reaction', { messageId, emoji });
      });
      container.appendChild(pill);
    });
  }

  // Delegated event listener for message hover actions
  elements.messagesContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.hover-action-btn');
    if (!btn) return;

    const emoji = btn.getAttribute('data-react');
    const msgId = btn.getAttribute('data-id');
    const copyText = btn.getAttribute('data-copy-text');

    if (emoji && msgId) {
      socket.emit('toggle-reaction', { messageId: msgId, emoji });
    } else if (copyText) {
      copyToClipboard(copyText, 'Message copied!');
    }
  });

  // 14. Message Composer & Typing
  elements.messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
  });

  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  function sendMessage() {
    const text = elements.messageInput.value.trim();
    if (!text || !state.roomId) return;

    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';

    // Send typing stopped immediately
    emitTyping(false);

    socket.emit('send-message', { text }, (res) => {
      if (res && res.success && res.message) {
        state.messages.push(res.message);
        appendMessageDOM(res.message);
        playChime('sent');
        if (state.roomId) {
          updateRoomInStorage(state.roomId, {
            lastMessage: `You: ${res.message.text}`,
            lastUpdated: Date.now()
          });
        }
      }
    });
  }

  // Typing debouncer
  elements.messageInput.addEventListener('input', () => {
    // Auto-grow textarea height
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 120)}px`;

    emitTyping(true);
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => {
      emitTyping(false);
    }, 1500);
  });

  function emitTyping(isTyping) {
    if (state.isTypingSent !== isTyping) {
      state.isTypingSent = isTyping;
      socket.emit('typing', { isTyping });
    }
  }

  // Quick Emoji Bar toggle
  elements.emojiPickerToggle.addEventListener('click', () => {
    elements.emojiQuickBar.classList.toggle('hidden');
  });

  elements.emojiQuickBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-emoji-btn');
    if (!btn) return;
    const emoji = btn.getAttribute('data-emoji');
    elements.messageInput.value += emoji;
    elements.messageInput.focus();
  });

  // 15. Scrolling & Unread Handling
  function scrollToBottom() {
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    state.isScrolledUp = false;
    state.unreadCount = 0;
    elements.scrollBottomBtn.classList.add('hidden');
    elements.unreadCountBadge.classList.add('hidden');
  }

  elements.messagesContainer.addEventListener('scroll', () => {
    const threshold = 120;
    const isAtBottom = elements.messagesContainer.scrollHeight - elements.messagesContainer.scrollTop - elements.messagesContainer.clientHeight < threshold;

    if (isAtBottom) {
      state.isScrolledUp = false;
      state.unreadCount = 0;
      elements.scrollBottomBtn.classList.add('hidden');
      elements.unreadCountBadge.classList.add('hidden');

      // Mark any unread messages
      const unreadIds = state.messages
        .filter(m => m.senderSlot !== state.role && m.status !== 'read')
        .map(m => m.id);
      if (unreadIds.length > 0) {
        socket.emit('mark-read', { messageIds: unreadIds });
      }
    } else {
      state.isScrolledUp = true;
      elements.scrollBottomBtn.classList.remove('hidden');
    }
  });

  elements.scrollBottomBtn.addEventListener('click', scrollToBottom);

  // 16. Header & Room Actions
  function copyInviteLink() {
    if (!state.roomId) return;
    const baseUrl = window.location.origin + window.location.pathname;
    const link = `${baseUrl}?room=${state.roomId}`;
    copyToClipboard(link, `Invite link copied! Share it with your partner.`);
  }

  elements.copyLinkBtn.addEventListener('click', copyInviteLink);
  elements.quickCopyBtn.addEventListener('click', copyInviteLink);

  elements.copyCodeBtn.addEventListener('click', () => {
    if (state.roomId) {
      copyToClipboard(state.roomId, `Room code "${state.roomId}" copied!`);
    }
  });

  // Export Transcript (.txt)
  elements.exportChatBtn.addEventListener('click', () => {
    if (state.messages.length === 0) {
      showToast('No messages available to export', 'warning');
      return;
    }

    let transcript = `========================================================\n`;
    transcript += ` DuoChat Conversation Transcript\n`;
    transcript += ` Room Code: ${state.roomId}\n`;
    transcript += ` Date Exported: ${new Date().toLocaleString()}\n`;
    transcript += ` Participants: ${state.name} (${state.role === 'host' ? 'Host' : 'Guest'}) & ${state.partner ? state.partner.name : 'Partner'}\n`;
    transcript += `========================================================\n\n`;

    state.messages.forEach(msg => {
      const time = new Date(msg.timestamp || Date.now()).toLocaleString();
      const roleLabel = msg.senderSlot === state.role ? 'You' : 'Partner';
      transcript += `[${time}] ${msg.senderName} (${roleLabel}):\n${msg.text}\n\n`;
    });

    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DuoChat_${state.roomId}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Transcript exported as .txt', 'success');
  });

  // Clear Chat Modal
  elements.clearChatBtn.addEventListener('click', () => {
    showModal({
      title: 'Clear Conversation?',
      desc: 'This will remove all current messages in this room for both you and your partner.',
      icon: 'fa-trash-can',
      iconType: 'danger',
      confirmText: 'Clear Chat',
      showCancel: true,
      onConfirm: () => {
        socket.emit('clear-chat');
        showToast('Chat cleared', 'info');
      }
    });
  });

  // 17. View Re-login Key Button Handler
  if (elements.viewReloginKeyBtn) {
    elements.viewReloginKeyBtn.addEventListener('click', () => {
      if (!state.reloginKey) {
        showToast('No Re-login Key available', 'warning');
        return;
      }

      const content = document.createElement('div');
      content.className = 'key-display-card';
      content.innerHTML = `
        <span class="key-large-pill" id="modal-key-text">${escapeHtml(state.reloginKey)}</span>
        <button type="button" id="modal-copy-key-btn" class="btn btn-sm btn-primary">
          <i class="fa-regular fa-copy"></i>
          <span>Copy Re-login Key</span>
        </button>
        <p class="key-hint">
          Keep this key safe! You can use it to re-login into Room <strong>${escapeHtml(state.roomId)}</strong> as ${state.role === 'host' ? 'Host' : 'Guest'} anytime after going offline or from another device.
        </p>
      `;

      const copyBtn = content.querySelector('#modal-copy-key-btn');
      copyBtn.addEventListener('click', () => {
        copyToClipboard(state.reloginKey, 'Re-login Key copied to clipboard!');
      });

      showModal({
        title: 'Your Re-login Key',
        desc: `This secret passkey authenticates your seat in this private 2-person room.`,
        icon: 'fa-key',
        iconType: 'info',
        confirmText: 'Done',
        showCancel: false,
        customContent: content
      });
    });
  }

  // 18. Leave / Burn Room Modal
  elements.leaveRoomBtn.addEventListener('click', () => {
    showModal({
      title: 'Leave Conversation',
      desc: 'Would you like to simply leave (you can re-login anytime from Saved Chats), or burn and destroy this room permanently?',
      icon: 'fa-arrow-right-from-bracket',
      iconType: 'warning',
      confirmText: 'Leave Room',
      cancelText: 'Burn & Destroy',
      showCancel: true,
      onConfirm: () => {
        // Simple leave (keeps saved in localStorage)
        socket.emit('leave-room', { destroyRoom: false });
        exitToLobby(false);
      }
    });

    // Special custom action: modify the cancel button in this specific dialog to act as "Burn"
    const originalCancel = elements.modalCancelBtn.onclick;
    elements.modalCancelBtn.onclick = () => {
      elements.modal.close();
      showModal({
        title: 'Burn & Destroy Room?',
        desc: 'This will permanently wipe all conversation messages and delete the room for both participants.',
        icon: 'fa-fire',
        iconType: 'danger',
        confirmText: 'Burn Permanently',
        cancelText: 'Cancel',
        showCancel: true,
        onConfirm: () => {
          socket.emit('leave-room', { destroyRoom: true });
          exitToLobby(true);
        }
      });
    };
  });

  function exitToLobby(isBurned = false) {
    if (isBurned && state.roomId) {
      removeRoomFromStorage(state.roomId);
    }
    state.roomId = null;
    state.role = null;
    state.reloginKey = null;
    state.partner = null;
    state.messages = [];
    state.unreadCount = 0;

    // Remove room param from URL
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);

    showView('lobby');
    renderSavedRoomsList();
    refreshSavedRoomsStatus();
    showToast(isBurned ? 'Room burned permanently' : 'You left the room. You can re-login anytime from Saved Chats.', 'info');
  }

  // 19. Startup Initialization
  window.addEventListener('DOMContentLoaded', () => {
    initPreferences();
    renderSavedRoomsList();
    refreshSavedRoomsStatus();

    // Check URL parameters for room invitation
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');

    if (roomParam) {
      const cleanCode = roomParam.trim().toUpperCase();
      elements.joinCodeInput.value = cleanCode;

      // Check if we have an existing session for this room
      const savedSession = getSavedRooms()[cleanCode];
      if (savedSession) {
        state.name = savedSession.name || 'User';
        elements.nicknameInput.value = state.name;
        socket.emit('join-room', {
          roomId: cleanCode,
          name: state.name,
          sessionToken: savedSession.sessionToken,
          reloginKey: savedSession.reloginKey
        });
      } else {
        showToast(`Invite code ${cleanCode} entered. Click Join to enter.`, 'info');
      }
    }
  });

})();
