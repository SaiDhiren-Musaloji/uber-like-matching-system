const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

// Import all services
const {
  initializeRedis,
  isRedisConnected,
  addDriverLocation,
  findNearbyDrivers,
  removeDriverLocation,
  getDriverLocation,
  closeRedis
} = require('./redisClient');

const {
  createBooking,
  assignDriver,
  acceptBooking,
  cancelBooking,
  completeRide,
  getBooking,
  getUserBookings,
  getLockStatistics
} = require('./bookingService');

const { initializeRedis: initLockRedis } = require('./lockService');

// New services
const {
  initializeRedis: initWebSocketRedis,
  initializeWebSocketServer,
  broadcastToRoom,
  broadcastToUser,
  broadcastToUserType,
  broadcastSystemEvent,
  getConnectionStats,
  getActiveConnections,
  closeWebSocketServer
} = require('./websocketService');

const {
  initializeRedis: initEventRedis,
  publishEvent,
  subscribeToEvent,
  publishBookingEvent,
  publishDriverEvent,
  publishSystemEvent: publishSystemEventToRedis,
  getEventStats,
  closeEventService
} = require('./eventService');

const {
  initializeRedis: initQueueRedis,
  enqueue,
  process,
  getQueueStats,
  getQueueHealth,
  closeQueueService
} = require('./queueService');

const {
  initializeMonitoring,
  recordRequest,
  recordDatabaseQuery,
  recordRedisOperation,
  updateWebSocketMetrics,
  updateEventMetrics,
  updateQueueMetrics,
  setRedisConnectionStatus,
  performHealthCheck,
  getSystemMetrics,
  getHealthChecks,
  closeMonitoring
} = require('./monitoringService');

/**
 * Week 4: Real-time Communication & Event-Driven Architecture
 * 
 * Learning Objectives:
 * 1. Implement WebSocket server for real-time communication
 * 2. Create event-driven architecture with Redis Pub/Sub
 * 3. Build message queue system for reliable processing
 * 4. Add comprehensive system monitoring
 * 5. Integrate all services for production-ready system
 */

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'uber_matching',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

// Middleware
app.use(cors());
app.use(express.json());

// Week 4: Request monitoring middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    recordRequest(req, res, responseTime);
  });
  
  next();
});

// Basic validation middleware (inherited from Week 3)
const validateDriver = (req, res, next) => {
  const { name, phone } = req.body;
  
  if (!name || name.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Name must be at least 2 characters long'
    });
  }
  
  if (!phone || !/^\+?[\d\s\-\(\)]+$/.test(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Phone number format is invalid'
    });
  }
  
  next();
};

const validateLocation = (req, res, next) => {
  const { lat, lng } = req.body;
  
  if (lat < -90 || lat > 90) {
    return res.status(400).json({
      success: false,
      message: 'Latitude must be between -90 and 90'
    });
  }
  
  if (lng < -180 || lng > 180) {
    return res.status(400).json({
      success: false,
      message: 'Longitude must be between -180 and 180'
    });
  }
  
  next();
};

const validateBooking = (req, res, next) => {
  const { rider_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, estimated_fare } = req.body;
  
  if (!rider_id || !pickup_lat || !pickup_lng || !dropoff_lat || !dropoff_lng || !estimated_fare) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: rider_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, estimated_fare'
    });
  }
  
  if (pickup_lat < -90 || pickup_lat > 90 || dropoff_lat < -90 || dropoff_lat > 90) {
    return res.status(400).json({
      success: false,
      message: 'Latitude must be between -90 and 90'
    });
  }
  
  if (pickup_lng < -180 || pickup_lng > 180 || dropoff_lng < -180 || dropoff_lng > 180) {
    return res.status(400).json({
      success: false,
      message: 'Longitude must be between -180 and 180'
    });
  }
  
  if (estimated_fare <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Estimated fare must be greater than 0'
    });
  }
  
  next();
};

// Routes

// Enhanced health check with Week 4 features
app.get('/api/health', async (req, res) => {
  try {
    const redisStatus = isRedisConnected() ? 'connected' : 'disconnected';
    const healthChecks = await performHealthCheck({
      redisClient: isRedisConnected() ? require('./redisClient') : null,
      websocketService: require('./websocketService'),
      eventService: require('./eventService'),
      queueService: require('./queueService')
    });
    
    res.json({
      success: true,
      message: 'Week 4 API with Real-time Communication & Event-Driven Architecture',
      timestamp: new Date().toISOString(),
      version: '4.0.0',
      services: {
        postgres: 'connected',
        redis: redisStatus,
        websocket: 'active',
        events: 'active',
        queues: 'active',
        monitoring: 'active'
      },
      health: healthChecks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Week 4: System monitoring endpoints
app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = getSystemMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get metrics',
      error: error.message
    });
  }
});

app.get('/api/health/detailed', async (req, res) => {
  try {
    const healthChecks = await performHealthCheck({
      redisClient: isRedisConnected() ? require('./redisClient') : null,
      websocketService: require('./websocketService'),
      eventService: require('./eventService'),
      queueService: require('./queueService')
    });
    
    res.json({
      success: true,
      data: healthChecks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get detailed health check',
      error: error.message
    });
  }
});

// Week 4: WebSocket statistics
app.get('/api/websocket/stats', async (req, res) => {
  try {
    const stats = getConnectionStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get WebSocket statistics',
      error: error.message
    });
  }
});

app.get('/api/websocket/connections', async (req, res) => {
  try {
    const connections = getActiveConnections();
    res.json({
      success: true,
      data: connections
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get active connections',
      error: error.message
    });
  }
});

// Week 4: Event system statistics
app.get('/api/events/stats', async (req, res) => {
  try {
    const stats = getEventStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get event statistics',
      error: error.message
    });
  }
});

// Week 4: Queue system statistics
app.get('/api/queue/stats', async (req, res) => {
  try {
    const stats = getQueueStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get queue statistics',
      error: error.message
    });
  }
});

app.get('/api/queue/health', async (req, res) => {
  try {
    const { queueName } = req.query;
    
    if (queueName) {
      const health = await getQueueHealth(queueName);
      res.json({
        success: true,
        data: health
      });
    } else {
      // Get health for all queues
      const queueNames = ['booking_queue', 'notification_queue', 'analytics_queue', 'cleanup_queue'];
      const healthChecks = await Promise.all(
        queueNames.map(name => getQueueHealth(name))
      );
      
      res.json({
        success: true,
        data: healthChecks
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get queue health',
      error: error.message
    });
  }
});

// Week 2 Routes (inherited with monitoring)

// Get all drivers
app.get('/api/drivers', async (req, res) => {
  const startTime = Date.now();
  try {
    const result = await pool.query('SELECT * FROM drivers ORDER BY created_at DESC');
    recordDatabaseQuery(Date.now() - startTime);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error getting drivers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get drivers',
      error: error.message
    });
  }
});

// Find nearby drivers (Week 2: Optimized with Redis Geo)
app.get('/api/drivers/nearby', async (req, res) => {
  const startTime = Date.now();
  try {
    const { lat, lng, radius = 5 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }
    
    const queryStartTime = Date.now();
    
    // Try Redis first (fast path)
    if (isRedisConnected()) {
      try {
        const nearbyDrivers = await findNearbyDrivers(lat, lng, parseFloat(radius));
        recordRedisOperation(Date.now() - queryStartTime);
        
        // Fetch full driver details from PostgreSQL for the nearby drivers
        if (nearbyDrivers.length > 0) {
          const driverIds = nearbyDrivers.map(d => d.id);
          const placeholders = driverIds.map((_, i) => `$${i + 1}`).join(',');
          
          const driverResult = await pool.query(
            `SELECT id, name, phone, lat, lng, status, vehicle_type, rating 
             FROM drivers 
             WHERE id IN (${placeholders}) AND status = 'online'`,
            driverIds
          );
          recordDatabaseQuery(Date.now() - queryStartTime);
          
          // Merge Redis results with driver details
          const driversWithDistance = driverResult.rows.map(driver => {
            const redisData = nearbyDrivers.find(r => r.id === driver.id);
            return {
              ...driver,
              distance: redisData ? redisData.distance : null
            };
          });
          
          const endTime = Date.now();
          const queryTime = endTime - startTime;
          
          return res.json({
            success: true,
            data: driversWithDistance,
            performance: {
              queryTime: queryTime + 'ms',
              driversFound: driversWithDistance.length,
              method: 'Redis Geo (Optimized)',
              note: 'Using Redis GEO for fast proximity search!'
            },
            searchParams: {
              lat: parseFloat(lat),
              lng: parseFloat(lng),
              radius: parseFloat(radius)
            }
          });
        } else {
          const endTime = Date.now();
          const queryTime = endTime - startTime;
          
          return res.json({
            success: true,
            data: [],
            performance: {
              queryTime: queryTime + 'ms',
              driversFound: 0,
              method: 'Redis Geo (Optimized)'
            },
            searchParams: {
              lat: parseFloat(lat),
              lng: parseFloat(lng),
              radius: parseFloat(radius)
            }
          });
        }
      } catch (redisError) {
        recordRedisOperation(Date.now() - queryStartTime, true);
        console.error('Redis error, falling back to SQL:', redisError);
        // Fall through to SQL fallback
      }
    }
    
    // Fallback to SQL if Redis is not available (slow path)
    const result = await pool.query(`
      SELECT id, name, phone, lat, lng, status, vehicle_type, rating,
             (6371 * acos(cos(radians($1)) * cos(radians(lat)) * 
              cos(radians(lng) - radians($2)) + sin(radians($1)) * 
              sin(radians(lat)))) AS distance
      FROM drivers
      WHERE status = 'online' 
        AND lat IS NOT NULL 
        AND lng IS NOT NULL
        AND (6371 * acos(cos(radians($1)) * cos(radians(lat)) * 
             cos(radians(lng) - radians($2)) + sin(radians($1)) * 
             sin(radians(lat)))) <= $3
      ORDER BY distance
      LIMIT 10
    `, [lat, lng, radius]);
    
    recordDatabaseQuery(Date.now() - queryStartTime);
    const endTime = Date.now();
    const queryTime = endTime - startTime;
    
    res.json({
      success: true,
      data: result.rows,
      performance: {
        queryTime: queryTime + 'ms',
        driversFound: result.rows.length,
        method: 'SQL (Fallback)',
        note: 'Redis not available, using SQL fallback'
      },
      searchParams: {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        radius: parseFloat(radius)
      }
    });
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error finding nearby drivers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find nearby drivers',
      error: error.message
    });
  }
});

// Get driver by ID
app.get('/api/drivers/:id', async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM drivers WHERE id = $1', [id]);
    recordDatabaseQuery(Date.now() - startTime);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error getting driver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get driver',
      error: error.message
    });
  }
});

// Create new driver
app.post('/api/drivers', validateDriver, async (req, res) => {
  const startTime = Date.now();
  try {
    const { name, phone, email, vehicle_type } = req.body;
    
    const result = await pool.query(
      'INSERT INTO drivers (name, phone, email, vehicle_type) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, phone, email, vehicle_type]
    );
    recordDatabaseQuery(Date.now() - startTime);
    
    // Week 4: Publish driver creation event
    await publishDriverEvent('created', result.rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error creating driver:', error);
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        message: 'Driver with this phone number already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create driver',
      error: error.message
    });
  }
});

// Update driver location (Week 2: Dual-write to PostgreSQL and Redis)
app.post('/api/drivers/:id/location', validateLocation, async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const { lat, lng } = req.body;
    
    // Update PostgreSQL
    const result = await pool.query(
      'UPDATE drivers SET lat = $1, lng = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [lat, lng, id]
    );
    recordDatabaseQuery(Date.now() - startTime);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    const driver = result.rows[0];
    
    // If driver is online, update Redis
    if (driver.status === 'online' && isRedisConnected()) {
      try {
        await addDriverLocation(id, lat, lng);
        recordRedisOperation(Date.now() - startTime);
      } catch (redisError) {
        recordRedisOperation(Date.now() - startTime, true);
        console.error('Failed to update Redis:', redisError);
        // Don't fail the request, Redis is not critical
      }
    }
    
    // Week 4: Publish location update event
    await publishDriverEvent('location_updated', {
      ...driver,
      lat,
      lng
    });
    
    // Week 4: Broadcast location update via WebSocket
    broadcastToUser('driver', id, {
      type: 'location_update',
      data: {
        driver_id: parseInt(id),
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        timestamp: Date.now()
      }
    });
    
    res.json({
      success: true,
      message: 'Driver location updated successfully',
      data: driver
    });
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error updating location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    });
  }
});

// Update driver status
app.patch('/api/drivers/:id/status', async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['online', 'offline', 'busy'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }
    
    const result = await pool.query(
      'UPDATE drivers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );
    recordDatabaseQuery(Date.now() - startTime);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    // Week 4: Publish status change event
    await publishDriverEvent('status_changed', result.rows[0]);
    
    // Week 4: Broadcast status update via WebSocket
    broadcastToUser('driver', id, {
      type: 'status_update',
      data: {
        driver_id: parseInt(id),
        status: status,
        timestamp: Date.now()
      }
    });
    
    res.json({
      success: true,
      message: 'Driver status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error updating status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    });
  }
});

// Week 3 Routes: Booking System with Distributed Locking (Enhanced for Week 4)

// Create a new booking request
app.post('/api/bookings', validateBooking, async (req, res) => {
  const startTime = Date.now();
  try {
    const result = await createBooking(req.body);
    recordDatabaseQuery(Date.now() - startTime);
    
    if (result.success) {
      // Week 4: Publish booking creation event
      await publishBookingEvent('created', result.data);
      
      // Week 4: Broadcast to rider
      broadcastToUser('rider', req.body.rider_id, {
        type: 'booking_created',
        data: {
          booking_id: result.data.id,
          status: result.data.status,
          estimated_fare: result.data.estimated_fare,
          timestamp: Date.now()
        }
      });
      
      // Week 4: Enqueue booking processing task
      await enqueue('booking_queue', {
        type: 'process_new_booking',
        booking_id: result.data.id,
        rider_id: req.body.rider_id
      });
      
      res.status(201).json({
        success: true,
        message: 'Booking request created successfully',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to create booking',
        error: result.error
      });
    }
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error creating booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking',
      error: error.message
    });
  }
});

// Assign a driver to a booking (atomic operation with locking)
app.post('/api/bookings/:id/assign', async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const result = await assignDriver(parseInt(id));
    recordDatabaseQuery(Date.now() - startTime);
    
    if (result.success) {
      // Week 4: Publish booking assignment event
      await publishBookingEvent('assigned', result.booking);
      
      // Week 4: Broadcast to both rider and driver
      broadcastToUser('rider', result.booking.rider_id, {
        type: 'booking_assigned',
        data: {
          booking_id: parseInt(id),
          driver: result.driver,
          eta: '5 minutes', // This would be calculated
          timestamp: Date.now()
        }
      });
      
      broadcastToUser('driver', result.driver.id, {
        type: 'booking_assigned',
        data: {
          booking_id: parseInt(id),
          rider_id: result.booking.rider_id,
          pickup_location: {
            lat: result.booking.pickup_lat,
            lng: result.booking.pickup_lng
          },
          estimated_fare: result.booking.estimated_fare,
          timestamp: Date.now()
        }
      });
      
      res.json({
        success: true,
        message: result.message,
        data: {
          booking: result.booking,
          driver: result.driver
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to assign driver',
        error: result.error
      });
    }
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error assigning driver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign driver',
      error: error.message
    });
  }
});

// Driver accepts a booking (atomic operation)
app.post('/api/bookings/:id/accept', async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const { driver_id } = req.body;
    
    if (!driver_id) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required'
      });
    }
    
    const result = await acceptBooking(parseInt(id), parseInt(driver_id));
    recordDatabaseQuery(Date.now() - startTime);
    
    if (result.success) {
      // Week 4: Publish booking acceptance event
      await publishBookingEvent('accepted', result.booking);
      
      // Week 4: Broadcast to rider
      broadcastToUser('rider', result.booking.rider_id, {
        type: 'booking_accepted',
        data: {
          booking_id: parseInt(id),
          driver_id: parseInt(driver_id),
          status: result.booking.status,
          timestamp: Date.now()
        }
      });
      
      res.json({
        success: true,
        message: result.message,
        data: result.booking
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to accept booking',
        error: result.error
      });
    }
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error accepting booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept booking',
      error: error.message
    });
  }
});

// Cancel a booking (atomic operation)
app.post('/api/bookings/:id/cancel', async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const { reason, user_id, user_type } = req.body;
    
    if (!reason || !user_id || !user_type) {
      return res.status(400).json({
        success: false,
        message: 'Reason, user_id, and user_type are required'
      });
    }
    
    if (!['rider', 'driver'].includes(user_type)) {
      return res.status(400).json({
        success: false,
        message: 'user_type must be either "rider" or "driver"'
      });
    }
    
    const result = await cancelBooking(parseInt(id), reason, parseInt(user_id), user_type);
    recordDatabaseQuery(Date.now() - startTime);
    
    if (result.success) {
      // Week 4: Publish booking cancellation event
      await publishBookingEvent('cancelled', result.booking);
      
      // Week 4: Broadcast cancellation
      broadcastToUser('rider', result.booking.rider_id, {
        type: 'booking_cancelled',
        data: {
          booking_id: parseInt(id),
          reason: reason,
          cancelled_by: user_type,
          timestamp: Date.now()
        }
      });
      
      if (result.booking.driver_id) {
        broadcastToUser('driver', result.booking.driver_id, {
          type: 'booking_cancelled',
          data: {
            booking_id: parseInt(id),
            reason: reason,
            cancelled_by: user_type,
            timestamp: Date.now()
          }
        });
      }
      
      res.json({
        success: true,
        message: result.message,
        data: result.booking
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to cancel booking',
        error: result.error
      });
    }
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking',
      error: error.message
    });
  }
});

// Complete a ride (atomic operation)
app.post('/api/bookings/:id/complete', async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const { driver_id, actual_fare } = req.body;
    
    if (!driver_id || !actual_fare) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID and actual fare are required'
      });
    }
    
    const result = await completeRide(parseInt(id), parseInt(driver_id), parseFloat(actual_fare));
    recordDatabaseQuery(Date.now() - startTime);
    
    if (result.success) {
      // Week 4: Publish ride completion event
      await publishBookingEvent('completed', result.booking);
      
      // Week 4: Broadcast completion to both parties
      broadcastToUser('rider', result.booking.rider_id, {
        type: 'ride_completed',
        data: {
          booking_id: parseInt(id),
          actual_fare: parseFloat(actual_fare),
          estimated_fare: result.booking.estimated_fare,
          timestamp: Date.now()
        }
      });
      
      broadcastToUser('driver', parseInt(driver_id), {
        type: 'ride_completed',
        data: {
          booking_id: parseInt(id),
          actual_fare: parseFloat(actual_fare),
          timestamp: Date.now()
        }
      });
      
      res.json({
        success: true,
        message: result.message,
        data: result.booking
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to complete ride',
        error: result.error
      });
    }
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error completing ride:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete ride',
      error: error.message
    });
  }
});

// Get booking by ID
app.get('/api/bookings/:id', async (req, res) => {
  const startTime = Date.now();
  try {
    const { id } = req.params;
    const result = await getBooking(parseInt(id));
    recordDatabaseQuery(Date.now() - startTime);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error getting booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get booking',
      error: error.message
    });
  }
});

// Get bookings for a user
app.get('/api/users/:user_id/bookings', async (req, res) => {
  const startTime = Date.now();
  try {
    const { user_id } = req.params;
    const { user_type, status } = req.query;
    
    if (!user_type || !['rider', 'driver'].includes(user_type)) {
      return res.status(400).json({
        success: false,
        message: 'user_type query parameter is required and must be "rider" or "driver"'
      });
    }
    
    const result = await getUserBookings(parseInt(user_id), user_type, status);
    recordDatabaseQuery(Date.now() - startTime);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        count: result.count
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    recordDatabaseQuery(Date.now() - startTime, true);
    console.error('Error getting user bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user bookings',
      error: error.message
    });
  }
});

// Get lock statistics (for monitoring)
app.get('/api/locks/stats', async (req, res) => {
  try {
    const result = await getLockStatistics();
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    console.error('Error getting lock statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get lock statistics',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    console.log(' Connected to PostgreSQL database');
    
    // Initialize monitoring
    await initializeMonitoring();
    console.log(' Monitoring service initialized');
    
    // Initialize Redis (Week 2)
    try {
      await initializeRedis();
      setRedisConnectionStatus(true);
      console.log(' Connected to Redis');
    } catch (redisError) {
      setRedisConnectionStatus(false);
      console.warn('  Redis connection failed, will use SQL fallback:', redisError.message);
    }
    
    // Initialize Redis for locking (Week 3)
    try {
      await initLockRedis();
      console.log(' Connected to Redis for distributed locking');
    } catch (lockRedisError) {
      console.warn('  Redis locking connection failed:', lockRedisError.message);
    }
    
    // Week 4: Initialize WebSocket service
    try {
      await initWebSocketRedis();
      initializeWebSocketServer(server);
      console.log(' WebSocket server initialized');
    } catch (wsError) {
      console.warn('  WebSocket service failed:', wsError.message);
    }
    
    // Week 4: Initialize Event service
    try {
      await initEventRedis();
      console.log(' Event service initialized');
      
      // Subscribe to booking events for WebSocket broadcasting
      await subscribeToEvent('booking:assigned', async (event) => {
        broadcastToUser('rider', event.data.rider_id, {
          type: 'booking_assigned',
          data: event.data
        });
      });
      
      await subscribeToEvent('booking:accepted', async (event) => {
        broadcastToUser('rider', event.data.rider_id, {
          type: 'booking_accepted',
          data: event.data
        });
      });
      
      await subscribeToEvent('booking:completed', async (event) => {
        broadcastToUser('rider', event.data.rider_id, {
          type: 'ride_completed',
          data: event.data
        });
        
        if (event.data.driver_id) {
          broadcastToUser('driver', event.data.driver_id, {
            type: 'ride_completed',
            data: event.data
          });
        }
      });
      
    } catch (eventError) {
      console.warn('  Event service failed:', eventError.message);
    }
    
    // Week 4: Initialize Queue service
    try {
      await initQueueRedis();
      console.log(' Queue service initialized');
      
      // Start queue processors
      process('booking_queue', async (message) => {
        console.log(' Processing booking:', message.data);
        // Process booking logic here
      });
      
      process('notification_queue', async (message) => {
        console.log('📱 Processing notification:', message.data);
        // Send push notifications here
      });
      
      process('analytics_queue', async (message) => {
        console.log(' Processing analytics:', message.data);
        // Process analytics data here
      });
      
    } catch (queueError) {
      console.warn('  Queue service failed:', queueError.message);
    }
    
    server.listen(PORT, () => {
      const redisInfo = isRedisConnected() ? ' Connected' : ' Not connected (fallback to SQL)';
      
      console.log(`
 Week 4 API Server Started!

Server running on: http://localhost:${PORT}
 Health check: http://localhost:${PORT}/api/health
 WebSocket endpoint: ws://localhost:${PORT}/ws

 Week 4 Learning Objectives:
   WebSocket server for real-time communication
   Event-driven architecture with Redis Pub/Sub
   Message queue system for reliable processing
   Comprehensive system monitoring
   Production-ready real-time system

 API Endpoints:
  • Week 2 Endpoints (inherited):
    - GET /api/drivers - Get all drivers
    - GET /api/drivers/:id - Get driver by ID
    - POST /api/drivers - Create driver
    - POST /api/drivers/:id/location - Update location (with Redis sync)
    - GET /api/drivers/nearby - Find nearby drivers (FAST with Redis!)
    - PATCH /api/drivers/:id/status - Update status

  • Week 3 Endpoints (inherited):
    - POST /api/bookings - Create booking request
    - POST /api/bookings/:id/assign - Assign driver (atomic)
    - POST /api/bookings/:id/accept - Driver accepts booking (atomic)
    - POST /api/bookings/:id/cancel - Cancel booking (atomic)
    - POST /api/bookings/:id/complete - Complete ride (atomic)
    - GET /api/bookings/:id - Get booking details
    - GET /api/users/:user_id/bookings - Get user bookings
    - GET /api/locks/stats - Get lock statistics

  • Week 4 New Endpoints:
    - GET /api/metrics - System metrics
    - GET /api/health/detailed - Detailed health check
    - GET /api/websocket/stats - WebSocket statistics
    - GET /api/websocket/connections - Active connections
    - GET /api/events/stats - Event system statistics
    - GET /api/queue/stats - Queue statistics
    - GET /api/queue/health - Queue health status

 Service Status:
  • PostgreSQL:  Connected
  • Redis: ${redisInfo}
  • WebSocket:  Active
  • Events:  Active
  • Queues:  Active
  • Monitoring:  Active

 Test the API:
  curl http://localhost:${PORT}/api/health
  curl http://localhost:${PORT}/api/metrics
  curl "http://localhost:${PORT}/api/drivers/nearby?lat=40.7128&lng=-74.0060&radius=5"
  
 Test WebSocket:
  wscat -c "ws://localhost:${PORT}/ws?user_type=rider&user_id=1&token=demo_token"
      `);
    });
  } catch (error) {
    console.error(' Failed to start server:', error);
    console.log(' Make sure PostgreSQL is running: docker-compose up -d postgres redis');
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n Shutting down server...');
  
  try {
    await closeRedis();
    await closeWebSocketServer();
    await closeEventService();
    await closeQueueService();
    await closeMonitoring();
    await pool.end();
    console.log(' All services closed gracefully');
  } catch (error) {
    console.error(' Error during shutdown:', error);
  }
  
  process.exit(0);
});

startServer();

module.exports = app;
