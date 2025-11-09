let ws = null;
let isServerMonitor = false;
let isClient = false;
let currentSessionCode = '';
let messageIdCounter = 0;
let hasConnected = false;
let clientId = null;

// ✅ WebSocket connection handler
function connectWebSocket(onOpenCallback) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log("Already connected to WebSocket.");
    if (onOpenCallback) onOpenCallback();
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("🟢 WebSocket connected");
    if (onOpenCallback) onOpenCallback();
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWebSocketMessage(data);
  };

  ws.onerror = (error) => {
    console.error("❌ WebSocket error:", error);
    showError("Connection error. Please refresh and try again.");
  };

  ws.onclose = () => {
    console.log("🔴 WebSocket closed");
    
    if (isClient && hasConnected) {
      showError("⚠️ Connection lost. Server unavailable.");
      setTimeout(() => {
        window.location.href = "/";
      }, 3000);
    }
  };
}

// ====================== SERVER MONITOR ======================
function initServer() {
  isServerMonitor = true;
  connectWebSocket(() => {
    ws.send(JSON.stringify({ type: "SERVER_MONITOR" }));
  });
}

// ====================== CLIENT ======================
function initClient() {
  isClient = true;

  const connectForm = document.getElementById("connectForm");
  connectForm.addEventListener("submit", handleClientConnect);

  const messageForm = document.getElementById("messageForm");
  if (messageForm) {
    messageForm.addEventListener("submit", handleClientMessage);
  }
}

function handleClientConnect(e) {
  e.preventDefault();

  const clientName = document.getElementById("clientName").value.trim();
  const sessionCode = document.getElementById("sessionCodeInput").value.trim().toUpperCase();

  if (!clientName || !sessionCode) {
    showError("Please enter both name and session code");
    return;
  }

  currentSessionCode = sessionCode;

  connectWebSocket(() => {
    ws.send(JSON.stringify({
      type: "CLIENT_CONNECT",
      code: sessionCode,
      clientName: clientName
    }));
  });
}

// ====================== MESSAGE HANDLERS ======================
function handleWebSocketMessage(data) {
  switch (data.type) {
    case "SESSION_CODE":
      displaySessionCode(data.code);
      break;
      
    case "CLIENT_COUNT":
      updateClientCount(data.count, data.max);
      break;
      
    case "CONNECTION_ACCEPTED":
      handleConnectionAccepted(data.clientId, data.waitingForOther);
      break;
      
    case "CONNECTION_REJECTED":
      handleConnectionRejected(data.reason);
      break;
      
    case "CHAT_READY":
      handleChatReady(data.message);
      break;
      
    case "SCP_MESSAGE":
      handleSCPMessage(data.message);
      break;
      
    case "SESSION_ENDED":
      handleSessionEnded(data.reason);
      break;
      
    case "SERVER_SHUTDOWN":
      handleServerShutdown(data.reason);
      break;
  }
}

// ====================== SERVER MONITOR FUNCTIONS ======================
function displaySessionCode(code) {
  currentSessionCode = code;
  const codeElement = document.querySelector(".code-text");
  if (codeElement) codeElement.textContent = code;
}

function updateClientCount(count, max) {
  const statusDiv = document.getElementById("connectionStatus");
  if (!statusDiv) return;
  
  let statusClass = count === 0 ? 'waiting' : (count === 1 ? 'partial' : 'connected');
  let statusText = `Clients connected: ${count}/${max}`;
  
  if (count === 0) {
    statusText = 'Waiting for clients to join...';
  } else if (count === 1) {
    statusText = 'Waiting for second client... (1/2 connected)';
  } else if (count === 2) {
    statusText = 'Both clients connected! Chat session active.';
  }
  
  statusDiv.innerHTML = `
    <div class="status-indicator ${statusClass}">
      <span class="status-dot"></span>
      <span class="status-text">${statusText}</span>
    </div>
  `;
}

// ====================== CLIENT FUNCTIONS ======================
function handleConnectionAccepted(id, waitingForOther) {
  hasConnected = true;
  clientId = id;
  
  document.getElementById("connectionPanel").style.display = "none";
  document.getElementById("chatContainer").style.display = "block";
  
  if (waitingForOther) {
    addConsoleMessage("clientConsole", "⏳ Connected! Waiting for another client to join...", "system");
    
    // Disable message input until both clients connected
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.querySelector("#messageForm button");
    if (messageInput) {
      messageInput.disabled = true;
      messageInput.placeholder = "Waiting for another client...";
    }
    if (sendButton) sendButton.disabled = true;
  } else {
    addConsoleMessage("clientConsole", "✓ Connected to server. Chat session ready!", "system");
  }
}

function handleConnectionRejected(reason) {
  showError(reason);
  if (ws) ws.close();
}

function handleChatReady(message) {
  addConsoleMessage("clientConsole", `✓ ${message}`, "system");
  
  // Enable message input
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.querySelector("#messageForm button");
  if (messageInput) {
    messageInput.disabled = false;
    messageInput.placeholder = "Type a message to the other client...";
    messageInput.focus();
  }
  if (sendButton) sendButton.disabled = false;
}

function handleClientMessage(e) {
  e.preventDefault();
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  const msgId = ++messageIdCounter;
  const message = `SCP/1.1 | MSG | id=${msgId} | ${text}`;

  addConsoleMessage("clientConsole", message, "sent");
  ws.send(JSON.stringify({ type: "SCP_MESSAGE", message }));
  input.value = "";
}

function handleSCPMessage(message) {
  const consoleId = isClient ? "clientConsole" : "serverConsole";
  addConsoleMessage(consoleId, message, "received");
}

function handleSessionEnded(reason) {
  addConsoleMessage("clientConsole", `⚠️ ${reason}`, "error");
  showError(reason);
  
  // Disable input
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.querySelector("#messageForm button");
  if (messageInput) {
    messageInput.disabled = true;
    messageInput.placeholder = "Session ended";
  }
  if (sendButton) sendButton.disabled = true;
  
  setTimeout(() => {
    window.location.href = "/";
  }, 3000);
}

function handleServerShutdown(reason) {
  const consoleId = isClient ? "clientConsole" : "serverConsole";
  addConsoleMessage(consoleId, `⚠️ ${reason}`, "error");
  showError("⚠️ Connection lost. Server unavailable.");
  
  setTimeout(() => {
    window.location.href = "/";
  }, 2000);
}

function disconnect() {
  if (ws) {
    ws.send(JSON.stringify({ type: "DISCONNECT" }));
    ws.close();
  }
  addConsoleMessage("clientConsole", "Disconnected from session", "system");
  setTimeout(() => (window.location.href = "/"), 1000);
}

// ====================== SHARED UTILITIES ======================
function addConsoleMessage(consoleId, text, className) {
  const consoleDiv = document.getElementById(consoleId);
  if (!consoleDiv) return;
  
  const line = document.createElement("div");
  line.className = `console-line ${className}`;
  
  const timestamp = new Date().toLocaleTimeString();
  line.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${escapeHtml(text)}`;
  
  consoleDiv.appendChild(line);
  consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  const errorDiv = document.getElementById("connectionError");
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = "block";
    setTimeout(() => (errorDiv.style.display = "none"), 5000);
  }
  
  // Also show in console if available
  const consoleId = isClient ? "clientConsole" : "serverConsole";
  const consoleDiv = document.getElementById(consoleId);
  if (consoleDiv) {
    addConsoleMessage(consoleId, message, "error");
  }
}

function copySessionCode() {
  navigator.clipboard.writeText(currentSessionCode).then(() => {
    const btn = document.getElementById("copyBtn");
    const icon = document.getElementById("copyIcon");
    if (icon) {
      icon.textContent = "✓";
      setTimeout(() => (icon.textContent = "📋"), 2000);
    }
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}
