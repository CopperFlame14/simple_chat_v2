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

// Session management
let activeSession = {
  code: generateSessionCode(),
  client: null,
  serverWs: null
};

function generateSessionCode() {
  return 'SCP-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'SERVER_INIT') {
        // Server page connected
        activeSession.serverWs = ws;
        ws.send(JSON.stringify({
          type: 'SESSION_CODE',
          code: activeSession.code
        }));
        console.log(`Server initialized with code: ${activeSession.code}`);
      }
      
      else if (data.type === 'CLIENT_CONNECT') {
        // Client attempting to connect with code
        if (data.code === activeSession.code) {
          if (activeSession.client) {
            // Already have a client
            ws.send(JSON.stringify({
              type: 'CONNECTION_REJECTED',
              reason: 'Session already has an active client'
            }));
          } else {
            // Accept client connection
            activeSession.client = ws;
            ws.send(JSON.stringify({
              type: 'CONNECTION_ACCEPTED'
            }));
            
            // Notify server
            if (activeSession.serverWs) {
              activeSession.serverWs.send(JSON.stringify({
                type: 'CLIENT_CONNECTED',
                clientName: data.clientName || 'Anonymous'
              }));
            }
            console.log(`Client connected with code: ${data.code}`);
          }
        } else {
          // Invalid code
          ws.send(JSON.stringify({
            type: 'CONNECTION_REJECTED',
            reason: 'Invalid session code'
          }));
        }
      }
      
      else if (data.type === 'SCP_MESSAGE') {
        // Forward SCP messages between client and server
        if (ws === activeSession.client && activeSession.serverWs) {
          activeSession.serverWs.send(JSON.stringify({
            type: 'SCP_MESSAGE',
            message: data.message,
            sender: 'client'
          }));
        } else if (ws === activeSession.serverWs && activeSession.client) {
          activeSession.client.send(JSON.stringify({
            type: 'SCP_MESSAGE',
            message: data.message,
            sender: 'server'
          }));
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
  if (ws === activeSession.client) {
    console.log('Client disconnected');
    activeSession.client = null;
    
    // Generate new session code
    activeSession.code = generateSessionCode();
    
    // Notify server of disconnect and new code
    if (activeSession.serverWs) {
      activeSession.serverWs.send(JSON.stringify({
        type: 'CLIENT_DISCONNECTED'
      }));
      activeSession.serverWs.send(JSON.stringify({
        type: 'SESSION_CODE',
        code: activeSession.code
      }));
    }
  } else if (ws === activeSession.serverWs) {
    console.log('Server disconnected');
    activeSession.serverWs = null;
    
    // Close client if connected
    if (activeSession.client) {
      activeSession.client.close();
      activeSession.client = null;
    }
  }
}

console.log(`Initial session code: ${activeSession.code}`);