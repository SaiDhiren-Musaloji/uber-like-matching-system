const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

/**
 * Minimal Server for Testing
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

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      success: true,
      message: 'Minimal API Server',
      timestamp: new Date().toISOString(),
      version: '1.0.0-minimal',
      services: {
        postgres: 'connected',
        redis: 'not_connected',
        websocket: 'not_implemented',
        events: 'not_implemented',
        queues: 'not_implemented',
        monitoring: 'not_implemented'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Basic driver endpoint
app.get('/api/drivers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM drivers ORDER BY created_at DESC LIMIT 10');
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get drivers',
      error: error.message
    });
  }
});

// Start server
const startServer = async () => {
  try {
    await pool.query('SELECT 1');
    console.log(' Connected to PostgreSQL database');
    
    server.listen(PORT, () => {
      console.log(`
Minimal Server Started!

Server running on: http://localhost:${PORT}
Health check: http://localhost:${PORT}/api/health

This is a minimal version for testing
      `);
    });
  } catch (error) {
    console.error(' Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
