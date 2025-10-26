const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();
const {
  initializeRedis,
  isRedisConnected,
  addDriverLocation,
  findNearbyDrivers,
  removeDriverLocation,
  getDriverLocation,
  closeRedis
} = require('./redisClient');

// Import booking service and lock service
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

/**
 * Distributed Locking & Concurrency Control Implementation
 * 
 * Features:
 * 1. Redis-based distributed locking
 * 2. Race condition prevention and double-booking protection
 * 3. Atomic booking operations
 * 4. Concurrent request handling
 */

const app = express();
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

// Basic validation middleware
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

// Health check
app.get('/api/health', async (req, res) => {
  const redisStatus = isRedisConnected() ? 'connected' : 'disconnected';
  
  res.json({
    success: true,
    message: 'Week 3 API with Distributed Locking & Concurrency Control',
    timestamp: new Date().toISOString(),
    version: '3.0.0',
    services: {
      postgres: 'connected',
      redis: redisStatus
    }
  });
});

// Week 2 Routes (inherited)

// Get all drivers
app.get('/api/drivers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM drivers ORDER BY created_at DESC');
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
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
  try {
    const { lat, lng, radius = 5 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }
    
    const startTime = Date.now();
    
    // Try Redis first (fast path)
    if (isRedisConnected()) {
      try {
        const nearbyDrivers = await findNearbyDrivers(lat, lng, parseFloat(radius));
        
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
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM drivers WHERE id = $1', [id]);
    
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
  try {
    const { name, phone, email, vehicle_type } = req.body;
    
    const result = await pool.query(
      'INSERT INTO drivers (name, phone, email, vehicle_type) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, phone, email, vehicle_type]
    );
    
    res.status(201).json({
      success: true,
      message: 'Driver created successfully',
      data: result.rows[0]
    });
  } catch (error) {
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
  try {
    const { id } = req.params;
    const { lat, lng } = req.body;
    
    // Update PostgreSQL
    const result = await pool.query(
      'UPDATE drivers SET lat = $1, lng = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [lat, lng, id]
    );
    
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
      } catch (redisError) {
        console.error('Failed to update Redis:', redisError);
        // Don't fail the request, Redis is not critical
      }
    }
    
    res.json({
      success: true,
      message: 'Driver location updated successfully',
      data: driver
    });
  } catch (error) {
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
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Driver status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    });
  }
});

// Week 3 Routes: Booking System with Distributed Locking

// Create a new booking request
app.post('/api/bookings', validateBooking, async (req, res) => {
  try {
    const result = await createBooking(req.body);
    
    if (result.success) {
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
  try {
    const { id } = req.params;
    const result = await assignDriver(parseInt(id));
    
    if (result.success) {
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
    
    if (result.success) {
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
    
    if (result.success) {
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
    
    if (result.success) {
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
  try {
    const { id } = req.params;
    const result = await getBooking(parseInt(id));
    
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
    
    // Initialize Redis (Week 2)
    try {
      await initializeRedis();
      console.log(' Connected to Redis');
    } catch (redisError) {
      console.warn('  Redis connection failed, will use SQL fallback:', redisError.message);
    }
    
    // Initialize Redis for locking (Week 3)
    try {
      await initLockRedis();
      console.log(' Connected to Redis for distributed locking');
    } catch (lockRedisError) {
      console.warn('  Redis locking connection failed:', lockRedisError.message);
    }
    
    app.listen(PORT, () => {
      const redisInfo = isRedisConnected() ? ' Connected' : ' Not connected (fallback to SQL)';
      
      console.log(`
 Week 3 API Server Started!

Server running on: http://localhost:${PORT}
 Health check: http://localhost:${PORT}/api/health

 Week 3 Learning Objectives:
   Redis-based distributed locking
   Atomic booking operations
   Race condition prevention
   Concurrent request handling

 API Endpoints:
  • Week 2 Endpoints (inherited):
    - GET /api/drivers - Get all drivers
    - GET /api/drivers/:id - Get driver by ID
    - POST /api/drivers - Create driver
    - POST /api/drivers/:id/location - Update location (with Redis sync)
    - GET /api/drivers/nearby - Find nearby drivers (FAST with Redis!)
    - PATCH /api/drivers/:id/status - Update status

  • Week 3 New Endpoints:
    - POST /api/bookings - Create booking request
    - POST /api/bookings/:id/assign - Assign driver (atomic)
    - POST /api/bookings/:id/accept - Driver accepts booking (atomic)
    - POST /api/bookings/:id/cancel - Cancel booking (atomic)
    - POST /api/bookings/:id/complete - Complete ride (atomic)
    - GET /api/bookings/:id - Get booking details
    - GET /api/users/:user_id/bookings - Get user bookings
    - GET /api/locks/stats - Get lock statistics

 Service Status:
  • PostgreSQL:  Connected
  • Redis: ${redisInfo}

 Test the API:
  curl http://localhost:${PORT}/api/health
  curl "http://localhost:${PORT}/api/drivers/nearby?lat=40.7128&lng=-74.0060&radius=5"
  curl -X POST http://localhost:${PORT}/api/bookings \\
    -H "Content-Type: application/json" \\
    -d '{"rider_id": 1, "pickup_lat": 40.7128, "pickup_lng": -74.0060, "dropoff_lat": 40.7589, "dropoff_lng": -73.9851, "estimated_fare": 15.50}'
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
  await closeRedis();
  await pool.end();
  process.exit(0);
});

startServer();

module.exports = app;
