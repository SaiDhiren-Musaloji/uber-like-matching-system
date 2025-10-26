const { Pool } = require('pg');
require('dotenv').config();

/**
 * Week 1 Test Data Seeding Script
 * 
 * This script generates 10,000 drivers with random coordinates around NYC
 * for testing the proximity search performance.
 */

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'uber_matching',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

// NYC coordinates and radius for realistic testing
const NYC_CENTER = { lat: 40.7128, lng: -74.0060 };
const RADIUS_KM = 20; // 20km radius around NYC

// Generate random coordinates within NYC area
function generateRandomCoordinates() {
  // Convert radius from km to degrees (approximate)
  const latRange = RADIUS_KM / 111; // 1 degree ≈ 111 km
  const lngRange = RADIUS_KM / (111 * Math.cos(NYC_CENTER.lat * Math.PI / 180));
  
  const lat = NYC_CENTER.lat + (Math.random() - 0.5) * latRange;
  const lng = NYC_CENTER.lng + (Math.random() - 0.5) * lngRange;
  
  return { 
    lat: parseFloat(lat.toFixed(6)), 
    lng: parseFloat(lng.toFixed(6)) 
  };
}

// Generate random phone number
function generatePhoneNumber() {
  const areaCode = Math.floor(Math.random() * 900) + 100;
  const exchange = Math.floor(Math.random() * 900) + 100;
  const number = Math.floor(Math.random() * 9000) + 1000;
  return `+1${areaCode}${exchange}${number}`;
}

// Generate random name
function generateRandomName() {
  const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'David', 'Lisa', 'Tom', 'Anna', 'Chris', 'Maria', 'Alex', 'Emma', 'Ryan', 'Sofia', 'James', 'Olivia', 'Michael', 'Jennifer', 'Robert', 'Jessica'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
  
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  
  return `${firstName} ${lastName}`;
}

// Generate random vehicle type
function getRandomVehicleType() {
  const types = ['sedan', 'suv', 'luxury', 'economy'];
  return types[Math.floor(Math.random() * types.length)];
}

async function seedWeek1() {
  try {
    console.log(' Seeding Week 1 test data...');
    
    // Clear existing data
    await pool.query('DELETE FROM drivers');
    console.log(' Cleared existing data');
    
    // Generate and insert drivers in batches
    const batchSize = 1000;
    const totalDrivers = 10000;
    
    for (let batch = 0; batch < totalDrivers / batchSize; batch++) {
      const drivers = [];
      
      for (let i = 0; i < batchSize; i++) {
        const coords = generateRandomCoordinates();
        const driver = {
          name: generateRandomName(),
          phone: generatePhoneNumber(),
          email: `driver${batch * batchSize + i + 1}@example.com`,
          lat: coords.lat,
          lng: coords.lng,
          status: Math.random() > 0.3 ? 'online' : 'offline', // 70% online
          vehicle_type: getRandomVehicleType(),
          rating: parseFloat((Math.random() * 2 + 3).toFixed(2)), // 3.0 to 5.0
          total_rides: Math.floor(Math.random() * 1000)
        };
        drivers.push(driver);
      }
      
      // Batch insert
      const query = `
        INSERT INTO drivers (name, phone, email, lat, lng, status, vehicle_type, rating, total_rides)
        VALUES ${drivers.map((_, index) => 
          `($${index * 9 + 1}, $${index * 9 + 2}, $${index * 9 + 3}, $${index * 9 + 4}, $${index * 9 + 5}, $${index * 9 + 6}, $${index * 9 + 7}, $${index * 9 + 8}, $${index * 9 + 9})`
        ).join(', ')}
      `;
      
      const values = drivers.flatMap(driver => [
        driver.name, driver.phone, driver.email, driver.lat, driver.lng, 
        driver.status, driver.vehicle_type, driver.rating, driver.total_rides
      ]);
      
      await pool.query(query, values);
      console.log(` Inserted batch ${batch + 1}/${totalDrivers / batchSize} (${(batch + 1) * batchSize} drivers)`);
    }
    
    // Get statistics
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_drivers,
        COUNT(CASE WHEN status = 'online' THEN 1 END) as online_drivers,
        COUNT(CASE WHEN status = 'offline' THEN 1 END) as offline_drivers,
        AVG(rating) as avg_rating
      FROM drivers
    `);
    
    console.log(`
 Week 1 test data seeding completed!

 Database Statistics:
  • Total drivers: ${stats.rows[0].total_drivers}
  • Online drivers: ${stats.rows[0].online_drivers}
  • Offline drivers: ${stats.rows[0].offline_drivers}
  • Average rating: ${parseFloat(stats.rows[0].avg_rating).toFixed(2)}

 Test the slow proximity search:
  curl "http://localhost:3000/api/drivers/nearby?lat=40.7128&lng=-74.0060&radius=5"

 Learning objectives:
  • Understand why this query is slow
  • Measure performance with 10K drivers
  • Prepare for Week 2 optimization!
    `);
    
  } catch (error) {
    console.error(' Seeding failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedWeek1()
    .then(() => {
      console.log(' Week 1 seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error(' Week 1 seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedWeek1 };
