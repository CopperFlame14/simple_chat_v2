let ws = null;
let isServer = false;
let isClient = false;
let currentSessionCode = '';
let messageIdCounter = 0;
let hasConnected = false;
let myName = '';
let otherClientName = '';

// ✅ Stable WebSocket connection handler
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
  };

  ws.onclose = () => {
    console.log("🔴 WebSocket closed");
    if (isClient && hasConnected) {
      showError("Connection lost. Please refresh and try again.");
    }
  };
}

// ====================== SERVER ======================
function initServer() {
  isServer = true;
  connectWebSocket(() => {
    ws.send(JSON.stringify({ type: "SERVER_INIT" }));
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

  myName = clientName;

  connectWebSocket(() => {
    ws.send(JSON.stringify({
      type: "CLIENT_CONNECT",
      code: sessionCode,
      clientName: clientName
    }));
  });
}

// ====================== HANDLERS ======================
function handleWebSocketMessage(data) {
  switch (data.type) {
    case "SESSION_CODE":
      displaySessionCode(data.code);
      break;
    case "STATUS_UPDATE":
      handleStatusUpdate(data);
      break;
    case "SESSION_RESET":
      handleSessionReset(data.code);
      break;
    case "CONNECTION_ACCEPTED":
      handleConnectionAccepted(data);
      break;
    case "CONNECTION_REJECTED":
      handleConnectionRejected(data.reason);
      break;
    case "OTHER_CLIENT_JOINED":
      handleOtherClientJoined(data.otherClientName);
      break;
    case "OTHER_CLIENT_DISCONNECTED":
      handleOtherClientDisconnected(data.message);
      break;
    case "SERVER_DOWN":
      handleServerDown(data.message);
      break;
    case "SCP_MESSAGE":
      handleSCPMessage(data.message, data.sender);
      break;
  }
}

// ====================== SERVER FUNCTIONS ======================
function displaySessionCode(code) {
  currentSessionCode = code;
  const codeElement = document.querySelector(".code-text");
  if (codeElement) codeElement.textContent = code;
}

function handleStatusUpdate(data) {
  const statusDiv = document.getElementById("connectionStatus");
  if (!statusDiv) return;

  const { connectedCount, client1Name, client2Name } = data;

  if (connectedCount === 0) {
    statusDiv.innerHTML = `
      <div class="status-indicator waiting">
        <span class="status-dot"></span>
        <span class="status-text">Waiting for clients... (0/2)</span>
      </div>
    `;
  } else if (connectedCount === 1) {
    statusDiv.innerHTML = `
      <div class="status-indicator waiting">
        <span class="status-dot"></span>
        <span class="status-text">Waiting for second client... (1/2)</span>
        <div style="margin-top: 10px; font-size: 0.9em; color: #9aa7b2;">
          Connected: ${client1Name}
        </div>
      </div>
    `;
  } else if (connectedCount === 2) {
    statusDiv.innerHTML = `
      <div class="status-indicator connected">
        <span class="status-dot"></span>
        <span class="status-text">Session Active (2/2)</span>
        <div style="margin-top: 10px; font-size: 0.9em; color: #9aa7b2;">
          ${client1Name} ↔ ${client2Name}
        </div>
      </div>
    `;
  }

  const consoleDiv = document.getElementById("serverConsole");
  if (consoleDiv && connectedCount === 2) {
    addConsoleMessage("serverConsole", `Both clients connected. Chat session active.`, "system");
  }
}

function handleSessionReset(code) {
  displaySessionCode(code);
  const consoleDiv = document.getElementById("serverConsole");
  if (consoleDiv) {
    addConsoleMessage("serverConsole", `Client disconnected. Session reset. New code: ${code}`, "system");
  }
}

// ====================== CLIENT FUNCTIONS ======================
function handleConnectionAccepted(data) {
  hasConnected = true;
  document.getElementById("connectionPanel").style.display = "none";
  document.getElementById("chatContainer").style.display = "block";

  if (data.waitingForOther) {
    addConsoleMessage("clientConsole", "Connected to server! Waiting for another client...", "system");
    updateClientStatus("Waiting for another client...", "waiting");
    
    // Disable message input while waiting
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.querySelector("#messageForm button");
    if (messageInput) messageInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
  } else {
    otherClientName = data.otherClientName;
    addConsoleMessage("clientConsole", `Connected to ${otherClientName}!`, "system");
    updateClientStatus(`Connected to ${otherClientName}`, "connected");
    
    // Enable message input
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.querySelector("#messageForm button");
    if (messageInput) messageInput.disabled = false;
    if (sendButton) sendButton.disabled = false;
  }
}

function handleConnectionRejected(reason) {
  showError(reason);
  if (ws) ws.close();
}

function handleOtherClientJoined(name) {
  otherClientName = name;
  addConsoleMessage("clientConsole", `Connected to ${name}!`, "system");
  updateClientStatus(`Connected to ${name}`, "connected");
  
  // Enable message input for first client when second joins
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.querySelector("#messageForm button");
  if (messageInput) messageInput.disabled = false;
  if (sendButton) sendButton.disabled = false;
}

function handleOtherClientDisconnected(message) {
  addConsoleMessage("clientConsole", message, "error");
  updateClientStatus("Session ended", "error");
  
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.querySelector("#messageForm button");
  if (messageInput) messageInput.disabled = true;
  if (sendButton) sendButton.disabled = true;

  setTimeout(() => {
    if (ws) ws.close();
    window.location.href = "/";
  }, 3000);
}

function handleServerDown(message) {
  addConsoleMessage("clientConsole", message, "error");
  updateClientStatus("Server unavailable", "error");
  
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.querySelector("#messageForm button");
  if (messageInput) messageInput.disabled = true;
  if (sendButton) sendButton.disabled = true;

  setTimeout(() => {
    window.location.href = "/";
  }, 3000);
}

function updateClientStatus(text, className) {
  const statusDiv = document.querySelector(".connection-status");
  if (statusDiv) {
    let buttonHtml = '';
    if (className === 'connected' || className === 'waiting') {
      buttonHtml = '<button onclick="disconnect()" class="disconnect-btn">Disconnect</button>';
    }
    
    statusDiv.innerHTML = `
      <div class="status-indicator ${className}">
        <span class="status-dot"></span>
        <span class="status-text">${text}</span>
      </div>
      ${buttonHtml}
    `;
  }
}

function handleClientMessage(e) {
  e.preventDefault();
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  const msgId = ++messageIdCounter;
  const message = `SCP/1.1 | MSG | id=${msgId} | ${text}`;

  addConsoleMessage("clientConsole", `You: ${text}`, "client");
  ws.send(JSON.stringify({ type: "SCP_MESSAGE", message }));
  input.value = "";
}

function disconnect() {
  if (ws) {
    ws.send(JSON.stringify({ type: "DISCONNECT" }));
    ws.close();
  }
  addConsoleMessage("clientConsole", "Disconnected from server", "system");
  setTimeout(() => (window.location.href = "/"), 1000);
}

// ====================== SHARED ======================
function handleSCPMessage(message, sender) {
  const consoleId = isServer ? "serverConsole" : "clientConsole";
  const displayText = sender ? `${sender}: ${message.split('|').pop().trim()}` : message;
  addConsoleMessage(consoleId, displayText, sender === myName ? "client" : "server");
}

function addConsoleMessage(consoleId, text, className) {
  const consoleDiv = document.getElementById(consoleId);
  if (!consoleDiv) return;
  const line = document.createElement("div");
  line.className = `console-line ${className}`;
  line.textContent = text;
  consoleDiv.appendChild(line);
  consoleDiv.scrollTop = consoleDiv.scrollHeight;
}

function showError(message) {
  const errorDiv = document.getElementById("connectionError");
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = "block";
    setTimeout(() => (errorDiv.style.display = "none"), 4000);
  }
}

function copySessionCode() {
  navigator.clipboard.writeText(currentSessionCode);
  const btn = document.getElementById("copyBtn");
  if (btn) {
    btn.textContent = "✓";
    setTimeout(() => (btn.textContent = "📋"), 2000);
  }
}
