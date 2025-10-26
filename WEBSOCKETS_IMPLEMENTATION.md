# WebSocket Implementation Guide

## Overview

This guide covers the complete WebSocket implementation with real-time communication, event-driven architecture, and comprehensive monitoring.

##  *Quick Start*

```bash
# 1. Setup WebSocket database schema
npm run setup-websockets

# 2. Seed with sample data
npm run seed-websockets

# 3. Start the WebSocket server
npm run start-websockets

# 4. Test real-time features
npm run test-websockets
```

##  *What You'll Learn*

### *Core Concepts*
- *WebSockets*: Real-time bidirectional communication
- *Event-Driven Architecture*: Decoupled, scalable system design
- *Redis Pub/Sub*: Event broadcasting and messaging
- *Message Queues*: Reliable message processing
- *System Monitoring*: Metrics, logging, and alerting

### *Technical Skills*
- WebSocket server implementation
- Event emission and subscription patterns
- Message queue design and processing
- Real-time data synchronization
- Performance monitoring and metrics

## 🏗 *Architecture*

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Rider App     │    │   Driver App    │    │   Admin Panel   │
│   (WebSocket)   │    │   (WebSocket)   │    │   (WebSocket)   │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     WebSocket API Server    │
                    │  (WebSocket + HTTP API)  │
                    └─────────────┬─────────────┘
                                 │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
┌─────────▼───────┐    ┌─────────▼───────┐    ┌─────────▼───────┐
│   PostgreSQL    │    │      Redis      │    │  Message Queue  │
│   (Bookings)    │    │ (Geo + Pub/Sub) │    │   (Reliability) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

##  *Key Components*

### *1. WebSocket Service (`src/websocketService.js`)*
- Real-time bidirectional communication
- Connection management and authentication
- Room-based messaging for targeted updates
- Heartbeat and connection monitoring

### *2. Event Service (`src/eventService.js`)*
- Redis Pub/Sub event broadcasting
- Event emission and subscription
- Event filtering and routing
- Event persistence and replay

### *3. Message Queue Service (`src/queueService.js`)*
- Reliable message processing
- Queue management and monitoring
- Error handling and retry logic
- Dead letter queue for failed messages

### *4. Monitoring Service (`src/monitoringService.js`)*
- Real-time metrics collection
- Performance monitoring
- System health checks
- Alerting and notifications

### *5. WebSocket Server (`src/server-websockets.js`)*
- Integrated WebSocket and HTTP API
- Event-driven booking operations
- Real-time notifications
- Comprehensive monitoring

## 📋 *API Endpoints*

### *HTTP API (inherited from previous implementations)*
```bash
# All previous implementation endpoints are available
GET /api/health
GET /api/drivers/nearby
POST /api/bookings
POST /api/bookings/:id/assign
# ... and more
```

### *WebSocket Events*
```javascript
// Connection
ws://localhost:3000/ws?user_type=rider&user_id=1&token=abc123

// Events emitted by server:
{
  "type": "booking_assigned",
  "data": {
    "booking_id": 123,
    "driver": {...},
    "eta": "5 minutes"
  }
}

{
  "type": "driver_location_update",
  "data": {
    "driver_id": 456,
    "lat": 40.7128,
    "lng": -74.0060,
    "heading": 45
  }
}

{
  "type": "ride_status_change",
  "data": {
    "booking_id": 123,
    "status": "accepted",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}

// Events sent by clients:
{
  "type": "subscribe",
  "data": {
    "topics": ["driver_updates", "booking_updates"]
  }
}

{
  "type": "location_update",
  "data": {
    "lat": 40.7128,
    "lng": -74.0060,
    "heading": 45
  }
}
```

##  *Testing*

### *Manual Testing*
```bash
# Test WebSocket connection
wscat -c ws://localhost:3000/ws?user_type=rider&user_id=1

# Test real-time booking flow
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"rider_id": 1, "pickup_lat": 40.7128, "pickup_lng": -74.0060, "dropoff_lat": 40.7589, "dropoff_lng": -73.9851, "estimated_fare": 15.50}'

# Monitor system metrics
curl http://localhost:3000/api/metrics
```

### *Real-time Testing*
The testing script demonstrates:
- WebSocket connection establishment
- Real-time event broadcasting
- Message queue processing
- System monitoring and metrics

##  *WebSocket Details*

### *Connection Management*
```javascript
// Client connection
const ws = new WebSocket('ws://localhost:3000/ws?user_type=rider&user_id=1&token=abc123');

// Server connection handling
ws.on('connection', (socket, request) => {
  const { user_type, user_id, token } = parseQuery(request.url);
  authenticateUser(user_id, token);
  joinRoom(socket, `${user_type}:${user_id}`);
});
```

### *Event Broadcasting*
```javascript
// Emit event to specific room
socket.to('driver:123').emit('booking_assigned', {
  booking_id: 456,
  rider: {...},
  pickup_location: {...}
});

// Emit event to all connected clients
io.emit('system_alert', {
  message: 'High demand in downtown area',
  severity: 'info'
});
```

### *Room Management*
- *Driver rooms*: `driver:${driver_id}` - for driver-specific updates
- *Rider rooms*: `rider:${rider_id}` - for rider-specific updates
- *Booking rooms*: `booking:${booking_id}` - for booking participants
- *System rooms*: `system` - for system-wide announcements

##  *Event-Driven Architecture*

### *Event Types*
```javascript
// Booking events
BOOKING_CREATED
BOOKING_ASSIGNED
BOOKING_ACCEPTED
BOOKING_CANCELLED
BOOKING_COMPLETED

// Driver events
DRIVER_LOCATION_UPDATE
DRIVER_STATUS_CHANGE
DRIVER_ONLINE
DRIVER_OFFLINE

// System events
HIGH_DEMAND_AREA
SYSTEM_MAINTENANCE
PERFORMANCE_ALERT
```

### *Event Flow*
```
1. User Action (HTTP API)
   ↓
2. Business Logic Processing
   ↓
3. Event Emission (Redis Pub/Sub)
   ↓
4. WebSocket Broadcasting
   ↓
5. Client Updates
```

##  *Message Queue System*

### *Queue Types*
- *booking_queue*: Booking processing tasks
- *notification_queue*: Push notifications
- *analytics_queue*: Data analysis tasks
- *cleanup_queue*: Maintenance tasks

### *Message Processing*
```javascript
// Producer
await queueService.enqueue('booking_queue', {
  type: 'process_booking',
  booking_id: 123,
  priority: 'high'
});

// Consumer
queueService.process('booking_queue', async (message) => {
  await processBooking(message.data);
});
```

##  *Monitoring & Metrics*

### *Key Metrics*
- *WebSocket connections*: Active connections count
- *Event throughput*: Events per second
- *Message queue depth*: Pending messages
- *Response times*: API and WebSocket latency
- *Error rates*: Failed operations percentage

### *Monitoring Endpoints*
```bash
# System metrics
GET /api/metrics

# WebSocket statistics
GET /api/websocket/stats

# Queue statistics
GET /api/queue/stats

# Event statistics
GET /api/events/stats
```

## 🚨 *Error Handling*

### *WebSocket Errors*
- Connection drops and reconnection
- Authentication failures
- Rate limiting and spam prevention
- Message validation and sanitization

### *Event System Errors*
- Event delivery failures
- Subscription management
- Event ordering and deduplication
- Dead letter queue handling

## 🔍 *Debugging & Monitoring*

### *WebSocket Debugging*
```bash
# Monitor WebSocket connections
curl http://localhost:3000/api/websocket/stats

# Check active connections
curl http://localhost:3000/api/websocket/connections
```

### *Event Monitoring*
```bash
# Monitor Redis Pub/Sub
docker exec -it uber_redis redis-cli MONITOR

# Check event subscriptions
docker exec -it uber_redis redis-cli PUBSUB CHANNELS
```

### *Queue Monitoring*
```bash
# Check queue status
curl http://localhost:3000/api/queue/stats

# Monitor queue processing
curl http://localhost:3000/api/queue/health
```

##  *Learning Objectives Checklist*

### *Understanding*
- [ ] How WebSockets enable real-time communication
- [ ] Event-driven architecture patterns and benefits
- [ ] Redis Pub/Sub for event broadcasting
- [ ] Message queue design for reliability
- [ ] System monitoring and observability

### *Implementation*
- [ ] WebSocket server with authentication
- [ ] Event emission and subscription system
- [ ] Message queue processing
- [ ] Real-time notification system
- [ ] Comprehensive monitoring dashboard

##  *Next Steps*

After completing Week 4, you'll have a production-ready real-time system with:
- *Instant communication* between all parties
- *Scalable event-driven architecture*
- *Reliable message processing*
- *Comprehensive monitoring*
- *Real-time system visibility*

##  *Resources*

### *Documentation*
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Socket.IO Documentation](https://socket.io/docs/)
- [Redis Pub/Sub](https://redis.io/docs/manual/pubsub/)
- [Event-Driven Architecture Patterns](https://martinfowler.com/articles/201701-event-driven.html)

### *Tools*
- WebSocket testing tools (wscat, Postman)
- Redis monitoring tools
- Performance monitoring dashboards
- Real-time testing scripts

---

*Remember: The goal is to build a real-time, event-driven system that can handle thousands of concurrent users!* 
