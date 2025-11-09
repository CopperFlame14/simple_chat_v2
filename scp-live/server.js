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
  console.log(`Initial session code: ${activeSession.code}`);
});

// WebSocket Server
const wss = new WebSocket.Server({ server });

// Session management - Server only manages, doesn't participate
let activeSession = {
  code: generateSessionCode(),
  clients: [], // Max 2 clients
  serverMonitor: null // Just for displaying status
};

function generateSessionCode() {
  return 'SCP-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function notifyServerMonitor() {
  if (activeSession.serverMonitor && activeSession.serverMonitor.readyState === WebSocket.OPEN) {
    activeSession.serverMonitor.send(JSON.stringify({
      type: 'CLIENT_COUNT',
      count: activeSession.clients.length,
      max: 2
    }));
  }
}

function endSession() {
  console.log('Session ended. Generating new code.');
  
  // Close all client connections
  activeSession.clients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'SESSION_ENDED',
        reason: 'The other client disconnected. Session ended.'
      }));
      client.ws.close();
    }
  });
  
  // Reset session
  activeSession.clients = [];
  activeSession.code = generateSessionCode();
  
  // Notify server monitor
  if (activeSession.serverMonitor) {
    activeSession.serverMonitor.send(JSON.stringify({
      type: 'SESSION_CODE',
      code: activeSession.code
    }));
    notifyServerMonitor();
  }
  
  console.log(`New session code: ${activeSession.code}`);
}

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'SERVER_MONITOR') {
        // Server page connected (just for monitoring)
        activeSession.serverMonitor = ws;
        ws.send(JSON.stringify({
          type: 'SESSION_CODE',
          code: activeSession.code
        }));
        notifyServerMonitor();
        console.log(`Server monitor connected. Code: ${activeSession.code}`);
      }
      
      else if (data.type === 'CLIENT_CONNECT') {
        // Client attempting to connect with code
        if (data.code !== activeSession.code) {
          ws.send(JSON.stringify({
            type: 'CONNECTION_REJECTED',
            reason: 'Invalid session code'
          }));
          console.log(`Connection rejected: Invalid code ${data.code}`);
          return;
        }
        
        if (activeSession.clients.length >= 2) {
          ws.send(JSON.stringify({
            type: 'CONNECTION_REJECTED',
            reason: 'Session is full (2 clients maximum)'
          }));
          console.log('Connection rejected: Session full');
          return;
        }
        
        // Accept client connection
        const clientInfo = {
          ws: ws,
          name: data.clientName || 'Anonymous',
          id: activeSession.clients.length + 1
        };
        activeSession.clients.push(clientInfo);
        
        ws.send(JSON.stringify({
          type: 'CONNECTION_ACCEPTED',
          clientId: clientInfo.id,
          waitingForOther: activeSession.clients.length === 1
        }));
        
        console.log(`Client ${clientInfo.id} (${clientInfo.name}) connected`);
        notifyServerMonitor();
        
        // If both clients are now connected, notify both
        if (activeSession.clients.length === 2) {
          activeSession.clients.forEach(client => {
            if (client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({
                type: 'CHAT_READY',
                message: 'Both clients connected! You can start chatting.'
              }));
            }
          });
          console.log('Both clients connected. Chat session ready.');
        }
      }
      
      else if (data.type === 'SCP_MESSAGE') {
        // Relay messages between the two clients (server doesn't participate)
        const senderIndex = activeSession.clients.findIndex(c => c.ws === ws);
        
        if (senderIndex === -1) {
          console.log('Message from unknown client');
          return;
        }
        
        // Find the other client
        const receiverIndex = senderIndex === 0 ? 1 : 0;
        const receiver = activeSession.clients[receiverIndex];
        
        if (receiver && receiver.ws.readyState === WebSocket.OPEN) {
          receiver.ws.send(JSON.stringify({
            type: 'SCP_MESSAGE',
            message: data.message
          }));
          console.log(`Message relayed from Client ${senderIndex + 1} to Client ${receiverIndex + 1}`);
        } else {
          console.log('Cannot relay message: Other client not available');
        }
      }
      
      else if (data.type === 'DISCONNECT') {
        handleClientDisconnect(ws);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    handleClientDisconnect(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    handleClientDisconnect(ws);
  });
});

function handleClientDisconnect(ws) {
  // Check if it's a client
  const clientIndex = activeSession.clients.findIndex(c => c.ws === ws);
  
  if (clientIndex !== -1) {
    console.log(`Client ${clientIndex + 1} disconnected`);
    
    // If session had 2 clients, end the entire session
    if (activeSession.clients.length === 2) {
      endSession();
    } else {
      // If only one client was connected, just remove it
      activeSession.clients.splice(clientIndex, 1);
      notifyServerMonitor();
    }
  } else if (ws === activeSession.serverMonitor) {
    console.log('Server monitor disconnected');
    activeSession.serverMonitor = null;
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server...');
  
  // Notify all clients
  activeSession.clients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'SERVER_SHUTDOWN',
        reason: 'Server is shutting down'
      }));
      client.ws.close();
    }
  });
  
  if (activeSession.serverMonitor && activeSession.serverMonitor.readyState === WebSocket.OPEN) {
    activeSession.serverMonitor.close();
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

console.log(`Initial session code: ${activeSession.code}`);
