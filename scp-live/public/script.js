let ws = null;
let isServer = false;
let isClient = false;
let currentSessionCode = '';
let messageIdCounter = 0;
let hasConnected = false;

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

  const messageForm = document.getElementById("messageForm");
  if (messageForm) {
    messageForm.addEventListener("submit", handleServerMessage);
  }
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
    case "CLIENT_CONNECTED":
      handleClientConnected(data.clientName);
      break;
    case "CLIENT_DISCONNECTED":
      handleClientDisconnected();
      break;
    case "CONNECTION_ACCEPTED":
      handleConnectionAccepted();
      break;
    case "CONNECTION_REJECTED":
      handleConnectionRejected(data.reason);
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

function handleClientConnected(clientName) {
  const statusDiv = document.getElementById("connectionStatus");
  statusDiv.innerHTML = `
    <div class="status-indicator connected">
      <span class="status-dot"></span>
      <span class="status-text">Connected to: ${clientName}</span>
    </div>
  `;
  addConsoleMessage("serverConsole", `Client "${clientName}" connected`, "system");

  const messageInput = document.getElementById("messageInput");
  const sendButton = document.querySelector("#messageForm button");
  const messageContainer = document.getElementById("messageContainer");

  if (messageContainer) messageContainer.style.display = "block";
  if (messageInput) messageInput.disabled = false;
  if (sendButton) sendButton.disabled = false;
}

function handleClientDisconnected() {
  const statusDiv = document.getElementById("connectionStatus");
  statusDiv.innerHTML = `
    <div class="status-indicator waiting">
      <span class="status-dot"></span>
      <span class="status-text">Waiting for client...</span>
    </div>
  `;
  addConsoleMessage("serverConsole", "Client disconnected", "system");
}

function handleServerMessage(e) {
  e.preventDefault();
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  const msgId = ++messageIdCounter;
  const message = `SCP/1.1 | MSG | id=${msgId} | ${text}`;

  addConsoleMessage("serverConsole", message, "server");
  ws.send(JSON.stringify({ type: "SCP_MESSAGE", message }));
  input.value = "";
}

// ====================== CLIENT FUNCTIONS ======================
function handleConnectionAccepted() {
  hasConnected = true;
  document.getElementById("connectionPanel").style.display = "none";
  document.getElementById("chatContainer").style.display = "block";
  addConsoleMessage("clientConsole", "Connected to server", "system");
}

function handleConnectionRejected(reason) {
  showError(reason);
  if (ws) ws.close();
}

function handleClientMessage(e) {
  e.preventDefault();
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text) return;

  const msgId = ++messageIdCounter;
  const message = `SCP/1.1 | MSG | id=${msgId} | ${text}`;

  addConsoleMessage("clientConsole", message, "client");
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
  addConsoleMessage(consoleId, message, sender);
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
