const { Pool } = require('pg');
const { createClient } = require('redis');
require('dotenv').config();

/**
 * Week 3 Setup Script
 * 
 * This script sets up the database schema for the booking system
 * and initializes Redis for distributed locking.
 */

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'uber_matching',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

// Redis connection
const redisClient = createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
});

const setupWeek3 = async () => {
  try {
    console.log(' Starting Week 3 setup...\n');
    
    // Test database connection
    await pool.query('SELECT 1');
    console.log(' Connected to PostgreSQL database');
    
    // Test Redis connection
    await redisClient.connect();
    console.log(' Connected to Redis');
    
    // Create riders table
    console.log('\n📋 Creating riders table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS riders (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        email VARCHAR(100),
        rating DECIMAL(3,2) DEFAULT 5.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(' Riders table created');
    
    // Create bookings table
    console.log('\n📋 Creating bookings table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        rider_id INTEGER NOT NULL REFERENCES riders(id),
        driver_id INTEGER REFERENCES drivers(id),
        pickup_lat DECIMAL(10, 8) NOT NULL,
        pickup_lng DECIMAL(11, 8) NOT NULL,
        dropoff_lat DECIMAL(10, 8) NOT NULL,
        dropoff_lng DECIMAL(11, 8) NOT NULL,
        estimated_fare DECIMAL(8, 2) NOT NULL,
        actual_fare DECIMAL(8, 2),
        vehicle_type VARCHAR(20) DEFAULT 'standard',
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'accepted', 'cancelled', 'completed')),
        cancellation_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        assigned_at TIMESTAMP,
        accepted_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);
    console.log(' Bookings table created');
    
    // Create indexes for better performance
    console.log('\n📋 Creating indexes...');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_rider_id ON bookings(rider_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_driver_id ON bookings(driver_id)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_riders_phone ON riders(phone)
    `);
    
    console.log(' Indexes created');
    
    // Clear any existing locks in Redis
    console.log('\n🧹 Cleaning up existing locks...');
    const lockKeys = await redisClient.keys('lock:*');
    if (lockKeys.length > 0) {
      await redisClient.del(lockKeys);
      console.log(` Cleaned up ${lockKeys.length} existing locks`);
    } else {
      console.log(' No existing locks to clean up');
    }
    
    // Test Redis locking functionality
    console.log('\n Testing Redis locking...');
    
    // Test basic lock acquisition
    const testLockResult = await redisClient.set('lock:test', 'test-value', {
      EX: 10,
      NX: true
    });
    
    if (testLockResult === 'OK') {
      console.log(' Basic lock acquisition test passed');
      
      // Test lock release
      const deleteResult = await redisClient.del('lock:test');
      if (deleteResult === 1) {
        console.log(' Basic lock release test passed');
      } else {
        console.log(' Basic lock release test failed');
      }
    } else {
      console.log(' Basic lock acquisition test failed');
    }
    
    // Test Lua script for atomic operations
    console.log('\n Testing Lua script for atomic operations...');
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;
    
    // Acquire a test lock
    const lockId = 'test-lock-id-' + Date.now();
    await redisClient.set('lock:lua-test', lockId, { EX: 10 });
    
    // Test Lua script
    const luaResult = await redisClient.eval(luaScript, {
      keys: ['lock:lua-test'],
      arguments: [lockId]
    });
    
    if (luaResult === 1) {
      console.log(' Lua script atomic operation test passed');
    } else {
      console.log(' Lua script atomic operation test failed');
    }
    
    console.log('\n🎉 Week 3 setup completed successfully!');
    console.log('\n What was created:');
    console.log('  • riders table - stores rider information');
    console.log('  • bookings table - stores booking requests and ride data');
    console.log('  • Database indexes for optimal performance');
    console.log('  • Redis lock cleanup and testing');
    console.log('\n Ready to start Week 3!');
    console.log('\n Next steps:');
    console.log('  1. Run: npm run seed-week3 (to add sample data)');
    console.log('  2. Run: npm run start-week3 (to start the server)');
    console.log('  3. Test the booking endpoints');
    
  } catch (error) {
    console.error(' Setup failed:', error);
    throw error;
  } finally {
    await pool.end();
    await redisClient.quit();
  }
};

// Run setup if this script is executed directly
if (require.main === module) {
  setupWeek3()
    .then(() => {
      console.log('\n Setup completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupWeek3 };
