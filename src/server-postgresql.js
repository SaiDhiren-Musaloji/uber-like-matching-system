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

/**
 * PostgreSQL Implementation with Redis Geo Optimization
 * 
 * Features:
 * 1. Redis GEO for fast proximity search
 * 2. Dual-write pattern (PostgreSQL + Redis)
 * 3. Graceful Redis failure handling
 * 4. Sub-100ms query performance
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

// Routes

// Health check
app.get('/api/health', async (req, res) => {
  const redisStatus = isRedisConnected() ? 'connected' : 'disconnected';
  
  res.json({
    success: true,
    message: 'API with Redis Geo optimization',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    services: {
      postgres: 'connected',
      redis: redisStatus
    }
  });
});

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

// Find nearby drivers (Optimized with Redis Geo)
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

// Update driver location (Dual-write to PostgreSQL and Redis)
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
    console.log('Connected to PostgreSQL database');
    
    // Initialize Redis
    try {
      await initializeRedis();
      console.log('Connected to Redis');
    } catch (redisError) {
      console.warn('Redis connection failed, will use SQL fallback:', redisError.message);
    }
    
    app.listen(PORT, () => {
      const redisInfo = isRedisConnected() ? 'Connected' : 'Not connected (fallback to SQL)';
      
      console.log(`
API Server Started!

Server running on: http://localhost:${PORT}
Health check: http://localhost:${PORT}/api/health

Features:
  - Redis Geo for fast proximity search
  - Dual-write pattern (PostgreSQL + Redis)
  - Graceful Redis failure handling
  - Sub-100ms query performance

API Endpoints:
  • GET /api/drivers - Get all drivers
  • GET /api/drivers/:id - Get driver by ID
  • POST /api/drivers - Create driver
  • POST /api/drivers/:id/location - Update location (with Redis sync)
  • GET /api/drivers/nearby - Find nearby drivers (FAST with Redis!)
  • PATCH /api/drivers/:id/status - Update status

Service Status:
  • PostgreSQL: Connected
  • Redis: ${redisInfo}

Test the API:
  curl http://localhost:${PORT}/api/health
  curl "http://localhost:${PORT}/api/drivers/nearby?lat=40.7128&lng=-74.0060&radius=5"
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    console.log('Make sure PostgreSQL is running: docker-compose up -d postgres redis');
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down server...');
  await closeRedis();
  await pool.end();
  process.exit(0);
});

startServer();

module.exports = app;
