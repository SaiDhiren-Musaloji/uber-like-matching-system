const { Pool } = require('pg');
require('dotenv').config();

/**
 * PostgreSQL Database Setup Script
 * 
 * This script creates the basic database structure for the PostgreSQL implementation.
 * It creates the drivers table and basic indexes.
 */

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'uber_matching',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

async function setupPostgreSQL() {
  try {
    console.log('Setting up PostgreSQL database...');
    
    // Create drivers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        email VARCHAR(255),
        lat DECIMAL(10, 8),
        lng DECIMAL(11, 8),
        status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy')),
        vehicle_type VARCHAR(50),
        rating DECIMAL(3, 2) DEFAULT 0.0,
        total_rides INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log(' Drivers table created successfully');
    
    // Create basic indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers(lat, lng)');
    
    console.log(' Indexes created successfully');
    
    console.log(`
🎉 Week 1 database setup completed!

 Database structure:
  • drivers table with spatial columns
  • Basic indexes for performance
  • Proper constraints and data types

 Next steps:
  1. Run: npm run seed-week1 (to add test data)
  2. Run: npm start (to start the API)
  3. Test: curl http://localhost:3000/api/health

 Learning objectives:
  • Understand why proximity search is slow
  • Learn PostgreSQL spatial data types
  • Prepare for Week 2 optimization!
    `);
    
  } catch (error) {
    console.error(' Setup failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupPostgreSQL()
    .then(() => {
      console.log('PostgreSQL setup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('PostgreSQL setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupPostgreSQL };
