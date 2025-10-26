const { Pool } = require('pg');
require('dotenv').config();

/**
 * Week 4 Database Seeding Script
 * 
 * This script seeds the database with sample data for Week 4 features
 * including real-time communication, event-driven architecture, and monitoring.
 */

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'uber_matching',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});

const seedWeek4 = async () => {
  try {
    console.log(' Seeding Week 4 database with sample data...');
    
    // Clear existing data
    console.log(' Clearing existing data...');
    await pool.query('DELETE FROM notification_preferences');
    await pool.query('DELETE FROM queue_messages');
    await pool.query('DELETE FROM websocket_sessions');
    await pool.query('DELETE FROM event_log');
    await pool.query('DELETE FROM system_metrics');
    
    // Seed notification preferences
    console.log('📱 Seeding notification preferences...');
    const notificationPreferences = [
      // Rider preferences
      { user_type: 'rider', user_id: 1, notification_type: 'booking_assigned', enabled: true, channels: ['websocket', 'push'] },
      { user_type: 'rider', user_id: 1, notification_type: 'driver_arrived', enabled: true, channels: ['websocket', 'push'] },
      { user_type: 'rider', user_id: 1, notification_type: 'ride_completed', enabled: true, channels: ['websocket', 'push'] },
      { user_type: 'rider', user_id: 2, notification_type: 'booking_assigned', enabled: true, channels: ['websocket'] },
      { user_type: 'rider', user_id: 2, notification_type: 'driver_arrived', enabled: false, channels: [] },
      { user_type: 'rider', user_id: 2, notification_type: 'ride_completed', enabled: true, channels: ['websocket', 'push'] },
      
      // Driver preferences
      { user_type: 'driver', user_id: 1, notification_type: 'new_booking', enabled: true, channels: ['websocket', 'push'] },
      { user_type: 'driver', user_id: 1, notification_type: 'booking_cancelled', enabled: true, channels: ['websocket'] },
      { user_type: 'driver', user_id: 1, notification_type: 'payment_received', enabled: true, channels: ['push'] },
      { user_type: 'driver', user_id: 2, notification_type: 'new_booking', enabled: true, channels: ['websocket'] },
      { user_type: 'driver', user_id: 2, notification_type: 'booking_cancelled', enabled: true, channels: ['websocket', 'push'] },
      { user_type: 'driver', user_id: 2, notification_type: 'payment_received', enabled: false, channels: [] },
    ];
    
    for (const pref of notificationPreferences) {
      await pool.query(`
        INSERT INTO notification_preferences (user_type, user_id, notification_type, enabled, channels, settings)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        pref.user_type,
        pref.user_id,
        pref.notification_type,
        pref.enabled,
        JSON.stringify(pref.channels),
        JSON.stringify({ priority: 'normal', sound: true })
      ]);
    }
    
    // Seed sample event logs
    console.log(' Seeding event logs...');
    const eventLogs = [
      {
        event_id: 'evt_1704067200000_abc123',
        event_type: 'booking:created',
        event_data: { booking_id: 1, rider_id: 1, estimated_fare: 15.50 },
        source: 'booking_service',
        metadata: { ip_address: '192.168.1.100', user_agent: 'Mozilla/5.0' }
      },
      {
        event_id: 'evt_1704067260000_def456',
        event_type: 'driver:location_updated',
        event_data: { driver_id: 1, lat: 40.7128, lng: -74.0060 },
        source: 'driver_service',
        metadata: { accuracy: 5.0, speed: 25.5 }
      },
      {
        event_id: 'evt_1704067320000_ghi789',
        event_type: 'booking:assigned',
        event_data: { booking_id: 1, driver_id: 1, rider_id: 1 },
        source: 'booking_service',
        metadata: { assignment_time: 2.5, driver_distance: 0.8 }
      },
      {
        event_id: 'evt_1704067380000_jkl012',
        event_type: 'system:high_demand',
        event_data: { area: 'downtown', demand_level: 'high', drivers_needed: 5 },
        source: 'system',
        metadata: { radius: 2.0, time_window: '15min' }
      }
    ];
    
    for (const event of eventLogs) {
      await pool.query(`
        INSERT INTO event_log (event_id, event_type, event_data, source, metadata)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        event.event_id,
        event.event_type,
        JSON.stringify(event.event_data),
        event.source,
        JSON.stringify(event.metadata)
      ]);
    }
    
    // Seed sample WebSocket sessions
    console.log(' Seeding WebSocket sessions...');
    const websocketSessions = [
      {
        session_id: 'ws_session_1704067200000_rider1',
        user_type: 'rider',
        user_id: 1,
        connected_at: new Date(Date.now() - 300000), // 5 minutes ago
        last_ping: new Date(Date.now() - 30000), // 30 seconds ago
        metadata: { browser: 'Chrome', version: '120.0' }
      },
      {
        session_id: 'ws_session_1704067260000_driver1',
        user_type: 'driver',
        user_id: 1,
        connected_at: new Date(Date.now() - 600000), // 10 minutes ago
        last_ping: new Date(Date.now() - 15000), // 15 seconds ago
        metadata: { app_version: '2.1.0', device: 'iPhone' }
      },
      {
        session_id: 'ws_session_1704067320000_rider2',
        user_type: 'rider',
        user_id: 2,
        connected_at: new Date(Date.now() - 120000), // 2 minutes ago
        last_ping: new Date(Date.now() - 10000), // 10 seconds ago
        metadata: { browser: 'Firefox', version: '121.0' }
      }
    ];
    
    for (const session of websocketSessions) {
      await pool.query(`
        INSERT INTO websocket_sessions (session_id, user_type, user_id, connected_at, last_ping, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        session.session_id,
        session.user_type,
        session.user_id,
        session.connected_at,
        session.last_ping,
        JSON.stringify(session.metadata)
      ]);
    }
    
    // Seed sample queue messages
    console.log(' Seeding queue messages...');
    const queueMessages = [
      {
        message_id: 'msg_1704067200000_booking1',
        queue_name: 'booking_queue',
        message_data: { type: 'process_booking', booking_id: 1, priority: 'high' },
        priority: 'high',
        status: 'processed',
        retry_count: 0,
        processed_at: new Date(Date.now() - 180000), // 3 minutes ago
        metadata: { processing_time: 1.2, worker_id: 'worker_001' }
      },
      {
        message_id: 'msg_1704067260000_notif1',
        queue_name: 'notification_queue',
        message_data: { type: 'send_push', user_id: 1, message: 'Driver assigned!' },
        priority: 'medium',
        status: 'processed',
        retry_count: 0,
        processed_at: new Date(Date.now() - 120000), // 2 minutes ago
        metadata: { delivery_time: 0.8, provider: 'fcm' }
      },
      {
        message_id: 'msg_1704067320000_analytics1',
        queue_name: 'analytics_queue',
        message_data: { type: 'track_event', event: 'booking_completed', data: { fare: 16.25 } },
        priority: 'low',
        status: 'pending',
        retry_count: 0,
        scheduled_at: new Date(Date.now() + 300000), // 5 minutes from now
        metadata: { batch_id: 'batch_001' }
      },
      {
        message_id: 'msg_1704067380000_failed1',
        queue_name: 'notification_queue',
        message_data: { type: 'send_sms', phone: '+1234567890', message: 'Ride completed' },
        priority: 'medium',
        status: 'failed',
        retry_count: 3,
        failed_at: new Date(Date.now() - 60000), // 1 minute ago
        error_message: 'Invalid phone number format',
        metadata: { last_attempt: new Date(Date.now() - 60000) }
      }
    ];
    
    for (const message of queueMessages) {
      await pool.query(`
        INSERT INTO queue_messages (
          message_id, queue_name, message_data, priority, status, 
          retry_count, max_retries, scheduled_at, processed_at, 
          failed_at, error_message, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        message.message_id,
        message.queue_name,
        JSON.stringify(message.message_data),
        message.priority,
        message.status,
        message.retry_count,
        3, // max_retries
        message.scheduled_at,
        message.processed_at,
        message.failed_at,
        message.error_message,
        JSON.stringify(message.metadata)
      ]);
    }
    
    // Seed sample system metrics
    console.log(' Seeding system metrics...');
    const systemMetrics = [
      // Performance metrics
      { metric_type: 'performance', metric_name: 'response_time_ms', metric_value: 45.2, tags: { endpoint: '/api/bookings' } },
      { metric_type: 'performance', metric_name: 'response_time_ms', metric_value: 23.8, tags: { endpoint: '/api/drivers/nearby' } },
      { metric_type: 'performance', metric_name: 'response_time_ms', metric_value: 67.1, tags: { endpoint: '/api/bookings/assign' } },
      
      // WebSocket metrics
      { metric_type: 'websocket', metric_name: 'active_connections', metric_value: 15, tags: { user_type: 'rider' } },
      { metric_type: 'websocket', metric_name: 'active_connections', metric_value: 8, tags: { user_type: 'driver' } },
      { metric_type: 'websocket', metric_name: 'messages_per_second', metric_value: 12.5, tags: {} },
      
      // Event metrics
      { metric_type: 'events', metric_name: 'events_published', metric_value: 1250, tags: { event_type: 'booking' } },
      { metric_type: 'events', metric_name: 'events_published', metric_value: 890, tags: { event_type: 'driver' } },
      { metric_type: 'events', metric_name: 'events_received', metric_value: 1180, tags: { event_type: 'booking' } },
      
      // Queue metrics
      { metric_type: 'queue', metric_name: 'messages_enqueued', metric_value: 450, tags: { queue: 'booking_queue' } },
      { metric_type: 'queue', metric_name: 'messages_processed', metric_value: 420, tags: { queue: 'booking_queue' } },
      { metric_type: 'queue', metric_name: 'messages_failed', metric_value: 5, tags: { queue: 'notification_queue' } },
      
      // Business metrics
      { metric_type: 'business', metric_name: 'bookings_per_hour', metric_value: 25, tags: { hour: '14' } },
      { metric_type: 'business', metric_name: 'avg_fare', metric_value: 18.75, tags: { period: 'today' } },
      { metric_type: 'business', metric_name: 'driver_utilization', metric_value: 0.68, tags: { area: 'downtown' } }
    ];
    
    for (const metric of systemMetrics) {
      await pool.query(`
        INSERT INTO system_metrics (metric_type, metric_name, metric_value, tags)
        VALUES ($1, $2, $3, $4)
      `, [
        metric.metric_type,
        metric.metric_name,
        metric.metric_value,
        JSON.stringify(metric.tags)
      ]);
    }
    
    // Add some historical metrics (last 24 hours)
    console.log(' Seeding historical metrics...');
    const now = new Date();
    const hoursAgo = 24;
    
    for (let i = 0; i < hoursAgo; i++) {
      const timestamp = new Date(now.getTime() - (i * 60 * 60 * 1000));
      const hour = timestamp.getHours();
      
      // Simulate realistic metrics with some variation
      const baseBookings = 20 + Math.floor(Math.random() * 15);
      const baseDrivers = 8 + Math.floor(Math.random() * 5);
      const baseResponseTime = 30 + Math.random() * 40;
      
      await pool.query(`
        INSERT INTO system_metrics (metric_type, metric_name, metric_value, tags, timestamp)
        VALUES 
        ($1, $2, $3, $4, $5),
        ($6, $7, $8, $9, $5),
        ($10, $11, $12, $13, $5)
      `, [
        'business', 'bookings_per_hour', baseBookings, JSON.stringify({ hour: hour.toString() }), timestamp,
        'websocket', 'active_connections', baseDrivers, JSON.stringify({ user_type: 'driver' }),
        'performance', 'response_time_ms', baseResponseTime, JSON.stringify({ endpoint: 'average' })
      ]);
    }
    
    console.log(' Week 4 database seeded successfully!');
    console.log('');
    console.log(' Sample Data Added:');
    console.log('  • 12 notification preferences (6 riders, 6 drivers)');
    console.log('  • 4 event log entries');
    console.log('  • 3 WebSocket sessions');
    console.log('  • 4 queue messages (processed, pending, failed)');
    console.log('  • 15 current system metrics');
    console.log('  • 72 historical metrics (24 hours)');
    console.log('');
    console.log(' Week 4 Features Ready:');
    console.log('   Real-time notification preferences');
    console.log('   Event tracking and audit logs');
    console.log('   WebSocket session management');
    console.log('   Message queue monitoring');
    console.log('   System performance metrics');
    console.log('   Historical data for analytics');
    console.log('');
    console.log(' Ready to test Week 4 features!');
    console.log('   Run: npm run start-week4');
    console.log('   Test: npm run test-realtime-week4');
    
  } catch (error) {
    console.error(' Error seeding Week 4 database:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run seeding if called directly
if (require.main === module) {
  seedWeek4()
    .then(() => {
      console.log(' Week 4 seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error(' Week 4 seeding failed:', error);
      process.exit(1);
    });
}

module.exports = seedWeek4;
