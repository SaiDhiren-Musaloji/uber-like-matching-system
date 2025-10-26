const { Pool } = require('pg');
require('dotenv').config();

/**
 * Week 4 Database Setup Script
 * 
 * This script sets up the database schema for Week 4 features including
 * real-time communication, event-driven architecture, and monitoring.
 */

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'uber_matching',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

const setupWeek4 = async () => {
  try {
    console.log(' Setting up Week 4 database schema...');
    
    // Week 4: Create system monitoring tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_metrics (
        id SERIAL PRIMARY KEY,
        metric_type VARCHAR(50) NOT NULL,
        metric_name VARCHAR(100) NOT NULL,
        metric_value DECIMAL(15,4) NOT NULL,
        tags JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_system_metrics_type_timestamp 
      ON system_metrics(metric_type, timestamp);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_system_metrics_name_timestamp 
      ON system_metrics(metric_name, timestamp);
    `);
    
    // Week 4: Create event log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_log (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(100) UNIQUE NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        event_data JSONB NOT NULL,
        source VARCHAR(50) NOT NULL,
        version VARCHAR(10) DEFAULT '1.0',
        metadata JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_event_log_type_timestamp 
      ON event_log(event_type, timestamp);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_event_log_source_timestamp 
      ON event_log(source, timestamp);
    `);
    
    // Week 4: Create WebSocket session tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS websocket_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100) UNIQUE NOT NULL,
        user_type VARCHAR(20) NOT NULL,
        user_id INTEGER NOT NULL,
        connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        disconnected_at TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_websocket_sessions_user 
      ON websocket_sessions(user_type, user_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_websocket_sessions_connected 
      ON websocket_sessions(connected_at);
    `);
    
    // Week 4: Create message queue tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS queue_messages (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(100) UNIQUE NOT NULL,
        queue_name VARCHAR(50) NOT NULL,
        message_data JSONB NOT NULL,
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP,
        failed_at TIMESTAMP,
        error_message TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_queue_messages_queue_status 
      ON queue_messages(queue_name, status);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_queue_messages_scheduled 
      ON queue_messages(scheduled_at);
    `);
    
    // Week 4: Create notification preferences
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id SERIAL PRIMARY KEY,
        user_type VARCHAR(20) NOT NULL,
        user_id INTEGER NOT NULL,
        notification_type VARCHAR(50) NOT NULL,
        enabled BOOLEAN DEFAULT true,
        channels JSONB DEFAULT '["websocket", "push"]',
        settings JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_type, user_id, notification_type)
      );
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_preferences_user 
      ON notification_preferences(user_type, user_id);
    `);
    
    // Week 4: Create real-time analytics views
    await pool.query(`
      CREATE OR REPLACE VIEW real_time_stats AS
      SELECT 
        'bookings' as metric_type,
        COUNT(*) as total_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'assigned' THEN 1 END) as assigned_count,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
        AVG(CASE WHEN status = 'completed' THEN actual_fare END) as avg_fare,
        CURRENT_TIMESTAMP as timestamp
      FROM bookings
      WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
      
      UNION ALL
      
      SELECT 
        'drivers' as metric_type,
        COUNT(*) as total_count,
        COUNT(CASE WHEN status = 'online' THEN 1 END) as online_count,
        COUNT(CASE WHEN status = 'busy' THEN 1 END) as busy_count,
        COUNT(CASE WHEN status = 'offline' THEN 1 END) as offline_count,
        0 as accepted_count,
        0 as cancelled_count,
        AVG(rating) as avg_fare,
        CURRENT_TIMESTAMP as timestamp
      FROM drivers
      WHERE updated_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour';
    `);
    
    // Week 4: Create performance monitoring functions
    await pool.query(`
      CREATE OR REPLACE FUNCTION get_system_performance()
      RETURNS TABLE (
        metric_name VARCHAR,
        metric_value DECIMAL,
        metric_timestamp TIMESTAMP
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          'active_bookings'::VARCHAR as metric_name,
          COUNT(*)::DECIMAL as metric_value,
          CURRENT_TIMESTAMP as metric_timestamp
        FROM bookings 
        WHERE status IN ('pending', 'assigned', 'accepted')
        
        UNION ALL
        
        SELECT 
          'online_drivers'::VARCHAR as metric_name,
          COUNT(*)::DECIMAL as metric_value,
          CURRENT_TIMESTAMP as metric_timestamp
        FROM drivers 
        WHERE status = 'online'
        
        UNION ALL
        
        SELECT 
          'avg_response_time'::VARCHAR as metric_name,
          AVG(EXTRACT(EPOCH FROM (accepted_at - assigned_at)))::DECIMAL as metric_value,
          CURRENT_TIMESTAMP as metric_timestamp
        FROM bookings 
        WHERE accepted_at IS NOT NULL 
        AND assigned_at IS NOT NULL
        AND accepted_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour';
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    // Week 4: Create cleanup procedures
    await pool.query(`
      CREATE OR REPLACE FUNCTION cleanup_old_data()
      RETURNS INTEGER AS $$
      DECLARE
        deleted_count INTEGER := 0;
      BEGIN
        -- Clean up old event logs (older than 30 days)
        DELETE FROM event_log 
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        
        -- Clean up old WebSocket sessions (older than 7 days)
        DELETE FROM websocket_sessions 
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
        
        -- Clean up old metrics (older than 90 days)
        DELETE FROM system_metrics 
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
        
        -- Clean up old queue messages (older than 14 days)
        DELETE FROM queue_messages 
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '14 days'
        AND status IN ('processed', 'failed');
        
        RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    // Week 4: Create triggers for real-time updates
    await pool.query(`
      CREATE OR REPLACE FUNCTION notify_booking_change()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify('booking_change', json_build_object(
          'id', NEW.id,
          'status', NEW.status,
          'rider_id', NEW.rider_id,
          'driver_id', NEW.driver_id,
          'timestamp', CURRENT_TIMESTAMP
        )::text);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    await pool.query(`
      DROP TRIGGER IF EXISTS booking_change_trigger ON bookings;
      CREATE TRIGGER booking_change_trigger
        AFTER INSERT OR UPDATE ON bookings
        FOR EACH ROW
        EXECUTE FUNCTION notify_booking_change();
    `);
    
    await pool.query(`
      CREATE OR REPLACE FUNCTION notify_driver_change()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify('driver_change', json_build_object(
          'id', NEW.id,
          'status', NEW.status,
          'lat', NEW.lat,
          'lng', NEW.lng,
          'timestamp', CURRENT_TIMESTAMP
        )::text);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    await pool.query(`
      DROP TRIGGER IF EXISTS driver_change_trigger ON drivers;
      CREATE TRIGGER driver_change_trigger
        AFTER UPDATE ON drivers
        FOR EACH ROW
        EXECUTE FUNCTION notify_driver_change();
    `);
    
    console.log(' Week 4 database schema created successfully!');
    console.log('');
    console.log(' New Tables Created:');
    console.log('  • system_metrics - System performance metrics');
    console.log('  • event_log - Event tracking and audit log');
    console.log('  • websocket_sessions - WebSocket connection tracking');
    console.log('  • queue_messages - Message queue tracking');
    console.log('  • notification_preferences - User notification settings');
    console.log('');
    console.log(' New Views Created:');
    console.log('  • real_time_stats - Real-time system statistics');
    console.log('');
    console.log(' New Functions Created:');
    console.log('  • get_system_performance() - Get current system performance');
    console.log('  • cleanup_old_data() - Clean up old data');
    console.log('');
    console.log('⚡ New Triggers Created:');
    console.log('  • booking_change_trigger - Notify on booking changes');
    console.log('  • driver_change_trigger - Notify on driver changes');
    console.log('');
    console.log(' Week 4 Features Ready:');
    console.log('   Real-time communication infrastructure');
    console.log('   Event-driven architecture support');
    console.log('   Message queue tracking');
    console.log('   System monitoring and metrics');
    console.log('   Performance optimization');
    console.log('');
    console.log(' Ready to start Week 4 server!');
    console.log('   Run: npm run start-week4');
    
  } catch (error) {
    console.error(' Error setting up Week 4 database:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run setup if called directly
if (require.main === module) {
  setupWeek4()
    .then(() => {
      console.log('🎉 Week 4 setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(' Week 4 setup failed:', error);
      process.exit(1);
    });
}

module.exports = setupWeek4;
