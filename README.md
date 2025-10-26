# Real-Time Driver Matching System

A production-ready Uber-like system that matches riders with nearby drivers in real-time. This project demonstrates progressive implementation of system design concepts, starting from basic database operations and evolving into a sophisticated real-time platform.

## Features

- *Real-time driver location tracking* with sub-100ms proximity search
- *Geospatial indexing* using Redis GEO for optimal performance
- *Distributed locking* to prevent race conditions and double-bookings
- *WebSocket communication* for real-time updates and notifications
- *Event-driven architecture* with Redis Pub/Sub messaging
- *Comprehensive monitoring* and performance metrics

## Architecture Progression

This project demonstrates a progressive implementation approach, starting with basic functionality and evolving into a production-ready system. Each implementation builds upon the previous one, showing how to scale from simple database queries to complex real-time systems.

### 1. PostgreSQL Implementation (`server-postgresql.js`)
- Basic REST API with CRUD operations
- PostgreSQL database with naive proximity search
- Foundation for driver and rider management
- Performance baseline for optimization

### 2. Redis Optimization (`server-redis-locks.js`)
- Redis GEO indexing for fast proximity search
- Dual-write pattern (PostgreSQL + Redis)
- Distributed locking with Redis
- Atomic booking operations
- Race condition prevention

### 3. WebSocket Integration (`server-websockets.js`)
- Real-time bidirectional communication
- Event-driven architecture with Redis Pub/Sub
- Message queue system for reliability
- Comprehensive monitoring and metrics
- Production-ready real-time features

## Tech Stack

- *Backend*: Node.js + Express
- *Database*: PostgreSQL (persistent data)
- *Cache*: Redis (geospatial indexing + pub/sub)
- *Real-time*: WebSockets + Socket.IO
- *Messaging*: Redis Pub/Sub + Message Queues
- *Monitoring*: Custom metrics and health checks

## Performance Metrics

| Implementation | Avg Latency | P95 Latency | Throughput | Features |
|---------------|-------------|-------------|------------|----------|
| PostgreSQL Only | 450ms | 800ms | 20 req/s | Basic CRUD |
| + Redis Geo | 35ms | 50ms | 500+ req/s | Fast proximity search |
| + Distributed Locks | 40ms | 60ms | 500+ req/s | Race condition prevention |
| + WebSockets | 25ms | 45ms | 1000+ req/s | Real-time communication |

## Quick Start

### Prerequisites

Before getting started, make sure you have the following installed:
- Node.js 18 or higher
- Docker and Docker Compose
- PostgreSQL 13 or higher
- Redis 6 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/SaiDhiren-Musaloji/uber-matching-system.git
cd uber-matching-system

# Install dependencies
npm install

# Start the required services
docker-compose up -d

# Choose your implementation and run setup
npm run setup-postgresql    # Basic PostgreSQL setup
npm run setup-redis        # Redis optimization
npm run setup-locks        # Distributed locking
npm run setup-websockets   # Full WebSocket implementation
```

### Running Different Implementations

You can run different versions of the system depending on what you want to explore:

```bash
# Basic PostgreSQL implementation
npm start

# With Redis optimization and distributed locking
npm run start-locks

# Full WebSocket implementation with real-time features
npm run start-websockets

# Minimal implementation for testing
npm run start-minimal
```

## API Documentation

### Core Endpoints

```bash
# Health check
GET /api/health

# Driver management
GET /api/drivers
POST /api/drivers
GET /api/drivers/:id
POST /api/drivers/:id/location
PATCH /api/drivers/:id/status

# Proximity search (optimized with Redis)
GET /api/drivers/nearby?lat=40.7128&lng=-74.0060&radius=5

# Booking system (with distributed locking)
POST /api/bookings
POST /api/bookings/:id/assign
POST /api/bookings/:id/accept
POST /api/bookings/:id/cancel
GET /api/bookings/:id
```

### WebSocket Events (Full Implementation)

The WebSocket implementation provides real-time communication between clients and the server:

```javascript
// Connection
ws://localhost:3000/ws?user_type=rider&user_id=1&token=abc123

// Real-time events
{
  "type": "booking_assigned",
  "data": { "booking_id": 123, "driver": {...}, "eta": "5 minutes" }
}

{
  "type": "driver_location_update", 
  "data": { "driver_id": 456, "lat": 40.7128, "lng": -74.0060 }
}
```

## Testing

The project includes comprehensive testing scripts for each implementation:

```bash
# Test PostgreSQL implementation performance
npm run benchmark-postgresql

# Test distributed locking under concurrent load
npm run test-concurrent-locks

# Test WebSocket functionality and real-time features
npm run test-websockets

# Manual API testing
curl http://localhost:3000/api/health
curl "http://localhost:3000/api/drivers/nearby?lat=40.7128&lng=-74.0060&radius=5"
```

## Monitoring

### Health Checks
- `/api/health` - System health status
- `/api/metrics` - Performance metrics
- `/api/websocket/stats` - WebSocket statistics
- `/api/queue/stats` - Message queue status

### Key Metrics
- *Response times*: API and WebSocket latency
- *Throughput*: Requests per second
- *Error rates*: Failed operations percentage
- *Connection counts*: Active WebSocket connections
- *Lock statistics*: Distributed lock performance

## Configuration

The system uses environment variables for configuration. Create a `.env` file in the root directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=uber_matching
DB_USER=postgres
DB_PASSWORD=password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Server Configuration
PORT=3000
NODE_ENV=development
```

## Project Structure

```
src/
├── server-postgresql.js    # Basic PostgreSQL implementation
├── server-redis-locks.js   # Redis + distributed locking
├── server-websockets.js    # Full WebSocket implementation
├── server-minimal.js       # Minimal implementation
├── redisClient.js         # Redis connection and GEO operations
├── bookingService.js      # Booking logic and atomic operations
├── lockService.js         # Distributed locking implementation
├── websocketService.js    # WebSocket server and event handling
├── eventService.js        # Event-driven architecture
├── queueService.js        # Message queue processing
└── monitoringService.js   # Metrics and monitoring

scripts/
├── setup-postgresql.js    # Database setup
├── setup-redis.js        # Redis configuration
├── setup-locks.js        # Locking system setup
├── setup-websockets.js   # WebSocket setup
├── seed-*.js            # Test data generation
└── test-*.js            # Testing scripts

docs/
├── POSTGRESQL_IMPLEMENTATION.md
├── REDIS_OPTIMIZATION.md
├── DISTRIBUTED_LOCKING.md
└── WEBSOCKETS_IMPLEMENTATION.md
```

## Key Learning Concepts

This project covers several important system design concepts:

1. *Geospatial Indexing*: Understanding why Redis GEO is faster than SQL for location queries
2. *Distributed Locking*: Preventing race conditions in concurrent systems
3. *Event-Driven Architecture*: Building decoupled, scalable system design
4. *Real-Time Communication*: Implementing WebSocket patterns for instant updates
5. *Performance Optimization*: Measuring and improving system performance
6. *System Monitoring*: Implementing metrics, logging, and observability

## Production Considerations

When deploying this system to production, consider these important aspects:

- *Scalability*: Horizontal scaling with Redis clustering
- *Reliability*: Circuit breakers and fallback mechanisms
- *Security*: Authentication, rate limiting, input validation
- *Monitoring*: Comprehensive metrics and alerting
- *Testing*: Unit, integration, and load testing

## License

This project is open source and available under the [MIT License](LICENSE).

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Contact

**SaiDhiren Musaloji**
- GitHub: [@SaiDhiren-Musaloji](https://github.com/SaiDhiren-Musaloji)

---

*Built with dedication to demonstrate progressive system design implementation*