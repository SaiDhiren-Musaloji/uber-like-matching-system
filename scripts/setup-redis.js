const { Pool } = require('pg');
const {
  initializeRedis,
  addDriverLocation,
  getDriverCount,
  closeRedis
} = require('../src/redisClient');
require('dotenv').config();

/**
 * Week 2 Setup Script
 * 
 * This script populates Redis with existing driver locations from PostgreSQL.
 * It syncs all online drivers with coordinates to Redis for fast proximity search.
 */

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'uber_matching',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

async function setupWeek2() {
  try {
    console.log(' Setting up Week 2 with Redis Geo...');
    
    // Initialize Redis
    try {
      await initializeRedis();
      console.log(' Connected to Redis');
    } catch (error) {
      console.error(' Failed to connect to Redis:', error.message);
      console.log(' Make sure Redis is running: docker-compose up -d redis');
      throw error;
    }
    
    // Get all online drivers with locations from PostgreSQL
    const result = await pool.query(`
      SELECT id, lat, lng 
      FROM drivers 
      WHERE status = 'online' 
        AND lat IS NOT NULL 
        AND lng IS NOT NULL
    `);
    
    console.log(` Found ${result.rows.length} online drivers with locations`);
    
    // Add each driver to Redis
    let successCount = 0;
    for (const driver of result.rows) {
      try {
        await addDriverLocation(driver.id, driver.lat, driver.lng);
        successCount++;
      } catch (error) {
        console.error(` Failed to add driver ${driver.id}:`, error.message);
      }
    }
    
    // Get Redis driver count
    const redisCount = await getDriverCount();
    
    console.log(`
🎉 Week 2 setup completed!

 Sync Results:
  • Total online drivers: ${result.rows.length}
  • Successfully synced: ${successCount}
  • Drivers in Redis: ${redisCount}

 Test Redis:
  docker exec -it uber_redis redis-cli GEOSEARCH drivers FROMLONLAT -74.0060 40.7128 BYRADIUS 5 km

 Next Steps:
  1. Run: npm start (to start the API)
  2. Test: curl "http://localhost:3000/api/drivers/nearby?lat=40.7128&lng=-74.0060&radius=5"
  3. Compare performance with Week 1!

 Note: Drivers will be automatically synced to Redis when locations are updated.
    `);
    
  } catch (error) {
    console.error(' Setup failed:', error);
    throw error;
  } finally {
    await closeRedis();
    await pool.end();
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupWeek2()
    .then(() => {
      console.log(' Week 2 setup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error(' Week 2 setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupWeek2 };
