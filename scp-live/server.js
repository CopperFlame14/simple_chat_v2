const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from 'public' directory
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/server', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'server.html'));
});

app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

const server = app.listen(PORT, () => {
  console.log(`🟢 SCP Live Server running on port ${PORT}`);
});

// WebSocket Server
const wss = new WebSocket.Server({ server });

console.log('🌐 WebSocket server initialized');

// Session management
let activeSession = {
  code: generateSessionCode(),
  client1: null,
  client2: null,
  client1Name: null,
  client2Name: null,
  serverWs: null
};

console.log(`🔑 Initial session code generated: ${activeSession.code}`);

function generateSessionCode() {
  return 'SCP-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function getConnectedCount() {
  let count = 0;
  if (activeSession.client1) count++;
  if (activeSession.client2) count++;
  return count;
}

function notifyServerOfStatus() {
  if (activeSession.serverWs) {
    activeSession.serverWs.send(JSON.stringify({
      type: 'STATUS_UPDATE',
      connectedCount: getConnectedCount(),
      client1Name: activeSession.client1Name,
      client2Name: activeSession.client2Name
    }));
  }
}

wss.on('connection', (ws, req) => {
  console.log('✅ New WebSocket connection established');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📩 Received message:', data.type);
      
      if (data.type === 'SERVER_INIT') {
        // Server page connected
        console.log('🖥️ Server page initialized');
        activeSession.serverWs = ws;
        
        // Send session code immediately
        const response = {
          type: 'SESSION_CODE',
          code: activeSession.code
        };
        console.log('📤 Sending session code:', response);
        ws.send(JSON.stringify(response));
        
        // Send initial status
        notifyServerOfStatus();
        console.log(`Session code: ${activeSession.code}`);
      }
      
      else if (data.type === 'CLIENT_CONNECT') {
        // Client attempting to connect with code
        const clientCode = data.code.trim().toUpperCase();
        const sessionCode = activeSession.code.trim().toUpperCase();
        
        console.log(`🔐 Client attempting connection:`);
        console.log(`   Client code: "${clientCode}"`);
        console.log(`   Session code: "${sessionCode}"`);
        console.log(`   Match: ${clientCode === sessionCode}`);
        
        if (clientCode === sessionCode) {
          if (!activeSession.client1) {
            // First client
            activeSession.client1 = ws;
            activeSession.client1Name = data.clientName || 'Client 1';
            ws.send(JSON.stringify({
              type: 'CONNECTION_ACCEPTED',
              waitingForOther: true
            }));
            notifyServerOfStatus();
            console.log(`✅ Client 1 (${activeSession.client1Name}) connected`);
          } else if (!activeSession.client2) {
            // Second client
            activeSession.client2 = ws;
            activeSession.client2Name = data.clientName || 'Client 2';
            ws.send(JSON.stringify({
              type: 'CONNECTION_ACCEPTED',
              waitingForOther: false,
              otherClientName: activeSession.client1Name
            }));
            
            // Notify first client that second client joined
            if (activeSession.client1) {
              activeSession.client1.send(JSON.stringify({
                type: 'OTHER_CLIENT_JOINED',
                otherClientName: activeSession.client2Name
              }));
            }
            
            notifyServerOfStatus();
            console.log(`✅ Client 2 (${activeSession.client2Name}) connected - Session full`);
          } else {
            // Session full
            console.log(`❌ Connection rejected - Session full`);
            ws.send(JSON.stringify({
              type: 'CONNECTION_REJECTED',
              reason: 'Session already has 2 active clients'
            }));
          }
        } else {
          // Invalid code
          console.log(`❌ Connection rejected - Invalid code`);
          ws.send(JSON.stringify({
            type: 'CONNECTION_REJECTED',
            reason: 'Invalid session code'
          }));
        }
      }
      
      else if (data.type === 'SCP_MESSAGE') {
        // Relay message between clients
        console.log(`💬 Relaying message from ${ws === activeSession.client1 ? activeSession.client1Name : activeSession.client2Name}`);
        
        if (ws === activeSession.client1 && activeSession.client2) {
          // Message from Client 1 to Client 2
          activeSession.client2.send(JSON.stringify({
            type: 'SCP_MESSAGE',
            message: data.message,
            sender: activeSession.client1Name
          }));
          console.log(`   → Sent to ${activeSession.client2Name}`);
        } else if (ws === activeSession.client2 && activeSession.client1) {
          // Message from Client 2 to Client 1
          activeSession.client1.send(JSON.stringify({
            type: 'SCP_MESSAGE',
            message: data.message,
            sender: activeSession.client2Name
          }));
          console.log(`   → Sent to ${activeSession.client1Name}`);
        }
      }
      
      else if (data.type === 'DISCONNECT') {
        handleDisconnect(ws);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function handleDisconnect(ws) {
  if (ws === activeSession.client1 || ws === activeSession.client2) {
    const disconnectedName = ws === activeSession.client1 ? activeSession.client1Name : activeSession.client2Name;
    const otherClient = ws === activeSession.client1 ? activeSession.client2 : activeSession.client1;
    
    console.log(`${disconnectedName} disconnected`);
    
    // Notify other client
    if (otherClient) {
      otherClient.send(JSON.stringify({
        type: 'OTHER_CLIENT_DISCONNECTED',
        message: '⚠️ The other client disconnected. Session ended.'
      }));
      otherClient.close();
    }
    
    // Reset session
    activeSession.client1 = null;
    activeSession.client2 = null;
    activeSession.client1Name = null;
    activeSession.client2Name = null;
    activeSession.code = generateSessionCode();
    
    // Notify server of new code and status
    if (activeSession.serverWs) {
      activeSession.serverWs.send(JSON.stringify({
        type: 'SESSION_RESET',
        code: activeSession.code
      }));
      notifyServerOfStatus();
    }
  } else if (ws === activeSession.serverWs) {
    console.log('Server page disconnected');
    activeSession.serverWs = null;
    
    // Close all clients
    if (activeSession.client1) {
      activeSession.client1.send(JSON.stringify({
        type: 'SERVER_DOWN',
        message: '⚠️ Connection lost. Server unavailable.'
      }));
      activeSession.client1.close();
    }
    if (activeSession.client2) {
      activeSession.client2.send(JSON.stringify({
        type: 'SERVER_DOWN',
        message: '⚠️ Connection lost. Server unavailable.'
      }));
      activeSession.client2.close();
    }
    
    activeSession.client1 = null;
    activeSession.client2 = null;
    activeSession.client1Name = null;
    activeSession.client2Name = null;
  }
}

console.log(`Initial session code: ${activeSession.code}`);
