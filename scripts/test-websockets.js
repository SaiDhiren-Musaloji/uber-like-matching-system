const WebSocket = require('ws');
const axios = require('axios');
require('dotenv').config();

/**
 * Week 4 Real-time Testing Script
 * 
 * This script tests the real-time features of Week 4 including
 * WebSocket connections, event broadcasting, message queues, and monitoring.
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const WS_URL = process.env.WS_URL || 'ws://localhost:3000/ws';

// Test configuration
const TEST_CONFIG = {
  concurrentConnections: 10,
  testDuration: 30000, // 30 seconds
  messageInterval: 1000, // 1 second
  testUsers: [
    { user_type: 'rider', user_id: 1, token: 'test_token_rider_1' },
    { user_type: 'rider', user_id: 2, token: 'test_token_rider_2' },
    { user_type: 'driver', user_id: 1, token: 'test_token_driver_1' },
    { user_type: 'driver', user_id: 2, token: 'test_token_driver_2' }
  ]
};

// Test statistics
const testStats = {
  connections: {
    attempted: 0,
    successful: 0,
    failed: 0,
    closed: 0
  },
  messages: {
    sent: 0,
    received: 0,
    errors: 0
  },
  events: {
    booking_created: 0,
    booking_assigned: 0,
    booking_accepted: 0,
    booking_completed: 0,
    driver_location_update: 0,
    status_update: 0
  },
  performance: {
    avgConnectionTime: 0,
    avgMessageLatency: 0,
    totalLatency: 0,
    latencyCount: 0
  }
};

// Active connections
const activeConnections = new Map();

/**
 * Create WebSocket connection
 * @param {Object} user - User configuration
 * @returns {Promise<WebSocket>} WebSocket connection
 */
const createWebSocketConnection = (user) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    testStats.connections.attempted++;
    
    const wsUrl = `${WS_URL}?user_type=${user.user_type}&user_id=${user.user_id}&token=${user.token}`;
    const ws = new WebSocket(wsUrl);
    
    ws.on('open', () => {
      const connectionTime = Date.now() - startTime;
      testStats.connections.successful++;
      testStats.performance.totalLatency += connectionTime;
      testStats.performance.latencyCount++;
      testStats.performance.avgConnectionTime = 
        testStats.performance.totalLatency / testStats.performance.latencyCount;
      
      console.log(` Connected: ${user.user_type}:${user.user_id} (${connectionTime}ms)`);
      
      // Store connection
      activeConnections.set(`${user.user_type}:${user.user_id}`, {
        ws,
        user,
        connectedAt: Date.now(),
        messagesSent: 0,
        messagesReceived: 0
      });
      
      resolve(ws);
    });
    
    ws.on('error', (error) => {
      testStats.connections.failed++;
      console.error(` Connection failed: ${user.user_type}:${user.user_id}`, error.message);
      reject(error);
    });
    
    ws.on('close', () => {
      testStats.connections.closed++;
      console.log(` Disconnected: ${user.user_type}:${user.user_id}`);
    });
  });
};

/**
 * Send test message
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} user - User configuration
 * @param {string} messageType - Type of message to send
 */
const sendTestMessage = (ws, user, messageType) => {
  const message = {
    type: messageType,
    data: generateTestData(user, messageType),
    timestamp: Date.now()
  };
  
  try {
    ws.send(JSON.stringify(message));
    testStats.messages.sent++;
    
    const connection = activeConnections.get(`${user.user_type}:${user.user_id}`);
    if (connection) {
      connection.messagesSent++;
    }
    
    console.log(` Sent ${messageType}: ${user.user_type}:${user.user_id}`);
  } catch (error) {
    testStats.messages.errors++;
    console.error(` Error sending message:`, error);
  }
};

/**
 * Generate test data based on message type
 * @param {Object} user - User configuration
 * @param {string} messageType - Message type
 * @returns {Object} Test data
 */
const generateTestData = (user, messageType) => {
  const baseData = {
    user_type: user.user_type,
    user_id: user.user_id,
    timestamp: Date.now()
  };
  
  switch (messageType) {
    case 'location_update':
      return {
        ...baseData,
        lat: 40.7128 + (Math.random() - 0.5) * 0.01,
        lng: -74.0060 + (Math.random() - 0.5) * 0.01,
        heading: Math.floor(Math.random() * 360),
        speed: Math.floor(Math.random() * 60)
      };
      
    case 'status_update':
      return {
        ...baseData,
        status: user.user_type === 'driver' ? 
          ['online', 'busy', 'offline'][Math.floor(Math.random() * 3)] : 
          'active'
      };
      
    case 'subscribe':
      return {
        ...baseData,
        topics: ['booking_updates', 'location_updates', 'status_updates']
      };
      
    case 'unsubscribe':
      return {
        ...baseData,
        topics: ['location_updates']
      };
      
    default:
      return baseData;
  }
};

/**
 * Test WebSocket message handling
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} user - User configuration
 */
const setupMessageHandlers = (ws, user) => {
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      testStats.messages.received++;
      
      const connection = activeConnections.get(`${user.user_type}:${user.user_id}`);
      if (connection) {
        connection.messagesReceived++;
      }
      
      // Track event types
      if (message.type && testStats.events.hasOwnProperty(message.type)) {
        testStats.events[message.type]++;
      }
      
      console.log(` Received ${message.type}: ${user.user_type}:${user.user_id}`);
      
      // Handle specific message types
      switch (message.type) {
        case 'pong':
          const latency = Date.now() - message.timestamp;
          testStats.performance.totalLatency += latency;
          testStats.performance.latencyCount++;
          testStats.performance.avgMessageLatency = 
            testStats.performance.totalLatency / testStats.performance.latencyCount;
          break;
          
        case 'booking_assigned':
          console.log(` Booking assigned to ${user.user_type}:${user.user_id}:`, message.data);
          break;
          
        case 'location_update':
          console.log(` Location update for ${user.user_type}:${user.user_id}:`, message.data);
          break;
      }
    } catch (error) {
      testStats.messages.errors++;
      console.error(` Error parsing message:`, error);
    }
  });
};

/**
 * Test HTTP API endpoints
 */
const testHttpEndpoints = async () => {
  console.log('\n🌐 Testing HTTP API endpoints...');
  
  try {
    // Test health endpoint
    const healthResponse = await axios.get(`${BASE_URL}/api/health`);
    console.log(' Health check:', healthResponse.data.message);
    
    // Test metrics endpoint
    const metricsResponse = await axios.get(`${BASE_URL}/api/metrics`);
    console.log(' Metrics endpoint:', Object.keys(metricsResponse.data.data).length, 'metric categories');
    
    // Test WebSocket stats
    const wsStatsResponse = await axios.get(`${BASE_URL}/api/websocket/stats`);
    console.log(' WebSocket stats:', wsStatsResponse.data.data.activeConnections, 'active connections');
    
    // Test event stats
    const eventStatsResponse = await axios.get(`${BASE_URL}/api/events/stats`);
    console.log(' Event stats:', eventStatsResponse.data.data.eventsPublished, 'events published');
    
    // Test queue stats
    const queueStatsResponse = await axios.get(`${BASE_URL}/api/queue/stats`);
    console.log(' Queue stats:', queueStatsResponse.data.data.messagesEnqueued, 'messages enqueued');
    
    // Test nearby drivers
    const nearbyResponse = await axios.get(`${BASE_URL}/api/drivers/nearby?lat=40.7128&lng=-74.0060&radius=5`);
    console.log(' Nearby drivers:', nearbyResponse.data.data.length, 'drivers found');
    
  } catch (error) {
    console.error(' HTTP API test failed:', error.message);
  }
};

/**
 * Test booking flow with real-time updates
 */
const testBookingFlow = async () => {
  console.log('\n Testing booking flow with real-time updates...');
  
  try {
    // Create a booking
    const bookingData = {
      rider_id: 1,
      pickup_lat: 40.7128,
      pickup_lng: -74.0060,
      dropoff_lat: 40.7589,
      dropoff_lng: -73.9851,
      estimated_fare: 15.50
    };
    
    const bookingResponse = await axios.post(`${BASE_URL}/api/bookings`, bookingData);
    const booking = bookingResponse.data.data;
    console.log(' Booking created:', booking.id);
    
    // Wait a moment for events to propagate
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Assign driver
    const assignResponse = await axios.post(`${BASE_URL}/api/bookings/${booking.id}/assign`);
    console.log(' Driver assigned:', assignResponse.data.data.driver.name);
    
    // Wait for real-time updates
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Accept booking
    const acceptResponse = await axios.post(`${BASE_URL}/api/bookings/${booking.id}/accept`, {
      driver_id: assignResponse.data.data.driver.id
    });
    console.log(' Booking accepted');
    
    // Wait for real-time updates
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Complete ride
    const completeResponse = await axios.post(`${BASE_URL}/api/bookings/${booking.id}/complete`, {
      driver_id: assignResponse.data.data.driver.id,
      actual_fare: 16.25
    });
    console.log(' Ride completed');
    
  } catch (error) {
    console.error(' Booking flow test failed:', error.message);
  }
};

/**
 * Run concurrent WebSocket test
 */
const runConcurrentTest = async () => {
  console.log('\n Running concurrent WebSocket test...');
  
  const connections = [];
  
  // Create multiple connections
  for (let i = 0; i < TEST_CONFIG.concurrentConnections; i++) {
    const user = TEST_CONFIG.testUsers[i % TEST_CONFIG.testUsers.length];
    try {
      const ws = await createWebSocketConnection(user);
      setupMessageHandlers(ws, user);
      connections.push({ ws, user });
    } catch (error) {
      console.error(` Failed to create connection ${i + 1}:`, error.message);
    }
  }
  
  console.log(` Created ${connections.length} concurrent connections`);
  
  // Send messages periodically
  const messageInterval = setInterval(() => {
    connections.forEach(({ ws, user }) => {
      if (ws.readyState === WebSocket.OPEN) {
        const messageTypes = ['location_update', 'status_update', 'ping'];
        const messageType = messageTypes[Math.floor(Math.random() * messageTypes.length)];
        sendTestMessage(ws, user, messageType);
      }
    });
  }, TEST_CONFIG.messageInterval);
  
  // Run test for specified duration
  await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.testDuration));
  
  // Cleanup
  clearInterval(messageInterval);
  connections.forEach(({ ws }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });
  
  console.log(' Concurrent test completed');
};

/**
 * Print test results
 */
const printTestResults = () => {
  console.log('\n Test Results:');
  console.log('================');
  
  console.log('\n Connection Statistics:');
  console.log(`  Attempted: ${testStats.connections.attempted}`);
  console.log(`  Successful: ${testStats.connections.successful}`);
  console.log(`  Failed: ${testStats.connections.failed}`);
  console.log(`  Closed: ${testStats.connections.closed}`);
  console.log(`  Success Rate: ${((testStats.connections.successful / testStats.connections.attempted) * 100).toFixed(1)}%`);
  
  console.log('\n Message Statistics:');
  console.log(`  Sent: ${testStats.messages.sent}`);
  console.log(`  Received: ${testStats.messages.received}`);
  console.log(`  Errors: ${testStats.messages.errors}`);
  console.log(`  Delivery Rate: ${((testStats.messages.received / testStats.messages.sent) * 100).toFixed(1)}%`);
  
  console.log('\n Performance Statistics:');
  console.log(`  Avg Connection Time: ${testStats.performance.avgConnectionTime.toFixed(1)}ms`);
  console.log(`  Avg Message Latency: ${testStats.performance.avgMessageLatency.toFixed(1)}ms`);
  
  console.log('\n Event Statistics:');
  Object.entries(testStats.events).forEach(([event, count]) => {
    if (count > 0) {
      console.log(`  ${event}: ${count}`);
    }
  });
  
  console.log('\n Test Summary:');
  const successRate = (testStats.connections.successful / testStats.connections.attempted) * 100;
  const deliveryRate = testStats.messages.sent > 0 ? (testStats.messages.received / testStats.messages.sent) * 100 : 0;
  
  if (successRate >= 90 && deliveryRate >= 95) {
    console.log(' Excellent! All tests passed with high success rates.');
  } else if (successRate >= 80 && deliveryRate >= 85) {
    console.log('  Good! Tests passed with acceptable success rates.');
  } else {
    console.log(' Issues detected! Check system configuration and try again.');
  }
};

/**
 * Main test function
 */
const runTests = async () => {
  console.log(' Starting Week 4 Real-time Testing...');
  console.log(` Testing server: ${BASE_URL}`);
  console.log(` WebSocket URL: ${WS_URL}`);
  console.log('');
  
  try {
    // Test HTTP endpoints
    await testHttpEndpoints();
    
    // Test booking flow
    await testBookingFlow();
    
    // Run concurrent WebSocket test
    await runConcurrentTest();
    
    // Print results
    printTestResults();
    
  } catch (error) {
    console.error(' Test suite failed:', error);
  }
};

// Run tests if called directly
if (require.main === module) {
  runTests()
    .then(() => {
      console.log('\n Week 4 real-time testing completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n Week 4 real-time testing failed:', error);
      process.exit(1);
    });
}

module.exports = {
  runTests,
  testStats,
  createWebSocketConnection,
  sendTestMessage,
  testHttpEndpoints,
  testBookingFlow
};
