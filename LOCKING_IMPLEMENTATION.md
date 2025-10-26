#  Week 3: Distributed Locking & Concurrency Control

##  *Overview*

Week 3 builds upon your Week 2 Redis Geo optimization by implementing *distributed locking* to prevent race conditions and ensure atomic operations in a distributed system. You'll learn how to handle concurrent requests safely and prevent double-bookings.

##  *Quick Start*

```bash
# 1. Setup Week 3 database schema
npm run setup-week3

# 2. Seed with sample data
npm run seed-week3

# 3. Start the Week 3 server
npm run start-week3

# 4. Test concurrent operations
npm run test-concurrent-week3
```

##  *What You'll Learn*

### *Core Concepts*
- *Distributed Locking*: Prevent race conditions across multiple processes
- *Atomic Operations*: Ensure data consistency in concurrent environments
- *Race Condition Prevention*: Handle simultaneous booking requests safely
- *Lock Timeout Management*: Prevent deadlocks and handle failures

### *Technical Skills*
- Redis-based distributed locking implementation
- Lua scripts for atomic operations
- Concurrent request handling
- Lock monitoring and debugging

## 🏗 *Architecture*

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Client Apps   │    │   Client Apps   │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     Week 3 API Server     │
                    │  (Distributed Locking)    │
                    └─────────────┬─────────────┘
                                 │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
┌─────────▼───────┐    ┌─────────▼───────┐    ┌─────────▼───────┐
│   PostgreSQL   │    │      Redis      │    │   Lock Service   │
│   (Bookings)   │    │   (Geo + Locks)  │    │  (Atomic Ops)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

##  *Key Components*

### *1. Lock Service (`src/lockService.js`)*
- Redis-based distributed locking
- Atomic lock acquisition/release
- Lock timeout and cleanup
- Lua scripts for atomic operations

### *2. Booking Service (`src/bookingService.js`)*
- Atomic booking operations
- Driver assignment with locking
- State management for rides
- Error handling and recovery

### *3. Week 3 Server (`src/server-week3.js`)*
- Extended API with booking endpoints
- Distributed locking integration
- Concurrent request handling
- Performance monitoring

## 📋 *API Endpoints*

### *Booking Management*
```bash
# Create booking request
POST /api/bookings
{
  "rider_id": 1,
  "pickup_lat": 40.7128,
  "pickup_lng": -74.0060,
  "dropoff_lat": 40.7589,
  "dropoff_lng": -73.9851,
  "estimated_fare": 15.50
}

# Assign driver (atomic operation)
POST /api/bookings/:id/assign

# Driver accepts booking (atomic operation)
POST /api/bookings/:id/accept
{
  "driver_id": 1
}

# Cancel booking (atomic operation)
POST /api/bookings/:id/cancel
{
  "reason": "Driver not available",
  "user_id": 1,
  "user_type": "rider"
}

# Complete ride (atomic operation)
POST /api/bookings/:id/complete
{
  "driver_id": 1,
  "actual_fare": 16.25
}
```

### *Monitoring*
```bash
# Get booking details
GET /api/bookings/:id

# Get user bookings
GET /api/users/:user_id/bookings?user_type=rider

# Get lock statistics
GET /api/locks/stats
```

##  *Testing*

### *Manual Testing*
```bash
# Test basic booking flow
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"rider_id": 1, "pickup_lat": 40.7128, "pickup_lng": -74.0060, "dropoff_lat": 40.7589, "dropoff_lng": -73.9851, "estimated_fare": 15.50}'

# Test driver assignment
curl -X POST http://localhost:3000/api/bookings/1/assign

# Test concurrent operations
npm run test-concurrent-week3
```

### *Concurrent Testing*
The concurrent testing script demonstrates:
- Multiple simultaneous booking requests
- Race condition prevention
- Lock acquisition and release
- Performance under load

##  *Distributed Locking Details*

### *Lock Implementation*
```javascript
// Acquire lock
const lockResult = await acquireLock('booking:123', 30); // 30 second TTL

// Execute atomic operation
if (lockResult.success) {
  // Perform critical section
  await performAtomicOperation();
  
  // Release lock
  await releaseLock('booking:123', lockResult.lockId);
}
```

### *Lua Script for Atomic Operations*
```lua
-- Atomic check-and-delete
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
```

### *Lock States*
- *Acquired*: Lock is held by a process
- *Expired*: Lock TTL has expired
- *Released*: Lock was explicitly released
- *Contested*: Multiple processes trying to acquire same lock

##  *Performance Metrics*

| Metric | Target | Description |
|--------|--------|-------------|
| Lock Acquisition Time | < 10ms | Time to acquire a lock |
| Booking Success Rate | > 99% | Successful booking operations |
| Concurrent Bookings | 100+ | Simultaneous booking requests |
| Lock Timeout Rate | < 1% | Percentage of locks that timeout |

## 🚨 *Error Handling*

### *Common Scenarios*
- *Lock Acquisition Failure*: Retry with exponential backoff
- *Lock Timeout*: Clean up and retry operation
- *Redis Failure*: Fall back to database-level locking
- *Process Crash*: Automatic lock cleanup via TTL

### *Recovery Strategies*
- Automatic retry mechanisms
- Lock cleanup on startup
- Graceful degradation
- Comprehensive logging

## 🔍 *Monitoring & Debugging*

### *Lock Statistics*
```bash
curl http://localhost:3000/api/locks/stats
```

### *Redis Monitoring*
```bash
# Monitor Redis operations
docker exec -it uber_redis redis-cli MONITOR

# Check active locks
docker exec -it uber_redis redis-cli KEYS "lock:*"

# Get lock details
docker exec -it uber_redis redis-cli GET "lock:booking:123"
```

##  *Learning Objectives Checklist*

### *Understanding*
- [ ] How distributed locking prevents race conditions
- [ ] Redis-based lock implementation patterns
- [ ] Atomic operations in distributed systems
- [ ] Lock timeout and cleanup strategies
- [ ] Optimistic vs pessimistic locking trade-offs

### *Implementation*
- [ ] Redis-based distributed locks
- [ ] Atomic booking operations
- [ ] Lock timeout and deadlock handling
- [ ] Concurrent operation testing
- [ ] Lock performance monitoring

##  *Next Steps*

After completing Week 3, you'll be ready for Week 4, which will cover:
- *Real-time Communication*: WebSockets for live updates
- *Event-Driven Architecture*: Pub/Sub patterns
- *Message Queues*: Reliable message delivery
- *System Monitoring*: Metrics and alerting

##  *Resources*

### *Documentation*
- [Redis Distributed Locks](https://redis.io/docs/manual/patterns/distributed-locks/)
- [Martin Kleppmann on Distributed Locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)
- [ACID Properties](https://en.wikipedia.org/wiki/ACID)
- [CAP Theorem](https://en.wikipedia.org/wiki/CAP_theorem)

### *Tools*
- Redis CLI for lock debugging
- Performance monitoring tools
- Concurrent testing scripts
- Lock statistics API

---

*Remember: The goal is to understand how to safely handle concurrent operations in distributed systems!* 
