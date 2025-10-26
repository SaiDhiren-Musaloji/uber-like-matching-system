const { Pool } = require('pg');
const { createClient } = require('redis');
require('dotenv').config();

/**
 * Week 3 Seed Script
 * 
 * This script populates the database with sample riders and bookings
 * for testing the distributed locking and booking system.
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

const seedWeek3 = async () => {
  try {
    console.log(' Starting Week 3 seeding...\n');
    
    // Test database connection
    await pool.query('SELECT 1');
    console.log(' Connected to PostgreSQL database');
    
    // Test Redis connection
    await redisClient.connect();
    console.log(' Connected to Redis');
    
    // Clear existing data
    console.log('\n Clearing existing data...');
    await pool.query('DELETE FROM bookings');
    await pool.query('DELETE FROM riders');
    console.log(' Existing data cleared');
    
    // Insert sample riders
    console.log('\n Inserting sample riders...');
    const riders = [
      { name: 'Alice Johnson', phone: '+1-555-0101', email: 'alice@example.com', rating: 4.8 },
      { name: 'Bob Smith', phone: '+1-555-0102', email: 'bob@example.com', rating: 4.5 },
      { name: 'Carol Davis', phone: '+1-555-0103', email: 'carol@example.com', rating: 4.9 },
      { name: 'David Wilson', phone: '+1-555-0104', email: 'david@example.com', rating: 4.7 },
      { name: 'Eva Brown', phone: '+1-555-0105', email: 'eva@example.com', rating: 4.6 },
      { name: 'Frank Miller', phone: '+1-555-0106', email: 'frank@example.com', rating: 4.8 },
      { name: 'Grace Lee', phone: '+1-555-0107', email: 'grace@example.com', rating: 4.9 },
      { name: 'Henry Taylor', phone: '+1-555-0108', email: 'henry@example.com', rating: 4.4 },
      { name: 'Ivy Chen', phone: '+1-555-0109', email: 'ivy@example.com', rating: 4.7 },
      { name: 'Jack Anderson', phone: '+1-555-0110', email: 'jack@example.com', rating: 4.5 }
    ];
    
    for (const rider of riders) {
      await pool.query(
        'INSERT INTO riders (name, phone, email, rating) VALUES ($1, $2, $3, $4)',
        [rider.name, rider.phone, rider.email, rider.rating]
      );
    }
    console.log(` Inserted ${riders.length} riders`);
    
    // Insert sample bookings
    console.log('\n Inserting sample bookings...');
    
    // Get the first 5 rider IDs for bookings
    const riderResult = await pool.query('SELECT id FROM riders ORDER BY id LIMIT 5');
    const riderIds = riderResult.rows.map(row => row.id);
    
    const bookings = [
      {
        rider_id: riderIds[0],
        pickup_lat: 40.7128,
        pickup_lng: -74.0060,
        dropoff_lat: 40.7589,
        dropoff_lng: -73.9851,
        estimated_fare: 15.50,
        vehicle_type: 'standard',
        status: 'pending'
      },
      {
        rider_id: riderIds[1],
        pickup_lat: 40.7505,
        pickup_lng: -73.9934,
        dropoff_lat: 40.7614,
        dropoff_lng: -73.9776,
        estimated_fare: 12.75,
        vehicle_type: 'premium',
        status: 'pending'
      },
      {
        rider_id: riderIds[2],
        pickup_lat: 40.6892,
        pickup_lng: -74.0445,
        dropoff_lat: 40.7282,
        dropoff_lng: -73.7949,
        estimated_fare: 25.00,
        vehicle_type: 'standard',
        status: 'pending'
      },
      {
        rider_id: riderIds[3],
        pickup_lat: 40.7831,
        pickup_lng: -73.9712,
        dropoff_lat: 40.7505,
        dropoff_lng: -73.9934,
        estimated_fare: 8.50,
        vehicle_type: 'standard',
        status: 'pending'
      },
      {
        rider_id: riderIds[4],
        pickup_lat: 40.6782,
        pickup_lng: -73.9442,
        dropoff_lat: 40.6892,
        dropoff_lng: -74.0445,
        estimated_fare: 18.25,
        vehicle_type: 'premium',
        status: 'pending'
      }
    ];
    
    for (const booking of bookings) {
      await pool.query(`
        INSERT INTO bookings (
          rider_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
          estimated_fare, vehicle_type, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        booking.rider_id,
        booking.pickup_lat,
        booking.pickup_lng,
        booking.dropoff_lat,
        booking.dropoff_lng,
        booking.estimated_fare,
        booking.vehicle_type,
        booking.status
      ]);
    }
    console.log(` Inserted ${bookings.length} bookings`);
    
    // Ensure we have some online drivers for testing
    console.log('\n Ensuring drivers are online...');
    const driverResult = await pool.query('SELECT id FROM drivers LIMIT 5');
    
    if (driverResult.rows.length > 0) {
      for (const driver of driverResult.rows) {
        await pool.query(
          'UPDATE drivers SET status = $1, lat = $2, lng = $3 WHERE id = $4',
          ['online', 40.7128 + (Math.random() - 0.5) * 0.1, -74.0060 + (Math.random() - 0.5) * 0.1, driver.id]
        );
      }
      console.log(` Updated ${driverResult.rows.length} drivers to online status`);
    } else {
      console.log(' No drivers found. Please run Week 1 or Week 2 setup first.');
    }
    
    // Clear any existing locks
    console.log('\n Clearing existing locks...');
    const lockKeys = await redisClient.keys('lock:*');
    if (lockKeys.length > 0) {
      await redisClient.del(lockKeys);
      console.log(` Cleared ${lockKeys.length} existing locks`);
    } else {
      console.log(' No existing locks to clear');
    }
    
    // Test data verification
    console.log('\n Verifying seeded data...');
    
    const riderCount = await pool.query('SELECT COUNT(*) FROM riders');
    const bookingCount = await pool.query('SELECT COUNT(*) FROM bookings');
    const onlineDriverCount = await pool.query("SELECT COUNT(*) FROM drivers WHERE status = 'online'");
    
    console.log(` Data Summary:`);
    console.log(`  • Riders: ${riderCount.rows[0].count}`);
    console.log(`  • Bookings: ${bookingCount.rows[0].count}`);
    console.log(`  • Online Drivers: ${onlineDriverCount.rows[0].count}`);
    
    console.log('\n Week 3 seeding completed successfully!');
    console.log('\n Sample data created:');
    console.log('  • 10 riders with realistic names and phone numbers');
    console.log('  • 5 pending booking requests');
    console.log('  • Online drivers positioned around NYC');
    console.log('  • Clean Redis lock state');
    
    console.log('\n Ready for testing!');
    console.log('\n Test commands:');
    console.log('  # Start the server');
    console.log('  npm run start-week3');
    console.log('');
    console.log('  # Test booking creation');
    console.log('  curl -X POST http://localhost:3000/api/bookings \\');
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -d \'{"rider_id": 1, "pickup_lat": 40.7128, "pickup_lng": -74.0060, "dropoff_lat": 40.7589, "dropoff_lng": -73.9851, "estimated_fare": 15.50}\'');
    console.log('');
    console.log('  # Test driver assignment (replace BOOKING_ID)');
    console.log('  curl -X POST http://localhost:3000/api/bookings/BOOKING_ID/assign');
    console.log('');
    console.log('  # Test concurrent booking (run multiple times simultaneously)');
    console.log('  npm run test-concurrent-bookings');
    
  } catch (error) {
    console.error(' Seeding failed:', error);
    throw error;
  } finally {
    await pool.end();
    await redisClient.quit();
  }
};

// Run seeding if this script is executed directly
if (require.main === module) {
  seedWeek3()
    .then(() => {
      console.log('\n Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedWeek3 };
