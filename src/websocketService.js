const { createClient } = require('redis');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * WebSocket Service (Week 4)
 * 
 * This module provides real-time bidirectional communication using WebSockets
 * with authentication, room management, and event broadcasting.
 */

let redisClient = null;
let wss = null;

// Initialize Redis client for WebSocket operations
const initializeRedis = async () => {
  try {
    if (!redisClient) {
      redisClient = createClient({
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error(' Redis WebSocket connection failed after 10 attempts');
              return false;
            }
            return retries * 100;
          }
        }
      });

      redisClient.on('error', (err) => {
        console.error(' Redis WebSocket Error:', err);
      });

      await redisClient.connect();
    }
    return redisClient;
  } catch (error) {
    console.error(' Failed to initialize Redis for WebSocket:', error);
    throw error;
  }
};

// WebSocket connection statistics
const connectionStats = {
  totalConnections: 0,
  activeConnections: 0,
  connectionsByType: {
    rider: 0,
    driver: 0,
    admin: 0
  },
  messagesSent: 0,
  messagesReceived: 0,
  errors: 0
};

// Room management
const rooms = new Map(); // roomName -> Set of socket IDs
const socketRooms = new Map(); // socketId -> Set of room names
const socketData = new Map(); // socketId -> { userType, userId, socket }

/**
 * Parse WebSocket connection query parameters
 * @param {string} url - WebSocket connection URL
 * @returns {Object} Parsed query parameters
 */
const parseQuery = (url) => {
  const urlObj = new URL(url, 'http://localhost');
  const params = {};
  
  for (const [key, value] of urlObj.searchParams) {
    params[key] = value;
  }
  
  return params;
};

/**
 * Authenticate WebSocket connection
 * @param {string} userType - Type of user (rider, driver, admin)
 * @param {string} userId - User ID
 * @param {string} token - Authentication token
 * @returns {Promise<boolean>} Authentication result
 */
const authenticateConnection = async (userType, userId, token) => {
  try {
    // For demo purposes, we'll use a simple token validation
    // In production, you'd validate against your auth system
    if (!token || token.length < 10) {
      return false;
    }
    
    // Verify user exists in database (simplified)
    if (!userId || !userType || !['rider', 'driver', 'admin'].includes(userType)) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(' Authentication error:', error);
    return false;
  }
};

/**
 * Join a WebSocket room
 * @param {WebSocket} socket - WebSocket connection
 * @param {string} roomName - Room name to join
 */
const joinRoom = (socket, roomName) => {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Set());
  }
  
  rooms.get(roomName).add(socket.id);
  
  if (!socketRooms.has(socket.id)) {
    socketRooms.set(socket.id, new Set());
  }
  
  socketRooms.get(socket.id).add(roomName);
  
  console.log(`🔗 Socket ${socket.id} joined room: ${roomName}`);
};

/**
 * Leave a WebSocket room
 * @param {WebSocket} socket - WebSocket connection
 * @param {string} roomName - Room name to leave
 */
const leaveRoom = (socket, roomName) => {
  if (rooms.has(roomName)) {
    rooms.get(roomName).delete(socket.id);
    
    if (rooms.get(roomName).size === 0) {
      rooms.delete(roomName);
    }
  }
  
  if (socketRooms.has(socket.id)) {
    socketRooms.get(socket.id).delete(roomName);
    
    if (socketRooms.get(socket.id).size === 0) {
      socketRooms.delete(socket.id);
    }
  }
  
  console.log(`🔗 Socket ${socket.id} left room: ${roomName}`);
};

/**
 * Broadcast message to a room
 * @param {string} roomName - Room name
 * @param {Object} message - Message to broadcast
 * @param {string} excludeSocketId - Socket ID to exclude from broadcast
 */
const broadcastToRoom = (roomName, message, excludeSocketId = null) => {
  if (!rooms.has(roomName)) {
    return;
  }
  
  const roomSockets = rooms.get(roomName);
  let sentCount = 0;
  
  roomSockets.forEach(socketId => {
    if (excludeSocketId && socketId === excludeSocketId) {
      return;
    }
    
    const socketData = getSocketData(socketId);
    if (socketData && socketData.socket.readyState === WebSocket.OPEN) {
      try {
        socketData.socket.send(JSON.stringify(message));
        sentCount++;
        connectionStats.messagesSent++;
      } catch (error) {
        console.error(` Error sending message to socket ${socketId}:`, error);
        connectionStats.errors++;
      }
    }
  });
  
  console.log(`📡 Broadcasted to room ${roomName}: ${sentCount} clients`);
};

/**
 * Send message to specific socket
 * @param {string} socketId - Socket ID
 * @param {Object} message - Message to send
 */
const sendToSocket = (socketId, message) => {
  const socketData = getSocketData(socketId);
  if (socketData && socketData.socket.readyState === WebSocket.OPEN) {
    try {
      socketData.socket.send(JSON.stringify(message));
      connectionStats.messagesSent++;
      return true;
    } catch (error) {
      console.error(` Error sending message to socket ${socketId}:`, error);
      connectionStats.errors++;
      return false;
    }
  }
  return false;
};

/**
 * Get socket data by ID
 * @param {string} socketId - Socket ID
 * @returns {Object|null} Socket data
 */
const getSocketData = (socketId) => {
  return socketData.get(socketId) || null;
};

/**
 * Store socket data
 * @param {string} socketId - Socket ID
 * @param {Object} data - Socket data
 */
const setSocketData = (socketId, data) => {
  socketData.set(socketId, data);
};

/**
 * Remove socket data
 * @param {string} socketId - Socket ID
 */
const removeSocketData = (socketId) => {
  socketData.delete(socketId);
};

/**
 * Handle WebSocket message
 * @param {WebSocket} socket - WebSocket connection
 * @param {string} message - Received message
 */
const handleMessage = async (socket, message) => {
  try {
    const data = JSON.parse(message);
    connectionStats.messagesReceived++;
    
    console.log(`📨 Received message from ${socket.id}:`, data.type);
    
    switch (data.type) {
      case 'subscribe':
        await handleSubscribe(socket, data.data);
        break;
        
      case 'unsubscribe':
        await handleUnsubscribe(socket, data.data);
        break;
        
      case 'location_update':
        await handleLocationUpdate(socket, data.data);
        break;
        
      case 'status_update':
        await handleStatusUpdate(socket, data.data);
        break;
        
      case 'ping':
        sendToSocket(socket.id, { type: 'pong', timestamp: Date.now() });
        break;
        
      default:
        console.log(` Unknown message type: ${data.type}`);
        sendToSocket(socket.id, { 
          type: 'error', 
          message: `Unknown message type: ${data.type}` 
        });
    }
  } catch (error) {
    console.error(' Error handling message:', error);
    connectionStats.errors++;
    sendToSocket(socket.id, { 
      type: 'error', 
      message: 'Invalid message format' 
    });
  }
};

/**
 * Handle subscription request
 * @param {WebSocket} socket - WebSocket connection
 * @param {Object} data - Subscription data
 */
const handleSubscribe = async (socket, data) => {
  const socketInfo = getSocketData(socket.id);
  if (!socketInfo) {
    return;
  }
  
  const { topics } = data;
  
  if (topics && Array.isArray(topics)) {
    topics.forEach(topic => {
      const roomName = `${socketInfo.userType}:${socketInfo.userId}:${topic}`;
      joinRoom(socket, roomName);
    });
    
    sendToSocket(socket.id, {
      type: 'subscribed',
      data: { topics }
    });
  }
};

/**
 * Handle unsubscription request
 * @param {WebSocket} socket - WebSocket connection
 * @param {Object} data - Unsubscription data
 */
const handleUnsubscribe = async (socket, data) => {
  const socketInfo = getSocketData(socket.id);
  if (!socketInfo) {
    return;
  }
  
  const { topics } = data;
  
  if (topics && Array.isArray(topics)) {
    topics.forEach(topic => {
      const roomName = `${socketInfo.userType}:${socketInfo.userId}:${topic}`;
      leaveRoom(socket, roomName);
    });
    
    sendToSocket(socket.id, {
      type: 'unsubscribed',
      data: { topics }
    });
  }
};

/**
 * Handle location update
 * @param {WebSocket} socket - WebSocket connection
 * @param {Object} data - Location data
 */
const handleLocationUpdate = async (socket, data) => {
  const socketInfo = getSocketData(socket.id);
  if (!socketInfo) {
    return;
  }
  
  // Store location in Redis for other services to use
  try {
    const client = redisClient || await initializeRedis();
    await client.hSet(`location:${socketInfo.userType}:${socketInfo.userId}`, {
      lat: data.lat,
      lng: data.lng,
      heading: data.heading || 0,
      timestamp: Date.now()
    });
    
    // Broadcast location update to relevant rooms
    const locationRoom = `${socketInfo.userType}:${socketInfo.userId}:location`;
    broadcastToRoom(locationRoom, {
      type: 'location_update',
      data: {
        user_type: socketInfo.userType,
        user_id: socketInfo.userId,
        lat: data.lat,
        lng: data.lng,
        heading: data.heading,
        timestamp: Date.now()
      }
    }, socket.id);
    
  } catch (error) {
    console.error(' Error handling location update:', error);
  }
};

/**
 * Handle status update
 * @param {WebSocket} socket - WebSocket connection
 * @param {Object} data - Status data
 */
const handleStatusUpdate = async (socket, data) => {
  const socketInfo = getSocketData(socket.id);
  if (!socketInfo) {
    return;
  }
  
  // Broadcast status update
  const statusRoom = `${socketInfo.userType}:${socketInfo.userId}:status`;
  broadcastToRoom(statusRoom, {
    type: 'status_update',
    data: {
      user_type: socketInfo.userType,
      user_id: socketInfo.userId,
      status: data.status,
      timestamp: Date.now()
    }
  }, socket.id);
};

/**
 * Initialize WebSocket server
 * @param {Object} server - HTTP server instance
 * @returns {WebSocketServer} WebSocket server
 */
const initializeWebSocketServer = (server) => {
  try {
    wss = new WebSocket.Server({ 
      server,
      path: '/ws',
      verifyClient: async (info) => {
        const { user_type, user_id, token } = parseQuery(info.req.url);
        return await authenticateConnection(user_type, user_id, token);
      }
    });
    
    wss.on('connection', async (socket, request) => {
      const { user_type, user_id, token } = parseQuery(request.url);
      
      // Generate unique socket ID
      socket.id = `socket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store socket data
      setSocketData(socket.id, {
        socket,
        userType: user_type,
        userId: user_id,
        connectedAt: Date.now(),
        lastPing: Date.now()
      });
      
      // Update connection statistics
      connectionStats.totalConnections++;
      connectionStats.activeConnections++;
      connectionStats.connectionsByType[user_type]++;
      
      console.log(` New WebSocket connection: ${socket.id} (${user_type}:${user_id})`);
      
      // Join default rooms
      joinRoom(socket, `${user_type}:${user_id}`);
      joinRoom(socket, `${user_type}:${user_id}:notifications`);
      
      // Send welcome message
      sendToSocket(socket.id, {
        type: 'connected',
        data: {
          socket_id: socket.id,
          user_type: user_type,
          user_id: user_id,
          timestamp: Date.now()
        }
      });
      
      // Handle messages
      socket.on('message', (message) => {
        handleMessage(socket, message.toString());
      });
      
      // Handle connection close
      socket.on('close', (code, reason) => {
        console.log(` WebSocket disconnected: ${socket.id} (${code}: ${reason})`);
        
        // Leave all rooms
        if (socketRooms.has(socket.id)) {
          socketRooms.get(socket.id).forEach(roomName => {
            leaveRoom(socket, roomName);
          });
        }
        
        // Update statistics
        connectionStats.activeConnections--;
        connectionStats.connectionsByType[user_type]--;
        
        // Remove socket data
        removeSocketData(socket.id);
      });
      
      // Handle errors
      socket.on('error', (error) => {
        console.error(` WebSocket error for ${socket.id}:`, error);
        connectionStats.errors++;
      });
      
      // Set up heartbeat
      const heartbeatInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          sendToSocket(socket.id, { type: 'ping', timestamp: Date.now() });
        } else {
          clearInterval(heartbeatInterval);
        }
      }, 30000); // 30 seconds
      
      socket.on('close', () => {
        clearInterval(heartbeatInterval);
      });
    });
    
    console.log(' WebSocket server initialized');
    return wss;
    
  } catch (error) {
    console.error(' Failed to initialize WebSocket server:', error);
    throw error;
  }
};

/**
 * Broadcast event to specific user type
 * @param {string} userType - User type (rider, driver, admin)
 * @param {string} userId - User ID
 * @param {Object} event - Event data
 */
const broadcastToUser = (userType, userId, event) => {
  const roomName = `${userType}:${userId}`;
  broadcastToRoom(roomName, event);
};

/**
 * Broadcast event to all users of a specific type
 * @param {string} userType - User type (rider, driver, admin)
 * @param {Object} event - Event data
 */
const broadcastToUserType = (userType, event) => {
  const pattern = `${userType}:*`;
  
  // Find all rooms matching the pattern
  for (const [roomName, sockets] of rooms) {
    if (roomName.startsWith(`${userType}:`)) {
      broadcastToRoom(roomName, event);
    }
  }
};

/**
 * Broadcast system-wide event
 * @param {Object} event - Event data
 */
const broadcastSystemEvent = (event) => {
  for (const [roomName, sockets] of rooms) {
    broadcastToRoom(roomName, event);
  }
};

/**
 * Get WebSocket connection statistics
 * @returns {Object} Connection statistics
 */
const getConnectionStats = () => {
  return {
    ...connectionStats,
    rooms: rooms.size,
    socketData: socketData.size
  };
};

/**
 * Get active connections by type
 * @returns {Object} Active connections breakdown
 */
const getActiveConnections = () => {
  const connections = [];
  
  for (const [socketId, data] of socketData) {
    connections.push({
      socket_id: socketId,
      user_type: data.userType,
      user_id: data.userId,
      connected_at: data.connectedAt,
      last_ping: data.lastPing
    });
  }
  
  return connections;
};

/**
 * Close WebSocket server
 */
const closeWebSocketServer = async () => {
  if (wss) {
    wss.close();
    console.log(' WebSocket server closed');
  }
  
  if (redisClient) {
    await redisClient.quit();
    console.log(' Redis WebSocket client closed');
  }
};

module.exports = {
  initializeRedis,
  initializeWebSocketServer,
  broadcastToRoom,
  broadcastToUser,
  broadcastToUserType,
  broadcastSystemEvent,
  sendToSocket,
  getConnectionStats,
  getActiveConnections,
  closeWebSocketServer
};
